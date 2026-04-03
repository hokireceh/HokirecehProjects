/**
 * autoRerange.ts — Shared Auto-Rerange Logic
 *
 * Implementasi fitur Auto-Rerange Grid dengan konfirmasi Telegram.
 * File ini bersifat EXCHANGE-AGNOSTIC: mendukung Lighter dan Extended.
 * Diletakkan di lib/ (bukan lighter/) karena digunakan oleh kedua exchange.
 *
 * Flow utama:
 *   executeGridCheck (botEngine) → handleAutoRerange (sini)
 *     → returns RerangeAction → botEngine decides what to do (stopBot, etc.)
 *
 * Approve/Reject handler didaftarkan di telegramBot.ts
 * menggunakan registerRerangeHandlers() yang diexport dari sini.
 */

import { db } from "@workspace/db";
import { strategiesTable, usersTable } from "@workspace/db";
import { eq, sql, isNull, and } from "drizzle-orm";
import Decimal from "decimal.js";
import { analyzeMarketForStrategy, type MarketContext } from "./groqAI";
import { getMarketInfo } from "./lighter/marketCache";
import { getBotConfig, getExtendedCredentials } from "../routes/configService";
import { getMarketStats, type ExtendedNetwork } from "./extended/extendedApi";
import { logger } from "./logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PendingRerangeParams {
  currentPrice: number;
  oldLowerPrice: number;
  oldUpperPrice: number;
  oldGridLevels: number;
  oldAmountPerGrid: number;
  newLowerPrice: number;
  newUpperPrice: number;
  newGridLevels: number;
  newAmountPerGrid: number;
  newStopLoss: number | null;
  newTakeProfit: number | null;
  newOrderType?: string;
  newLimitPriceOffset?: number;
  newMode?: string;
  reasoning: string;
}

export type RerangeAction =
  | { type: "continue" }
  | { type: "short_circuit" }
  | { type: "timeout" }
  | { type: "triggered"; params: PendingRerangeParams };

// ─── Constants ────────────────────────────────────────────────────────────────

const OUT_OF_RANGE_THRESHOLD = 5;
const COOLDOWN_MS = 2 * 60 * 60 * 1000;
const MAX_RERANGE_PER_DAY = 3;
const PENDING_TIMEOUT_MS = 20 * 60 * 1000;

// ─── Global Telegram Reference ────────────────────────────────────────────────
// Diisi oleh telegramBot.ts via setGlobalBotTelegramForRerange() saat bot init.
// autoRerange.ts tidak mengimport telegramBot.ts untuk menghindari circular dep.

type TelegramInstance = {
  sendMessage: (chatId: string, text: string, extra?: any) => Promise<any>;
};

let _globalTelegram: TelegramInstance | null = null;

export function setGlobalBotTelegramForRerange(tg: TelegramInstance): void {
  _globalTelegram = tg;
}

// ─── TP/SL Calculation ────────────────────────────────────────────────────────

/**
 * Hitung ulang TP/SL baru secara proporsional berdasarkan offset dari range lama.
 *
 * ATURAN KRITIS:
 * - Jika SL/TP lama null → baru HARUS null (tidak boleh diisi)
 * - Jika SL/TP lama ada → hitung offset lama, apply ke range baru
 */
export function computeNewSLTP(
  oldLower: number,
  oldUpper: number,
  oldStopLoss: number | null | undefined,
  oldTakeProfit: number | null | undefined,
  newLower: number,
  newUpper: number
): { newStopLoss: number | null; newTakeProfit: number | null } {
  let newStopLoss: number | null = null;
  let newTakeProfit: number | null = null;

  if (oldStopLoss != null && oldLower > 0) {
    const offsetLama = (oldLower - oldStopLoss) / oldLower;
    newStopLoss = parseFloat((newLower * (1 - offsetLama)).toFixed(6));
  }

  if (oldTakeProfit != null && oldUpper > 0) {
    const offsetLama = (oldTakeProfit - oldUpper) / oldUpper;
    newTakeProfit = parseFloat((newUpper * (1 + offsetLama)).toFixed(6));
  }

  return { newStopLoss, newTakeProfit };
}

// ─── AI Call ─────────────────────────────────────────────────────────────────

async function callAIForGridRerange(
  marketContext: MarketContext,
  oldConfig: {
    lowerPrice: number;
    upperPrice: number;
    gridLevels: number;
    amountPerGrid: number;
    stopLoss?: number | null;
    takeProfit?: number | null;
  }
): Promise<{
  newLowerPrice: number;
  newUpperPrice: number;
  newGridLevels: number;
  newAmountPerGrid: number;
  newOrderType: string;
  newLimitPriceOffset: number;
  newMode: string;
  rawStopLossFromAI: number | null;
  rawTakeProfitFromAI: number | null;
  reasoning: string;
}> {
  const result = await analyzeMarketForStrategy("grid", marketContext);

  if (!result.grid_params) {
    throw new Error("AI tidak mengembalikan grid_params untuk rerange");
  }

  const gp = result.grid_params;

  return {
    newLowerPrice: gp.lowerPrice,
    newUpperPrice: gp.upperPrice,
    newGridLevels: gp.gridLevels,
    newAmountPerGrid: Math.max(gp.amountPerGrid, oldConfig.amountPerGrid),
    newOrderType: gp.orderType,
    newLimitPriceOffset: gp.limitPriceOffset,
    newMode: gp.mode,
    rawStopLossFromAI: gp.stopLoss,
    rawTakeProfitFromAI: gp.takeProfit,
    reasoning: result.reasoning,
  };
}

// ─── Telegram Message Builder ─────────────────────────────────────────────────

function buildRerangeConfirmationText(
  strategyName: string,
  marketSymbol: string,
  params: PendingRerangeParams
): string {
  const slLine = params.newStopLoss != null
    ? `🛑 Stop Loss: $${params.newStopLoss.toFixed(4)}\n`
    : "";
  const tpLine = params.newTakeProfit != null
    ? `🎯 Take Profit: $${params.newTakeProfit.toFixed(4)}\n`
    : "";

  return (
    `⚠️ *Harga Keluar Range Grid!*\n\n` +
    `📊 *${strategyName}* (${marketSymbol})\n` +
    `💰 Harga sekarang: $${params.currentPrice.toFixed(4)}\n` +
    `📉 Range lama: $${params.oldLowerPrice.toFixed(4)} - $${params.oldUpperPrice.toFixed(4)}\n\n` +
    `🤖 *AI Rekomendasi Range Baru:*\n` +
    `📈 Range baru: $${params.newLowerPrice.toFixed(4)} - $${params.newUpperPrice.toFixed(4)}\n` +
    `🔢 Grid levels: ${params.newGridLevels}\n` +
    `💵 Amount/grid: $${params.newAmountPerGrid.toFixed(2)}\n` +
    slLine +
    tpLine +
    `\n💡 *Alasan:* ${params.reasoning}\n\n` +
    `⏱ Konfirmasi dalam 20 menit atau bot akan *PAUSE* otomatis.`
  );
}

async function sendRerangeConfirmationMessage(
  telegramId: string,
  strategyId: number,
  strategyName: string,
  marketSymbol: string,
  params: PendingRerangeParams
): Promise<boolean> {
  if (!_globalTelegram) {
    logger.warn({ strategyId }, "[AutoRerange] globalTelegram belum diset, tidak bisa kirim konfirmasi");
    return false;
  }

  const text = buildRerangeConfirmationText(strategyName, marketSymbol, params);

  try {
    await _globalTelegram.sendMessage(telegramId, text, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Approve", callback_data: `rerange_approve_${strategyId}` },
          { text: "❌ Reject",  callback_data: `rerange_reject_${strategyId}` },
        ]],
      },
    });
    return true;
  } catch (err: any) {
    logger.warn({ strategyId, err: err?.message }, "[AutoRerange] Gagal kirim pesan konfirmasi ke Telegram");
    return false;
  }
}

// ─── DB Helpers ───────────────────────────────────────────────────────────────

export async function clearRerangeState(strategyId: number): Promise<void> {
  await db.update(strategiesTable).set({
    consecutiveOutOfRange: 0,
    pendingRerangeAt: null,
    pendingRerangeParams: null,
    updatedAt: new Date(),
  }).where(eq(strategiesTable.id, strategyId));
}

export async function applyApprovedRerangeParams(
  strategyId: number,
  params: PendingRerangeParams
): Promise<void> {
  const strategy = await db.query.strategiesTable.findFirst({
    where: eq(strategiesTable.id, strategyId),
  });
  if (!strategy) return;

  const oldConfig = strategy.gridConfig as any ?? {};

  const newGridConfig = {
    ...oldConfig,
    lowerPrice: params.newLowerPrice,
    upperPrice: params.newUpperPrice,
    gridLevels: params.newGridLevels,
    amountPerGrid: params.newAmountPerGrid,
    stopLoss: params.newStopLoss,
    takeProfit: params.newTakeProfit,
    ...(params.newOrderType ? { orderType: params.newOrderType } : {}),
    ...(params.newLimitPriceOffset != null ? { limitPriceOffset: params.newLimitPriceOffset } : {}),
    ...(params.newMode ? { mode: params.newMode } : {}),
  };

  const today = getTodayString();
  const strategy2 = await db.query.strategiesTable.findFirst({
    where: eq(strategiesTable.id, strategyId),
  });
  const currentCount = (strategy2?.rerangeCountDate === today)
    ? (strategy2?.rerangeCountToday ?? 0)
    : 0;

  await db.update(strategiesTable).set({
    gridConfig: newGridConfig,
    consecutiveOutOfRange: 0,
    pendingRerangeAt: null,
    pendingRerangeParams: null,
    lastRerangeAt: new Date(),
    rerangeCountToday: currentCount + 1,
    rerangeCountDate: today,
    updatedAt: new Date(),
  }).where(eq(strategiesTable.id, strategyId));
}

function getTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Main Logic: handleAutoRerange ───────────────────────────────────────────

/**
 * Dipanggil oleh executeGridCheck di botEngine.ts di awal setiap tick.
 *
 * Returns:
 *   "continue"      → tidak ada pending, tidak ada trigger baru → lanjut logika grid normal
 *   "short_circuit" → ada pending konfirmasi aktif, belum timeout → jangan trade
 *   "timeout"       → pending sudah >20 menit → botEngine harus stopBot + clear state
 *   "triggered"     → baru saja trigger (counter >= 5, cooldown OK, dsb.)
 *                     konfirmasi sudah dikirim ke Telegram → jangan trade
 */
export async function handleAutoRerange(
  strategy: typeof strategiesTable.$inferSelect,
  currentPrice: Decimal
): Promise<RerangeAction> {
  if (strategy.type !== "grid") return { type: "continue" };

  const config = strategy.gridConfig as {
    lowerPrice: number;
    upperPrice: number;
    gridLevels: number;
    amountPerGrid: number;
    mode?: string;
    stopLoss?: number | null;
    takeProfit?: number | null;
    orderType?: string;
    limitPriceOffset?: number;
  } | null;

  if (!config) return { type: "continue" };

  const now = new Date();

  // ── 1. CECK TIMEOUT (paling prioritas) ───────────────────────────────────
  if (strategy.pendingRerangeAt) {
    const elapsed = now.getTime() - new Date(strategy.pendingRerangeAt).getTime();

    if (elapsed > PENDING_TIMEOUT_MS) {
      await clearRerangeState(strategy.id);
      logger.info({ strategyId: strategy.id }, "[AutoRerange] Timeout 20 menit — bot akan di-pause");
      return { type: "timeout" };
    }

    logger.info({ strategyId: strategy.id }, "[AutoRerange] Menunggu konfirmasi user — skip grid logic");
    return { type: "short_circuit" };
  }

  // ── 2. CEK HARGA DALAM RANGE ──────────────────────────────────────────────
  const lower = new Decimal(config.lowerPrice);
  const upper = new Decimal(config.upperPrice);
  const isOutOfRange = currentPrice.lt(lower) || currentPrice.gt(upper);

  if (!isOutOfRange) {
    if ((strategy.consecutiveOutOfRange ?? 0) > 0) {
      await db.update(strategiesTable).set({
        consecutiveOutOfRange: 0,
        updatedAt: new Date(),
      }).where(eq(strategiesTable.id, strategy.id));
    }
    return { type: "continue" };
  }

  // ── 3. HARGA DI LUAR RANGE — INCREMENT COUNTER (ATOMIC) ─────────────────
  const [counterRow] = await db.update(strategiesTable)
    .set({ consecutiveOutOfRange: sql`consecutive_out_of_range + 1`, updatedAt: new Date() })
    .where(eq(strategiesTable.id, strategy.id))
    .returning({ consecutiveOutOfRange: strategiesTable.consecutiveOutOfRange });

  const newCount = counterRow?.consecutiveOutOfRange ?? 1;

  logger.info(
    { strategyId: strategy.id, consecutiveOutOfRange: newCount, threshold: OUT_OF_RANGE_THRESHOLD },
    "[AutoRerange] Harga di luar range"
  );

  if (newCount < OUT_OF_RANGE_THRESHOLD) {
    return { type: "continue" };
  }

  // ── 4. COOLDOWN CHECK ─────────────────────────────────────────────────────
  if (strategy.lastRerangeAt) {
    const elapsed = now.getTime() - new Date(strategy.lastRerangeAt).getTime();
    if (elapsed < COOLDOWN_MS) {
      const remainingMin = Math.ceil((COOLDOWN_MS - elapsed) / 60000);
      logger.info(
        { strategyId: strategy.id, remainingMin },
        "[AutoRerange] Masih cooldown 2 jam, skip trigger"
      );
      return { type: "continue" };
    }
  }

  // ── 5. DAILY LIMIT CHECK ──────────────────────────────────────────────────
  const today = getTodayString();
  const todayCount = (strategy.rerangeCountDate === today)
    ? (strategy.rerangeCountToday ?? 0)
    : 0;

  if (todayCount >= MAX_RERANGE_PER_DAY) {
    logger.info(
      { strategyId: strategy.id, todayCount },
      "[AutoRerange] Limit 3x rerange per hari sudah tercapai, skip trigger"
    );
    return { type: "continue" };
  }

  // ── 6. PANGGIL AI ─────────────────────────────────────────────────────────
  logger.info({ strategyId: strategy.id, exchange: strategy.exchange }, "[AutoRerange] Trigger! Memanggil AI untuk parameter baru...");

  const userId = strategy.userId;

  try {
    let marketContext: MarketContext;

    if (strategy.exchange === "extended") {
      // Extended: ambil market stats dari Extended API
      const extCreds = userId != null ? await getExtendedCredentials(userId).catch(() => null) : null;
      const network = (extCreds?.extendedNetwork ?? "mainnet") as ExtendedNetwork;
      const stats = await getMarketStats(strategy.marketSymbol, network).catch(() => null);

      const high24h = stats?.dailyHigh ?? stats?.dailyHighPrice;
      const low24h = stats?.dailyLow ?? stats?.dailyLowPrice;
      const pctChange = stats?.dailyPriceChangePercentage ?? stats?.dailyPriceChangePercent ?? stats?.dailyPriceChange;

      marketContext = {
        exchange: "extended",
        symbol: strategy.marketSymbol,
        type: "perp",
        lastPrice: currentPrice.toNumber(),
        high24h: high24h ? parseFloat(high24h) : 0,
        low24h: low24h ? parseFloat(low24h) : 0,
        volume24h: stats?.dailyVolume ? parseFloat(stats.dailyVolume) : 0,
        priceChangePct24h: pctChange ? parseFloat(pctChange) : 0,
        minBaseAmount: 0,
        minQuoteAmount: 0,
      };
    } else {
      // Lighter: ambil market info dari market cache
      const botCfg = userId != null ? await getBotConfig(userId).catch(() => null) : null;
      const network = botCfg?.network ?? "mainnet";
      const marketInfo = await getMarketInfo(strategy.marketIndex, network);

      if (!marketInfo) {
        logger.warn({ strategyId: strategy.id }, "[AutoRerange] Tidak bisa fetch market info Lighter untuk AI call");
        return { type: "continue" };
      }

      marketContext = {
        exchange: "lighter",
        symbol: strategy.marketSymbol,
        type: marketInfo.type,
        lastPrice: currentPrice.toNumber(),
        high24h: marketInfo.dailyHigh,
        low24h: marketInfo.dailyLow,
        volume24h: marketInfo.dailyVolumeQuote,
        priceChangePct24h: marketInfo.dailyPriceChange,
        minBaseAmount: marketInfo.minBaseAmount,
        minQuoteAmount: marketInfo.minQuoteAmount,
      };
    }

    const aiResult = await callAIForGridRerange(marketContext, {
      lowerPrice: config.lowerPrice,
      upperPrice: config.upperPrice,
      gridLevels: config.gridLevels,
      amountPerGrid: config.amountPerGrid,
      stopLoss: config.stopLoss,
      takeProfit: config.takeProfit,
    });

    // ── 7. HITUNG ULANG TP/SL SECARA PROPORSIONAL ─────────────────────────
    const { newStopLoss, newTakeProfit } = computeNewSLTP(
      config.lowerPrice,
      config.upperPrice,
      config.stopLoss,
      config.takeProfit,
      aiResult.newLowerPrice,
      aiResult.newUpperPrice
    );

    const params: PendingRerangeParams = {
      currentPrice: currentPrice.toNumber(),
      oldLowerPrice: config.lowerPrice,
      oldUpperPrice: config.upperPrice,
      oldGridLevels: config.gridLevels,
      oldAmountPerGrid: config.amountPerGrid,
      newLowerPrice: aiResult.newLowerPrice,
      newUpperPrice: aiResult.newUpperPrice,
      newGridLevels: aiResult.newGridLevels,
      newAmountPerGrid: aiResult.newAmountPerGrid,
      newStopLoss,
      newTakeProfit,
      newOrderType: aiResult.newOrderType,
      newLimitPriceOffset: aiResult.newLimitPriceOffset,
      newMode: aiResult.newMode,
      reasoning: aiResult.reasoning,
    };

    // ── 8. SIMPAN PENDING STATE KE DB (CONDITIONAL — MENCEGAH DOUBLE TRIGGER) ──
    const [guardRow] = await db.update(strategiesTable).set({
      pendingRerangeAt: new Date(),
      pendingRerangeParams: params as any,
      updatedAt: new Date(),
    })
      .where(and(eq(strategiesTable.id, strategy.id), isNull(strategiesTable.pendingRerangeAt)))
      .returning({ id: strategiesTable.id });

    if (!guardRow) {
      logger.info({ strategyId: strategy.id }, "[AutoRerange] Double-trigger dicegah: pendingRerangeAt sudah diset oleh call lain");
      return { type: "short_circuit" };
    }

    // ── 9. KIRIM KONFIRMASI KE TELEGRAM ───────────────────────────────────
    if (userId != null) {
      const user = await db.query.usersTable.findFirst({
        where: eq(usersTable.id, userId),
      });

      if (user?.telegramId) {
        await sendRerangeConfirmationMessage(
          user.telegramId,
          strategy.id,
          strategy.name,
          strategy.marketSymbol,
          params
        );
      } else {
        logger.warn({ strategyId: strategy.id, userId }, "[AutoRerange] User tidak punya telegramId, konfirmasi tidak terkirim");
      }
    }

    return { type: "triggered", params };

  } catch (err: any) {
    logger.error({ strategyId: strategy.id, err: err?.message }, "[AutoRerange] Error saat proses AI/trigger");
    return { type: "continue" };
  }
}

// ─── Register Approve/Reject Handlers ────────────────────────────────────────
/**
 * Dipanggil dari startTelegramBot() di telegramBot.ts.
 * Mendaftarkan bot.action handler untuk approve/reject rerange.
 *
 * @param bot - Telegraf bot instance
 * @param startBotFn - startBot dari botEngine
 * @param stopBotFn - stopBot dari botEngine
 */
export function registerRerangeHandlers(
  bot: { action: (pattern: any, handler: (ctx: any) => Promise<void>) => void },
  startBotFn: (strategyId: number) => Promise<boolean>,
  stopBotFn: (strategyId: number) => Promise<boolean>
): void {

  // ── APPROVE ──────────────────────────────────────────────────────────────
  bot.action(/^rerange_approve_(\d+)$/, async (ctx: any) => {
    const strategyId = parseInt(ctx.match[1], 10);
    if (isNaN(strategyId)) return;

    try {
      await ctx.answerCbQuery("⏳ Memproses approve...");
    } catch (_) {}

    const strategy = await db.query.strategiesTable.findFirst({
      where: eq(strategiesTable.id, strategyId),
    });

    if (!strategy) {
      try { await ctx.editMessageText("❌ Strategy tidak ditemukan."); } catch (_) {}
      return;
    }

    if (strategy.userId != null) {
      const user = await db.query.usersTable.findFirst({
        where: eq(usersTable.id, strategy.userId),
      });
      const senderTelegramId = String(ctx.from?.id);
      if (user?.telegramId && user.telegramId !== senderTelegramId) {
        try { await ctx.answerCbQuery("❌ Bukan bot kamu!"); } catch (_) {}
        return;
      }
    }

    const pending = strategy.pendingRerangeParams as PendingRerangeParams | null;
    if (!pending) {
      try { await ctx.editMessageText("❌ Tidak ada pending rerange untuk di-approve."); } catch (_) {}
      return;
    }

    // ─────────────────────────────────────────────────────────────────────
    // ORDER HANDLING SAAT APPROVE — berbeda antara Extended dan Lighter
    //
    // Extended: massCancelExtendedOrders dipanggil SEBELUM stopBot untuk
    //   membatalkan semua open orders di market ini. API tersedia.
    //
    // Lighter: TIDAK ada cancel order API. Open orders dari range lama
    //   tetap hidup di exchange sampai terisi atau expire natural.
    //   Ini acceptable karena order di luar range tidak akan terisi.
    //   User diperingatkan via pesan approve.
    // ─────────────────────────────────────────────────────────────────────

    if (strategy.exchange === "extended" && strategy.userId != null) {
      try {
        // Dynamic import untuk menghindari circular dependency
        // massCancelExtendedOrders ada di extendedApi.ts (setelah merge dari extendedOrderManager)
        const { massCancelExtendedOrders } = await import("./extended/extendedApi");
        const extCreds = await getExtendedCredentials(strategy.userId).catch(() => null);
        if (extCreds?.apiKey && extCreds.extendedNetwork) {
          await massCancelExtendedOrders({
            apiKey: extCreds.apiKey,
            markets: [strategy.marketSymbol],
            network: extCreds.extendedNetwork,
          });
          logger.info({ strategyId }, "[AutoRerange] Approve Extended: open orders dibatalkan sebelum restart");
        }
      } catch (cancelErr: any) {
        logger.warn({ strategyId, err: cancelErr?.message }, "[AutoRerange] Approve Extended: gagal cancel orders, lanjut approve");
      }
    }

    await stopBotFn(strategyId);
    await applyApprovedRerangeParams(strategyId, pending);
    const started = await startBotFn(strategyId);

    if (started) {
      const slText = pending.newStopLoss != null ? `\n🛑 SL: $${pending.newStopLoss.toFixed(4)}` : "";
      const tpText = pending.newTakeProfit != null ? `\n🎯 TP: $${pending.newTakeProfit.toFixed(4)}` : "";
      const ordersNote = strategy.exchange === "extended"
        ? `\n✅ Open orders lama sudah dibatalkan.`
        : `\n\n⚠️ *Perhatian:* Open orders lama di Lighter tidak dibatalkan otomatis — cancel manual dari dashboard exchange jika perlu.`;

      try {
        await ctx.editMessageText(
          `✅ *Rerange Disetujui!*\n\n` +
          `📈 Range baru: $${pending.newLowerPrice.toFixed(4)} - $${pending.newUpperPrice.toFixed(4)}\n` +
          `🔢 Grid levels: ${pending.newGridLevels}\n` +
          `💵 Amount/grid: $${pending.newAmountPerGrid.toFixed(2)}` +
          slText + tpText + ordersNote +
          `\n\n🚀 Bot sudah restart dengan parameter baru.`,
          { parse_mode: "Markdown" }
        );
      } catch (_) {}

      logger.info({ strategyId }, "[AutoRerange] Approve: bot restart dengan config baru");
    } else {
      try {
        await ctx.editMessageText(
          `⚠️ *Rerange disetujui tapi bot gagal restart.*\n` +
          `Cek konfigurasi dan mulai bot secara manual dari dashboard.`,
          { parse_mode: "Markdown" }
        );
      } catch (_) {}

      logger.warn({ strategyId }, "[AutoRerange] Approve: gagal restart bot setelah rerange");
    }
  });

  // ── REJECT ───────────────────────────────────────────────────────────────
  bot.action(/^rerange_reject_(\d+)$/, async (ctx: any) => {
    const strategyId = parseInt(ctx.match[1], 10);
    if (isNaN(strategyId)) return;

    try {
      await ctx.answerCbQuery("⏳ Memproses reject...");
    } catch (_) {}

    const strategy = await db.query.strategiesTable.findFirst({
      where: eq(strategiesTable.id, strategyId),
    });

    if (!strategy) {
      try { await ctx.editMessageText("❌ Strategy tidak ditemukan."); } catch (_) {}
      return;
    }

    if (strategy.userId != null) {
      const user = await db.query.usersTable.findFirst({
        where: eq(usersTable.id, strategy.userId),
      });
      const senderTelegramId = String(ctx.from?.id);
      if (user?.telegramId && user.telegramId !== senderTelegramId) {
        try { await ctx.answerCbQuery("❌ Bukan bot kamu!"); } catch (_) {}
        return;
      }
    }

    await clearRerangeState(strategyId);

    try {
      await ctx.editMessageText(
        `❌ *Rerange Ditolak.*\n\n` +
        `Bot akan melanjutkan dengan range lama.\n` +
        `Cooldown: 2 jam sebelum bisa trigger rerange lagi.`,
        { parse_mode: "Markdown" }
      );
    } catch (_) {}

    logger.info({ strategyId }, "[AutoRerange] Reject: state cleared, bot lanjut dengan range lama");
  });
}
