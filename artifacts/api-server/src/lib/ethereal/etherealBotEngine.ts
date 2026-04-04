import { db } from "@workspace/db";
import { strategiesTable, tradesTable, botLogsTable } from "@workspace/db";
import { eq, sql, and, isNotNull, ne, gte, lte } from "drizzle-orm";
import Decimal from "decimal.js";
import { logger } from "../logger";
import { sendMessageToUser } from "../telegramBot";
import {
  placeOrder,
  cancelOrder,
  getFills,
  getMarketPrice,
} from "./etherealApi";
import type { EtherealNetwork } from "./etherealApi";
import {
  registerEtherealPriceCallback,
  unregisterEtherealPriceCallback,
  getEtherealWsCachedPrice,
} from "./etherealWs";
import {
  getProductByTicker,
  getProductInfo,
  roundToStepStr,
  roundToTickStr,
} from "./etherealMarkets";
import type { ProductInfo } from "./etherealMarkets";
import {
  signTradeOrder,
  signCancelOrder,
  getWalletAddress,
  decimalToBigInt,
  generateNonce,
  generateSignedAt,
  DEFAULT_SUBACCOUNT,
} from "./etherealSigner";
import {
  getBotConfig,
  getEtherealCredentials,
} from "../../routes/configService";
import { handleAutoRerange, clearRerangeState } from "../autoRerange";
import { getDuplicateTolerance } from "../shared/tolerance";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ─── STATE TERISOLASI ─────────────────────────────────────────────────────────

interface EtherealRunningBot {
  strategyId: number;
  timer: NodeJS.Timeout;
  nextRunAt: Date;
}

interface EtherealGridState {
  lastLevel: number;
  initializedAt: Date;
}

const etherealRunningBots = new Map<number, EtherealRunningBot>();
const etherealGridStates = new Map<number, EtherealGridState>();
const ethWsGridLastTriggered = new Map<number, number>();

const ETH_WS_GRID_COOLDOWN_MS    = 10_000;
const ETH_GRID_FALLBACK_INTERVAL = 5 * 60 * 1000;

// ─── STATUS QUERIES ───────────────────────────────────────────────────────────

export function isEtherealBotRunning(strategyId: number): boolean {
  return etherealRunningBots.has(strategyId);
}

export function getEtherealBotNextRunAt(strategyId: number): Date | null {
  return etherealRunningBots.get(strategyId)?.nextRunAt ?? null;
}

export function getAllRunningEtherealBots(): { strategyId: number; nextRunAt: Date }[] {
  return Array.from(etherealRunningBots.entries()).map(([id, bot]) => ({
    strategyId: id,
    nextRunAt: bot.nextRunAt,
  }));
}

// ─── CREDENTIALS ──────────────────────────────────────────────────────────────

interface EtherealCreds {
  privateKey: string;
  walletAddress: string;
  subaccountId: string;
  subaccountName: string;
  network: EtherealNetwork;
  hasCredentials: boolean;
}

async function getEtherealConfig(userId: number): Promise<EtherealCreds | null> {
  try {
    const creds = await getEtherealCredentials(userId);
    if (!creds.privateKey || !creds.subaccountId) {
      return null;
    }

    let walletAddress = creds.walletAddress;
    if (!walletAddress && creds.privateKey) {
      walletAddress = getWalletAddress(creds.privateKey);
    }

    const subaccountName = creds.subaccountName ?? DEFAULT_SUBACCOUNT;

    return {
      privateKey: creds.privateKey,
      walletAddress: walletAddress ?? "",
      subaccountId: creds.subaccountId,
      subaccountName,
      network: creds.etherealNetwork,
      hasCredentials: true,
    };
  } catch {
    return null;
  }
}

// ─── LOG & NOTIFIKASI ─────────────────────────────────────────────────────────

async function ethAddLog(
  userId: number | null,
  strategyId: number | null,
  strategyName: string | null,
  level: "info" | "warn" | "error" | "success",
  message: string,
  details?: string
): Promise<void> {
  try {
    await db.insert(botLogsTable).values({
      userId,
      strategyId,
      strategyName,
      level,
      message,
      details: details ?? null,
      exchange: "ethereal",
    });
  } catch (err) {
    logger.error({ err }, "[EtherealBot] Failed to add bot log");
  }
}

async function ethNotifyUser(userId: number | null, message: string): Promise<void> {
  if (userId === null || userId === undefined) return;
  try {
    const botCfg = await getBotConfig(userId);
    if (!botCfg.notifyBotToken || !botCfg.notifyChatId) return;
    const result = await sendMessageToUser(botCfg.notifyChatId, message, botCfg.notifyBotToken);
    if (!result.ok) {
      await ethAddLog(userId, null, null, "warn",
        `[Notifikasi Telegram gagal] ${result.error ?? "Unknown error"}`);
    }
  } catch (err: any) {
    logger.error({ err }, "[EtherealBot] Unexpected error in ethNotifyUser");
  }
}

async function ethGetNotificationConfig(userId: number) {
  const botCfg = await getBotConfig(userId).catch(() => null);
  return {
    notifyOnBuy: botCfg?.notifyOnBuy ?? true,
    notifyOnSell: botCfg?.notifyOnSell ?? true,
    notifyOnError: botCfg?.notifyOnError ?? true,
    notifyOnStart: botCfg?.notifyOnStart ?? true,
    notifyOnStop: botCfg?.notifyOnStop ?? false,
  };
}

// ─── DB: CATAT TRADE ──────────────────────────────────────────────────────────

async function ethRecordTrade(params: {
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
  errorMessage?: string;
  fee?: string;
}): Promise<void> {
  await db.insert(tradesTable).values({
    userId: params.userId,
    strategyId: params.strategyId,
    strategyName: params.strategyName,
    marketIndex: params.marketIndex,
    marketSymbol: params.marketSymbol,
    side: params.side,
    size: params.size.toFixed(8),
    price: params.price.toFixed(8),
    fee: params.fee ?? "0",
    status: params.status,
    orderHash: params.orderHash ?? null,
    clientOrderIndex: null,
    exchange: "ethereal",
    errorMessage: params.errorMessage ?? null,
    executedAt: params.status === "filled" ? new Date() : null,
  });
}

async function ethUpdateStrategyStatsAtomic(
  strategyId: number,
  side: "buy" | "sell",
  size: Decimal,
  price: Decimal
): Promise<void> {
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

// ─── HARGA SAAT INI ───────────────────────────────────────────────────────────

async function ethGetCurrentPrice(
  productUuid: string,
  ticker: string,
  network: EtherealNetwork = "mainnet"
): Promise<Decimal | null> {
  // Preferensi: WS cache (real-time, max 5 detik lalu)
  const cached = getEtherealWsCachedPrice(productUuid, 5_000);
  if (cached) return cached;

  // Fallback: REST API market price
  try {
    const priceData = await getMarketPrice(productUuid, network);
    if (priceData?.price) {
      const p = new Decimal(priceData.price);
      if (p.gt(0)) {
        logger.info({ ticker, price: p.toFixed(4) }, "[EtherealBot] Harga dari REST fallback");
        return p;
      }
    }
  } catch (err) {
    logger.warn({ err, ticker }, "[EtherealBot] REST price fallback gagal");
  }

  return null;
}

// ─── PAPER TRADE ─────────────────────────────────────────────────────────────

async function ethExecutePaperTrade(params: {
  userId: number | null;
  strategy: typeof strategiesTable.$inferSelect;
  side: "buy" | "sell";
  size: Decimal;
  price: Decimal;
  orderCount?: number;
}): Promise<void> {
  const { userId, strategy, side, size, price } = params;
  const count = params.orderCount ?? 1;
  for (let i = 0; i < count; i++) {
    await ethRecordTrade({
      userId,
      strategyId: strategy.id,
      strategyName: strategy.name,
      marketIndex: strategy.marketIndex,
      marketSymbol: strategy.marketSymbol,
      side,
      size,
      price,
      status: "filled",
      orderHash: `eth_paper_${Date.now()}_${i}`,
    });
    await ethUpdateStrategyStatsAtomic(strategy.id, side, size, price);
  }
  const label = count > 1 ? `×${count}` : "";
  await ethAddLog(userId, strategy.id, strategy.name, "warn",
    `Paper trade${label}: ${side.toUpperCase()} ${size.toFixed(6)} @ $${price.toFixed(2)}`,
    "Credentials Ethereal belum dikonfigurasi — hanya simulasi"
  );
}

// ─── LIVE ORDER ───────────────────────────────────────────────────────────────

async function ethExecuteLiveOrder(params: {
  userId: number | null;
  strategy: typeof strategiesTable.$inferSelect;
  creds: EtherealCreds;
  productInfo: ProductInfo;
  side: "buy" | "sell";
  size: Decimal;
  currentPrice: Decimal;
  orderKind?: "market" | "limit" | "post_only";
  limitPriceOffset?: number;
}): Promise<void> {
  const { userId, strategy, creds, productInfo, side, size, currentPrice } = params;
  const orderKind = params.orderKind ?? "market";
  const limitPriceOffset = params.limitPriceOffset ?? 0;
  const network = creds.network;

  // ── Hitung execution price ────────────────────────────────────────────────
  let executionPriceStr: string;
  let orderType: "LIMIT" | "MARKET";

  // Dikonfirmasi dari OpenAPI OrderDto.price:
  //   "Limit price in native units expressed as a decimal, zero if market order (precision: 9)"
  // → EIP-712 price untuk MARKET order = 0n
  // → REST body tidak mengirim field price untuk MARKET order (sudah benar)

  if (orderKind === "market") {
    executionPriceStr = "0";
    orderType = "MARKET";
  } else {
    const offset = new Decimal(limitPriceOffset);
    const rawPrice = side === "buy" ? currentPrice.sub(offset) : currentPrice.add(offset);
    executionPriceStr = roundToTickStr(rawPrice.toNumber(), productInfo.tickSize, productInfo.priceDecimals);
    orderType = "LIMIT";
  }

  const sizeStr = roundToStepStr(size.toNumber(), productInfo.lotSize, productInfo.sizeDecimals);
  const executionPrice = new Decimal(executionPriceStr);
  const execSizeDecimal = new Decimal(sizeStr);

  await ethAddLog(userId, strategy.id, strategy.name, "info",
    `Ethereal ${side.toUpperCase()} order akan dikirim`,
    `Type: ${orderType} | Size: ${sizeStr} | Price: $${executionPriceStr} | Network: ${network}`
  );

  // ── Prepare EIP-712 order data ─────────────────────────────────────────────
  // Perbedaan dari Lighter:
  //   Lighter → nonce dari GET /api/v1/nextNonce (server-side)
  //   Ethereal → nonce lokal: BigInt(Date.now()) * 1_000_000n (nanoseconds)
  //
  // Perbedaan dari Extended:
  //   Extended → Starknet Poseidon hash via extendedSigner.ts
  //   Ethereal → EIP-712 via ethers.Wallet.signTypedData()

  const nonce = generateNonce();
  const signedAt = generateSignedAt();

  const orderData = {
    sender:     creds.walletAddress,
    subaccount: creds.subaccountName,  // bytes32 hex (sama antara EIP-712 dan REST body)
    quantity:   decimalToBigInt(sizeStr),           // decimal × 1e9 → uint128
    price:      decimalToBigInt(executionPriceStr), // decimal × 1e9 → uint128
    reduceOnly: false,
    side:       (side === "buy" ? 0 : 1) as 0 | 1,
    engineType: productInfo.engineType,
    productId:  productInfo.onchainId,  // integer onchainId, bukan UUID
    nonce,
    signedAt,
  };

  let signature: string;
  try {
    signature = await signTradeOrder(creds.privateKey, orderData, network);
  } catch (err: any) {
    const msg = `Signing gagal: ${err.message}`;
    await ethAddLog(userId, strategy.id, strategy.name, "error", msg);
    await ethRecordTrade({
      userId, strategyId: strategy.id, strategyName: strategy.name,
      marketIndex: strategy.marketIndex, marketSymbol: strategy.marketSymbol,
      side, size: execSizeDecimal, price: executionPrice, status: "failed", errorMessage: msg,
    });
    return;
  }

  // ── Submit order ke Ethereal ───────────────────────────────────────────────
  // Perbedaan dari Lighter (form-urlencoded sendTx):
  //   Ethereal → JSON body: { data: {...}, signature: "0x..." }
  //
  // Catatan field penting (dari OpenAPI SubmitOrderMarketDtoData):
  //   - quantity: decimal string "5.5" (bukan raw uint128) — precision 9
  //   - price: hanya untuk LIMIT, tidak ada di MARKET body
  //   - nonce: string decimal nanoseconds (bukan bigint — JSON tidak support bigint)
  //   - onchainId: integer ID produk
  //   - subaccount: bytes32 hex (sama persis dengan yang dipakai EIP-712)

  const body = {
    data: {
      subaccount: creds.subaccountName,
      sender:     creds.walletAddress,
      nonce:      nonce.toString(),      // bigint → string (JSON safe)
      type:       orderType,
      quantity:   sizeStr,               // decimal string, precision 9
      side:       side === "buy" ? 0 : 1,
      onchainId:  productInfo.onchainId,
      engineType: productInfo.engineType,
      signedAt,
      price:      orderType === "LIMIT" ? executionPriceStr : undefined,
      reduceOnly: false,
    },
    signature,
  };

  let submitResult: Awaited<ReturnType<typeof placeOrder>>;
  try {
    submitResult = await placeOrder(body, network);
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ strategyId: strategy.id, side, err: msg }, "[EtherealBot] Order submission FAILED");
    await ethAddLog(userId, strategy.id, strategy.name, "error", "Order submission gagal", msg);
    if (userId !== null) {
      const notif = await ethGetNotificationConfig(userId);
      if (notif.notifyOnError) {
        await ethNotifyUser(userId, `❌ *Order Gagal (Ethereal)*\n*${strategy.name}*\n${msg}`);
      }
    }
    await ethRecordTrade({
      userId, strategyId: strategy.id, strategyName: strategy.name,
      marketIndex: strategy.marketIndex, marketSymbol: strategy.marketSymbol,
      side, size: execSizeDecimal, price: currentPrice, status: "failed", errorMessage: msg,
    });
    return;
  }

  // ── Cek result dari API ────────────────────────────────────────────────────
  // KRITIS: HTTP 200 TIDAK berarti order berhasil terisi.
  // API Ethereal selalu return 200 tapi dengan field "result" yang menunjukkan status.
  // Sumber: OpenAPI SubmitOrderCreatedDto.result
  //
  // "Ok" = order diterima (bisa pending atau filled)
  // "UnfilledMarketOrder" = market order tidak ada likuiditas → gagal
  // "InsufficientBalance" = balance kurang → gagal
  // dll

  const isAccepted = submitResult.result === "Ok";
  const orderId = submitResult.id;
  const orderHash = `eth_${orderId}`;

  if (!isAccepted) {
    const msg = `Order ditolak oleh Ethereal: result=${submitResult.result}`;
    logger.warn({ strategyId: strategy.id, side, result: submitResult.result, orderId }, "[EtherealBot] Order REJECTED");
    await ethAddLog(userId, strategy.id, strategy.name, "warn",
      `Order ditolak (${orderType})`,
      `Result: ${submitResult.result} | OrderId: ${orderId}`
    );
    await ethRecordTrade({
      userId, strategyId: strategy.id, strategyName: strategy.name,
      marketIndex: strategy.marketIndex, marketSymbol: strategy.marketSymbol,
      side, size: execSizeDecimal, price: executionPrice, status: "failed",
      errorMessage: msg, orderHash,
    });
    if (userId !== null) {
      const notif = await ethGetNotificationConfig(userId);
      if (notif.notifyOnError) {
        await ethNotifyUser(userId,
          `⚠️ *Order Ditolak (Ethereal)*\n*${strategy.name}*\n` +
          `Result: ${submitResult.result}\nType: ${orderType} ${side.toUpperCase()}`
        );
      }
    }
    return;
  }

  // ── Tentukan status berdasarkan tipe order dan fill immediate ─────────────
  // Untuk MARKET orders: cek submitResult.filled untuk tahu apakah langsung terisi
  // Untuk LIMIT orders: selalu "pending" — polling akan update saat fill terjadi

  const isMarket = orderType === "MARKET";
  const filledAmount = new Decimal(submitResult.filled ?? "0");

  const immediatelyFilled = isMarket && filledAmount.gt(0);

  const tradeStatus = isMarket
  ? (immediatelyFilled ? "filled" : "pending")
  : "pending";

  const filledSize = isMarket
    ? filledAmount
    : execSizeDecimal;

  await ethRecordTrade({
    userId, strategyId: strategy.id, strategyName: strategy.name,
    marketIndex: strategy.marketIndex, marketSymbol: strategy.marketSymbol,
    side, size: filledSize, price: executionPrice, status: tradeStatus,
    orderHash,
  });

  if (immediatelyFilled) {
    await ethUpdateStrategyStatsAtomic(strategy.id, side, filledSize, executionPrice);
  }

  const filledInfo = immediatelyFilled
    ? `Filled: ${filledSize.toFixed(6)}`
    : "Pending — polling akan update";

  await ethAddLog(userId, strategy.id, strategy.name, "success",
    `Live ${side.toUpperCase()} order dikirim (${orderType})`,
    `OrderId: ${orderId} | Price: $${executionPriceStr} | ${filledInfo}`
  );

  if (userId !== null && immediatelyFilled) {
    const notif = await ethGetNotificationConfig(userId);
    const shouldNotify = side === "buy" ? notif.notifyOnBuy : notif.notifyOnSell;
    if (shouldNotify) {
      await ethNotifyUser(userId,
        `✅ *Order Ethereal ${side.toUpperCase()} Terisi*\n*${strategy.name}*\n` +
        `Market: ${strategy.marketSymbol}\n` +
        `Size: ${filledSize.toFixed(6)} @ $${executionPriceStr}`
      );
    }
  }
}

// ─── EXECUTE GRID CHECK ───────────────────────────────────────────────────────

async function ethExecuteGridCheck(strategy: typeof strategiesTable.$inferSelect): Promise<void> {
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
  } | null;

  if (!config) return;

  const userId = strategy.userId ?? null;

  // ── SHORT-CIRCUIT a/b: Cek timeout/pending rerange SEBELUM fetch credentials/harga ──
  // Identik dengan Lighter/Extended — jika ada pending konfirmasi, bot tidak boleh
  // menjalankan logika grid sama sekali.
  if (strategy.pendingRerangeAt) {
    const elapsed = Date.now() - new Date(strategy.pendingRerangeAt).getTime();
    const RERANGE_TIMEOUT_MS = 20 * 60 * 1000;

    if (elapsed > RERANGE_TIMEOUT_MS) {
      // (a) Timeout 20 menit: clear state, pause bot, kirim notifikasi
      await clearRerangeState(strategy.id);
      await ethAddLog(
        userId, strategy.id, strategy.name, "warn",
        "⏸ Auto-Rerange timeout: tidak ada konfirmasi dalam 20 menit. Bot di-pause.",
        "User tidak merespons konfirmasi rerange. Atur parameter manual dari dashboard."
      );
      await ethNotifyUser(
        userId,
        `⏸ *Bot Ethereal Di-Pause*\nStrategy: *${strategy.name}*\n\nTidak ada konfirmasi rerange dalam 20 menit.\nAtur parameter manual dari dashboard lalu start kembali.`
      );
      await stopEtherealBot(strategy.id);
    }
    // (b) Pending ada tapi belum timeout → jangan jalankan logika grid apapun
    return;
  }
  // ─────────────────────────────────────────────────────────────────────────────

  const creds = userId !== null ? await getEtherealConfig(userId) : null;
  const hasCredentials = creds?.hasCredentials ?? false;
  const network = creds?.network ?? "mainnet";

  // Ambil product info dari market ticker
  const productInfo = await getProductByTicker(strategy.marketSymbol, network).catch(() => null);
  if (!productInfo) {
    await ethAddLog(userId, strategy.id, strategy.name, "warn",
      `Product info tidak tersedia untuk ${strategy.marketSymbol}`,
      "Cek apakah market masih aktif di Ethereal"
    );
    return;
  }

  // Ambil harga saat ini
  const currentPrice = await ethGetCurrentPrice(productInfo.id, strategy.marketSymbol, network);
  if (!currentPrice || currentPrice.lte(0)) {
    await ethAddLog(userId, strategy.id, strategy.name, "warn",
      "Harga market tidak tersedia",
      `Market: ${strategy.marketSymbol} — WS belum terhubung & REST fallback gagal`
    );
    return;
  }

  const { lowerPrice, upperPrice, gridLevels, amountPerGrid, mode } = config;
  const currentPriceNum = currentPrice.toNumber();
  const lower = new Decimal(lowerPrice);
  const upper = new Decimal(upperPrice);
  const gridSpacing = upper.sub(lower).div(gridLevels);

  // Cek stop loss / take profit
  if (config.stopLoss && currentPriceNum <= config.stopLoss) {
    await ethAddLog(userId, strategy.id, strategy.name, "warn",
      `Stop Loss triggered! Harga: $${currentPrice.toFixed(2)} ≤ SL: $${config.stopLoss}`,
      "Bot Ethereal dihentikan otomatis karena stop loss"
    );
    if (userId !== null) {
      const notif = await ethGetNotificationConfig(userId);
      if (notif.notifyOnStop) {
        await ethNotifyUser(userId,
          `⚠️ *Stop Loss Triggered (Ethereal)*\nStrategy: *${strategy.name}*\nHarga: $${currentPrice.toFixed(2)} ≤ SL: $${config.stopLoss}\nBot dihentikan otomatis.`
        );
      }
    }
    await stopEtherealBot(strategy.id);
    return;
  }
  if (config.takeProfit && currentPriceNum >= config.takeProfit) {
    await ethAddLog(userId, strategy.id, strategy.name, "success",
      `Take Profit triggered! Harga: $${currentPrice.toFixed(2)} ≥ TP: $${config.takeProfit}`,
      "Bot Ethereal dihentikan otomatis karena take profit"
    );
    if (userId !== null) {
      const notif = await ethGetNotificationConfig(userId);
      if (notif.notifyOnStop) {
        await ethNotifyUser(userId,
          `🎯 *Take Profit Triggered (Ethereal)*\nStrategy: *${strategy.name}*\nHarga: $${currentPrice.toFixed(2)} ≥ TP: $${config.takeProfit}\nBot dihentikan otomatis.`
        );
      }
    }
    await stopEtherealBot(strategy.id);
    return;
  }

  // Cek apakah harga di luar range — delegasikan ke Auto-Rerange engine
  // Identik dengan Lighter/Extended: handleAutoRerange mengelola counter 5 tick,
  // cooldown 2 jam, daily limit 3x, AI call, pending state DB, konfirmasi Telegram.
  // pendingRerangeAt sudah dicek di short-circuit block di atas, jadi di sini
  // dijamin pendingRerangeAt IS NULL.
  if (currentPrice.lt(lower) || currentPrice.gt(upper)) {
    const rerangeResult = await handleAutoRerange(strategy, currentPrice);

    switch (rerangeResult.type) {
      case "triggered":
        await ethAddLog(
          userId, strategy.id, strategy.name, "warn",
          `🤖 Auto-Rerange triggered: harga $${currentPrice.toFixed(4)} keluar range. Menunggu konfirmasi user.`,
          `Range lama: $${lower.toFixed(4)}-$${upper.toFixed(4)} | Range baru AI: $${rerangeResult.params.newLowerPrice.toFixed(4)}-$${rerangeResult.params.newUpperPrice.toFixed(4)}`
        );
        break;
      case "continue":
        await ethAddLog(
          userId, strategy.id, strategy.name, "warn",
          `Harga $${currentPrice.toFixed(4)} di luar range ($${lower.toFixed(4)} - $${upper.toFixed(4)}) — menunggu (${(strategy.consecutiveOutOfRange ?? 0) + 1}/5 ticks)`
        );
        break;
    }
    return;
  }

  // Hitung level saat ini — gunakan Decimal untuk presisi + clamp ke gridLevels-1
  const currentLevel = Math.min(
    Math.floor(currentPrice.sub(lower).div(gridSpacing).toNumber()),
    gridLevels - 1
  );
  const prevState = etherealGridStates.get(strategy.id);
  const lastLevel = prevState?.lastLevel ?? currentLevel;

  logger.debug({ strategyId: strategy.id, currentLevel, lastLevel, currentPrice: currentPriceNum }, "[EtherealBot] Grid check");

  // Jika level tidak berubah dan sudah pernah init, tidak ada aksi
  if (prevState && currentLevel === lastLevel) return;

  // Inisialisasi state
  if (!prevState) {
    etherealGridStates.set(strategy.id, { lastLevel: currentLevel, initializedAt: new Date() });
    await ethAddLog(userId, strategy.id, strategy.name, "info",
      `Grid Ethereal diinisialisasi`,
      `Level: ${currentLevel}/${gridLevels} | Harga: $${currentPrice.toFixed(2)} | Range: $${lowerPrice}–$${upperPrice}`
    );
    return;
  }

  // Hitung pergerakan level
  const levelDelta = currentLevel - lastLevel;
  etherealGridStates.set(strategy.id, { lastLevel: currentLevel, initializedAt: prevState.initializedAt });

  // Tentukan aksi berdasarkan mode dan arah pergerakan
  // PENTING: long hanya BUY saat down-cross; short hanya SELL saat up-cross.
  // Identik dengan logika Lighter/Extended — harga naik (up-cross) di mode long
  // tidak menambah posisi, harga turun (down-cross) di mode short tidak menjual.
  let orderSide: "buy" | "sell" | null = null;
  let orderCount = Math.abs(levelDelta);

  const direction = levelDelta < 0 ? "down" : "up";
  if (direction === "down" && (mode === "neutral" || mode === "long")) {
    orderSide = "buy";
  } else if (direction === "up" && (mode === "neutral" || mode === "short")) {
    orderSide = "sell";
  }

  if (!orderSide) return;

  // Hitung size per order
  const rawSize = new Decimal(amountPerGrid).div(currentPrice);
  const sizeNum = parseFloat(roundToStepStr(rawSize.toNumber(), productInfo.lotSize, productInfo.sizeDecimals));
  const size = new Decimal(sizeNum);

  if (size.lte(0) || sizeNum < productInfo.minOrderSize) {
    await ethAddLog(userId, strategy.id, strategy.name, "warn",
      `Size terlalu kecil: ${sizeNum.toFixed(8)} (min: ${productInfo.minOrderSize})`,
      `Amount per grid: $${amountPerGrid} | Price: $${currentPrice.toFixed(2)}`
    );
    return;
  }

  await ethAddLog(userId, strategy.id, strategy.name, "info",
    `Grid level crossing: ${lastLevel} → ${currentLevel} | ${orderSide.toUpperCase()} ×${orderCount}`,
    `Harga: $${currentPrice.toFixed(2)} | Size: ${size.toFixed(6)} × ${orderCount}`
  );

  // Ethereal: tidak ada batch endpoint — sequential
  const maxOrders = Math.min(orderCount, 3); // Max 3 per tick untuk rate limit safety
  for (let i = 0; i < maxOrders; i++) {
    const targetPrice = currentPrice.toNumber();
    const { lower: tolLower, upper: tolUpper } = getDuplicateTolerance(targetPrice, gridSpacing.toNumber());
    const existingPending = await db.query.tradesTable.findFirst({
      where: and(
        eq(tradesTable.strategyId, strategy.id),
        eq(tradesTable.status, "pending"),
        eq(tradesTable.side, orderSide),
        gte(tradesTable.price, String(tolLower)),
        lte(tradesTable.price, String(tolUpper)),
      ),
    });
    if (existingPending) {
      logger.info({ strategyId: strategy.id, side: orderSide, targetPrice }, "Skip: pending order sudah ada di level ini");
      continue;
    }

    if (hasCredentials && creds) {
      await ethExecuteLiveOrder({
        userId, strategy, creds, productInfo, side: orderSide, size, currentPrice,
        orderKind: config.orderType ?? "market",
        limitPriceOffset: config.limitPriceOffset ?? 0,
      });
    } else {
      await ethExecutePaperTrade({ userId, strategy, side: orderSide, size, price: currentPrice });
    }
  }
}

// ─── EXECUTE DCA ORDER ────────────────────────────────────────────────────────

async function ethExecuteDcaOrder(strategy: typeof strategiesTable.$inferSelect): Promise<void> {
  const config = strategy.dcaConfig as {
    amountPerOrder: number;
    intervalMinutes: number;
    side: "buy" | "sell";
    orderType: "market" | "limit" | "post_only";
    maxOrders?: number;
    limitPriceOffset?: number;
  } | null;

  if (!config) return;

  const userId = strategy.userId ?? null;
  const creds = userId !== null ? await getEtherealConfig(userId) : null;
  const network = creds?.network ?? "mainnet";

  const productInfo = await getProductByTicker(strategy.marketSymbol, network).catch(() => null);
  if (!productInfo) {
    await ethAddLog(userId, strategy.id, strategy.name, "warn",
      `Product info tidak tersedia: ${strategy.marketSymbol}`);
    return;
  }

  const currentPrice = await ethGetCurrentPrice(productInfo.id, strategy.marketSymbol, network);
  if (!currentPrice || currentPrice.lte(0)) {
    await ethAddLog(userId, strategy.id, strategy.name, "warn",
      "Harga tidak tersedia untuk DCA Ethereal", `Market: ${strategy.marketSymbol}`);
    return;
  }

  const rawSize = new Decimal(config.amountPerOrder).div(currentPrice);
  const sizeStr = roundToStepStr(rawSize.toNumber(), productInfo.lotSize, productInfo.sizeDecimals);
  const size = new Decimal(sizeStr);

  if (size.lte(0) || size.toNumber() < productInfo.minOrderSize) {
    await ethAddLog(userId, strategy.id, strategy.name, "warn",
      `DCA size terlalu kecil: ${sizeStr}`);
    return;
  }

  await ethAddLog(userId, strategy.id, strategy.name, "info",
    `DCA Ethereal ${config.side.toUpperCase()} dipicu`,
    `Amount: $${config.amountPerOrder} | Harga: $${currentPrice.toFixed(2)} | Size: ${sizeStr}`
  );

  if (!creds?.hasCredentials) {
    await ethExecutePaperTrade({ userId, strategy, side: config.side, size, price: currentPrice });
  } else {
    await ethExecuteLiveOrder({
      userId, strategy, creds, productInfo, side: config.side, size, currentPrice,
      orderKind: config.orderType ?? "market",
      limitPriceOffset: config.limitPriceOffset ?? 0,
    });
  }
}

// ─── JALANKAN STRATEGY SEKALI ─────────────────────────────────────────────────

async function ethRunStrategyOnce(strategyId: number): Promise<void> {
  const strategy = await db.query.strategiesTable.findFirst({
    where: eq(strategiesTable.id, strategyId),
  });

  if (!strategy || !strategy.isRunning) return;

  try {
    if (strategy.type === "grid") {
      await ethExecuteGridCheck(strategy);
    } else if (strategy.type === "dca") {
      await ethExecuteDcaOrder(strategy);
    }
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, strategyId }, "[EtherealBot] Error in ethRunStrategyOnce");
    await ethAddLog(strategy.userId ?? null, strategyId, strategy.name, "error",
      "Error saat menjalankan strategi", msg);
  }

  // Update nextRunAt
  const bot = etherealRunningBots.get(strategyId);
  if (bot) {
    const intervalMs = strategy.type === "dca"
      ? ((strategy.dcaConfig as { intervalMinutes?: number })?.intervalMinutes ?? 60) * 60 * 1000
      : ETH_GRID_FALLBACK_INTERVAL;
    bot.nextRunAt = new Date(Date.now() + intervalMs);
    await db.update(strategiesTable)
      .set({ nextRunAt: bot.nextRunAt, lastRunAt: new Date(), updatedAt: new Date() })
      .where(eq(strategiesTable.id, strategyId));
  }
}

// ─── START BOT ────────────────────────────────────────────────────────────────

export async function startEtherealBot(strategyId: number): Promise<boolean> {
  if (etherealRunningBots.has(strategyId)) {
    logger.info({ strategyId }, "[EtherealBot] Bot sudah running");
    return true;
  }

  const strategy = await db.query.strategiesTable.findFirst({
    where: and(eq(strategiesTable.id, strategyId), eq(strategiesTable.exchange, "ethereal")),
  });

  if (!strategy) {
    throw new Error(`Strategy Ethereal tidak ditemukan: ${strategyId}`);
  }

  const userId = strategy.userId ?? null;

  // Ambil credentials dan validasi
  const creds = userId !== null ? await getEtherealConfig(userId) : null;

  if (creds && !creds.hasCredentials) {
    logger.warn({ strategyId, userId }, "[EtherealBot] Credentials tidak lengkap — paper trade mode");
  }

  // Register WS price callback
  const network = creds?.network ?? "mainnet";
  const productInfo = await getProductByTicker(strategy.marketSymbol, network).catch(() => null);
  const productUuid = productInfo?.id;

  if (productUuid) {
    const isGrid = strategy.type === "grid";
    registerEtherealPriceCallback(
      productUuid,
      strategyId,
      isGrid
        ? (_price: any, _id: any) => {
            const now = Date.now();
            const last = ethWsGridLastTriggered.get(strategyId) ?? 0;
            if (now - last < ETH_WS_GRID_COOLDOWN_MS) return;
            if (!etherealRunningBots.has(strategyId)) return;
            ethWsGridLastTriggered.set(strategyId, now);
            ethRunStrategyOnce(strategyId).catch(() => {});
          }
        : () => {},
      network
    );
  }

  const intervalMs = strategy.type === "dca"
    ? ((strategy.dcaConfig as { intervalMinutes?: number })?.intervalMinutes ?? 60) * 60 * 1000
    : ETH_GRID_FALLBACK_INTERVAL;

  const nextRunAt = new Date(Date.now() + intervalMs);

  await db.update(strategiesTable)
    .set({ isRunning: true, isActive: true, updatedAt: new Date(), nextRunAt })
    .where(eq(strategiesTable.id, strategyId));

  const timer = setInterval(async () => {
    const bot = etherealRunningBots.get(strategyId);
    if (bot) {
      const s = await db.query.strategiesTable.findFirst({ where: eq(strategiesTable.id, strategyId) }).catch(() => null);
      const nextInterval = strategy.type === "dca"
        ? ((s?.dcaConfig as { intervalMinutes?: number })?.intervalMinutes ?? 60) * 60 * 1000
        : ETH_GRID_FALLBACK_INTERVAL;
      bot.nextRunAt = new Date(Date.now() + nextInterval);
    }
    await ethRunStrategyOnce(strategyId);
  }, intervalMs);

  etherealRunningBots.set(strategyId, { strategyId, timer, nextRunAt });

  await ethAddLog(userId, strategyId, strategy.name, "success",
    "Bot Ethereal dimulai",
    `Mode: WebSocket realtime + ${ETH_GRID_FALLBACK_INTERVAL / 60000} menit fallback | Network: ${network}`
  );

  logger.info({ strategyId, type: strategy.type, exchange: "ethereal" }, "[EtherealBot] Bot started");

  if (userId !== null) {
    const notif = await ethGetNotificationConfig(userId).catch(() => null);
    if (notif?.notifyOnStart) {
      await ethNotifyUser(userId,
        `🚀 *Bot Ethereal Dimulai*\nStrategy: *${strategy.name}*\nType: ${strategy.type.toUpperCase()}\nMarket: ${strategy.marketSymbol}`
      );
    }
  }

  // Jalankan setelah 8 detik — beri waktu WS connect
  setTimeout(() => ethRunStrategyOnce(strategyId), 8000);

  return true;
}

// ─── STOP BOT ─────────────────────────────────────────────────────────────────

export async function stopEtherealBot(strategyId: number, skipDbUpdate = false): Promise<boolean> {
  const bot = etherealRunningBots.get(strategyId);
  if (bot) {
    clearInterval(bot.timer);
    etherealRunningBots.delete(strategyId);
  }

  etherealGridStates.delete(strategyId);
  ethWsGridLastTriggered.delete(strategyId);

  // Reset auto-rerange state saat bot di-stop karena alasan apapun.
  // Mencegah counter stale consecutiveOutOfRange saat bot restart,
  // sehingga rerange tidak langsung trigger ulang begitu bot dinyalakan kembali.
  await clearRerangeState(strategyId);

  // Unregister WS callback
  const strategy = await db.query.strategiesTable.findFirst({
    where: eq(strategiesTable.id, strategyId),
  });

  if (strategy) {
    const userId = strategy.userId ?? null;
    const network = userId !== null
      ? (await getEtherealCredentials(userId).catch(() => null))?.etherealNetwork ?? "mainnet"
      : "mainnet";
    const productInfo = await getProductByTicker(strategy.marketSymbol, network).catch(() => null);
    if (productInfo) {
      unregisterEtherealPriceCallback(productInfo.id, strategyId);
    }
  }

  await db.update(strategiesTable)
    if (!skipDbUpdate) await db.update(strategiesTable)
    .set({ isRunning: false, updatedAt: new Date(), nextRunAt: null })
    .where(eq(strategiesTable.id, strategyId));

  if (strategy) {
    await ethAddLog(strategy.userId ?? null, strategyId, strategy.name, "warn", "Bot Ethereal dihentikan");
    const userId = strategy.userId ?? null;
    if (userId !== null) {
      const notif = await ethGetNotificationConfig(userId).catch(() => null);
      if (notif?.notifyOnStop) {
        await ethNotifyUser(userId,
          `⛔ *Bot Ethereal Dihentikan*\nStrategy: *${strategy.name}*\nMarket: ${strategy.marketSymbol}`
        );
      }
    }
  }

  return true;
}

// ─── RESTORE BOTS SAAT RESTART ────────────────────────────────────────────────

export async function restoreRunningEtherealBots(): Promise<void> {
  const strategies = await db.query.strategiesTable.findMany({
    where: and(
      eq(strategiesTable.isRunning, true),
      eq(strategiesTable.exchange, "ethereal")
    ),
  });

  for (const s of strategies) {
    logger.info({ strategyId: s.id }, "[EtherealBot] Restoring running ethereal bot");
    try {
      await startEtherealBot(s.id);
    } catch (err) {
      logger.error({ strategyId: s.id, err }, "[EtherealBot] Failed to restore ethereal bot");
      await db.update(strategiesTable)
        .set({ isRunning: false })
        .where(eq(strategiesTable.id, s.id));
    }
  }
}

// ─── POLL PENDING TRADES ──────────────────────────────────────────────────────
// Fill detection untuk LIMIT orders (yang status-nya masih "pending" di DB).
//
// Cara fill detection Ethereal:
//   GET /v1/order/fill?subaccountId=<id>&productIds=<uuid>
//   Filter client-side: f.orderId === orderId
//
// Perbedaan dari Lighter:
//   Lighter → GET /api/v1/tx?by=hash&hash=<txHash> → cek status field === 2
//   Ethereal → GET /v1/order/fill (bulk endpoint, filter client-side by orderId)
//
// Catatan: API tidak punya query param orderId untuk fill endpoint.
// Efisiensi: gunakan productIds filter untuk mempersempit hasil, kurangi data yang difilter.
//
// Keterbatasan: jika satu user punya banyak fills (> 50 dalam periode polling),
// fills spesifik mungkin tidak ada di halaman pertama. Mitigasi: filter by productId.

const ETH_TRADE_POLL_INTERVAL_MS = 1 * 60 * 1000;       // poll setiap 1 menit
const ETH_TRADE_CHECK_AFTER_MS   = 2 * 60 * 1000;       // mulai cek setelah 2 menit
const ETH_TRADE_TIMEOUT_MS       = 30 * 60 * 1000;      // timeout setelah 30 menit

export async function pollPendingEtherealTrades(): Promise<void> {
  try {
    const pendingTrades = await db.query.tradesTable.findMany({
      where: and(
        eq(tradesTable.status, "pending"),
        eq(tradesTable.exchange, "ethereal"),
        isNotNull(tradesTable.orderHash),
        ne(tradesTable.orderHash, "")
      ),
    });

    // Hanya trade yang punya real orderHash (bukan paper trade)
    // Format orderHash live: "eth_<uuid>"
    // Format orderHash paper: "eth_paper_<timestamp>"
    const realPending = pendingTrades.filter(
      (t) => t.orderHash?.startsWith("eth_") && !t.orderHash?.startsWith("eth_paper_")
    );

    if (realPending.length === 0) return;

    logger.info({ count: realPending.length }, "[EtherealBot] Poll: checking pending trades");

    // Cache credentials per userId untuk menghindari multiple DB calls
    const uniqueUserIds = [...new Set(
      realPending.map((t) => t.userId).filter((id): id is number => id !== null)
    )];

    const credsByUserId = new Map<number, EtherealCreds | null>();
    await Promise.all(
      uniqueUserIds.map(async (uid) => {
        const c = await getEtherealConfig(uid).catch(() => null);
        credsByUserId.set(uid, c?.hasCredentials ? c : null);
      })
    );

    for (const trade of realPending) {
      const ageMs = Date.now() - new Date(trade.createdAt).getTime();
      if (ageMs < ETH_TRADE_CHECK_AFTER_MS) continue;

      const ageMinutes = Math.floor(ageMs / 60000);
      const orderId = trade.orderHash!.slice("eth_".length); // strip prefix "eth_"
      const creds = trade.userId !== null ? (credsByUserId.get(trade.userId) ?? null) : null;

      if (!creds) {
        logger.warn({ tradeId: trade.id, orderId, ageMinutes }, "[EtherealBot] Poll: no credentials for user");
        continue;
      }

      // Cari product UUID untuk filter fills secara efisien
      // Menggunakan marketSymbol dari trade record untuk lookup ke cache produk
      let productUuids: string[] = [];
      try {
        const productInfo = await getProductByTicker(trade.marketSymbol ?? "", creds.network);
        if (productInfo?.id) {
          productUuids = [productInfo.id];
        }
      } catch {
        // Jika gagal lookup, tetap fetch tanpa filter productId (less efficient)
      }

      // Poll fills endpoint:
      // - Filter by productIds untuk efisiensi (kurangi data yang difilter client-side)
      // - Filter client-side by orderId (tidak ada query param orderId di API)
      let fills: Awaited<ReturnType<typeof getFills>> = [];
      try {
        fills = await getFills(
          creds.subaccountId,
          {
            orderId,
            productIds: productUuids.length > 0 ? productUuids : undefined,
            limit: 50,
          },
          creds.network
        );
      } catch (err) {
        logger.warn({ err, tradeId: trade.id, orderId }, "[EtherealBot] Poll: fetch fills failed");
        continue;
      }

      if (fills.length > 0) {
        // Ada fills untuk order ini — bisa partial atau full fill
        // Hitung total quantity yang sudah terisi (untuk partial fill)
        const totalFilled = fills.reduce(
          (acc, f) => acc.add(new Decimal(f.filled)),
          new Decimal(0)
        );
        const fillPrice = new Decimal(fills[0].price);
        const totalFeeUsd = fills.reduce(
          (acc, f) => acc.add(new Decimal(f.feeUsd ?? "0")),
          new Decimal(0)
        ).toFixed(8);

        await db.update(tradesTable)
          .set({ status: "filled", executedAt: new Date(), fee: totalFeeUsd })
          .where(eq(tradesTable.id, trade.id));

        if (trade.strategyId !== null) {
          await ethUpdateStrategyStatsAtomic(
            trade.strategyId,
            trade.side as "buy" | "sell",
            totalFilled,
            fillPrice
          );
        }

        await ethAddLog(
          trade.userId ?? null,
          trade.strategyId,
          trade.strategyName,
          "success",
          `Order Ethereal terisi (konfirmasi polling)`,
          `OrderId: ${orderId} | Qty: ${totalFilled.toFixed(6)} | Price: $${fillPrice.toFixed(4)} | Usia: ${ageMinutes} menit | Fee: $${totalFeeUsd}`
        );

        logger.info({ tradeId: trade.id, orderId, ageMinutes, totalFilled: totalFilled.toFixed(6) }, "[EtherealBot] Poll: order FILLED");

        if (trade.userId !== null) {
          const notif = await ethGetNotificationConfig(trade.userId).catch(() => null);
          const shouldNotify = trade.side === "buy" ? notif?.notifyOnBuy : notif?.notifyOnSell;
          if (shouldNotify && notif) {
            await ethNotifyUser(
              trade.userId,
              `✅ *Order Ethereal ${trade.side.toUpperCase()} Terisi*\n` +
              `*${trade.strategyName}*\n` +
              `Qty: ${totalFilled.toFixed(6)} @ $${fillPrice.toFixed(4)}`
            );
          }
        }
      } else if (ageMs > ETH_TRADE_TIMEOUT_MS) {
        // Sudah 30 menit tidak ada fill — tandai failed
        // User bisa cek status manual di explorer.ethereal.trade
        await db.update(tradesTable)
          .set({
            status: "failed",
            errorMessage: `Order timeout setelah ${Math.floor(ETH_TRADE_TIMEOUT_MS / 60000)} menit — cek di explorer.ethereal.trade/tx/${orderId}`
          })
          .where(eq(tradesTable.id, trade.id));

        await ethAddLog(
          trade.userId ?? null,
          trade.strategyId,
          trade.strategyName,
          "error",
          `Order Ethereal timeout`,
          `OrderId: ${orderId} | Usia: ${ageMinutes} menit — tidak ada fill terdeteksi`
        );

        logger.warn({ tradeId: trade.id, orderId, ageMinutes }, "[EtherealBot] Poll: order timeout");
      }
    }
  } catch (err) {
    logger.error({ err }, "[EtherealBot] Error during pending Ethereal trade monitoring");
  }
}

export function startEtherealTradePollSchedule(): void {
  setInterval(pollPendingEtherealTrades, ETH_TRADE_POLL_INTERVAL_MS);
  logger.info(
    { intervalMs: ETH_TRADE_POLL_INTERVAL_MS, checkAfterMs: ETH_TRADE_CHECK_AFTER_MS, timeoutMs: ETH_TRADE_TIMEOUT_MS },
    "[EtherealBot] Trade status polling started"
  );
}
