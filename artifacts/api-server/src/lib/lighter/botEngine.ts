import { db } from "@workspace/db";
import { strategiesTable, tradesTable, botLogsTable, usersTable } from "@workspace/db";
import { eq, desc, lt, sql, and, isNotNull, ne } from "drizzle-orm";
import Decimal from "decimal.js";
import { logger } from "../logger";
import { getBotConfig, getNotificationConfig } from "../../routes/configService";
import { getNextNonce, sendTx, sendTxBatch, toBaseAmount, toPriceInt, getTx } from "./lighterApi";
import { getMarketInfo } from "./marketCache";
import { initSigner, signCreateOrder } from "./lighterSigner";
import { sendMessageToUser } from "../telegramBot";
import { registerPriceCallback, unregisterPriceCallback, getWsCachedPrice } from "./lighterWs";
import { handleAutoRerange, clearRerangeState } from "../autoRerange";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ─── ATOMIC CLIENT ORDER INDEX COUNTER ──────────────────────────────────────
// uint48 max = 2^48 - 1 = 281,474,976,710,655
// Seed from current time so it survives restarts without collision,
// then increment atomically — never use Date.now() directly to avoid
// same-millisecond duplicates when multiple bots run concurrently.
const UINT48_MAX = BigInt(281_474_976_710_655);
let _clientOrderCounter = BigInt(Date.now() % Number(UINT48_MAX));

function nextClientOrderIndex(): number {
  _clientOrderCounter = (_clientOrderCounter + 1n) % (UINT48_MAX + 1n);
  return Number(_clientOrderCounter);
}

interface RunningBot {
  strategyId: number;
  timer: NodeJS.Timeout;
  nextRunAt: Date;
}

interface GridState {
  lastLevel: number;
  initializedAt: Date;
}

const runningBots = new Map<number, RunningBot>();
const gridStates = new Map<number, GridState>();

// Minimum ms between WS-triggered grid checks per strategy (avoids rapid-fire on volatile ticks)
const WS_GRID_COOLDOWN_MS = 10_000;
// strategyId → timestamp of last WS-triggered run
const wsGridLastTriggered = new Map<number, number>();

// Fallback interval for grid bots (WS is primary; this catches any WS gaps)
const GRID_FALLBACK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function isRunning(strategyId: number): boolean {
  return runningBots.has(strategyId);
}

export function getNextRunAt(strategyId: number): Date | null {
  return runningBots.get(strategyId)?.nextRunAt ?? null;
}

export function getAllRunningBots(): { strategyId: number; nextRunAt: Date }[] {
  return Array.from(runningBots.entries()).map(([id, bot]) => ({
    strategyId: id,
    nextRunAt: bot.nextRunAt,
  }));
}

async function notifyUser(userId: number | null, message: string): Promise<void> {
  if (userId === null || userId === undefined) return;
  try {
    const config = await getBotConfig(userId);
    if (!config.notifyBotToken || !config.notifyChatId) return;
    const result = await sendMessageToUser(config.notifyChatId, message, config.notifyBotToken);
    if (!result.ok) {
      // Log failure to DB so user can see it in the Logs tab
      await addLog(userId, null, null, "warn",
        `[Notifikasi Telegram gagal] ${result.error ?? "Unknown error"}`,
        `Pastikan: 1) Bot token benar, 2) Sudah kirim /start ke bot notifikasimu, 3) Chat ID benar`
      );
    }
  } catch (err: any) {
    logger.error({ err }, "[Notify] Unexpected error in notifyUser");
  }
}

async function addLog(
  userId: number | null,
  strategyId: number | null,
  strategyName: string | null,
  level: "info" | "warn" | "error" | "success",
  message: string,
  details?: string
) {
  try {
    await db.insert(botLogsTable).values({
      userId,
      strategyId,
      strategyName,
      level,
      message,
      details: details ?? null,
      exchange: "lighter",
    });
  } catch (err) {
    logger.error({ err }, "Failed to add bot log");
  }
}

async function recordTrade(params: {
  userId: number | null;
  strategyId: number;
  strategyName: string;
  marketIndex: number;
  marketSymbol: string;
  side: "buy" | "sell";
  size: Decimal;
  price: Decimal;
  status: "pending" | "filled" | "cancelled" | "failed";
  orderHash?: string;
  clientOrderIndex?: number;
  errorMessage?: string;
}) {
  await db.insert(tradesTable).values({
    userId: params.userId,
    strategyId: params.strategyId,
    strategyName: params.strategyName,
    marketIndex: params.marketIndex,
    marketSymbol: params.marketSymbol,
    side: params.side,
    size: params.size.toFixed(8),
    price: params.price.toFixed(8),
    fee: "0",
    status: params.status,
    orderHash: params.orderHash ?? null,
    clientOrderIndex: params.clientOrderIndex ?? null,
    errorMessage: params.errorMessage ?? null,
    executedAt: params.status === "filled" ? new Date() : null,
  });
}

async function updateStrategyStatsAtomic(
  strategyId: number,
  side: "buy" | "sell",
  size: Decimal,
  price: Decimal
) {
  if (side === "buy") {
    await db.execute(sql`
      UPDATE strategies
      SET
        total_orders      = total_orders + 1,
        successful_orders = successful_orders + 1,
        last_run_at       = NOW(),
        updated_at        = NOW(),
        total_bought      = total_bought + ${size.toFixed(8)}::numeric,
        avg_buy_price     = CASE
          WHEN total_bought + ${size.toFixed(8)}::numeric = 0 THEN 0
          ELSE (avg_buy_price * total_bought + ${price.toFixed(8)}::numeric * ${size.toFixed(8)}::numeric)
               / (total_bought + ${size.toFixed(8)}::numeric)
        END
      WHERE id = ${strategyId}
    `);
  } else {
    await db.execute(sql`
      UPDATE strategies
      SET
        total_orders      = total_orders + 1,
        successful_orders = successful_orders + 1,
        last_run_at       = NOW(),
        updated_at        = NOW(),
        total_sold        = total_sold + ${size.toFixed(8)}::numeric,
        avg_sell_price    = CASE
          WHEN total_sold + ${size.toFixed(8)}::numeric = 0 THEN 0
          ELSE (avg_sell_price * total_sold + ${price.toFixed(8)}::numeric * ${size.toFixed(8)}::numeric)
               / (total_sold + ${size.toFixed(8)}::numeric)
        END
      WHERE id = ${strategyId}
    `);
  }
}

async function getCurrentPrice(marketIndex: number, network: "mainnet" | "testnet" = "mainnet"): Promise<Decimal | null> {
  // Prefer WebSocket cache (real-time, < 5 s old)
  const cached = getWsCachedPrice(marketIndex, 5_000);
  if (cached) return cached;

  // Fallback to REST
  try {
    const marketInfo = await getMarketInfo(marketIndex, network);
    if (marketInfo && marketInfo.lastTradePrice > 0) {
      return new Decimal(marketInfo.lastTradePrice);
    }
    return null;
  } catch {
    return null;
  }
}

async function executeDcaOrder(strategy: typeof strategiesTable.$inferSelect) {
  const config = strategy.dcaConfig as {
    amountPerOrder: number;
    intervalMinutes: number;
    side: "buy" | "sell";
    orderType: "market" | "limit" | "post_only";
    maxOrders?: number;
    limitPriceOffset?: number;
  };

  if (!config) return;

  const userId = strategy.userId ?? null;
  const botConfig = userId !== null ? await getBotConfig(userId) : null;
  const hasCredentials = !!(botConfig?.privateKey && botConfig?.accountIndex != null);
  const network = botConfig?.network ?? "mainnet";

  const currentPrice = await getCurrentPrice(strategy.marketIndex, network);

  if (!currentPrice || currentPrice.lte(0)) {
    await addLog(userId, strategy.id, strategy.name, "warn", "Could not fetch market price for DCA order");
    return;
  }

  const amountPerOrder = new Decimal(config.amountPerOrder);
  const size = amountPerOrder.div(currentPrice);

  await addLog(
    userId,
    strategy.id,
    strategy.name,
    "info",
    `DCA ${config.side.toUpperCase()} order triggered`,
    `Amount: $${amountPerOrder.toFixed(2)} USDC | Price: $${currentPrice.toFixed(2)} | Size: ${size.toFixed(6)}`
  );

  if (!hasCredentials) {
    await addLog(
      userId,
      strategy.id,
      strategy.name,
      "warn",
      "Paper trade (no API key configured)",
      `Simulated ${config.side} ${size.toFixed(6)} @ $${currentPrice.toFixed(2)}`
    );
    await recordTrade({
      userId,
      strategyId: strategy.id,
      strategyName: strategy.name,
      marketIndex: strategy.marketIndex,
      marketSymbol: strategy.marketSymbol,
      side: config.side,
      size,
      price: currentPrice,
      status: "filled",
      orderHash: `paper_${Date.now()}`,
    });
    await updateStrategyStatsAtomic(strategy.id, config.side, size, currentPrice);
  } else {
    await executeLiveOrder({
      userId,
      strategy,
      botConfig: botConfig!,
      side: config.side,
      size,
      currentPrice,
      network,
      orderKind: config.orderType ?? "market",
      limitPriceOffset: config.limitPriceOffset ?? 0,
    });
  }
}

async function executeLiveOrder(params: {
  userId: number | null;
  strategy: typeof strategiesTable.$inferSelect;
  botConfig: Awaited<ReturnType<typeof getBotConfig>>;
  side: "buy" | "sell";
  size: Decimal;
  currentPrice: Decimal;
  network: "mainnet" | "testnet";
  orderKind?: "market" | "limit" | "post_only";
  limitPriceOffset?: number;
}) {
  const { userId, strategy, botConfig, side, size, currentPrice, network } = params;
  const orderKind = params.orderKind ?? "market";
  const limitPriceOffset = params.limitPriceOffset ?? 0;

  const marketInfo = await getMarketInfo(strategy.marketIndex, network);
  const sizeDecimals = marketInfo?.sizeDecimals ?? 4;
  const priceDecimals = marketInfo?.priceDecimals ?? 2;

  const baseAmount = toBaseAmount(size.toNumber(), sizeDecimals);

  // ── Validate against exchange minimums before signing ─────────────────────
  // Lighter docs: "Note that those minimums only apply to maker orders."
  // min_base_amount and min_quote_amount ONLY apply to limit/post_only (maker).
  // Market orders (IOC/taker) are NOT subject to these minimums.
  const minBase = marketInfo?.minBaseAmount ?? 0;
  const minQuote = marketInfo?.minQuoteAmount ?? 0;
  const isMakerOrder = orderKind === "limit" || orderKind === "post_only";

  if (isMakerOrder) {
    if (minBase > 0 && size.lt(minBase)) {
      const msg = `Order size ${size.toFixed(6)} ${strategy.marketSymbol} is below exchange minimum of ${minBase} (min_base_amount). Increase amountPerOrder.`;
      await addLog(userId, strategy.id, strategy.name, "warn", "Order skipped: size below exchange minimum", msg);
      logger.warn({ size: size.toNumber(), minBase, market: strategy.marketSymbol }, "Order below min_base_amount, skipped");
      return;
    }

    const orderValueUsdc = size.mul(currentPrice);
    if (minQuote > 0 && orderValueUsdc.lt(minQuote)) {
      const msg = `Order value $${orderValueUsdc.toFixed(2)} USDC is below exchange minimum of $${minQuote} (min_quote_amount). Increase amountPerOrder.`;
      await addLog(userId, strategy.id, strategy.name, "warn", "Order skipped: value below exchange minimum", msg);
      logger.warn({ valueUsdc: orderValueUsdc.toNumber(), minQuote, market: strategy.marketSymbol }, "Order below min_quote_amount, skipped");
      return;
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Market order: add 5% slippage buffer (worst-case fill price)
  // Limit/PostOnly order: offset from current price (buy below, sell above)
  let executionPrice: Decimal;
  let lighterOrderType: number;
  let lighterTimeInForce: number;
  let lighterOrderExpiry: number;

  if (orderKind === "limit" || orderKind === "post_only") {
    const offset = new Decimal(limitPriceOffset);
    executionPrice = side === "buy"
      ? currentPrice.sub(offset)
      : currentPrice.add(offset);
    lighterOrderType = 0;   // LimitOrder
    // PostOnly (2): maker-only, rejected immediately if it would cross — no expiry needed
    // GoodTillTime (1): standard limit, stays in book until expiry
    lighterTimeInForce = orderKind === "post_only" ? 2 : 1;
    // All limit orders (GTT and PostOnly) use -1 = DEFAULT_28_DAY_ORDER_EXPIRY
    // The Go signer computes the actual expiry internally.
    // PostOnly orders that don't cross sit in the book and also need a valid expiry.
    // 0 (NilOrderExpiry) is only correct for IOC/Market orders.
    lighterOrderExpiry = -1;
  } else {
    const slippageFactor = side === "buy" ? 1.05 : 0.95;
    executionPrice = currentPrice.mul(slippageFactor);
    lighterOrderType = 1;   // MarketOrder
    lighterTimeInForce = 0; // ImmediateOrCancel
    lighterOrderExpiry = 0; // NilOrderExpiry — not needed for IOC
  }

  const priceInt = toPriceInt(executionPrice.toNumber(), priceDecimals);
  const isAsk = side === "sell";

  const accountIndex = botConfig.accountIndex!;
  const apiKeyIndex = botConfig.apiKeyIndex;
  const privateKey = botConfig.privateKey!;

  if (apiKeyIndex === null) {
    const msg = "API key index not configured — go to Settings and enter your API Key Index";
    await addLog(userId, strategy.id, strategy.name, "error", "Order aborted: missing API key index", msg);
    return;
  }
  const url = network === "mainnet"
    ? "https://mainnet.zklighter.elliot.ai"
    : "https://testnet.zklighter.elliot.ai";

  const clientOrderIndex = nextClientOrderIndex();

  try {
    initSigner(url, privateKey, apiKeyIndex, accountIndex);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await addLog(userId, strategy.id, strategy.name, "error", "Failed to initialize signer", msg);
    await recordTrade({
      userId,
      strategyId: strategy.id,
      strategyName: strategy.name,
      marketIndex: strategy.marketIndex,
      marketSymbol: strategy.marketSymbol,
      side,
      size,
      price: currentPrice,
      status: "failed",
      errorMessage: msg,
    });
    return;
  }

  let nonce: number;
  try {
    nonce = await getNextNonce(accountIndex, apiKeyIndex, network);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await addLog(userId, strategy.id, strategy.name, "error", "Failed to get nonce", msg);
    await recordTrade({
      userId,
      strategyId: strategy.id,
      strategyName: strategy.name,
      marketIndex: strategy.marketIndex,
      marketSymbol: strategy.marketSymbol,
      side,
      size,
      price: currentPrice,
      status: "failed",
      errorMessage: msg,
    });
    return;
  }

  const signResult = signCreateOrder({
    marketIndex: strategy.marketIndex,
    clientOrderIndex,
    baseAmount,
    price: priceInt,
    isAsk,
    orderType: lighterOrderType,
    timeInForce: lighterTimeInForce,
    reduceOnly: false,
    triggerPrice: 0,
    orderExpiry: lighterOrderExpiry,
    nonce,
    apiKeyIndex,
    accountIndex,
  });

  if (signResult.err) {
    const msg = `Sign failed: ${signResult.err}`;
    await addLog(userId, strategy.id, strategy.name, "error", "Order signing failed", msg);
    if (userId !== null) {
      getNotificationConfig(userId).then(notif => {
        if (notif.notifyOnError) notifyUser(userId, `❌ *Order Sign Failed*\n*${strategy.name}*\n${msg}`);
      }).catch(() => {});
    }
    await recordTrade({
      userId,
      strategyId: strategy.id,
      strategyName: strategy.name,
      marketIndex: strategy.marketIndex,
      marketSymbol: strategy.marketSymbol,
      side,
      size,
      price: currentPrice,
      status: "failed",
      errorMessage: msg,
    });
    return;
  }

  // For market orders (IOC), disable price_protection because we already
  // apply a 5% slippage buffer in executionPrice. Keeping price_protection=true
  // on top of slippage causes sequencer to reject orders on volatile markets.
  // For limit orders keep price_protection=true as a safety net.
  const priceProtection = orderKind !== "market";

  let sendTxResult: Awaited<ReturnType<typeof sendTx>>;
  try {
    sendTxResult = await sendTx(signResult.txType, signResult.txInfo, network, priceProtection);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await addLog(userId, strategy.id, strategy.name, "error", "Order submission failed", msg);
    if (userId !== null) {
      getNotificationConfig(userId).then(notif => {
        if (notif.notifyOnError) notifyUser(userId, `❌ *Order Submission Failed*\n*${strategy.name}* (${side.toUpperCase()} ${strategy.marketSymbol})\n${msg}`);
      }).catch(() => {});
    }
    await recordTrade({
      userId,
      strategyId: strategy.id,
      strategyName: strategy.name,
      marketIndex: strategy.marketIndex,
      marketSymbol: strategy.marketSymbol,
      side,
      size,
      price: currentPrice,
      status: "failed",
      orderHash: signResult.txHash || undefined,
      clientOrderIndex,
      errorMessage: msg,
    });
    return;
  }

  // Lighter mengembalikan hash yang BENAR di sendTx response (field: tx_hash).
  // Hash dari signer (signResult.txHash) = signing hash (berbeda dari Lighter-indexed hash).
  // Selalu pakai hash dari Lighter response — fallback ke signer hash hanya jika API tidak return.
  const confirmedHash = sendTxResult.tx_hash ?? signResult.txHash;

  if (sendTxResult.tx_hash) {
    logger.info({ lighterHash: sendTxResult.tx_hash, signerHash: signResult.txHash }, "Using Lighter-assigned hash for polling");
  } else {
    logger.warn({ signerHash: signResult.txHash }, "sendTx did not return tx_hash — using signer hash (may cause poll failures)");
  }

  await addLog(
    userId,
    strategy.id,
    strategy.name,
    "success",
    `Live ${side.toUpperCase()} order submitted`,
    `Size: ${size.toFixed(6)} | Price: $${currentPrice.toFixed(2)} | TxHash: ${confirmedHash}`
  );

  await recordTrade({
    userId,
    strategyId: strategy.id,
    strategyName: strategy.name,
    marketIndex: strategy.marketIndex,
    marketSymbol: strategy.marketSymbol,
    side,
    size,
    price: currentPrice,
    status: "pending",
    orderHash: confirmedHash,
    clientOrderIndex,
  });

  // NOTE: updateStrategyStatsAtomic is called in pollPendingTrades when the
  // order is confirmed as filled (txStatus=2), not here. This avoids counting
  // orders that are submitted but later cancelled/rejected by the sequencer.

}

// Max orders per batch — prevents flooding the sequencer on huge price swings
const MAX_BATCH_ORDERS = 5;

async function executeBatchLiveOrders(params: {
  userId: number | null;
  strategy: typeof strategiesTable.$inferSelect;
  botConfig: Awaited<ReturnType<typeof getBotConfig>>;
  side: "buy" | "sell";
  size: Decimal;         // size per order
  currentPrice: Decimal;
  network: "mainnet" | "testnet";
  orderCount: number;
  orderKind?: "market" | "limit" | "post_only";
  limitPriceOffset?: number;
}): Promise<void> {
  const { userId, strategy, botConfig, side, size, currentPrice, network, orderCount } = params;
  const orderKind = params.orderKind ?? "market";
  const limitPriceOffset = params.limitPriceOffset ?? 0;

  const marketInfo = await getMarketInfo(strategy.marketIndex, network);
  const sizeDecimals = marketInfo?.sizeDecimals ?? 4;
  const priceDecimals = marketInfo?.priceDecimals ?? 2;
  const minBase = marketInfo?.minBaseAmount ?? 0;
  const minQuote = marketInfo?.minQuoteAmount ?? 0;

  const baseAmount = toBaseAmount(size.toNumber(), sizeDecimals);

  // Lighter docs: minimums only apply to maker orders (limit/post_only), not market (taker) orders.
  const isMakerOrder = orderKind === "limit" || orderKind === "post_only";
  if (isMakerOrder) {
    if (minBase > 0 && size.lt(minBase)) {
      await addLog(userId, strategy.id, strategy.name, "warn", "Batch order skipped: size below min_base_amount");
      return;
    }
    if (minQuote > 0 && size.mul(currentPrice).lt(minQuote)) {
      await addLog(userId, strategy.id, strategy.name, "warn", "Batch order skipped: value below min_quote_amount");
      return;
    }
  }

  const accountIndex = botConfig.accountIndex!;
  const apiKeyIndex = botConfig.apiKeyIndex;
  const privateKey = botConfig.privateKey!;

  if (apiKeyIndex === null) {
    await addLog(userId, strategy.id, strategy.name, "error", "Batch order aborted: missing API key index");
    return;
  }

  const url = network === "mainnet"
    ? "https://mainnet.zklighter.elliot.ai"
    : "https://testnet.zklighter.elliot.ai";

  try {
    initSigner(url, privateKey, apiKeyIndex, accountIndex);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await addLog(userId, strategy.id, strategy.name, "error", "Batch: failed to initialize signer", msg);
    return;
  }

  // Get base nonce once — each subsequent order uses baseNonce + i
  let baseNonce: number;
  try {
    baseNonce = await getNextNonce(accountIndex, apiKeyIndex, network);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await addLog(userId, strategy.id, strategy.name, "error", "Batch: failed to get nonce", msg);
    return;
  }

  // Compute execution price and order params (same for all orders in this batch)
  let executionPrice: Decimal;
  let lighterOrderType: number;
  let lighterTimeInForce: number;
  let lighterOrderExpiry: number;

  if (orderKind === "limit" || orderKind === "post_only") {
    const offset = new Decimal(limitPriceOffset);
    executionPrice = side === "buy" ? currentPrice.sub(offset) : currentPrice.add(offset);
    lighterOrderType = 0;
    lighterTimeInForce = orderKind === "post_only" ? 2 : 1; // PostOnly=2, GoodTillTime=1
    // All limit orders (GTT and PostOnly) use -1 = DEFAULT_28_DAY_ORDER_EXPIRY
    // PostOnly orders that don't cross sit in the book and also need a valid expiry.
    lighterOrderExpiry = -1;
  } else {
    const slippageFactor = side === "buy" ? 1.05 : 0.95;
    executionPrice = currentPrice.mul(slippageFactor);
    lighterOrderType = 1;
    lighterTimeInForce = 0;
    lighterOrderExpiry = 0;
  }

  const priceInt = toPriceInt(executionPrice.toNumber(), priceDecimals);
  const isAsk = side === "sell";

  // Sign all orders sequentially, each with an incremented nonce
  const signedTxs: Array<{ txType: number; txInfo: string }> = [];
  const clientOrderIndexes: number[] = [];

  for (let i = 0; i < orderCount; i++) {
    const clientOrderIndex = nextClientOrderIndex();
    const nonce = baseNonce + i;

    const signResult = signCreateOrder({
      marketIndex: strategy.marketIndex,
      clientOrderIndex,
      baseAmount,
      price: priceInt,
      isAsk,
      orderType: lighterOrderType,
      timeInForce: lighterTimeInForce,
      reduceOnly: false,
      triggerPrice: 0,
      orderExpiry: lighterOrderExpiry,
      nonce,
      apiKeyIndex,
      accountIndex,
    });

    if (signResult.err) {
      await addLog(userId, strategy.id, strategy.name, "error",
        `Batch: sign failed for order ${i + 1}/${orderCount}`, signResult.err);
      break;
    }

    signedTxs.push({ txType: signResult.txType, txInfo: signResult.txInfo });
    clientOrderIndexes.push(clientOrderIndex);
  }

  if (signedTxs.length === 0) {
    await addLog(userId, strategy.id, strategy.name, "warn", "Batch: no orders could be signed");
    return;
  }

  await addLog(
    userId, strategy.id, strategy.name, "info",
    `Batch: submitting ${signedTxs.length}× ${side.toUpperCase()} orders via sendTxBatch`,
    `Size each: ${size.toFixed(6)} | Price: $${currentPrice.toFixed(2)} | Total: $${size.mul(currentPrice).mul(signedTxs.length).toFixed(2)}`
  );

  let batchResult: Awaited<ReturnType<typeof sendTxBatch>>;
  try {
    // price_protection is not supported by sendTxBatch API (only by single sendTx).
    // Market orders in grid batch are handled by the 5% slippage buffer in executionPrice.
    batchResult = await sendTxBatch(signedTxs, network);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await addLog(userId, strategy.id, strategy.name, "error", "Batch order submission failed", msg);
    for (let i = 0; i < signedTxs.length; i++) {
      await recordTrade({
        userId, strategyId: strategy.id, strategyName: strategy.name,
        marketIndex: strategy.marketIndex, marketSymbol: strategy.marketSymbol,
        side, size, price: currentPrice, status: "failed",
        errorMessage: msg, clientOrderIndex: clientOrderIndexes[i],
      });
    }
    return;
  }

  const txHashes = batchResult.tx_hash ?? [];

  // Record one pending trade per order, each with its own tx_hash
  for (let i = 0; i < signedTxs.length; i++) {
    await recordTrade({
      userId, strategyId: strategy.id, strategyName: strategy.name,
      marketIndex: strategy.marketIndex, marketSymbol: strategy.marketSymbol,
      side, size, price: currentPrice, status: "pending",
      orderHash: txHashes[i] ?? undefined,
      clientOrderIndex: clientOrderIndexes[i],
    });
  }

  await addLog(
    userId, strategy.id, strategy.name, "success",
    `Batch: ${signedTxs.length} ${side.toUpperCase()} orders submitted`,
    txHashes.length > 0 ? `TxHashes: ${txHashes.join(", ")}` : "No tx_hash returned from sequencer"
  );

}

async function executeGridCheck(strategy: typeof strategiesTable.$inferSelect) {
  const config = strategy.gridConfig as {
    lowerPrice: number;
    upperPrice: number;
    gridLevels: number;
    amountPerGrid: number;
    mode: "neutral" | "long" | "short";
    stopLoss?: number | null;
    takeProfit?: number | null;
    orderType?: "market" | "limit" | "post_only";
    limitPriceOffset?: number;
  };

  if (!config) return;

  const userId = strategy.userId ?? null;

  // ── SHORT-CIRCUIT a/b: Cek timeout/pending rerange SEBELUM apapun ─────────
  // Ini adalah check pertama sebelum fetch harga atau logika grid apapun.
  // Jika ada pending konfirmasi, bot tidak boleh menjalankan logika grid sama sekali.
  if (strategy.pendingRerangeAt) {
    const elapsed = Date.now() - new Date(strategy.pendingRerangeAt).getTime();
    const RERANGE_TIMEOUT_MS = 20 * 60 * 1000;

    if (elapsed > RERANGE_TIMEOUT_MS) {
      // (a) Timeout 20 menit: clear state, pause bot, kirim notifikasi
      await clearRerangeState(strategy.id);
      await addLog(
        userId, strategy.id, strategy.name, "warn",
        "⏸ Auto-Rerange timeout: tidak ada konfirmasi dalam 20 menit. Bot di-pause.",
        "User tidak merespons konfirmasi rerange. Atur parameter manual dari dashboard."
      );
      await notifyUser(
        userId,
        `⏸ *Bot Di-Pause*\nStrategy: *${strategy.name}*\n\nTidak ada konfirmasi rerange dalam 20 menit.\nAtur parameter manual dari dashboard lalu start kembali.`
      );
      await stopBot(strategy.id);
    }
    // (b) Pending ada tapi belum timeout → jangan jalankan logika grid apapun
    return;
  }
  // ─────────────────────────────────────────────────────────────────────────

  const botConfig = userId !== null ? await getBotConfig(userId) : null;
  const hasCredentials = !!(botConfig?.privateKey && botConfig?.accountIndex != null);
  const network = botConfig?.network ?? "mainnet";

  const currentPrice = await getCurrentPrice(strategy.marketIndex, network);
  if (!currentPrice) {
    await addLog(userId, strategy.id, strategy.name, "warn", "Could not fetch market price for grid check");
    return;
  }

  // SL/TP check
  if (config.stopLoss && currentPrice.lt(config.stopLoss)) {
    await addLog(userId, strategy.id, strategy.name, "warn",
      `Stop Loss triggered at $${currentPrice.toFixed(2)} (SL: $${config.stopLoss})`,
      "Bot stopped automatically due to stop loss"
    );
    if (userId !== null) {
      const notif = await getNotificationConfig(userId);
      if (notif.notifyOnStop) {
        await notifyUser(userId, `⚠️ *Stop Loss Triggered*\nStrategy: *${strategy.name}*\nPrice: $${currentPrice.toFixed(2)} ≤ SL: $${config.stopLoss}\nBot dihentikan otomatis.`);
      }
    }
    await stopBot(strategy.id);
    return;
  }

  if (config.takeProfit && currentPrice.gt(config.takeProfit)) {
    await addLog(userId, strategy.id, strategy.name, "success",
      `Take Profit triggered at $${currentPrice.toFixed(2)} (TP: $${config.takeProfit})`,
      "Bot stopped automatically due to take profit"
    );
    if (userId !== null) {
      const notif = await getNotificationConfig(userId);
      if (notif.notifyOnStop) {
        await notifyUser(userId, `🎯 *Take Profit Triggered*\nStrategy: *${strategy.name}*\nPrice: $${currentPrice.toFixed(2)} ≥ TP: $${config.takeProfit}\nBot dihentikan otomatis.`);
      }
    }
    await stopBot(strategy.id);
    return;
  }

  const lower = new Decimal(config.lowerPrice);
  const upper = new Decimal(config.upperPrice);
  const levels = config.gridLevels;
  const amountPerGrid = new Decimal(config.amountPerGrid);
  const mode = config.mode ?? "neutral";
  const gridSpacing = upper.sub(lower).div(levels);

  // Out-of-range: delegasikan ke Auto-Rerange engine
  // handleAutoRerange mengelola: counter candle, cooldown, daily limit, AI call,
  // simpan pending state ke DB, dan kirim konfirmasi ke Telegram.
  if (currentPrice.lt(lower) || currentPrice.gt(upper)) {
    const rerangeResult = await handleAutoRerange(strategy, currentPrice);

    switch (rerangeResult.type) {
      case "triggered":
        // Konfirmasi sudah dikirim ke Telegram. Bot menunggu respons user.
        // Tick berikutnya akan short-circuit via pendingRerangeAt check di atas.
        await addLog(
          userId, strategy.id, strategy.name, "warn",
          `🤖 Auto-Rerange triggered: harga $${currentPrice.toFixed(4)} keluar range. Menunggu konfirmasi user.`,
          `Range lama: $${lower.toFixed(4)}-$${upper.toFixed(4)} | Range baru AI: $${rerangeResult.params.newLowerPrice.toFixed(4)}-$${rerangeResult.params.newUpperPrice.toFixed(4)}`
        );
        break;
      case "continue":
        // Counter belum cukup (< 5 tick), atau cooldown aktif, atau limit harian.
        // Tetap log warning seperti sebelumnya agar user bisa monitor.
        await addLog(
          userId, strategy.id, strategy.name, "warn",
          `Price $${currentPrice.toFixed(4)} outside range ($${lower.toFixed(4)} - $${upper.toFixed(4)}) — waiting (${(strategy.consecutiveOutOfRange ?? 0) + 1}/5 ticks)`
        );
        break;
      // "short_circuit" dan "timeout" tidak akan terjadi di sini
      // karena sudah ditangani di short-circuit block di atas (pendingRerangeAt check).
    }
    return;
  }

  // Current level: 0 = at lower, levels-1 = near upper
  const currentLevel = Math.min(
    Math.floor(currentPrice.sub(lower).div(gridSpacing).toNumber()),
    levels - 1
  );

  const existingState = gridStates.get(strategy.id);

  // First run: initialize state only, no order
  if (!existingState) {
    gridStates.set(strategy.id, { lastLevel: currentLevel, initializedAt: new Date() });
    await addLog(
      userId,
      strategy.id,
      strategy.name,
      "info",
      `Grid initialized at level ${currentLevel}/${levels}`,
      `Price: $${currentPrice.toFixed(2)} | Range: $${lower.toFixed(2)}-$${upper.toFixed(2)} | Spacing: $${gridSpacing.toFixed(2)}`
    );
    return;
  }

  const lastLevel = existingState.lastLevel;

  // No crossing: just log
  if (currentLevel === lastLevel) {
    await addLog(
      userId,
      strategy.id,
      strategy.name,
      "info",
      `Grid check: level ${currentLevel}/${levels} | price $${currentPrice.toFixed(2)} | no crossing`
    );
    return;
  }

  const levelsMoved = currentLevel - lastLevel;
  const direction = levelsMoved < 0 ? "down" : "up";

  // Determine side based on direction and mode
  // Price DOWN → buy (accumulate), price UP → sell (take profit)
  let side: "buy" | "sell" | null = null;
  if (direction === "down" && (mode === "neutral" || mode === "long")) {
    side = "buy";
  } else if (direction === "up" && (mode === "neutral" || mode === "short")) {
    side = "sell";
  }

  // Update state immediately to prevent re-triggering
  existingState.lastLevel = currentLevel;

  if (!side) {
    await addLog(
      userId,
      strategy.id,
      strategy.name,
      "info",
      `Grid crossed ${Math.abs(levelsMoved)} level(s) ${direction} → no action (mode: ${mode})`
    );
    return;
  }

  // Place one order per level crossed, capped at MAX_BATCH_ORDERS
  const orderCount = Math.min(Math.abs(levelsMoved), MAX_BATCH_ORDERS);
  const size = amountPerGrid.div(currentPrice);

  await addLog(
    userId,
    strategy.id,
    strategy.name,
    "info",
    `Grid crossed ${Math.abs(levelsMoved)} level(s) ${direction} → ${side.toUpperCase()} ×${orderCount}`,
    `Level: ${lastLevel} → ${currentLevel} | Price: $${currentPrice.toFixed(2)} | Size each: ${size.toFixed(6)} | Amount each: $${amountPerGrid.toFixed(2)}`
  );

  if (!hasCredentials) {
    // Paper trading — simulate one order per level crossed
    for (let i = 0; i < orderCount; i++) {
      await recordTrade({
        userId,
        strategyId: strategy.id,
        strategyName: strategy.name,
        marketIndex: strategy.marketIndex,
        marketSymbol: strategy.marketSymbol,
        side,
        size,
        price: currentPrice,
        status: "filled",
        orderHash: `paper_${Date.now()}_${i}`,
      });
      await updateStrategyStatsAtomic(strategy.id, side, size, currentPrice);
    }
    await addLog(
      userId, strategy.id, strategy.name, "warn",
      `Paper trade: ${orderCount}× ${side.toUpperCase()} ${size.toFixed(6)} @ $${currentPrice.toFixed(2)}`,
      "No API credentials configured — simulated orders only"
    );
  } else if (orderCount === 1) {
    // Single level crossed — use the original single-order path
    await executeLiveOrder({
      userId,
      strategy,
      botConfig: botConfig!,
      side,
      size,
      currentPrice,
      network,
      orderKind: config.orderType ?? "market",
      limitPriceOffset: config.limitPriceOffset ?? 0,
    });
  } else {
    // Multiple levels crossed — send all orders in a single sendTxBatch call
    await executeBatchLiveOrders({
      userId,
      strategy,
      botConfig: botConfig!,
      side,
      size,
      currentPrice,
      network,
      orderCount,
      orderKind: config.orderType ?? "market",
      limitPriceOffset: config.limitPriceOffset ?? 0,
    });
  }
}

async function runStrategyOnce(strategyId: number) {
  const strategy = await db.query.strategiesTable.findFirst({
    where: eq(strategiesTable.id, strategyId),
  });

  if (!strategy || !strategy.isActive || !strategy.isRunning) {
    await stopBot(strategyId);
    return;
  }

  try {
    if (strategy.type === "dca") {
      await executeDcaOrder(strategy);
    } else if (strategy.type === "grid") {
      await executeGridCheck(strategy);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await addLog(strategy.userId ?? null, strategy.id, strategy.name, "error", `Strategy execution error: ${message}`);
    logger.error({ err, strategyId }, "Strategy execution error");
    if (strategy.userId) {
      getNotificationConfig(strategy.userId).then(notif => {
        if (notif.notifyOnError) notifyUser(strategy.userId, `🚨 *Strategy Error*\n*${strategy.name}*\n${message}`);
      }).catch(() => {});
    }
  }
}

export async function startBot(strategyId: number): Promise<boolean> {
  if (runningBots.has(strategyId)) return true;

  const strategy = await db.query.strategiesTable.findFirst({
    where: eq(strategiesTable.id, strategyId),
  });

  if (!strategy) return false;

  // ── Exchange guard: tolak strategy bukan milik Lighter ───────────────────────
  if (strategy.exchange !== "lighter") {
    logger.warn({ strategyId, exchange: strategy.exchange }, "[HokirecehProjects] startBot dipanggil untuk non-lighter strategy — diabaikan");
    return false;
  }

  // ── Pre-flight: validate amount against exchange minimums — HARD STOP ────────
  // If the configured amount is below the exchange minimum, the bot will never
  // place any orders. We refuse to start rather than let it run silently idle.
  {
    const userId = strategy.userId ?? null;
    let validationError: string | null = null;

    try {
      const botCfg = userId !== null ? await getBotConfig(userId).catch(() => null) : null;
      const network = botCfg?.network ?? "mainnet";
      const marketInfo = await getMarketInfo(strategy.marketIndex, network);

      if (marketInfo) {
        const lastPrice = marketInfo.lastTradePrice > 0 ? marketInfo.lastTradePrice : null;

        let amount = 0;
        let amountLabel = "";

        if (strategy.type === "grid") {
          amount = (strategy.gridConfig as any)?.amountPerGrid ?? 0;
          amountLabel = "amountPerGrid";
        } else if (strategy.type === "dca") {
          amount = (strategy.dcaConfig as any)?.amountPerOrder ?? 0;
          amountLabel = "amountPerOrder";
        }

        if (amount > 0) {
          // Check minQuoteAmount (amount is already in USDC)
          if (marketInfo.minQuoteAmount > 0 && amount < marketInfo.minQuoteAmount) {
            const recommended = Math.ceil(marketInfo.minQuoteAmount * 1.2);
            validationError = `${amountLabel} ($${amount}) di bawah minimum exchange ($${marketInfo.minQuoteAmount} USDC). Naikkan ke minimal $${recommended}.`;
          }

          // Check minBaseAmount using last known price
          if (!validationError && lastPrice && marketInfo.minBaseAmount > 0) {
            const estimatedSize = amount / lastPrice;
            if (estimatedSize < marketInfo.minBaseAmount) {
              const minNeeded = Math.ceil(marketInfo.minBaseAmount * lastPrice * 1.2 * 100) / 100;
              validationError = `${amountLabel} ($${amount}) terlalu kecil — estimasi ${estimatedSize.toFixed(6)} ${marketInfo.baseAsset} < minimum ${marketInfo.minBaseAmount} ${marketInfo.baseAsset}. Naikkan ke minimal $${minNeeded}.`;
            }
          }
        }
      }
    } catch (_err) {
      // Market info fetch failed — best-effort, don't block start
    }

    if (validationError) {
      await addLog(userId, strategyId, strategy.name, "error",
        `❌ Bot tidak dapat dimulai: ${validationError}`
      );
      throw new Error(`BOT_VALIDATION_FAILED: ${validationError}`);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  const isGrid = strategy.type === "grid";
  const intervalMs = strategy.type === "dca"
    ? ((strategy.dcaConfig as { intervalMinutes?: number })?.intervalMinutes ?? 60) * 60 * 1000
    : GRID_FALLBACK_INTERVAL_MS;

  const nextRunAt = new Date(Date.now() + intervalMs);

  await db.update(strategiesTable)
    .set({ isRunning: true, isActive: true, updatedAt: new Date(), nextRunAt })
    .where(eq(strategiesTable.id, strategyId));

  // Grid bots: register a WebSocket price callback for real-time level detection
  if (isGrid) {
    const botConfig = strategy.userId !== null ? await getBotConfig(strategy.userId!).catch(() => null) : null;
    const network = botConfig?.network ?? "mainnet";

    registerPriceCallback(
      strategy.marketIndex,
      strategyId,
      (_midPrice, _mktIdx) => {
        const now = Date.now();
        const last = wsGridLastTriggered.get(strategyId) ?? 0;
        if (now - last < WS_GRID_COOLDOWN_MS) return;
        if (!runningBots.has(strategyId)) return;
        wsGridLastTriggered.set(strategyId, now);
        runStrategyOnce(strategyId).catch(() => {});
      },
      network
    );
  }

  const timer = setInterval(async () => {
    const bot = runningBots.get(strategyId);
    if (bot) {
      const nextInterval = strategy.type === "dca"
        ? ((strategy.dcaConfig as { intervalMinutes?: number })?.intervalMinutes ?? 60) * 60 * 1000
        : GRID_FALLBACK_INTERVAL_MS;
      bot.nextRunAt = new Date(Date.now() + nextInterval);
    }
    await runStrategyOnce(strategyId);
  }, intervalMs);

  runningBots.set(strategyId, { strategyId, timer, nextRunAt });

  const intervalLabel = isGrid
    ? `WebSocket realtime + ${GRID_FALLBACK_INTERVAL_MS / 60000} min fallback`
    : `every ${intervalMs / 60000} min`;
  await addLog(strategy.userId ?? null, strategyId, strategy.name, "success", `Bot started`, `Mode: ${intervalLabel}`);
  logger.info({ strategyId, type: strategy.type }, "Bot started");

  if (strategy.userId !== null && strategy.userId !== undefined) {
    const notif = await getNotificationConfig(strategy.userId).catch(() => null);
    if (notif?.notifyOnStart) {
      await notifyUser(strategy.userId, `🚀 *Bot Started*\nStrategy: *${strategy.name}*\nType: ${strategy.type.toUpperCase()}\nMarket: ${strategy.marketSymbol}`);
    }
  }

  setTimeout(() => runStrategyOnce(strategyId), 2000);

  return true;
}

export async function stopBot(strategyId: number, skipDbUpdate = false): Promise<boolean> {
  const bot = runningBots.get(strategyId);
  if (bot) {
    clearInterval(bot.timer);
    runningBots.delete(strategyId);
  }
  gridStates.delete(strategyId);
  wsGridLastTriggered.delete(strategyId);

  const strategy = await db.query.strategiesTable.findFirst({
    where: eq(strategiesTable.id, strategyId),
  });

  // Reset auto-rerange state saat bot di-stop/pause karena alasan apapun
  // (timeout konfirmasi, reject user, SL/TP triggered, manual stop).
  // Ini mencegah counter stale consecutiveOutOfRange saat bot restart setelah pause,
  // sehingga rerange tidak langsung trigger ulang begitu bot dinyalakan kembali.
  await clearRerangeState(strategyId);

  // Unregister WebSocket callback for grid bots
  if (strategy?.type === "grid") {
    unregisterPriceCallback(strategy.marketIndex, strategyId);
  }

  await db.update(strategiesTable)
    if (!skipDbUpdate) await db.update(strategiesTable)
    .set({ isRunning: false, updatedAt: new Date(), nextRunAt: null })
    .where(eq(strategiesTable.id, strategyId));

  if (strategy) {
    await addLog(strategy.userId ?? null, strategyId, strategy.name, "warn", "Bot stopped");
    if (strategy.userId !== null && strategy.userId !== undefined) {
      const notif = await getNotificationConfig(strategy.userId).catch(() => null);
      if (notif?.notifyOnStop) {
        await notifyUser(strategy.userId, `⛔ *Bot Stopped*\nStrategy: *${strategy.name}*\nMarket: ${strategy.marketSymbol}`);
      }
    }
  }

  return true;
}

export async function restoreRunningBots() {
  const strategies = await db.query.strategiesTable.findMany({
    where: eq(strategiesTable.isRunning, true),
  });

  for (const strategy of strategies) {
    logger.info({ strategyId: strategy.id }, "Restoring running bot");
    try {
      await startBot(strategy.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isValidationFail = message.startsWith("BOT_VALIDATION_FAILED:");

      logger.error({ strategyId: strategy.id, err }, "Failed to restore bot");

      // Mark as stopped in DB so it won't be retried on next restart
      await db
        .update(strategiesTable)
        .set({ isRunning: false })
        .where(eq(strategiesTable.id, strategy.id));

      if (isValidationFail) {
        // Log already written by startBot — no duplicate needed
        logger.warn(
          { strategyId: strategy.id, reason: message },
          "Bot config outdated after restart — marked as stopped. User must review settings."
        );
      }
    }
  }
}

const LOG_RETENTION_DAYS = 30;

export async function cleanupOldLogs() {
  try {
    const cutoff = new Date(Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const result = await db.delete(botLogsTable).where(lt(botLogsTable.createdAt, cutoff));
    logger.info({ cutoff }, "Old bot logs cleaned up");
  } catch (err) {
    logger.error({ err }, "Failed to cleanup old logs");
  }
}

export function startLogCleanupSchedule() {
  cleanupOldLogs();
  setInterval(cleanupOldLogs, 24 * 60 * 60 * 1000);
}

// ─── TRADE STATUS POLLING ───────────────────────────────────────────────────
// Lighter transaction status codes (from official docs):
//   0 = Failed / Cancelled by sequencer
//   1 = Pending
//   2 = Executed (filled)
//   3 = Pending - Final State
//
// BUG FIX: timeout check MUST come AFTER getTx, not before.
// Previously the timeout fired before calling getTx, meaning a filled order
// that had a slow indexer would be marked "failed" without ever being re-checked.
// Correct order: (1) call getTx, (2) act on status, (3) only if getTx returns
// null AND age > timeout, THEN mark as timed-out.

const TRADE_POLL_INTERVAL_MS = 5_000;   // 5 s — fast enough for IOC market orders
const TRADE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export async function pollPendingTrades() {
  try {
    const pendingTrades = await db.query.tradesTable.findMany({
      where: and(
        eq(tradesTable.status, "pending"),
        isNotNull(tradesTable.orderHash),
        ne(tradesTable.orderHash, "")
      ),
    });

    if (pendingTrades.length === 0) return;

    // Group unique userIds to look up network config per user
    const uniqueUserIds = [...new Set(
      pendingTrades.map((t) => t.userId).filter((id): id is number => id !== null)
    )];

    const networkByUserId = new Map<number, "mainnet" | "testnet">();
    await Promise.all(
      uniqueUserIds.map(async (userId) => {
        try {
          const config = await getBotConfig(userId);
          networkByUserId.set(userId, config.network);
        } catch {
          networkByUserId.set(userId, "mainnet");
        }
      })
    );

    for (const trade of pendingTrades) {
      const orderHash = trade.orderHash!;

      // Skip paper trades
      if (orderHash.startsWith("paper_")) continue;

      // Skip Extended DEX trades — dikelola oleh pollPendingExtendedTrades() di extendedBotEngine.ts
      if (orderHash.startsWith("ext_")) continue;

      const network = trade.userId !== null
        ? (networkByUserId.get(trade.userId) ?? "mainnet")
        : "mainnet";

      const ageMs = Date.now() - new Date(trade.createdAt).getTime();

      // STEP 1: Always call getTx first — never skip it for timeouts
      const txResponse = await getTx("hash", orderHash, network);

      // EnrichedTx response is flat — check txResponse.hash (required field) to confirm Lighter indexed it
      if (!txResponse || !txResponse.hash) {
        // Lighter hasn't indexed this tx yet (or network error)
        // ONLY mark as timed-out if we've been waiting too long with no response
        if (ageMs > TRADE_TIMEOUT_MS) {
          await db.update(tradesTable)
            .set({ status: "failed", errorMessage: "Order timed out — Lighter did not index this tx after 10 minutes" })
            .where(eq(tradesTable.id, trade.id));

          await addLog(
            trade.userId ?? null,
            trade.strategyId,
            trade.strategyName,
            "error",
            `${trade.side.toUpperCase()} order timed out`,
            `TxHash: ${orderHash} | Lighter returned no data after 10 minutes — check exchange directly`
          );

          logger.warn({ tradeId: trade.id, orderHash }, "Trade timed out — no Lighter indexer data after 10 min");
        }
        // else: still within timeout window, keep polling next cycle
        continue;
      }

      // STEP 2: We have a definitive response from Lighter — act on it (fields are flat at root)
      const txStatus = txResponse.status;
      const executedAt = txResponse.executed_at;

      // Lighter tx status:
      //   0 = Failed/Cancelled
      //   1 = Queued/Pending
      //   2 = Committed & L1-verified (full finality)
      //   3 = Committed to L2 (trade has happened, awaiting L1 batch proof)
      //
      // Status 3 with executed_at set = order has been processed on L2.
      // From a trading perspective this IS "filled" — L1 proof is a formality.
      const isFilled = txStatus === 2 || (txStatus === 3 && !!executedAt);

      if (isFilled) {
        const execTime = executedAt ? new Date(executedAt) : new Date();
        await db.update(tradesTable)
          .set({ status: "filled", executedAt: execTime })
          .where(eq(tradesTable.id, trade.id));

        await addLog(
          trade.userId ?? null,
          trade.strategyId,
          trade.strategyName,
          "success",
          `${trade.side.toUpperCase()} order confirmed (filled)`,
          `TxHash: ${orderHash} | Size: ${trade.size} | Price: ${trade.price} | L2 status: ${txStatus}`
        );

        // Update strategy stats now that the order is confirmed filled
        try {
          await updateStrategyStatsAtomic(
            trade.strategyId,
            trade.side as "buy" | "sell",
            new Decimal(trade.size),
            new Decimal(trade.price)
          );
        } catch (e) {
          logger.warn({ tradeId: trade.id }, "Failed to update strategy stats after fill");
        }

        // Notify user via Telegram (respect notifyOnBuy / notifyOnSell settings)
        if (trade.userId !== null) {
          const notif = await getNotificationConfig(trade.userId).catch(() => null);
          const shouldNotify = trade.side === "buy"
            ? (notif?.notifyOnBuy ?? true)
            : (notif?.notifyOnSell ?? true);
          if (shouldNotify) {
            await notifyUser(
              trade.userId,
              `✅ *Order Filled*\n${trade.side.toUpperCase()} ${trade.size} ${trade.marketSymbol} @ $${parseFloat(trade.price).toFixed(2)}`
            );
          }
        }

        logger.info({ tradeId: trade.id, orderHash, txStatus }, "Trade confirmed as filled");

      } else if (txStatus === 0) {
        // Failed / cancelled by sequencer (includes IOC not filled)
        const errMsg = `Order cancelled/failed by Lighter sequencer (status=0)`;

        await db.update(tradesTable)
          .set({ status: "cancelled", errorMessage: errMsg })
          .where(eq(tradesTable.id, trade.id));

        await addLog(
          trade.userId ?? null,
          trade.strategyId,
          trade.strategyName,
          "warn",
          `${trade.side.toUpperCase()} order cancelled by sequencer`,
          `TxHash: ${orderHash} | IOC order may have found no liquidity`
        );

        logger.warn({ tradeId: trade.id, orderHash, txStatus }, "Trade cancelled by Lighter sequencer");

      }
      // txStatus === 1 = Queued → keep polling
      // txStatus === 3 without executed_at = committed but not yet executed → keep polling
    }
  } catch (err) {
    logger.error({ err }, "Error during pending trade poll");
  }
}

export function startTradePollSchedule() {
  setInterval(pollPendingTrades, TRADE_POLL_INTERVAL_MS);
  logger.info({ intervalMs: TRADE_POLL_INTERVAL_MS }, "Trade status polling started");
}
