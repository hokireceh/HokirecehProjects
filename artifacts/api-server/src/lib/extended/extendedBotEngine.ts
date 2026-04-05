import { db } from "@workspace/db";
import { strategiesTable, tradesTable, botLogsTable, DcaConfig, GridConfig } from "@workspace/db";
import { eq, sql, and, isNotNull, ne, gte, lte } from "drizzle-orm";
import Decimal from "decimal.js";
import { logger } from "../logger";
import { sendMessageToUser, formatBotStarted, formatBotStopped, formatOrderFilled,
         formatOrderFailed, formatStrategyError, formatStopLoss, formatTakeProfit,
         formatBotPaused } from "../telegramBot";
import {
  placeExtendedOrder,
  cancelExtendedOrderByExternalId,
  massCancelExtendedOrders,
  calcMarketOrderPrice,
} from "./extendedApi";
import {
  registerExtendedPriceCallback,
  unregisterExtendedPriceCallback,
  getExtendedWsCachedPrice,
  connectExtendedAccountWs,
  disconnectExtendedAccountWs,
} from "./extendedWs";
import type { ExtendedTrade as ExtendedWsTrade } from "./extendedWs";
import { getOrderBookDepth, getMidPrice, getMarketStats, validateExtendedApiKey, getAccountDetails, getOrderByExternalId } from "./extendedApi";
import { handleAutoRerange, clearRerangeState, sendMainBotMessageWithButton } from "../autoRerange";
import type { ExtendedNetwork, ExtendedOrder } from "./extendedApi";
import { getExtendedMarketInfo } from "./extendedMarkets";
import { derivePublicKey } from "./extendedSigner";
import { getBotConfig, getExtendedCredentials as getExtendedCredsFromConfig } from "../../routes/configService";
import { getDuplicateTolerance } from "../shared/tolerance";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ─── CACHE l2Vault PER USER ───────────────────────────────────────────────────
// l2Vault adalah vault ID yang dibutuhkan untuk SNIP-12 signing.
// Nilainya diambil dari GET /api/v1/user/account (bukan dari input user di Settings).
// Cache per userId, TTL 30 menit — refresh saat bot di-start ulang.

interface L2VaultCacheEntry {
  l2Vault: string;
  fetchedAt: number;
}
const L2VAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 jam — l2Vault tidak pernah berubah
const l2VaultCache = new Map<number, L2VaultCacheEntry>();

// ─── TIPE INTERNAL ────────────────────────────────────────────────────────────

interface ExtendedRunningBot {
  strategyId: number;
  timer: NodeJS.Timeout;
  nextRunAt: Date;
}

interface ExtendedGridState {
  lastLevel: number;
  initializedAt: Date;
}

// ─── STATE TERISOLASI (tidak berbagi apapun dengan Lighter) ───────────────────

const extendedRunningBots = new Map<number, ExtendedRunningBot>();
const extendedGridStates = new Map<number, ExtendedGridState>();

// Cooldown WS untuk grid — hindari rapid-fire saat tick harga volatil
const EXT_WS_GRID_COOLDOWN_MS = 10_000;
const extendedWsGridLastTriggered = new Map<number, number>();

// ─── ACCOUNT WS PER USER (ref-counted) ───────────────────────────────────────
// Satu koneksi account WS per userId. Ref-count memastikan koneksi tidak
// ditutup selama masih ada bot yang berjalan untuk user tersebut.

const userAccountWsInstanceKey = new Map<number, string>();
const userAccountWsRefCount = new Map<number, number>();

// Interval fallback untuk grid (WS adalah primary; ini sebagai jaring pengaman)
const EXT_GRID_FALLBACK_INTERVAL_MS = 5 * 60 * 1000; // 5 menit

// Maksimum order per "batch" grid (Extended tidak punya batch endpoint — dikirim sequential)
const EXT_MAX_GRID_ORDERS = 5;

// ─── QUERY STATUS BOT ─────────────────────────────────────────────────────────

export function isExtendedBotRunning(strategyId: number): boolean {
  return extendedRunningBots.has(strategyId);
}

export function getExtendedBotNextRunAt(strategyId: number): Date | null {
  return extendedRunningBots.get(strategyId)?.nextRunAt ?? null;
}

export function getAllRunningExtendedBots(): { strategyId: number; nextRunAt: Date }[] {
  return Array.from(extendedRunningBots.entries()).map(([id, bot]) => ({
    strategyId: id,
    nextRunAt: bot.nextRunAt,
  }));
}

// ─── BACA CREDENTIALS EXTENDED DARI DB ───────────────────────────────────────
// Berbeda dari Lighter: credentials Extended disimpan langsung di tabel `users`,
// bukan di tabel key-value `bot_config`.

interface ExtendedCredentials {
  apiKey: string | null;
  privateKey: string | null;
  /** collateralPosition = l2Vault / extendedAccountId */
  collateralPosition: string | null;
  network: ExtendedNetwork;
  hasCredentials: boolean;
}

async function getExtendedConfig(userId: number): Promise<ExtendedCredentials> {
  // Credentials disimpan di bot_config table (mendukung userId=0 / admin)
  const creds = await getExtendedCredsFromConfig(userId).catch(() => null);

  const network: ExtendedNetwork = (creds?.extendedNetwork ?? "mainnet") as ExtendedNetwork;
  const apiKey = creds?.apiKey ?? null;
  const privateKey = creds?.privateKey ?? null;

  // Prioritaskan l2Vault dari cache (diisi saat bot start via API fetch).
  // l2Vault adalah nilai yang benar untuk SNIP-12 signing, bukan accountId.
  // l2Vault TIDAK PERNAH berubah untuk satu akun, jadi nilai stale pun tetap benar.
  // Fallback ke accountId HANYA jika l2Vault belum pernah diambil sama sekali.
  const cachedVault = l2VaultCache.get(userId);
  const collateralPosition = cachedVault?.l2Vault ?? (creds?.accountId ?? null);

  return {
    apiKey,
    privateKey,
    collateralPosition,
    network,
    hasCredentials: !!(apiKey && privateKey && collateralPosition),
  };
}

// ─── LOG DAN NOTIFIKASI ───────────────────────────────────────────────────────

async function extAddLog(
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
      exchange: "extended",
    });
  } catch (err) {
    logger.error({ err }, "[ExtendedBot] Failed to add bot log");
  }
}

async function extNotifyUser(userId: number | null, message: string): Promise<void> {
  if (userId === null || userId === undefined) return;
  try {
    const botCfg = await getBotConfig(userId);
    if (!botCfg.notifyBotToken || !botCfg.notifyChatId) return;
    const result = await sendMessageToUser(botCfg.notifyChatId, message, botCfg.notifyBotToken);
    if (!result.ok) {
      await extAddLog(userId, null, null, "warn",
        `[Notifikasi Telegram gagal] ${result.error ?? "Unknown error"}`,
        `Pastikan: 1) Bot token benar, 2) Sudah kirim /start ke bot notifikasimu, 3) Chat ID benar`
      );
    }
  } catch (err: any) {
    logger.error({ err }, "[ExtendedBot] Unexpected error in extNotifyUser");
  }
}

async function extGetNotificationConfig(userId: number) {
  const botCfg = await getBotConfig(userId).catch(() => null);
  return {
    notifyOnBuy: botCfg?.notifyOnBuy ?? true,
    notifyOnSell: botCfg?.notifyOnSell ?? true,
    notifyOnError: botCfg?.notifyOnError ?? true,
    notifyOnStart: botCfg?.notifyOnStart ?? true,
    notifyOnStop: botCfg?.notifyOnStop ?? false,
  };
}

// ─── CATAT TRADE KE DB ───────────────────────────────────────────────────────

async function extRecordTrade(params: {
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
  /** Fee aktual yang dibayar (dalam USDC). Untuk taker fills: size * price * 0.00025. Default "0". */
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
    exchange: "extended",
    errorMessage: params.errorMessage ?? null,
    executedAt: params.status === "filled" ? new Date() : null,
  });
}

async function extUpdateStrategyStatsAtomic(
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

// ─── ACCOUNT WS EVENT HANDLERS ───────────────────────────────────────────────
// Dipanggil ketika Extended account WS mengirim ORDER atau TRADE event.
// Hanya memproses limit/GTT orders yang ada di DB sebagai "pending".
// Market/IOC orders tidak terdampak — mereka sudah ditandai "filled" saat REST response.

/**
 * Tangani ORDER event dari account WebSocket.
 * Match ke trade di DB via orderHash = "ext_" + order.externalId.
 */
async function handleExtendedOrderEvent(
  userId: number,
  orders: ExtendedOrder[]
): Promise<void> {
  for (const order of orders) {
    if (!order.externalId) continue;

    const orderHash = `ext_${order.externalId}`;
    const status = (order.status ?? "").toUpperCase();

    if (!["FILLED", "PARTIALLY_FILLED", "CANCELLED", "REJECTED", "EXPIRED"].includes(status)) {
      continue;
    }

    let trade: Awaited<ReturnType<typeof db.query.tradesTable.findFirst>>;
    try {
      trade = await db.query.tradesTable.findFirst({
        where: and(
          eq(tradesTable.status, "pending"),
          eq(tradesTable.orderHash, orderHash)
        ),
      });
    } catch (err) {
      logger.error({ err, orderHash }, "[ExtendedBot] WS: DB lookup failed");
      continue;
    }

    if (!trade) continue;

    if (status === "FILLED" || status === "PARTIALLY_FILLED") {
      const fillPrice = order.averagePrice && parseFloat(order.averagePrice) > 0
        ? new Decimal(order.averagePrice)
        : new Decimal(order.price);
      const fillQty = order.filledQty && parseFloat(order.filledQty) > 0
        ? new Decimal(order.filledQty)
        : new Decimal(order.qty);

      try {
        await db.update(tradesTable)
          .set({ status: "filled", executedAt: new Date() })
          .where(eq(tradesTable.id, trade.id));

        await extUpdateStrategyStatsAtomic(
          trade.strategyId!,
          trade.side as "buy" | "sell",
          fillQty,
          fillPrice
        );

        await extAddLog(
          userId, trade.strategyId, trade.strategyName, "success",
          `Order Extended ${status === "FILLED" ? "terisi penuh" : "terisi sebagian"} (via WS)`,
          `ExternalId: ${order.externalId} | Qty: ${fillQty.toFixed(6)} | Avg: $${fillPrice.toFixed(4)}`
        );

        logger.info(
          { tradeId: trade.id, orderHash, fillPrice: fillPrice.toFixed(4), fillQty: fillQty.toFixed(6) },
          "[ExtendedBot] WS: Limit order filled — DB updated"
        );
      } catch (err) {
        logger.error({ err, tradeId: trade.id, orderHash }, "[ExtendedBot] WS: Failed to update filled trade");
      }
    } else {
      // CANCELLED / REJECTED / EXPIRED
      try {
        await db.update(tradesTable)
          .set({
            status: "cancelled",
            errorMessage: `Order ${status.toLowerCase()} oleh exchange (konfirmasi WS)`,
          })
          .where(eq(tradesTable.id, trade.id));

        await extAddLog(
          userId, trade.strategyId, trade.strategyName, "warn",
          `Order Extended ${status.toLowerCase()} (via WS)`,
          `ExternalId: ${order.externalId} | Market: ${order.market} | Side: ${order.side}`
        );

        logger.warn(
          { tradeId: trade.id, orderHash, status },
          "[ExtendedBot] WS: Order cancelled/rejected — DB updated"
        );
      } catch (err) {
        logger.error({ err, tradeId: trade.id, orderHash }, "[ExtendedBot] WS: Failed to update cancelled trade");
      }
    }
  }
}

/**
 * Tangani TRADE event dari account WebSocket.
 * Digunakan sebagai pengaman tambahan: jika ORDER event terlewat tapi TRADE sudah masuk,
 * trade di DB tetap bisa ditandai filled dengan harga eksekusi aktual.
 */
async function handleExtendedTradeEvent(
  userId: number,
  trades: ExtendedWsTrade[]
): Promise<void> {
  for (const wsTrade of trades) {
    if (!wsTrade.externalId) continue;

    const orderHash = `ext_${wsTrade.externalId}`;

    let trade: Awaited<ReturnType<typeof db.query.tradesTable.findFirst>>;
    try {
      trade = await db.query.tradesTable.findFirst({
        where: and(
          eq(tradesTable.status, "pending"),
          eq(tradesTable.orderHash, orderHash)
        ),
      });
    } catch (err) {
      logger.error({ err, orderHash }, "[ExtendedBot] WS TRADE: DB lookup failed");
      continue;
    }

    if (!trade) continue;

    const fillPrice = new Decimal(wsTrade.price);
    const fillQty = new Decimal(wsTrade.qty);

    try {
      await db.update(tradesTable)
        .set({ status: "filled", executedAt: new Date() })
        .where(eq(tradesTable.id, trade.id));

      await extUpdateStrategyStatsAtomic(
        trade.strategyId!,
        trade.side as "buy" | "sell",
        fillQty,
        fillPrice
      );

      await extAddLog(
        userId, trade.strategyId, trade.strategyName, "success",
        `Order Extended terisi (konfirmasi TRADE event WS)`,
        `ExternalId: ${wsTrade.externalId} | Qty: ${fillQty.toFixed(6)} | Price: $${fillPrice.toFixed(4)}`
      );

      logger.info(
        { tradeId: trade.id, orderHash, price: fillPrice.toFixed(4), qty: fillQty.toFixed(6) },
        "[ExtendedBot] WS TRADE: Limit order confirmed filled via trade event"
      );
    } catch (err) {
      logger.error({ err, tradeId: trade.id, orderHash }, "[ExtendedBot] WS TRADE: Failed to update trade");
    }
  }
}

/**
 * Hubungkan account WS untuk user jika belum ada.
 * Ref-counted: koneksi dibuat saat bot pertama start, tetap hidup selama ada bot running.
 */
async function ensureExtendedAccountWs(
  userId: number,
  apiKey: string,
  network: ExtendedNetwork
): Promise<void> {
  const prev = userAccountWsRefCount.get(userId) ?? 0;
  userAccountWsRefCount.set(userId, prev + 1);

  if (prev > 0) {
    logger.debug({ userId, refCount: prev + 1 }, "[ExtendedBot] Account WS already connected (ref++)");
    return;
  }

  const instanceKey = connectExtendedAccountWs({
    apiKey,
    network,
    callbacks: {
      onOrder: (orders) => {
        handleExtendedOrderEvent(userId, orders).catch((err) =>
          logger.error({ err, userId }, "[ExtendedBot] Error in onOrder handler")
        );
      },
      onTrade: (trades) => {
        handleExtendedTradeEvent(userId, trades).catch((err) =>
          logger.error({ err, userId }, "[ExtendedBot] Error in onTrade handler")
        );
      },
      onConnected: () => {
        logger.info({ userId, network }, "[ExtendedBot] Account WS connected — limit order confirmation active");
      },
      onDisconnected: () => {
        logger.warn({ userId }, "[ExtendedBot] Account WS disconnected — will reconnect automatically");
      },
      onError: (err) => {
        logger.error({ err, userId }, "[ExtendedBot] Account WS error");
      },
    },
  });

  userAccountWsInstanceKey.set(userId, instanceKey);
  logger.info({ userId, network, instanceKey }, "[ExtendedBot] Account WS connected (new)");
}

/**
 * Lepaskan referensi account WS untuk user.
 * Koneksi diputus hanya jika ref-count mencapai 0 (tidak ada bot running untuk user ini).
 */
function releaseExtendedAccountWs(userId: number): void {
  const current = userAccountWsRefCount.get(userId) ?? 0;
  const next = Math.max(0, current - 1);
  userAccountWsRefCount.set(userId, next);

  if (next > 0) {
    logger.debug({ userId, refCount: next }, "[ExtendedBot] Account WS ref-- (still in use)");
    return;
  }

  const instanceKey = userAccountWsInstanceKey.get(userId);
  if (instanceKey) {
    disconnectExtendedAccountWs(instanceKey);
    userAccountWsInstanceKey.delete(userId);
    logger.info({ userId, instanceKey }, "[ExtendedBot] Account WS disconnected (no bots running)");
  }
  userAccountWsRefCount.delete(userId);
}

// ─── AMBIL HARGA SAAT INI ─────────────────────────────────────────────────────
// Extended menggunakan market string (bukan integer seperti Lighter).
// WS cache menyimpan mid price. Untuk market order, mid price digunakan sebagai
// acuan dan offset 0.75% ditambahkan oleh calcMarketOrderPrice.

async function extGetCurrentPrice(
  market: string,
  network: ExtendedNetwork = "mainnet"
): Promise<Decimal | null> {
  // Preferensi: cache WebSocket (real-time, maksimal 5 detik lalu)
  const cached = getExtendedWsCachedPrice(market, 5_000);
  if (cached) return cached;

  // Fallback 1: REST API orderbook saat WS belum terkoneksi / cache stale
  try {
    const ob = await getOrderBookDepth(market, network);
    if (ob) {
      const mid = getMidPrice(ob);
      if (mid && mid.gt(0)) {
        logger.info({ market, network, price: mid.toFixed(4) }, "[Extended] Harga dari REST orderbook fallback");
        return mid;
      }
    }
  } catch (err) {
    logger.warn({ err, market }, "[Extended] REST orderbook fallback gagal");
  }

  // Fallback 2: markPrice dari market stats (selalu tersedia walau orderbook kosong)
  try {
    const stats = await getMarketStats(market, network);
    if (stats) {
      const markStr = stats.markPrice ?? stats.indexPrice ?? stats.lastPrice;
      if (markStr) {
        const markPrice = new Decimal(markStr);
        if (markPrice.gt(0)) {
          logger.info({ market, network, price: markPrice.toFixed(4) }, "[Extended] Harga dari markPrice fallback");
          return markPrice;
        }
      }
    }
  } catch (err) {
    logger.warn({ err, market }, "[Extended] markPrice fallback gagal");
  }

  return null;
}

// ─── HELPER: ROUND SIZE KE STEP SIZE MARKET ──────────────────────────────────

function roundToStepSize(size: Decimal, stepSize: string): Decimal {
  const step = new Decimal(stepSize);
  if (step.lte(0)) return size;
  return size.div(step).floor().mul(step);
}

// ─── HELPER: ROUND HARGA KE TICK SIZE MARKET ─────────────────────────────────
// BUY limit → floor (jangan overpay)
// SELL limit → ceil (jangan undersell)
// Market/any → round nearest

function roundToTickSize(price: Decimal, tickSize: string, side: "buy" | "sell" | "any" = "any"): Decimal {
  const tick = new Decimal(tickSize);
  if (tick.lte(0)) return price;
  const divided = price.div(tick);
  if (side === "buy") return divided.floor().mul(tick);
  if (side === "sell") return divided.ceil().mul(tick);
  return divided.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).mul(tick);
}

function tickSizeDecimals(tickSize: string): number {
  return tickSize.includes(".") ? tickSize.split(".")[1].replace(/0+$/, "").length : 0;
}

// ─── EKSEKUSI PAPER TRADE ─────────────────────────────────────────────────────

async function extExecutePaperTrade(params: {
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
    await extRecordTrade({
      userId,
      strategyId: strategy.id,
      strategyName: strategy.name,
      marketIndex: strategy.marketIndex,
      marketSymbol: strategy.marketSymbol,
      side,
      size,
      price,
      status: "filled",
      orderHash: `ext_paper_${Date.now()}_${i}`,
    });
    await extUpdateStrategyStatsAtomic(strategy.id, side, size, price);
  }

  const label = count > 1 ? `×${count}` : "";
  await extAddLog(
    userId, strategy.id, strategy.name, "warn",
    `Paper trade${label}: ${side.toUpperCase()} ${size.toFixed(6)} @ $${price.toFixed(2)}`,
    "Credentials Extended belum dikonfigurasi — hanya simulasi"
  );

}

// ─── EKSEKUSI LIVE ORDER (single) ─────────────────────────────────────────────
// Berbeda dari Lighter: tidak ada initSigner/getNextNonce — semua ditangani oleh
// placeExtendedOrder() secara internal.

async function extExecuteLiveOrder(params: {
  userId: number | null;
  strategy: typeof strategiesTable.$inferSelect;
  creds: ExtendedCredentials;
  side: "buy" | "sell";
  size: Decimal;
  currentPrice: Decimal;
  orderKind?: "market" | "limit" | "post_only";
  limitPriceOffset?: number;
  stepSize?: string;
}): Promise<void> {
  const { userId, strategy, creds, side, size, currentPrice } = params;
  const orderKind = params.orderKind ?? "market";
  const limitPriceOffset = params.limitPriceOffset ?? 0;
  const network = creds.network;

  // ── Ambil market info untuk stepSize dan tickSize (cached) ─────────────────
  const priceMarketInfo = await getExtendedMarketInfo(strategy.marketSymbol, undefined, network).catch(() => null);
  const resolvedStepSize = priceMarketInfo?.stepSize ?? params.stepSize ?? "0.0001";
  const resolvedTickSize = priceMarketInfo?.tickSize ?? "0.1";
  const resolvedStepDecimals = resolvedStepSize.includes(".") ? resolvedStepSize.split(".")[1].length : 0;
  const resolvedTickDecimals = tickSizeDecimals(resolvedTickSize);

  // ── Hitung execution price ──────────────────────────────────────────────────
  // Extended market order: gunakan calcMarketOrderPrice (0.75% buffer)
  // Extended limit/post_only: offset dari currentPrice, dibulatkan ke tickSize
  let executionPrice: Decimal;
  let extOrderType: "LIMIT" | "MARKET";
  let extTimeInForce: "GTT" | "IOC";
  let postOnly: boolean;

  if (orderKind === "market") {
    // Market order di Extended = IOC limit dengan worst-case price
    // WS mid price digunakan sebagai referensi best price
    const marketPriceStr = calcMarketOrderPrice(
      currentPrice.toFixed(8),
      side === "buy" ? "BUY" : "SELL"
    );
    executionPrice = roundToTickSize(new Decimal(marketPriceStr), resolvedTickSize, side);
    extOrderType = "MARKET";
    extTimeInForce = "IOC";
    postOnly = false;
  } else {
    const offset = new Decimal(limitPriceOffset);
    const rawPrice = side === "buy"
      ? currentPrice.sub(offset)
      : currentPrice.add(offset);
    // Round ke tickSize: BUY floor (jangan overpay), SELL ceil (jangan undersell)
    executionPrice = roundToTickSize(rawPrice, resolvedTickSize, side);
    extOrderType = "LIMIT";
    extTimeInForce = "GTT";
    postOnly = orderKind === "post_only";
  }

  const priceStr = executionPrice.toFixed(resolvedTickDecimals);

  await extAddLog(
    userId, strategy.id, strategy.name, "info",
    `Extended ${side.toUpperCase()} order akan dikirim`,
    `Type: ${extOrderType} | Size: ${size.toFixed(6)} | Price: $${priceStr} | TickSize: ${resolvedTickSize} | Network: ${network}`
  );

  let result: { orderId: number; externalId: string };
  try {
    result = await placeExtendedOrder({
      apiKey: creds.apiKey!,
      privateKey: creds.privateKey!,
      collateralPosition: creds.collateralPosition!,
      market: strategy.marketSymbol,
      type: extOrderType,
      side: side === "buy" ? "BUY" : "SELL",
      qty: size.toFixed(resolvedStepDecimals),
      price: priceStr,
      timeInForce: extTimeInForce,
      postOnly,
      network,
    });
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      { strategyId: strategy.id, side, market: strategy.marketSymbol, err: msg },
      "[ExtendedBot] Order submission FAILED"
    );
    await extAddLog(userId, strategy.id, strategy.name, "error", "Order submission gagal", msg);
    if (userId !== null) {
      const notif = await extGetNotificationConfig(userId);
      if (notif.notifyOnError) {
        await extNotifyUser(userId, formatOrderFailed("extended", strategy.name, msg));
      }
    }
    await extRecordTrade({
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

  // Extended REST mengkonfirmasi order diterima secara sinkron.
  // - Market (IOC): kemungkinan besar langsung terisi — tandai filled dan update stats.
  // - Limit/GTT   : tandai pending — polling akan update status nanti.
  const isIoc = extTimeInForce === "IOC";
  const tradeStatus = isIoc ? "filled" : "pending";

  // orderHash = externalId (UUID yang kita generate) dengan prefix "ext_"
  const orderHash = `ext_${result.externalId}`;

  await extRecordTrade({
    userId,
    strategyId: strategy.id,
    strategyName: strategy.name,
    marketIndex: strategy.marketIndex,
    marketSymbol: strategy.marketSymbol,
    side,
    size,
    price: executionPrice,
    status: tradeStatus,
    orderHash,
  });

  if (isIoc) {
    await extUpdateStrategyStatsAtomic(strategy.id, side, size, executionPrice);
  }

  await extAddLog(
    userId, strategy.id, strategy.name, "success",
    `Live ${side.toUpperCase()} order diterima (${extOrderType})`,
    `ExtOrderId: ${result.orderId} | ExternalId: ${result.externalId} | Price: $${priceStr} | Status: ${tradeStatus}`
  );

}

// ─── EKSEKUSI MULTIPLE LIVE ORDERS (untuk Grid multi-level) ──────────────────
// Berbeda dari Lighter yang pakai sendTxBatch:
// Extended TIDAK punya batch endpoint — order dikirim satu per satu secara sequential.

async function extExecuteMultipleLiveOrders(params: {
  userId: number | null;
  strategy: typeof strategiesTable.$inferSelect;
  creds: ExtendedCredentials;
  side: "buy" | "sell";
  size: Decimal;
  currentPrice: Decimal;
  orderCount: number;
  orderKind?: "market" | "limit" | "post_only";
  limitPriceOffset?: number;
  stepSize?: string;
}): Promise<void> {
  const { userId, strategy, creds, side, size, currentPrice, orderCount } = params;
  const orderKind = params.orderKind ?? "market";
  const limitPriceOffset = params.limitPriceOffset ?? 0;
  const network = creds.network;

  // ── Ambil market info untuk stepSize dan tickSize (cached) ─────────────────
  const multiMarketInfo = await getExtendedMarketInfo(strategy.marketSymbol, undefined, network).catch(() => null);
  const multiStepSize = multiMarketInfo?.stepSize ?? params.stepSize ?? "0.0001";
  const multiTickSize = multiMarketInfo?.tickSize ?? "0.1";
  const multiStepDecimals = multiStepSize.includes(".") ? multiStepSize.split(".")[1].length : 0;
  const multiTickDecimals = tickSizeDecimals(multiTickSize);

  let executionPrice: Decimal;
  let extOrderType: "LIMIT" | "MARKET";
  let extTimeInForce: "GTT" | "IOC";
  let postOnly: boolean;

  if (orderKind === "market") {
    const marketPriceStr = calcMarketOrderPrice(
      currentPrice.toFixed(8),
      side === "buy" ? "BUY" : "SELL"
    );
    executionPrice = roundToTickSize(new Decimal(marketPriceStr), multiTickSize, side);
    extOrderType = "MARKET";
    extTimeInForce = "IOC";
    postOnly = false;
  } else {
    const offset = new Decimal(limitPriceOffset);
    const rawPrice = side === "buy"
      ? currentPrice.sub(offset)
      : currentPrice.add(offset);
    executionPrice = roundToTickSize(rawPrice, multiTickSize, side);
    extOrderType = "LIMIT";
    extTimeInForce = "GTT";
    postOnly = orderKind === "post_only";
  }

  const multiPriceStr = executionPrice.toFixed(multiTickDecimals);

  const isIoc = extTimeInForce === "IOC";
  let successCount = 0;

  for (let i = 0; i < orderCount; i++) {
    try {
      const result = await placeExtendedOrder({
        apiKey: creds.apiKey!,
        privateKey: creds.privateKey!,
        collateralPosition: creds.collateralPosition!,
        market: strategy.marketSymbol,
        type: extOrderType,
        side: side === "buy" ? "BUY" : "SELL",
        qty: size.toFixed(multiStepDecimals),
        price: multiPriceStr,
        timeInForce: extTimeInForce,
        postOnly,
        network,
      });

      const orderHash = `ext_${result.externalId}`;
      const tradeStatus = isIoc ? "filled" : "pending";

      await extRecordTrade({
        userId,
        strategyId: strategy.id,
        strategyName: strategy.name,
        marketIndex: strategy.marketIndex,
        marketSymbol: strategy.marketSymbol,
        side,
        size,
        price: executionPrice,
        status: tradeStatus,
        orderHash,
      });

      if (isIoc) {
        await extUpdateStrategyStatsAtomic(strategy.id, side, size, executionPrice);
      }

      successCount++;
      logger.info(
        { orderId: result.orderId, externalId: result.externalId, i, orderCount },
        "[ExtendedBot] Sequential order sent"
      );
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err, i, orderCount }, "[ExtendedBot] Sequential order failed");
      await extAddLog(userId, strategy.id, strategy.name, "error",
        `Order ${i + 1}/${orderCount} gagal`, msg);

      await extRecordTrade({
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
    }
  }

  if (successCount > 0) {
    await extAddLog(
      userId, strategy.id, strategy.name, "success",
      `${successCount}/${orderCount} order Extended berhasil dikirim`,
      `Type: ${extOrderType} | Size each: ${size.toFixed(6)} | Price: $${executionPrice.toFixed(4)}`
    );

  }
}

// ─── EKSEKUSI DCA ORDER ───────────────────────────────────────────────────────

async function extExecuteDcaOrder(strategy: typeof strategiesTable.$inferSelect): Promise<void> {
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

  // Baca credentials Extended (dari tabel users, bukan botConfig)
  const creds = userId !== null ? await getExtendedConfig(userId) : null;
  const hasCredentials = creds?.hasCredentials ?? false;

  // Harga saat ini dari WS cache Extended (dengan REST fallback otomatis)
  const network = (creds?.network ?? "mainnet") as ExtendedNetwork;
  const currentPrice = await extGetCurrentPrice(strategy.marketSymbol, network);
  if (!currentPrice || currentPrice.lte(0)) {
    await extAddLog(userId, strategy.id, strategy.name, "warn",
      "Harga market tidak tersedia untuk DCA Extended",
      `Market: ${strategy.marketSymbol} — WS belum terhubung & REST fallback gagal`
    );
    return;
  }

  const amountPerOrder = new Decimal(config.amountPerOrder);
  const rawSize = amountPerOrder.div(currentPrice);

  // Round down size ke stepSize market agar tidak ditolak API (Invalid quantity precision)
  const marketInfo = await getExtendedMarketInfo(strategy.marketSymbol, undefined, network).catch(() => null);
  const stepSize = marketInfo?.stepSize ?? "0.0001";
  const size = roundToStepSize(rawSize, stepSize);

  if (size.lte(0)) {
    await extAddLog(userId, strategy.id, strategy.name, "warn",
      "Size DCA terlalu kecil setelah pembulatan",
      `Raw: ${rawSize.toFixed(8)} | Step: ${stepSize} | Rounded: ${size.toFixed(8)}`
    );
    return;
  }

  await extAddLog(
    userId, strategy.id, strategy.name, "info",
    `DCA Extended ${config.side.toUpperCase()} dipicu`,
    `Amount: $${amountPerOrder.toFixed(2)} | Harga: $${currentPrice.toFixed(2)} | Size: ${size.toFixed(6)}`
  );

  if (!hasCredentials) {
    await extExecutePaperTrade({ userId, strategy, side: config.side, size, price: currentPrice });
  } else {
    await extExecuteLiveOrder({
      userId,
      strategy,
      creds: creds!,
      side: config.side,
      size,
      currentPrice,
      orderKind: config.orderType ?? "market",
      limitPriceOffset: config.limitPriceOffset ?? 0,
      stepSize,
    });
  }
}

// ─── EKSEKUSI GRID CHECK ─────────────────────────────────────────────────────
// Logika identik dengan Lighter (level crossing, SL/TP, mode neutral/long/short),
// namun menggunakan Extended order manager dan WS yang berbeda.

async function extExecuteGridCheck(strategy: typeof strategiesTable.$inferSelect): Promise<void> {
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
  // Jika ada pending konfirmasi, bot tidak boleh menjalankan logika grid sama sekali.
  if (strategy.pendingRerangeAt) {
    const elapsed = Date.now() - new Date(strategy.pendingRerangeAt).getTime();
    const RERANGE_TIMEOUT_MS = 20 * 60 * 1000;

    if (elapsed > RERANGE_TIMEOUT_MS) {
      // (a) Timeout 20 menit: clear state, pause bot, kirim notifikasi
      await clearRerangeState(strategy.id);
      await extAddLog(
        userId, strategy.id, strategy.name, "warn",
        "⏸ Auto-Rerange timeout: tidak ada konfirmasi dalam 20 menit. Bot di-pause.",
        "User tidak merespons konfirmasi rerange. Atur parameter manual dari dashboard."
      );
      const pauseNotifCfg = userId !== null ? await getBotConfig(userId).catch(() => null) : null;
      await sendMainBotMessageWithButton(
        pauseNotifCfg?.notifyChatId,
        formatBotPaused("extended", strategy.name, "Tidak ada konfirmasi rerange dalam 20 menit"),
        { text: "▶️ Start Bot", callback_data: `bot_restart_${strategy.id}` }
      );
      await stopExtendedBot(strategy.id);
    }
    // (b) Pending ada tapi belum timeout → jangan jalankan logika grid apapun
    return;
  }
  // ──────────────────────────────────────────────────────────────────────────────

  const creds = userId !== null ? await getExtendedConfig(userId) : null;
  const hasCredentials = creds?.hasCredentials ?? false;

  // Network HARUS diambil dari credentials user, bukan default "mainnet".
  // Ini menentukan: (1) endpoint REST/WS yang dituju, (2) chainId domain untuk signing.
  const network = (creds?.network ?? "mainnet") as ExtendedNetwork;

  // Gunakan marketSymbol (string) untuk Extended, bukan marketIndex (integer).
  // Teruskan network agar harga diambil dari endpoint yang tepat (mainnet vs testnet).
  const currentPrice = await extGetCurrentPrice(strategy.marketSymbol, network);
  if (!currentPrice) {
    await extAddLog(userId, strategy.id, strategy.name, "warn",
      "Harga market tidak tersedia untuk grid check Extended",
      `Market: ${strategy.marketSymbol} | Network: ${network}`
    );
    return;
  }

  // ── Stop Loss / Take Profit ─────────────────────────────────────────────────
  if (config.stopLoss && currentPrice.lt(config.stopLoss)) {
    await extAddLog(userId, strategy.id, strategy.name, "warn",
      `Stop Loss dipicu di $${currentPrice.toFixed(2)} (SL: $${config.stopLoss})`,
      "Bot Extended dihentikan otomatis karena stop loss"
    );
    if (userId !== null) {
      const notif = await extGetNotificationConfig(userId);
      if (notif.notifyOnStop) {
        await extNotifyUser(userId, formatStopLoss("extended", strategy.name, strategy.marketSymbol, currentPrice.toFixed(2), config.stopLoss));
      }
    }
    await stopExtendedBot(strategy.id);
    return;
  }

  if (config.takeProfit && currentPrice.gt(config.takeProfit)) {
    await extAddLog(userId, strategy.id, strategy.name, "success",
      `Take Profit dipicu di $${currentPrice.toFixed(2)} (TP: $${config.takeProfit})`,
      "Bot Extended dihentikan otomatis karena take profit"
    );
    if (userId !== null) {
      const notif = await extGetNotificationConfig(userId);
      if (notif.notifyOnStop) {
        await extNotifyUser(userId, formatTakeProfit("extended", strategy.name, strategy.marketSymbol, currentPrice.toFixed(2), config.takeProfit));
      }
    }
    await stopExtendedBot(strategy.id);
    return;
  }

  // ── Kalkulasi level grid ────────────────────────────────────────────────────
  const lower = new Decimal(config.lowerPrice);
  const upper = new Decimal(config.upperPrice);
  const levels = config.gridLevels;
  const amountPerGrid = new Decimal(config.amountPerGrid);
  const mode = config.mode ?? "neutral";
  const gridSpacing = upper.sub(lower).div(levels);

  // Out-of-range: delegasikan ke Auto-Rerange engine (shared dengan Lighter).
  // handleAutoRerange mengelola: counter candle (atomic), cooldown 2 jam, daily limit 3x,
  // AI call, simpan pending state ke DB, dan kirim konfirmasi ke Telegram.
  // pendingRerangeAt sudah dicek di short-circuit block di atas, sehingga di sini
  // dijamin pendingRerangeAt IS NULL — handleAutoRerange hanya akan di-hit saat needed.
  if (currentPrice.lt(lower) || currentPrice.gt(upper)) {
    const rerangeResult = await handleAutoRerange(strategy, currentPrice);

    switch (rerangeResult.type) {
      case "triggered":
        // Konfirmasi sudah dikirim ke Telegram. Bot menunggu respons user.
        // Tick berikutnya akan short-circuit via pendingRerangeAt check di atas.
        await extAddLog(
          userId, strategy.id, strategy.name, "warn",
          `🤖 Auto-Rerange triggered: harga $${currentPrice.toFixed(4)} keluar range. Menunggu konfirmasi user.`,
          `Range lama: $${lower.toFixed(4)}-$${upper.toFixed(4)} | Range baru AI: $${rerangeResult.params.newLowerPrice.toFixed(4)}-$${rerangeResult.params.newUpperPrice.toFixed(4)}`
        );
        break;
      case "continue":
        // Counter belum cukup (< 5 tick), atau cooldown aktif, atau limit harian.
        // Tetap log warning agar user bisa monitor progress di dashboard.
        await extAddLog(
          userId, strategy.id, strategy.name, "warn",
          `Harga $${currentPrice.toFixed(4)} di luar range ($${lower.toFixed(4)} - $${upper.toFixed(4)}) — menunggu (${(strategy.consecutiveOutOfRange ?? 0) + 1}/5 ticks)`
        );
        break;
      // "short_circuit" dan "timeout" tidak akan terjadi di sini —
      // sudah ditangani di short-circuit block di atas sebelum price fetch.
    }
    return;
  }

  const currentLevel = Math.min(
    Math.floor(currentPrice.sub(lower).div(gridSpacing).toNumber()),
    levels - 1
  );

  const existingState = extendedGridStates.get(strategy.id);

  // Inisialisasi pertama: simpan state, jangan buat order
  if (!existingState) {
    extendedGridStates.set(strategy.id, { lastLevel: currentLevel, initializedAt: new Date() });
    await extAddLog(
      userId, strategy.id, strategy.name, "info",
      `Grid Extended diinisialisasi di level ${currentLevel}/${levels}`,
      `Harga: $${currentPrice.toFixed(2)} | Range: $${lower.toFixed(2)}-$${upper.toFixed(2)} | Spacing: $${gridSpacing.toFixed(2)}`
    );
    return;
  }

  const lastLevel = existingState.lastLevel;

  if (currentLevel === lastLevel) {
    await extAddLog(
      userId, strategy.id, strategy.name, "info",
      `Grid check Extended: level ${currentLevel}/${levels} | harga $${currentPrice.toFixed(2)} | tidak ada crossing`
    );
    return;
  }

  const levelsMoved = currentLevel - lastLevel;
  const direction = levelsMoved < 0 ? "down" : "up";

  // Tentukan sisi order berdasarkan arah dan mode
  let side: "buy" | "sell" | null = null;
  if (direction === "down" && (mode === "neutral" || mode === "long")) {
    side = "buy";
  } else if (direction === "up" && (mode === "neutral" || mode === "short")) {
    side = "sell";
  }

  // Update state segera untuk mencegah re-trigger
  existingState.lastLevel = currentLevel;

  if (!side) {
    await extAddLog(
      userId, strategy.id, strategy.name, "info",
      `Grid Extended crossing ${Math.abs(levelsMoved)} level ${direction} → tidak ada aksi (mode: ${mode})`
    );
    return;
  }

  const orderCount = Math.min(Math.abs(levelsMoved), EXT_MAX_GRID_ORDERS);
  const rawSize = amountPerGrid.div(currentPrice);

  // Round down size ke stepSize market agar tidak ditolak API (Invalid quantity precision)
  const gridMarketInfo = await getExtendedMarketInfo(strategy.marketSymbol, undefined, creds?.network ?? "mainnet").catch(() => null);
  const gridStepSize = gridMarketInfo?.stepSize ?? "0.0001";
  const size = roundToStepSize(rawSize, gridStepSize);

  if (size.lte(0)) {
    await extAddLog(userId, strategy.id, strategy.name, "warn",
      "Size Grid terlalu kecil setelah pembulatan",
      `Raw: ${rawSize.toFixed(8)} | Step: ${gridStepSize} | Rounded: ${size.toFixed(8)}`
    );
    return;
  }

  await extAddLog(
    userId, strategy.id, strategy.name, "info",
    `Grid Extended: crossing ${Math.abs(levelsMoved)} level ${direction} → ${side.toUpperCase()} ×${orderCount}`,
    `Level: ${lastLevel} → ${currentLevel} | Harga: $${currentPrice.toFixed(2)} | Size each: ${size.toFixed(6)} | Step: ${gridStepSize}`
  );

  const targetPrice = currentPrice.toNumber();
  const { lower: tolLower, upper: tolUpper } = getDuplicateTolerance(targetPrice, gridSpacing.toNumber());
  const existingPending = await db.query.tradesTable.findFirst({
    where: and(
      eq(tradesTable.strategyId, strategy.id),
      eq(tradesTable.status, "pending"),
      eq(tradesTable.side, side),
      gte(tradesTable.price, String(tolLower)),
      lte(tradesTable.price, String(tolUpper)),
    ),
  });
  if (existingPending) {
    logger.info({ strategyId: strategy.id, side, targetPrice }, "Skip: pending order sudah ada di level ini");
    return;
  }

  if (!hasCredentials) {
    // Paper trading — simulasi satu order per level yang di-cross
    await extExecutePaperTrade({ userId, strategy, side, size, price: currentPrice, orderCount });
  } else if (orderCount === 1) {
    await extExecuteLiveOrder({
      userId, strategy, creds: creds!, side, size, currentPrice,
      orderKind: config.orderType ?? "market",
      limitPriceOffset: config.limitPriceOffset ?? 0,
      stepSize: gridStepSize,
    });
  } else {
    // Tidak ada batch di Extended — kirim sequential
    await extExecuteMultipleLiveOrders({
      userId, strategy, creds: creds!, side, size, currentPrice,
      orderCount,
      orderKind: config.orderType ?? "market",
      limitPriceOffset: config.limitPriceOffset ?? 0,
      stepSize: gridStepSize,
    });
  }
}

// ─── JALANKAN STRATEGY SEKALI ─────────────────────────────────────────────────

async function extRunStrategyOnce(strategyId: number): Promise<void> {
  const strategy = await db.query.strategiesTable.findFirst({
    where: eq(strategiesTable.id, strategyId),
  });

  if (!strategy) {
    logger.warn({ strategyId }, "[ExtendedBot] DB query returned null — skipping tick, bot stays running");
    return;
  }

  if (!strategy.isActive || !strategy.isRunning) {
    await stopExtendedBot(strategyId);
    return;
  }

  // Hanya jalankan strategy Extended
  if (strategy.exchange !== "extended") return;

  try {
    if (strategy.type === "dca") {
      await extExecuteDcaOrder(strategy);
    } else if (strategy.type === "grid") {
      await extExecuteGridCheck(strategy);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await extAddLog(strategy.userId ?? null, strategy.id, strategy.name, "error",
      `Kesalahan eksekusi strategy Extended: ${message}`
    );
    logger.error({ err, strategyId }, "[ExtendedBot] Strategy execution error");
    if (strategy.userId) {
      extGetNotificationConfig(strategy.userId).then(notif => {
        if (notif.notifyOnError) {
          extNotifyUser(strategy.userId, formatStrategyError("extended", strategy.name, message));
        }
      }).catch(() => {});
    }
  }
}

// ─── START / STOP BOT ─────────────────────────────────────────────────────────

export async function startExtendedBot(strategyId: number): Promise<boolean> {
  if (extendedRunningBots.has(strategyId)) return true;

  const strategy = await db.query.strategiesTable.findFirst({
    where: eq(strategiesTable.id, strategyId),
  });

  if (!strategy) return false;

  // Pastikan strategy ini memang untuk Extended
  if (strategy.exchange !== "extended") {
    logger.warn({ strategyId, exchange: strategy.exchange }, "[ExtendedBot] startExtendedBot called on non-extended strategy");
    return false;
  }

  const userId = strategy.userId ?? null;

  // ── Pre-flight: validasi credentials ────────────────────────────────────────
  // Extended tidak punya minBaseAmount/minQuoteAmount yang mudah diakses seperti Lighter.
  // Validasi minimal: cek amount > 0.
  {
    let validationError: string | null = null;

    if (strategy.type === "grid") {
      const amount = strategy.gridConfig?.amountPerGrid ?? 0;
      if (amount <= 0) validationError = "amountPerGrid harus lebih dari 0.";
    } else if (strategy.type === "dca") {
      const amount = strategy.dcaConfig?.amountPerOrder ?? 0;
      if (amount <= 0) validationError = "amountPerOrder harus lebih dari 0.";
    }

    if (validationError) {
      await extAddLog(userId, strategyId, strategy.name, "error",
        `❌ Bot Extended tidak dapat dimulai: ${validationError}`
      );
      throw new Error(`EXTENDED_BOT_VALIDATION_FAILED: ${validationError}`);
    }
  }

  // ── Credential check — graceful abort jika belum dikonfigurasi ───────────────
  let startCreds: ExtendedCredentials | null = null;
  {
    const creds = userId !== null ? await getExtendedConfig(userId).catch(() => null) : null;
    if (!creds || !creds.hasCredentials) {
      await extAddLog(userId, strategyId, strategy.name, "error",
        `❌ Bot Extended tidak dapat dimulai: kredensial belum dikonfigurasi.`,
        `Isi API Key, Stark Private Key, dan Account ID di halaman Pengaturan > Extended DEX terlebih dahulu.`
      );
      logger.warn({ strategyId, userId }, "[ExtendedBot] Bot aborted — credentials missing. Lighter is unaffected.");
      throw new Error("EXTENDED_BOT_VALIDATION_FAILED: Kredensial Extended belum dikonfigurasi. Buka Pengaturan → Extended DEX dan isi API Key, Stark Private Key, serta Account ID.");
    }
    startCreds = creds;
  }

  // ── Validasi API key ke server Extended (test endpoint read-only) ─────────────
  // Ini mendeteksi API key salah/expired SEBELUM bot mulai trading,
  // sehingga error tidak muncul saat order gagal dengan pesan 401 yang tidak jelas.
  {
    const keyToCheck = startCreds!.apiKey!;
    const netToCheck = startCreds!.network;
    const validation = await validateExtendedApiKey(keyToCheck, netToCheck);
    if (!validation.valid) {
      const reason = validation.reason ?? "API key tidak valid.";
      await extAddLog(userId, strategyId, strategy.name, "error",
        `❌ Bot Extended tidak dapat dimulai: API key ditolak.`,
        reason
      );
      logger.warn({ strategyId, userId, network: netToCheck }, "[ExtendedBot] Bot aborted — API key rejected by Extended server.");
      throw new Error(`EXTENDED_BOT_VALIDATION_FAILED: ${reason}`);
    }
    logger.info({ strategyId, network: netToCheck }, "[ExtendedBot] API key validated OK");
  }

  // ── Validasi minOrderSize dari Extended Exchange ──────────────────────────────
  // Dilakukan SETELAH credentials resolved (network diambil dari startCreds agar
  // tidak hardcode "mainnet" — testnet bisa punya minimum berbeda).
  {
    const network = startCreds!.network;
    const marketInfo = await getExtendedMarketInfo(strategy.marketSymbol, undefined, network).catch(() => null);

    if (marketInfo) {
      const minOrderSize = parseFloat(marketInfo.minOrderSize ?? "0");

      let amount = 0;
      if (strategy.type === "grid") {
        amount = strategy.gridConfig?.amountPerGrid ?? 0;
      } else if (strategy.type === "dca") {
        amount = strategy.dcaConfig?.amountPerOrder ?? 0;
      }

      if (minOrderSize > 0 && amount < minOrderSize) {
        const amountField = strategy.type === "grid" ? "amountPerGrid" : "amountPerOrder";
        const errMsg = `${amountField} (${amount}) di bawah minimum exchange untuk ${strategy.marketSymbol}: ${minOrderSize}.`;
        await extAddLog(userId, strategyId, strategy.name, "error",
          `❌ Bot Extended tidak dapat dimulai: order size terlalu kecil.`,
          errMsg
        );
        logger.warn(
          { strategyId, userId, amount, minOrderSize, market: strategy.marketSymbol, network },
          "[ExtendedBot] Bot aborted — amount below minOrderSize"
        );
        throw new Error(`EXTENDED_BOT_VALIDATION_FAILED: ${errMsg}`);
      }
    } else {
      // Market info gagal di-fetch (network error, market baru, dsb).
      // Log warning tapi jangan block start — bot masih bisa jalan, exchange
      // akan reject order individual jika size benar-benar terlalu kecil.
      logger.warn(
        { strategyId, market: strategy.marketSymbol, network },
        "[ExtendedBot] getExtendedMarketInfo gagal — validasi minOrderSize dilewati"
      );
    }
  }

  // ── Fetch l2Vault + verifikasi starkKey dari Extended API ────────────────────
  // l2Vault berbeda dari accountId yang user masukkan di Settings.
  // Tanpa nilai yang benar, setiap order akan ditolak: "Invalid StarkEx signature".
  //
  // Selain itu, kami verifikasi bahwa starkKey yang di-derive dari private key
  // cocok dengan starkKey yang terdaftar di akun Exchange. Mismatch ini adalah
  // penyebab paling umum "Invalid StarkEx signature" yang tidak bisa di-debug
  // tanpa pengecekan eksplisit.
  if (userId !== null && startCreds) {
    try {
      const accountDetails = await getAccountDetails(startCreds.apiKey!, startCreds.network);

      // ── Verifikasi starkKey mismatch ──────────────────────────────────────────
      // Derive starkKey dari private key yang tersimpan, lalu bandingkan
      // dengan l2Key dari account API (field aktual di Extended Exchange API).
      // NB: API response menggunakan "l2Key" bukan "starkKey".
      const registeredStarkKey: string | null =
        accountDetails ? (accountDetails.l2Key ?? null) : null;

      logger.info(
        {
          strategyId,
          userId,
          l2Key: registeredStarkKey ?? "(tidak tersedia di response)",
          hasPrivateKey: !!startCreds.privateKey,
        },
        "[ExtendedBot] Account details received — memulai starkKey (l2Key) verification"
      );

      if (registeredStarkKey && startCreds.privateKey) {
        let derivedKey: string | null = null;
        try {
          derivedKey = derivePublicKey(startCreds.privateKey);
        } catch (deriveErr) {
          logger.error(
            { err: deriveErr, strategyId, userId },
            "[ExtendedBot] Gagal derive starkKey dari private key — private key mungkin corrupt atau format salah."
          );
        }

        const registeredKeyNorm = registeredStarkKey.toLowerCase().replace(/^0x/, "");
        const derivedKeyNorm = derivedKey ? derivedKey.toLowerCase().replace(/^0x/, "") : null;

        logger.info(
          {
            strategyId,
            userId,
            registeredStarkKey: `0x${registeredKeyNorm}`,
            derivedStarkKey: derivedKey ?? "(gagal derive)",
            match: derivedKeyNorm === registeredKeyNorm,
          },
          "[ExtendedBot] StarkKey comparison — registered vs derived from privateKey"
        );

        if (derivedKeyNorm && derivedKeyNorm !== registeredKeyNorm) {
          const errMsg =
            `StarkKey mismatch! Private key yang tersimpan menghasilkan starkKey ` +
            `0x${derivedKeyNorm}, tetapi akun Exchange menggunakan 0x${registeredKeyNorm}. ` +
            `Pastikan Stark Private Key di Pengaturan Extended DEX sudah benar.`;

          await extAddLog(userId, strategyId, strategy.name, "error",
            `❌ Invalid StarkEx signature: StarkKey mismatch.`,
            errMsg
          );
          logger.error({ strategyId, userId, derivedKey, registeredStarkKey: `0x${registeredKeyNorm}` },
            "[ExtendedBot] Bot aborted — starkKey mismatch antara private key dan akun."
          );
          throw new Error(`EXTENDED_BOT_VALIDATION_FAILED: ${errMsg}`);
        }
      } else if (!registeredStarkKey) {
        logger.warn(
          { strategyId, userId },
          "[ExtendedBot] starkKey tidak tersedia di response account API — skip verifikasi mismatch."
        );
        throw new Error(
          `EXTENDED_BOT_VALIDATION_FAILED: [ExtendedBot] l2Key tidak tersedia dari API — tidak bisa verifikasi starkKey`
        );
      }

      // ── Ambil l2Vault ─────────────────────────────────────────────────────────
      // Handle camelCase (l2Vault) dan snake_case (l2_vault) — Extended Exchange API
      const rawVault = accountDetails ? (accountDetails.l2Vault ?? null) : null;
      if (rawVault != null) {
        const l2VaultStr = String(rawVault);
        l2VaultCache.set(userId, { l2Vault: l2VaultStr, fetchedAt: Date.now() });
        startCreds.collateralPosition = l2VaultStr;
        logger.info(
          { strategyId, userId, l2Vault: l2VaultStr, accountId: accountDetails?.accountId },
          "[ExtendedBot] l2Vault fetched from API — akan dipakai sebagai collateralPosition untuk signing"
        );
      } else {
        logger.warn(
          { strategyId, userId },
          "[ExtendedBot] Gagal fetch l2Vault dari API — fallback ke accountId yang tersimpan. Jika terjadi 'Invalid StarkEx signature', pastikan Account ID di Pengaturan diisi dengan l2Vault (bukan accountId)."
        );
        throw new Error(
          `EXTENDED_BOT_VALIDATION_FAILED: [ExtendedBot] l2Vault tidak tersedia dari API — tidak bisa sign order`
        );
      }
    } catch (err: any) {
      // Jika ini error dari starkKey mismatch, re-throw supaya bot tidak jalan
      if (err?.message?.startsWith("EXTENDED_BOT_VALIDATION_FAILED")) throw err;
      logger.warn(
        { err, strategyId, userId },
        "[ExtendedBot] Error saat fetch account details — fallback ke accountId tersimpan."
      );
    }
  }

  // ── Hubungkan account WS untuk konfirmasi limit/GTT order secara real-time ───
  // Dilakukan setelah credential check berhasil. Ref-counted per user.
  if (userId !== null && startCreds) {
    await ensureExtendedAccountWs(userId, startCreds.apiKey!, startCreds.network);
  }

  const isGrid = strategy.type === "grid";
  const intervalMs = strategy.type === "dca"
    ? ((strategy.dcaConfig as { intervalMinutes?: number })?.intervalMinutes ?? 60) * 60 * 1000
    : EXT_GRID_FALLBACK_INTERVAL_MS;

  const nextRunAt = new Date(Date.now() + intervalMs);

  await db.update(strategiesTable)
    .set({ isRunning: true, isActive: true, updatedAt: new Date(), nextRunAt })
    .where(eq(strategiesTable.id, strategyId));

  // Daftarkan WS callback untuk SEMUA tipe bot Extended:
  // - Grid: callback aktif untuk deteksi crossing level real-time
  // - DCA: callback no-op — hanya menjaga WS aktif agar price cache terisi
  //        sehingga extGetCurrentPrice() tidak selalu return null
  {
    const creds = userId !== null ? await getExtendedConfig(userId).catch(() => null) : null;
    const network = creds?.network ?? "mainnet";

    registerExtendedPriceCallback(
      strategy.marketSymbol,
      strategyId,
      isGrid
        ? (_midPrice: any, _market: any) => {
            const now = Date.now();
            const last = extendedWsGridLastTriggered.get(strategyId) ?? 0;
            if (now - last < EXT_WS_GRID_COOLDOWN_MS) return;
            if (!extendedRunningBots.has(strategyId)) return;
            extendedWsGridLastTriggered.set(strategyId, now);
            extRunStrategyOnce(strategyId).catch(() => {});
          }
        : () => {}, // DCA: no-op — WS hanya dibutuhkan untuk mengisi price cache
      network
    );
  }

  const timer = setInterval(async () => {
    const bot = extendedRunningBots.get(strategyId);
    if (bot) {
      const nextInterval = strategy.type === "dca"
        ? ((strategy.dcaConfig as { intervalMinutes?: number })?.intervalMinutes ?? 60) * 60 * 1000
        : EXT_GRID_FALLBACK_INTERVAL_MS;
      bot.nextRunAt = new Date(Date.now() + nextInterval);
    }
    await extRunStrategyOnce(strategyId);
  }, intervalMs);

  extendedRunningBots.set(strategyId, { strategyId, timer, nextRunAt });

  const intervalLabel = isGrid
    ? `WebSocket realtime + ${EXT_GRID_FALLBACK_INTERVAL_MS / 60000} menit fallback`
    : `setiap ${intervalMs / 60000} menit`;

  await extAddLog(strategy.userId ?? null, strategyId, strategy.name, "success",
    `Bot Extended dimulai`, `Mode: ${intervalLabel}`
  );
  logger.info({ strategyId, type: strategy.type, exchange: "extended" }, "[ExtendedBot] Bot started");

  if (strategy.userId !== null && strategy.userId !== undefined) {
    const notif = await extGetNotificationConfig(strategy.userId).catch(() => null);
    if (notif?.notifyOnStart) {
      await extNotifyUser(strategy.userId, formatBotStarted("extended", strategy.name, strategy.type, strategy.marketSymbol));
    }
  }

  // Jalankan setelah 8 detik (beri waktu WS connect & terima harga pertama)
  setTimeout(() => extRunStrategyOnce(strategyId), 8000);

  return true;
}

export async function stopExtendedBot(strategyId: number, skipDbUpdate = false): Promise<boolean> {
  const bot = extendedRunningBots.get(strategyId);
  if (bot) {
    clearInterval(bot.timer);
    extendedRunningBots.delete(strategyId);
  }

  extendedGridStates.delete(strategyId);
  extendedWsGridLastTriggered.delete(strategyId);

  // Reset rerange state: consecutive_out_of_range → 0, pending_rerange_at → null.
  // Dipanggil di sini (stop/pause karena apapun) agar counter tidak stale saat bot restart.
  await clearRerangeState(strategyId);

  const strategy = await db.query.strategiesTable.findFirst({
    where: eq(strategiesTable.id, strategyId),
  });

  // Hapus WS callback untuk semua tipe bot Extended (grid DAN dca)
  if (strategy) {
    unregisterExtendedPriceCallback(strategy.marketSymbol, strategyId);
  }

  // Lepaskan referensi account WS — disconnect jika tidak ada bot lain yang berjalan untuk user ini
  const userId = strategy?.userId ?? null;
  if (userId !== null) {
    releaseExtendedAccountWs(userId);
  }

  await db.update(strategiesTable)
    if (!skipDbUpdate) await db.update(strategiesTable)
    .set({ isRunning: false, updatedAt: new Date(), nextRunAt: null })
    .where(eq(strategiesTable.id, strategyId));

  if (strategy) {
    await extAddLog(strategy.userId ?? null, strategyId, strategy.name, "warn", "Bot Extended dihentikan");
    if (strategy.userId !== null && strategy.userId !== undefined) {
      const notif = await extGetNotificationConfig(strategy.userId).catch(() => null);
      if (notif?.notifyOnStop) {
        await extNotifyUser(strategy.userId, formatBotStopped("extended", strategy.name, strategy.marketSymbol));
      }
    }
  }

  return true;
}

// ─── RESTORE BOTS YANG SEDANG RUNNING SAAT RESTART SERVER ────────────────────

export async function restoreRunningExtendedBots(): Promise<void> {
  const strategies = await db.query.strategiesTable.findMany({
    where: and(
      eq(strategiesTable.isRunning, true),
      eq(strategiesTable.exchange, "extended")
    ),
  });

  for (const strategy of strategies) {
    logger.info({ strategyId: strategy.id }, "[ExtendedBot] Restoring running extended bot");
    try {
      await startExtendedBot(strategy.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isValidationFail = message.startsWith("EXTENDED_BOT_VALIDATION_FAILED:");

      logger.error({ strategyId: strategy.id, err }, "[ExtendedBot] Failed to restore extended bot");

      await db.update(strategiesTable)
        .set({ isRunning: false })
        .where(eq(strategiesTable.id, strategy.id));

      if (isValidationFail) {
        logger.warn(
          { strategyId: strategy.id, reason: message },
          "[ExtendedBot] Bot config tidak valid setelah restart — ditandai sebagai stopped. User harus review settings."
        );
      }
    }
  }
}

// ─── MONITORING TRADE PENDING (untuk Limit/GTT orders) ───────────────────────
// Konfirmasi fill/cancel ditangani secara real-time oleh account WebSocket
// (lihat handleExtendedOrderEvent dan handleExtendedTradeEvent di atas).
//
// Fungsi ini adalah fallback REST polling untuk trade yang mungkin terlewat oleh WS
// (misalnya koneksi WS putus sementara). Setelah 10 menit pending:
//   - Cek status via GET /api/v1/user/orders?externalId={id}
//   - FILLED → update DB filled
//   - CANCELLED/REJECTED/EXPIRED → update DB cancelled
//   - Tidak ditemukan setelah 30 menit → mark failed

const EXT_TRADE_POLL_INTERVAL_MS = 1 * 60 * 1000;  // 1 menit (dipercepat untuk mainnet)
const EXT_TRADE_CHECK_AFTER_MS   = 2 * 60 * 1000;  // 2 menit → mulai cek ke API (WS fallback cepat)
const EXT_TRADE_TIMEOUT_MS       = 30 * 60 * 1000; // 30 menit → mark failed jika tidak ditemukan

export async function pollPendingExtendedTrades(): Promise<void> {
  try {
    const pendingTrades = await db.query.tradesTable.findMany({
      where: and(
        eq(tradesTable.status, "pending"),
        isNotNull(tradesTable.orderHash),
        ne(tradesTable.orderHash, "")
      ),
    });

    const extPendingTrades = pendingTrades.filter(t =>
      t.orderHash?.startsWith("ext_") && !t.orderHash?.startsWith("ext_paper_")
    );

    if (extPendingTrades.length === 0) return;

    logger.info(
      { count: extPendingTrades.length, hashes: extPendingTrades.map(t => t.orderHash) },
      "[ExtendedBot] Poll siklus mulai — memeriksa trades pending"
    );

    // Kumpulkan credentials per userId — satu fetch per user, bukan per trade
    const uniqueUserIds = [...new Set(
      extPendingTrades.map(t => t.userId).filter((id): id is number => id !== null)
    )];

    const credsByUserId = new Map<number, ExtendedCredentials | null>();
    await Promise.all(
      uniqueUserIds.map(async (userId) => {
        try {
          const creds = await getExtendedConfig(userId);
          credsByUserId.set(userId, creds.hasCredentials ? creds : null);
        } catch {
          credsByUserId.set(userId, null);
        }
      })
    );

    for (const trade of extPendingTrades) {
      const orderHash = trade.orderHash!;
      // externalId = bagian setelah "ext_"
      const externalId = orderHash.slice("ext_".length);
      const ageMs = Date.now() - new Date(trade.createdAt).getTime();

      if (ageMs < EXT_TRADE_CHECK_AFTER_MS) continue; // Masih baru, biarkan WS yang tangani

      const ageMinutes = Math.floor(ageMs / 60000);
      const creds = trade.userId !== null ? (credsByUserId.get(trade.userId) ?? null) : null;

      if (!creds || !creds.apiKey) {
        // Tidak ada credentials → tidak bisa cek → hanya log warning
        logger.warn(
          { tradeId: trade.id, orderHash, ageMinutes },
          "[ExtendedBot] Trade pending >10 menit tapi credentials tidak tersedia untuk cek status"
        );
        continue;
      }

      // Cek status order ke Extended API via externalId
      logger.info(
        { tradeId: trade.id, externalId, ageMinutes, endpoint: `/api/v1/user/orders/external/${externalId}` },
        "[ExtendedBot] Poll: mengecek status order ke Extended API"
      );
      let order: Awaited<ReturnType<typeof getOrderByExternalId>> = null;
      try {
        order = await getOrderByExternalId(creds.apiKey, externalId, creds.network);
      } catch (fetchErr) {
        logger.warn({ fetchErr, tradeId: trade.id, externalId }, "[ExtendedBot] Gagal fetch status order dari Extended API");
        continue;
      }

      if (order) {
        logger.info(
          { tradeId: trade.id, externalId, status: order.status, side: order.side, qty: order.qty, price: order.price, filledQty: order.filledQty, averagePrice: order.averagePrice, ageMinutes },
          "[ExtendedBot] Poll: Extended API mengembalikan data order ✓"
        );
      }

      if (!order) {
        // Order tidak ditemukan di Extended API
        if (ageMs > EXT_TRADE_TIMEOUT_MS) {
          // Sudah terlalu lama dan tidak ada data — mark failed
          await db.update(tradesTable)
            .set({
              status: "failed",
              errorMessage: "Order Extended tidak ditemukan di exchange setelah 30 menit — cek langsung di Extended Exchange",
            })
            .where(eq(tradesTable.id, trade.id));

          await extAddLog(
            trade.userId ?? null,
            trade.strategyId,
            trade.strategyName,
            "error",
            `${trade.side.toUpperCase()} order Extended timeout`,
            `TxHash: ${orderHash} | Extended tidak mengembalikan data setelah ${ageMinutes} menit — cek langsung di exchange`
          );

          logger.warn(
            { tradeId: trade.id, orderHash, ageMinutes },
            "[ExtendedBot] Trade Extended timeout — tidak ada data dari Extended API setelah 30 menit"
          );
        } else {
          // Masih dalam batas wajar — bisa jadi order masih diproses
          logger.info(
            { tradeId: trade.id, orderHash, ageMinutes },
            "[ExtendedBot] Trade Extended pending — Extended API belum mengembalikan data, masih menunggu"
          );
        }
        continue;
      }

      // Order ditemukan — proses berdasarkan status
      const status = (order.status ?? "").toUpperCase();

      if (status === "FILLED") {
        // Order terisi PENUH — update DB
        const fillPrice = order.averagePrice && parseFloat(order.averagePrice) > 0
          ? new Decimal(order.averagePrice)
          : new Decimal(order.price);
        const fillQty = order.filledQty && parseFloat(order.filledQty) > 0
          ? new Decimal(order.filledQty)
          : new Decimal(order.qty);

        await db.update(tradesTable)
          .set({ status: "filled", executedAt: new Date() })
          .where(eq(tradesTable.id, trade.id));

        if (trade.strategyId !== null) {
          await extUpdateStrategyStatsAtomic(
            trade.strategyId,
            trade.side as "buy" | "sell",
            fillQty,
            fillPrice
          );
        }

        await extAddLog(
          trade.userId ?? null,
          trade.strategyId,
          trade.strategyName,
          "success",
          `Order Extended terisi penuh (konfirmasi REST polling)`,
          `ExternalId: ${externalId} | Qty: ${fillQty.toFixed(6)} | Avg: $${fillPrice.toFixed(4)} | Usia: ${ageMinutes} menit`
        );

        logger.info(
          { tradeId: trade.id, orderHash, fillPrice: fillPrice.toFixed(4), fillQty: fillQty.toFixed(6), ageMinutes },
          "[ExtendedBot] REST poll: Extended order FILLED — DB updated"
        );

      } else if (["CANCELLED", "REJECTED", "EXPIRED"].includes(status)) {
        await db.update(tradesTable)
          .set({
            status: "cancelled",
            errorMessage: `Order ${status.toLowerCase()} oleh Extended Exchange (konfirmasi REST polling)`,
          })
          .where(eq(tradesTable.id, trade.id));

        await extAddLog(
          trade.userId ?? null,
          trade.strategyId,
          trade.strategyName,
          "warn",
          `Order Extended ${status.toLowerCase()} (konfirmasi REST polling)`,
          `ExternalId: ${externalId} | Market: ${order.market} | Side: ${order.side} | Usia: ${ageMinutes} menit`
        );

        logger.warn(
          { tradeId: trade.id, orderHash, status, ageMinutes },
          "[ExtendedBot] REST poll: Extended order cancelled/rejected — DB updated"
        );

      } else {
        // NEW, PARTIALLY_FILLED, TRIGGERED, UNTRIGGERED, dll — order masih aktif di order book
        // TIDAK boleh di-timeout atau di-mark error; biarkan terus dipantau hingga FILLED atau CANCELLED
        const partialInfo = status === "PARTIALLY_FILLED" && order.filledQty
          ? ` | filledQty: ${order.filledQty}/${order.qty}`
          : "";
        logger.info(
          { tradeId: trade.id, orderHash, status, ageMinutes, filledQty: order.filledQty, qty: order.qty },
          `[ExtendedBot] REST poll: order masih aktif di order book (${status})${partialInfo} — tidak ada aksi`
        );
      }
    }
  } catch (err) {
    logger.error({ err }, "[ExtendedBot] Error during pending Extended trade monitoring");
  }
}

export function startExtendedTradePollSchedule(): void {
  setInterval(pollPendingExtendedTrades, EXT_TRADE_POLL_INTERVAL_MS);
  logger.info(
    {
      intervalMs: EXT_TRADE_POLL_INTERVAL_MS,
      checkAfterMs: EXT_TRADE_CHECK_AFTER_MS,
      timeoutMs: EXT_TRADE_TIMEOUT_MS,
    },
    "[ExtendedBot] Trade status polling started — interval=1min, checkAfter=2min, timeout=30min"
  );
}
