import { execFile } from "child_process";
import https from "https";
import { Telegraf, Markup, session } from "telegraf";
import type { Context } from "telegraf";
import QRCode from "qrcode";
import { db } from "@workspace/db";
import { usersTable, pendingPaymentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import path from "path";
import fs from "fs";
import { logger } from "./logger";
import { generatePassword, addDays } from "./utils";
import { setGlobalBotTelegramForRerange, registerRerangeHandlers } from "./autoRerange";
import { broadcaster } from "./smartBroadcaster";

// CS_PERSONA — identitas karakter untuk AI Chat (future use)
export const CS_PERSONA = `Kamu adalah asisten AI dari Sepi Bukan Sapi.
Karaktermu: hangat, playful, casual, selalu panggil user dengan "sayang".
Tone seperti kakak/tante yang akrab dan perhatian.
Bahasa Indonesia santai, tidak formal, tidak kaku.
Tetap informatif dan helpful meski dengan gaya yang fun.`;

const PLANS = {
  "30d": { label: "30 Hari", price: 50000, days: 30, formatted: "Rp 50.000" },
  "60d": { label: "60 Hari", price: 100000, days: 60, formatted: "Rp 100.000" },
  "90d": { label: "90 Hari", price: 150000, days: 90, formatted: "Rp 150.000" },
} as const;

type PlanKey = keyof typeof PLANS;

let activePromo: { discountPercent: number; label: string } | null = null;

function getEffectivePrice(basePrice: number): number {
  if (!activePromo) return basePrice;
  return Math.round(basePrice * (1 - activePromo.discountPercent / 100));
}

function getEffectiveFormatted(basePrice: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(getEffectivePrice(basePrice));
}

interface SessionData {
  step?: string;
  pendingTelegramId?: string;
  pendingPlan?: PlanKey;
  pendingPromoPercent?: number;
}

type BotContext = Context & { session: SessionData };

const SAWERIA_API = "https://backend.saweria.co";
const CHECK_INTERVAL_MS = 7000;
const MAX_WAIT_MINUTES = 15;

const CURL_HEADERS = [
  "-H", "Accept: */*",
  "-H", "Accept-Encoding: gzip, deflate, br, zstd",
  "-H", "Accept-Language: id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
  "-H", "DNT: 1",
  "-H", "Origin: https://saweria.co",
  "-H", "Priority: u=1, i",
  "-H", "Referer: https://saweria.co/",
  "-H", "Sec-Fetch-Dest: empty",
  "-H", "Sec-Fetch-Mode: cors",
  "-H", "Sec-Fetch-Site: same-site",
  "-H", 'sec-ch-ua: "Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
  "-H", "sec-ch-ua-mobile: ?0",
  "-H", 'sec-ch-ua-platform: "Windows"',
  "-H", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
];

const MD = (text: string) => ({ parse_mode: "Markdown" as const, ...(text ? {} : {}) });

function curlPost(url: string, body: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const args = ["-s", "--compressed", "-m", "30", "-X", "POST", url,
      "-H", "Content-Type: application/json", ...CURL_HEADERS, "-d", JSON.stringify(body)];
    execFile("curl", args, { maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(new Error(`curl error: ${err.message}`));
      try { resolve(JSON.parse(stdout)); }
      catch { reject(new Error(`Non-JSON dari Saweria: ${stdout.slice(0, 200)}`)); }
    });
  });
}

function curlGet(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const args = ["-s", "--compressed", "-m", "30", url, ...CURL_HEADERS];
    execFile("curl", args, { maxBuffer: 2 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(new Error(`curl error: ${err.message}`));
      try { resolve(JSON.parse(stdout)); }
      catch { reject(new Error(`Non-JSON: ${stdout.slice(0, 200)}`)); }
    });
  });
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 2000): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); }
    catch (err: any) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, i)));
    }
  }
  throw new Error("Max retries reached");
}


async function createDonation(saweriaId: string, amount: number, name: string) {
  return withRetry(async () => {
    const payload = {
      agree: true, notUnderage: true, message: "Sepi Bukan Sapi Subscription",
      amount, payment_type: "qris", vote: "", currency: "IDR",
      customer_info: { first_name: name, email: "bot@hokireceh.online", phone: "" },
    };
    const res = await curlPost(`${SAWERIA_API}/donations/snap/${saweriaId}`, payload);
    if (!res?.data?.qr_string) throw new Error(res?.message || "Respons tidak valid dari Saweria");
    return res.data as { id: string; qr_string: string; amount_raw: number };
  });
}

async function checkPaymentStatus(donationId: string) {
  try {
    const res = await curlGet(`${SAWERIA_API}/donations/qris/snap/${donationId}`);
    const d = res?.data;
    if (d) return { id: d.id, status: d.transaction_status as string, amount: d.amount_raw as number };
  } catch (e: any) {
    logger.warn(`checkPaymentStatus error: ${e.message}`);
  }
  return null;
}

async function generateQRImage(qrString: string, donationId: string): Promise<string> {
  const filePath = path.join("/tmp", `qr_${donationId}.png`);
  await QRCode.toFile(filePath, qrString, { width: 500, margin: 2 });
  return filePath;
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
}

function buildWaitingText(donationId: string, secsLeft: number): string {
  const m = Math.floor(secsLeft / 60);
  const s = secsLeft % 60;
  const countdown = `${m}:${String(s).padStart(2, "0")}`;
  return (
    `⏳ *Aku lagi nungguin pembayaran kamu sayang~* 🙏\n\n` +
    `🆔 ID: \`${donationId}\`\n` +
    `⏱ Sisa waktu: *${countdown}*\n\n` +
    `_Otomatis aktif begitu pembayaran berhasil ya!_`
  );
}

async function upsertUser(
  telegramId: string, telegramUsername: string | undefined,
  telegramName: string, plan: PlanKey, password: string
) {
  const planInfo = PLANS[plan];
  const bcrypt = await import("bcryptjs");
  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await db.query.usersTable.findFirst({ where: eq(usersTable.telegramId, telegramId) });

  if (existing) {
    const base = existing.expiresAt > new Date() ? existing.expiresAt : new Date();
    const newExpiry = addDays(base, planInfo.days);
    await db.update(usersTable)
      .set({ password, passwordHash, plan, expiresAt: newExpiry, isActive: true, updatedAt: new Date() })
      .where(eq(usersTable.telegramId, telegramId));
    return { password, expiresAt: newExpiry, isNew: false };
  } else {
    const expiresAt = addDays(new Date(), planInfo.days);
    await db.insert(usersTable).values({
      telegramId, telegramUsername: telegramUsername ?? null,
      telegramName, password, passwordHash, plan, expiresAt, isActive: true,
    });
    return { password, expiresAt, isNew: true };
  }
}

const activeIntervals: Record<string, ReturnType<typeof setInterval>> = {};

function startPaymentPolling(
  bot: Telegraf<BotContext>,
  donationId: string,
  chatId: string,
  telegramId: string,
  telegramUsername: string | undefined,
  telegramName: string,
  plan: PlanKey,
  planInfo: typeof PLANS[PlanKey],
  amount: number,
  expiresAt: Date,
  adminChatId: string | undefined,
  notifyAdmin: (text: string) => Promise<void>,
  waitingMsgId?: number
) {
  if (activeIntervals[donationId]) return;

  let lastCountdownUpdate = 0;

  const editWaiting = async (text: string, keyboard?: ReturnType<typeof Markup.inlineKeyboard>) => {
    if (!waitingMsgId) return;
    try {
      await bot.telegram.editMessageText(
        chatId, waitingMsgId, undefined, text,
        { ...MD(""), ...(keyboard ? keyboard : {}) }
      );
    } catch (_) { }
  };

  const interval = setInterval(async () => {
    try {
      const now = Date.now();

      if (waitingMsgId && now - lastCountdownUpdate > 55_000) {
        lastCountdownUpdate = now;
        const secsLeft = Math.max(0, Math.floor((expiresAt.getTime() - now) / 1000));
        await editWaiting(
          buildWaitingText(donationId, secsLeft),
          Markup.inlineKeyboard([[Markup.button.callback("❌ Batalkan", `cancel_${donationId}`)]])
        );
      }

      if (new Date() >= expiresAt) {
        clearInterval(interval);
        delete activeIntervals[donationId];
        await db.delete(pendingPaymentsTable).where(eq(pendingPaymentsTable.donationId, donationId));
        const expiredText =
          `⏰ *Waduh, waktu habis nih sayang* 🥺\n\n` +
          `_QR-nya udah expired. Tapi tenang, tekan tombol di bawah buat mulai lagi~_`;
        const retryBtn = Markup.inlineKeyboard([[Markup.button.callback("🔄 Mulai Ulang", "back_main")]]);
        if (waitingMsgId) {
          await editWaiting(expiredText, retryBtn);
        } else {
          try { await bot.telegram.sendMessage(chatId, expiredText, { ...MD(""), ...retryBtn }); } catch (_) { }
        }
        return;
      }

      const data = await checkPaymentStatus(donationId);
      const status = (data?.status || "").toUpperCase();

      if (["SUCCESS", "SETTLEMENT", "PAID", "CAPTURE"].includes(status)) {
        clearInterval(interval);
        delete activeIntervals[donationId];
        await db.delete(pendingPaymentsTable).where(eq(pendingPaymentsTable.donationId, donationId));

        const password = generatePassword();
        const { expiresAt: subscriptionExpiry, isNew } = await upsertUser(
          telegramId, telegramUsername, telegramName, plan, password
        );

        await editWaiting(`✅ *Yeay, pembayaran diterima!* 🎉`);

        await bot.telegram.sendMessage(chatId,
          `🎉 *Yeay sayang berhasil!* 🥳\n\n` +
          `Ini password kamu ya, jangan sampe keselip:\n🔑 \`${password}\`\n\n` +
          `📦 Paket: *${planInfo.label}*\n` +
          `📅 Aktif sampai: *${formatDate(subscriptionExpiry)}*\n\n` +
          `Buruan login ke dashboard, aku udah nungguin~ 😘` +
          (isNew ? "" : `\n\n_Password lama udah gak berlaku ya sayang._`),
          { ...MD(""), ...Markup.inlineKeyboard([[Markup.button.callback("🏠 Menu Utama", "back_main")]]) }
        );

        await notifyAdmin(
          `💳 *PEMBAYARAN MASUK*\n\n` +
          `👤 ${telegramName} (@${telegramUsername || telegramId})\n` +
          `📦 ${planInfo.label} | 💰 ${formatRupiah(amount)}\n` +
          `🔑 Password: \`${password}\``
        );
      } else if (["FAILED", "EXPIRED", "CANCEL", "FAILURE", "DENY"].includes(status)) {
        clearInterval(interval);
        delete activeIntervals[donationId];
        await db.delete(pendingPaymentsTable).where(eq(pendingPaymentsTable.donationId, donationId));
        const failText = `❌ *Aduh, pembayaran gagal nih sayang* 😢\n\n_Jangan nyerah ya, coba lagi yuk~_`;
        const retryBtn = Markup.inlineKeyboard([[Markup.button.callback("🔄 Coba Lagi", "back_main")]]);
        if (waitingMsgId) {
          await editWaiting(failText, retryBtn);
        } else {
          await bot.telegram.sendMessage(chatId, failText, { ...MD(""), ...retryBtn });
        }
      }
    } catch (e: any) {
      logger.error(`Poll error: ${e.message}`);
    }
  }, CHECK_INTERVAL_MS);

  activeIntervals[donationId] = interval;
}

let globalBotTelegram: Telegraf<BotContext>["telegram"] | null = null;

export async function sendMessageToUser(
  chatId: string,
  text: string,
  notifyBotToken?: string | null
): Promise<{ ok: boolean; error?: string }> {
  if (!notifyBotToken) return { ok: false, error: "Bot token not configured" };
  if (!chatId) return { ok: false, error: "Chat ID not configured" };
  // Force IPv4 — same as the main bot. VPS servers sometimes have broken IPv6
  // connectivity to Telegram's API which causes silent send failures.
  const ipv4Agent = new https.Agent({ family: 4 });
  const telegram = new Telegraf(notifyBotToken, { telegram: { agent: ipv4Agent } }).telegram;
  try {
    await telegram.sendMessage(chatId, text, { parse_mode: "Markdown" });
    return { ok: true };
  } catch (err: any) {
    const msg = err?.response?.description ?? err?.message ?? String(err);
    logger.warn({ chatId, err: msg }, "[Notify] Failed to send Telegram notification");
    return { ok: false, error: msg };
  }
}

export function startTelegramBot() {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const SAWERIA_USER_ID = process.env.SAWERIA_USER_ID;
  const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

  if (!BOT_TOKEN) { logger.warn("BOT_TOKEN tidak diset, Telegram bot tidak aktif"); return; }

  const subscriptionEnabled = !!SAWERIA_USER_ID;
  if (!subscriptionEnabled) {
    logger.warn("SAWERIA_USER_ID tidak diset, fitur subscription/pembayaran dinonaktifkan (bot notifikasi tetap jalan jika diperlukan)");
  }

  const ipv4Agent = new https.Agent({ family: 4 });
  const bot = new Telegraf<BotContext>(BOT_TOKEN, { telegram: { agent: ipv4Agent } });
  globalBotTelegram = bot.telegram;

  // Daftarkan referensi telegram ke autoRerange module agar bisa kirim
  // pesan konfirmasi inline-keyboard via main bot (bukan notify bot per-user).
  setGlobalBotTelegramForRerange(bot.telegram);

  // Daftarkan ke SmartBroadcaster agar broadcast bisa menggunakan token yang sama
  broadcaster.setTelegram(bot.telegram);

  bot.use(session({ defaultSession: () => ({}) }));

  const isAdmin = (ctx: BotContext) =>
    ADMIN_CHAT_ID && String(ctx.from?.id) === String(ADMIN_CHAT_ID);

  async function notifyAdmin(text: string) {
    if (!ADMIN_CHAT_ID) return;
    try { await bot.telegram.sendMessage(ADMIN_CHAT_ID, text, MD(text)); }
    catch (e: any) { logger.warn(`Gagal notif admin: ${e.message}`); }
  }

  // ─── MENU UTAMA USER ──────────────────────────────────────────────────────
  async function showMainMenu(ctx: BotContext, edit = false) {
    const name = ctx.from?.first_name || "Trader";
    const promoLine = activePromo && subscriptionEnabled
      ? `\n🔥 *PROMO ${activePromo.label}* — Diskon *${activePromo.discountPercent}%*!`
      : "";
    const text =
      `🤖 *Sepi Bukan Sapi — Automated Trading*\n\n` +
      `Haii sayang *${name}*! 👋✨\n` +
      `Mau join VIP? Langsung chat aku ya~\n` +
      `Cek testi & postingan aku dulu di profil dong${promoLine}\n\n` +
      (subscriptionEnabled
        ? `Yuk pilih paket atau cek status akses kamu:`
        : `Cek status akses kamu di bawah ya sayang~`);

    const statusRow = [
      Markup.button.callback("📊 Cek status aku dong~", "menu_status"),
      Markup.button.callback("🔑 Psst, liat password aku", "menu_mypassword"),
    ];

    const rows = subscriptionEnabled ? [
      [Markup.button.callback(
        activePromo ? `⚡ 30 Hari · ~~Rp 50.000~~ ${getEffectiveFormatted(PLANS["30d"].price)}` : `⚡ 30 Hari · Rp 50.000`,
        "plan_30d"
      )],
      [Markup.button.callback(
        activePromo ? `🔥 60 Hari · ~~Rp 100.000~~ ${getEffectiveFormatted(PLANS["60d"].price)}` : `🔥 60 Hari · Rp 100.000`,
        "plan_60d"
      )],
      [Markup.button.callback(
        activePromo ? `💎 90 Hari · ~~Rp 150.000~~ ${getEffectiveFormatted(PLANS["90d"].price)}` : `💎 90 Hari · Rp 150.000`,
        "plan_90d"
      )],
      statusRow,
    ] : [statusRow];

    const keyboard = Markup.inlineKeyboard(rows);
    if (edit) return ctx.editMessageText(text, { ...MD(text), ...keyboard });
    return ctx.reply(text, { ...MD(text), ...keyboard });
  }

  // ─── MENU ADMIN ───────────────────────────────────────────────────────────
  async function showAdminMenu(ctx: BotContext, edit = false) {
    const promoStatus = activePromo
      ? `🔥 Promo aktif: *${activePromo.label}* (-${activePromo.discountPercent}%)`
      : `🎁 Tidak ada promo aktif`;
    const text =
      `👑 *Admin Panel — Sepi Bukan Sapi*\n\n` +
      `${promoStatus}\n\n` +
      `Selamat datang, Admin! Pilih aksi:`;
    const promoBtn = activePromo
      ? Markup.button.callback("🔥 Kelola Promo (Aktif)", "admin_promo")
      : Markup.button.callback("🎁 Kelola Promo", "admin_promo");
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback("👥 Daftar User", "admin_listusers")],
      [
        Markup.button.callback("➕ Tambah User", "admin_adduser"),
        Markup.button.callback("❌ Hapus User", "admin_deleteuser"),
      ],
      [Markup.button.callback("⏰ Perpanjang User", "admin_extenduser")],
      [promoBtn, Markup.button.callback("📊 Statistik", "admin_stats")],
      [Markup.button.callback("📢 Broadcast Pesan", "admin_broadcast")],
    ]);
    if (edit) return ctx.editMessageText(text, { ...MD(text), ...keyboard });
    return ctx.reply(text, { ...MD(text), ...keyboard });
  }

  // ─── /start ───────────────────────────────────────────────────────────────
  bot.start(async (ctx) => {
    ctx.session = {};
    if (isAdmin(ctx)) {
      await showAdminMenu(ctx);
    } else {
      await showMainMenu(ctx);
    }
  });

  // ─── /help ────────────────────────────────────────────────────────────────
  bot.help(async (ctx) => {
    if (isAdmin(ctx)) {
      await showAdminMenu(ctx);
    } else {
      await showMainMenu(ctx);
    }
  });

  // ─── AUTO-RERANGE: Daftarkan action handler approve/reject ───────────────
  // Dipasang di sini (setelah session middleware) agar session tersedia jika dibutuhkan.
  // startBot/stopBot di-import secara lazy untuk menghindari circular dependency.
  // Callbacks dispatch berdasarkan strategy.exchange — mendukung Lighter dan Extended.
  // Ethereal: rerange via Telegram belum didukung (guard eksplisit, tidak fall-through ke Lighter).
  registerRerangeHandlers(
    bot,
    async (strategyId) => {
      const { db: botDb } = await import("@workspace/db");
      const { strategiesTable: st } = await import("@workspace/db");
      const { eq: eqFn } = await import("drizzle-orm");
      const strat = await botDb.query.strategiesTable.findFirst({ where: eqFn(st.id, strategyId) });
      if (strat?.exchange === "extended") {
        const { startExtendedBot } = await import("./extended/extendedBotEngine");
        return startExtendedBot(strategyId);
      }
      if (strat?.exchange === "ethereal") {
        logger.warn({ strategyId }, "[TelegramBot] Ethereal rerange approve not yet supported via Telegram");
        return;
      }
      const { startBot } = await import("./lighter/botEngine");
      return startBot(strategyId);
    },
    async (strategyId) => {
      const { db: botDb } = await import("@workspace/db");
      const { strategiesTable: st } = await import("@workspace/db");
      const { eq: eqFn } = await import("drizzle-orm");
      const strat = await botDb.query.strategiesTable.findFirst({ where: eqFn(st.id, strategyId) });
      if (strat?.exchange === "extended") {
        const { stopExtendedBot } = await import("./extended/extendedBotEngine");
        return stopExtendedBot(strategyId);
      }
      if (strat?.exchange === "ethereal") {
        logger.warn({ strategyId }, "[TelegramBot] Ethereal rerange reject not yet supported via Telegram");
        return;
      }
      const { stopBot } = await import("./lighter/botEngine");
      return stopBot(strategyId);
    }
  );

  // ─── BOT RESTART (dari notif pause) ──────────────────────────────────────
  // Dipasang setelah session middleware agar handler berjalan dalam konteks bot.
  // Callback data: bot_restart_<strategyId> — dikirim oleh pause notification di *BotEngine.ts
  bot.action(/^bot_restart_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery("⏳ Memulai ulang bot...");
    const strategyId = Number(ctx.match![1]);
    try {
      const { db: botDb } = await import("@workspace/db");
      const { strategiesTable: st } = await import("@workspace/db");
      const { eq: eqFn } = await import("drizzle-orm");
      const strat = await botDb.query.strategiesTable.findFirst({ where: eqFn(st.id, strategyId) });
      if (!strat) {
        await ctx.reply(`❌ Strategy ID ${strategyId} tidak ditemukan.`);
        return;
      }
      if (strat.exchange === "extended") {
        const { startExtendedBot } = await import("./extended/extendedBotEngine");
        await startExtendedBot(strategyId);
      } else if (strat.exchange === "ethereal") {
        const { startEtherealBot } = await import("./ethereal/etherealBotEngine");
        await startEtherealBot(strategyId);
      } else {
        const { startBot } = await import("./lighter/botEngine");
        await startBot(strategyId);
      }
      await ctx.reply(`▶️ *Bot Dimulai Kembali*\nStrategy: *${strat.name}*`, { parse_mode: "Markdown" });
    } catch (err: any) {
      logger.error({ err, strategyId }, "[TelegramBot] Gagal restart bot dari tombol pause");
      await ctx.reply(`❌ Gagal memulai bot: ${err?.message ?? "Unknown error"}`);
    }
  });

  // ─── TOMBOL KEMBALI ───────────────────────────────────────────────────────
  bot.action("back_main", async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session = {};
    if (isAdmin(ctx)) {
      await showAdminMenu(ctx, true).catch(() => showAdminMenu(ctx));
    } else {
      await showMainMenu(ctx, true).catch(() => showMainMenu(ctx));
    }
  });

  bot.action("back_admin", async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session = {};
    await showAdminMenu(ctx, true).catch(() => showAdminMenu(ctx));
  });

  // ─── STATUS LANGGANAN (USER) ──────────────────────────────────────────────
  bot.action("menu_status", async (ctx) => {
    await ctx.answerCbQuery();
    const telegramId = String(ctx.from!.id);
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.telegramId, telegramId) });
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback("🏠 Menu Utama", "back_main")]]);
    if (!user) {
      return ctx.reply("Eh sayang, kamu belum berlangganan nih 🥺\nYuk daftar dulu~", { ...keyboard });
    }
    const isExpired = user.expiresAt < new Date();
    await ctx.reply(
      `📊 *Status Akses Kamu*\n\n` +
      `${isExpired ? "❌ Expired nih sayang 🥺" : "✅ Masih aktif & aman~"}\n` +
      `📦 ${PLANS[user.plan as PlanKey]?.label || user.plan}\n` +
      `📅 Sampai *${formatDate(user.expiresAt)}*\n` +
      (isExpired ? "\nSayang jangan pergi dulu dong~ Perpanjang yuk:" : `🔑 Password: \`${user.password}\``),
      { ...MD(""), ...keyboard }
    );
  });

  // ─── PASSWORD SAYA (USER) ─────────────────────────────────────────────────
  bot.action("menu_mypassword", async (ctx) => {
    await ctx.answerCbQuery();
    const telegramId = String(ctx.from!.id);
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.telegramId, telegramId) });
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback("🏠 Menu Utama", "back_main")]]);
    if (!user || !user.isActive) {
      return ctx.reply("Eh sayang, kamu belum berlangganan nih 🥺\nYuk daftar dulu~", { ...keyboard });
    }
    if (user.expiresAt < new Date()) {
      return ctx.reply(
        `Eh sayang, akses kamu udah habis nih 🥺\n_(habis sejak ${formatDate(user.expiresAt)})_\nJangan pergi dulu dong, perpanjang yuk~`,
        { ...MD(""), ...keyboard }
      );
    }
    await ctx.reply(
      `🔑 *Ini password kamu ya sayang, jangan keselip!*\n\n\`${user.password}\`\n\n` +
      `📅 Aktif sampai: *${formatDate(user.expiresAt)}*\n` +
      `📦 Paket: *${PLANS[user.plan as PlanKey]?.label || user.plan}*`,
      { ...MD(""), ...keyboard }
    );
  });

  // ─── PILIH PAKET (USER) ───────────────────────────────────────────────────
  for (const [planKey, planInfo] of Object.entries(PLANS)) {
    bot.action(`plan_${planKey}`, async (ctx) => {
      await ctx.answerCbQuery();

      if (!subscriptionEnabled) {
        return ctx.reply(
          `⚠️ Eh sayang, fitur pembelian lagi off dulu nih.\nHubungi admin untuk berlangganan ya~`,
          Markup.inlineKeyboard([[Markup.button.callback("🏠 Menu Utama", "back_main")]])
        );
      }

      const userName = ctx.from?.first_name || "Trader";
      const saweriaId = SAWERIA_USER_ID!;

      const effectivePrice = getEffectivePrice(planInfo.price);
      const effectiveFormatted = getEffectiveFormatted(planInfo.price);
      const promoNote = activePromo
        ? `\n🔥 Promo *${activePromo.label}* — hemat *${activePromo.discountPercent}%*`
        : "";

      const loadingMsg = await ctx.reply(
        `⏳ *Sabar ya sayang, lagi bikin QR-nya...* 🙏\n\n📦 Paket: *${planInfo.label}*\n💰 Harga: *${effectiveFormatted}*${promoNote}`,
        MD("")
      );

      try {
        const donation = await createDonation(saweriaId, effectivePrice, userName);
        const qrFile = await generateQRImage(donation.qr_string, donation.id);
        const expiresAt = new Date(Date.now() + MAX_WAIT_MINUTES * 60 * 1000);

        const pgFee = donation.amount_raw - effectivePrice;
        const captionLines = [
          `📋 *Detail Pembayaran — ${planInfo.label}* 💸`,
          ``,
          `👤 User: \`${ctx.from!.id}\``,
          `📦 Paket: *${planInfo.label}*`,
          `💰 Nominal: *${formatRupiah(effectivePrice)}*`,
          pgFee > 0 ? `🏦 Biaya PG: *${formatRupiah(pgFee)}*` : null,
          pgFee > 0 ? `💳 Total Bayar: *${formatRupiah(donation.amount_raw)}*` : null,
          ``,
          `📲 Scan QR di atas pakai e-wallet / m-banking`,
          `⏰ Berlaku: *${MAX_WAIT_MINUTES} menit*`,
        ].filter(l => l !== null).join("\n");

        await ctx.replyWithPhoto(
          { source: fs.createReadStream(qrFile) },
          { caption: captionLines, parse_mode: "Markdown" }
        );

        fs.unlink(qrFile, () => { });
        try { await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id); } catch (_) { }

        const chatId = String(ctx.chat!.id);
        const telegramId = String(ctx.from!.id);
        const telegramName = ctx.from?.first_name || "Trader";
        const telegramUsername = ctx.from?.username;

        const waitingMsg = await ctx.reply(
          buildWaitingText(donation.id, MAX_WAIT_MINUTES * 60),
          { ...MD(""), ...Markup.inlineKeyboard([[Markup.button.callback("❌ Batalkan", `cancel_${donation.id}`)]]) }
        );
        const waitingMsgId = waitingMsg.message_id;

        await db.insert(pendingPaymentsTable).values({
          donationId: donation.id,
          chatId, telegramId,
          telegramUsername: telegramUsername ?? null,
          telegramName,
          plan: planKey,
          amount: String(donation.amount_raw),
          qrString: donation.qr_string,
          waitingMsgId,
          expiresAt,
        }).onConflictDoNothing();

        startPaymentPolling(
          bot, donation.id, chatId, telegramId, telegramUsername,
          telegramName, planKey as PlanKey, planInfo, donation.amount_raw,
          expiresAt, ADMIN_CHAT_ID, notifyAdmin, waitingMsgId
        );

      } catch (err: any) {
        logger.error(`Gagal buat donasi: ${err.message}`);
        try { await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id); } catch (_) { }
        await ctx.reply(
          `❌ Aduh sayang, gagal bikin QR nih 😣\n${err.message}\n\nCoba lagi ya atau hubungi admin~`,
          Markup.inlineKeyboard([[Markup.button.callback("🔄 Coba Lagi", `plan_${planKey}`), Markup.button.callback("🏠 Menu", "back_main")]])
        );
      }
    });
  }

  // ─── BATALKAN PEMBAYARAN ──────────────────────────────────────────────────
  bot.action(/^cancel_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const donationId = ctx.match[1];
    const chatId = String(ctx.chat!.id);

    const pending = await db.query.pendingPaymentsTable.findFirst({
      where: eq(pendingPaymentsTable.donationId, donationId),
    });

    if (!pending || pending.chatId !== chatId) return;

    if (activeIntervals[donationId]) {
      clearInterval(activeIntervals[donationId]);
      delete activeIntervals[donationId];
    }

    await db.delete(pendingPaymentsTable).where(eq(pendingPaymentsTable.donationId, donationId));

    try {
      await ctx.editMessageText(
        `❌ *Pembayaran dibatalkan ya sayang*\n\n_QR-nya udah gak aktif. Kalau mau lagi, tekan mulai ulang~_`,
        { ...MD(""), ...Markup.inlineKeyboard([[Markup.button.callback("🔄 Mulai Ulang", "back_main")]]) }
      );
    } catch (_) { }
  });

  // ─── ADMIN: DAFTAR USER ───────────────────────────────────────────────────
  bot.action("admin_listusers", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery("⛔ Bukan admin");
    await ctx.answerCbQuery();
    const users = await db.query.usersTable.findMany({ orderBy: (u, { desc }) => [desc(u.createdAt)] });
    const backBtn = Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", "back_admin")]]);
    if (!users.length) return ctx.reply("Belum ada user.", backBtn);

    const lines = users.map((u, i) => {
      const expired = u.expiresAt < new Date();
      return `${i + 1}. *${u.telegramName || u.telegramId}* (@${u.telegramUsername || "-"})\n` +
        `   🆔 \`${u.telegramId}\` | 📦 ${PLANS[u.plan as PlanKey]?.label || u.plan}\n` +
        `   ${expired ? "❌ Expired" : "✅ Aktif"} s/d ${formatDate(u.expiresAt)}\n` +
        `   🔑 \`${u.password}\``;
    });

    const chunks: string[] = [];
    let chunk = `👥 *Daftar User (${users.length})*\n\n`;
    for (const line of lines) {
      if (chunk.length + line.length > 3500) { chunks.push(chunk); chunk = ""; }
      chunk += line + "\n\n";
    }
    if (chunk) chunks.push(chunk);

    for (let i = 0; i < chunks.length; i++) {
      if (i === chunks.length - 1) {
        await ctx.reply(chunks[i], { ...MD(""), ...backBtn });
      } else {
        await ctx.reply(chunks[i], MD(""));
      }
    }
  });

  // ─── ADMIN: TAMBAH USER (flow) ────────────────────────────────────────────
  bot.action("admin_adduser", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery("⛔ Bukan admin");
    await ctx.answerCbQuery();
    ctx.session = { step: "admin_adduser_id" };
    await ctx.reply(
      `➕ *Tambah User*\n\nKirim *Telegram ID* user yang ingin ditambahkan:\n_Contoh: 123456789_`,
      { ...MD(""), ...Markup.inlineKeyboard([[Markup.button.callback("❌ Batal", "back_admin")]]) }
    );
  });

  // ─── ADMIN: HAPUS USER (flow) ─────────────────────────────────────────────
  bot.action("admin_deleteuser", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery("⛔ Bukan admin");
    await ctx.answerCbQuery();
    ctx.session = { step: "admin_deleteuser_id" };
    await ctx.reply(
      `❌ *Hapus User*\n\nKirim *Telegram ID* user yang ingin dinonaktifkan:`,
      { ...MD(""), ...Markup.inlineKeyboard([[Markup.button.callback("❌ Batal", "back_admin")]]) }
    );
  });

  // ─── ADMIN: PERPANJANG USER (flow) ────────────────────────────────────────
  bot.action("admin_extenduser", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery("⛔ Bukan admin");
    await ctx.answerCbQuery();
    ctx.session = { step: "admin_extenduser_id" };
    await ctx.reply(
      `⏰ *Perpanjang User*\n\nKirim *Telegram ID* user yang ingin diperpanjang:`,
      { ...MD(""), ...Markup.inlineKeyboard([[Markup.button.callback("❌ Batal", "back_admin")]]) }
    );
  });

  // ─── ADMIN: PILIH PLAN UNTUK ADDUSER ─────────────────────────────────────
  for (const [planKey, planInfo] of Object.entries(PLANS)) {
    bot.action(`admin_setplan_${planKey}`, async (ctx) => {
      if (!isAdmin(ctx)) return ctx.answerCbQuery("⛔ Bukan admin");
      await ctx.answerCbQuery();
      const telegramId = ctx.session.pendingTelegramId;
      if (!telegramId) return ctx.reply("Sesi habis. Mulai lagi dari menu admin.");

      const password = generatePassword();
      const { expiresAt } = await upsertUser(telegramId, undefined, `User-${telegramId}`, planKey as PlanKey, password);
      ctx.session = {};

      await ctx.reply(
        `✅ *User Ditambahkan*\n\n` +
        `🆔 Telegram ID: \`${telegramId}\`\n` +
        `📦 Plan: *${planInfo.label}*\n` +
        `🔑 Password: \`${password}\`\n` +
        `📅 Expires: *${formatDate(expiresAt)}*`,
        { ...MD(""), ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", "back_admin")]]) }
      );

      try {
        await bot.telegram.sendMessage(telegramId,
          `🎉 *Haii sayang, akses kamu udah aktif nih!* ✨\n\n🔑 Password: \`${password}\`\n📦 Paket: *${planInfo.label}*\n\nBuruan login ke dashboard ya, jangan sampe keselip passwordnya~ 😘`,
          MD("")
        );
      } catch (_) { }
    });
  }

  // ─── ADMIN: STATISTIK ─────────────────────────────────────────────────────
  bot.action("admin_stats", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery("⛔ Bukan admin");
    await ctx.answerCbQuery();
    const users = await db.query.usersTable.findMany();
    const now = new Date();
    const total = users.length;
    const aktif = users.filter(u => u.isActive && u.expiresAt > now).length;
    const expired = users.filter(u => u.expiresAt <= now).length;
    const plan30 = users.filter(u => u.plan === "30d" && u.isActive && u.expiresAt > now).length;
    const plan60 = users.filter(u => u.plan === "60d" && u.isActive && u.expiresAt > now).length;
    const plan90 = users.filter(u => u.plan === "90d" && u.isActive && u.expiresAt > now).length;

    await ctx.reply(
      `📊 *Statistik Sepi Bukan Sapi*\n\n` +
      `👥 Total User: *${total}*\n` +
      `✅ Aktif: *${aktif}*\n` +
      `❌ Expired: *${expired}*\n\n` +
      `📦 Rincian Aktif:\n` +
      `   • 30 Hari: *${plan30}* user\n` +
      `   • 60 Hari: *${plan60}* user\n` +
      `   • 90 Hari: *${plan90}* user`,
      { ...MD(""), ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", "back_admin")]]) }
    );
  });

  // ─── ADMIN: BROADCAST ─────────────────────────────────────────────────────
  bot.action("admin_broadcast", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery("⛔ Bukan admin");
    await ctx.answerCbQuery();
    await ctx.reply(
      "📢 *Broadcast Pesan*\n\n" +
      "Untuk broadcast pesan ke semua user,\n" +
      "gunakan dashboard admin:\n\n" +
      "🌐 https://hokireceh.online/admin\n\n" +
      "Scroll ke bagian Broadcast di halaman Admin.",
      { parse_mode: "Markdown" }
    );
  });

  // ─── ADMIN: KELOLA PROMO ──────────────────────────────────────────────────
  async function showPromoMenu(ctx: BotContext, edit = false) {
    const promoStatus = activePromo
      ? `🔥 *Promo Aktif:* ${activePromo.label} — Diskon *${activePromo.discountPercent}%*\n\n` +
        `Harga saat ini:\n` +
        `   • 30 Hari: ~~Rp 50.000~~ → *${getEffectiveFormatted(PLANS["30d"].price)}*\n` +
        `   • 60 Hari: ~~Rp 100.000~~ → *${getEffectiveFormatted(PLANS["60d"].price)}*\n` +
        `   • 90 Hari: ~~Rp 150.000~~ → *${getEffectiveFormatted(PLANS["90d"].price)}*`
      : `🎁 Tidak ada promo aktif saat ini.\n\n` +
        `Harga normal:\n` +
        `   • 30 Hari: *Rp 50.000*\n` +
        `   • 60 Hari: *Rp 100.000*\n` +
        `   • 90 Hari: *Rp 150.000*`;
    const text = `🎁 *Kelola Promo*\n\n${promoStatus}`;
    const keyboard = activePromo
      ? Markup.inlineKeyboard([
          [Markup.button.callback("✏️ Ubah Promo", "admin_promo_set")],
          [Markup.button.callback("❌ Nonaktifkan Promo", "admin_promo_off")],
          [Markup.button.callback("◀️ Kembali", "back_admin")],
        ])
      : Markup.inlineKeyboard([
          [Markup.button.callback("✅ Aktifkan Promo Baru", "admin_promo_set")],
          [Markup.button.callback("◀️ Kembali", "back_admin")],
        ]);
    if (edit) return ctx.editMessageText(text, { ...MD(text), ...keyboard });
    return ctx.reply(text, { ...MD(text), ...keyboard });
  }

  bot.action("admin_promo", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery("⛔ Bukan admin");
    await ctx.answerCbQuery();
    await showPromoMenu(ctx, true).catch(() => showPromoMenu(ctx));
  });

  bot.action("admin_promo_set", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery("⛔ Bukan admin");
    await ctx.answerCbQuery();
    ctx.session = { step: "admin_promo_percent" };
    await ctx.reply(
      `✏️ *Set Promo Diskon*\n\nKirim persentase diskon (1–99):\n_Contoh: 20 (untuk diskon 20%)_`,
      { ...MD(""), ...Markup.inlineKeyboard([[Markup.button.callback("❌ Batal", "admin_promo")]]) }
    );
  });

  bot.action("admin_promo_off", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery("⛔ Bukan admin");
    await ctx.answerCbQuery();
    activePromo = null;
    await ctx.reply(
      `✅ *Promo dinonaktifkan.*\n\nHarga kembali ke normal.`,
      { ...MD(""), ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", "back_admin")]]) }
    );
  });

  // ─── HANDLER TEKS (untuk flow multi-step admin) ───────────────────────────
  bot.on("text", async (ctx) => {
    if (!isAdmin(ctx)) return;

    const step = ctx.session?.step;
    const text = ctx.message.text.trim();

    // Step: tunggu persentase diskon promo
    if (step === "admin_promo_percent") {
      const percent = parseInt(text);
      if (isNaN(percent) || percent < 1 || percent > 99) {
        return ctx.reply("❌ Persentase harus antara 1–99. Coba lagi:");
      }
      ctx.session = { step: "admin_promo_label", pendingPromoPercent: percent };
      return ctx.reply(
        `✅ Diskon *${percent}%* dipilih.\n\nSekarang kirim nama/label promo:\n_Contoh: Lebaran, Flash Sale, dll._`,
        { ...MD(""), ...Markup.inlineKeyboard([[Markup.button.callback("❌ Batal", "admin_promo")]]) }
      );
    }

    // Step: tunggu label promo
    if (step === "admin_promo_label") {
      const percent = ctx.session.pendingPromoPercent;
      if (!percent) return ctx.reply("Sesi habis. Coba lagi dari menu promo.");
      activePromo = { discountPercent: percent, label: text };
      ctx.session = {};
      await ctx.reply(
        `🎉 *Promo Aktif!*\n\n` +
        `🏷️ Label: *${text}*\n` +
        `💸 Diskon: *${percent}%*\n\n` +
        `Harga promo sekarang:\n` +
        `   • 30 Hari: *${getEffectiveFormatted(PLANS["30d"].price)}*\n` +
        `   • 60 Hari: *${getEffectiveFormatted(PLANS["60d"].price)}*\n` +
        `   • 90 Hari: *${getEffectiveFormatted(PLANS["90d"].price)}*`,
        { ...MD(""), ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali ke Admin", "back_admin")]]) }
      );
      return;
    }

    // Step: tunggu Telegram ID untuk adduser
    if (step === "admin_adduser_id") {
      if (!/^\d+$/.test(text)) {
        return ctx.reply("❌ Telegram ID harus berupa angka. Coba lagi:");
      }
      ctx.session = { step: "admin_adduser_plan", pendingTelegramId: text };
      return ctx.reply(
        `🆔 ID: \`${text}\`\n\nPilih paket untuk user ini:`,
        {
          ...MD(""),
          ...Markup.inlineKeyboard([
            [Markup.button.callback("📦 30 Hari", "admin_setplan_30d")],
            [Markup.button.callback("📦 60 Hari", "admin_setplan_60d")],
            [Markup.button.callback("📦 90 Hari", "admin_setplan_90d")],
            [Markup.button.callback("❌ Batal", "back_admin")],
          ])
        }
      );
    }

    // Step: tunggu Telegram ID untuk deleteuser
    if (step === "admin_deleteuser_id") {
      if (!/^\d+$/.test(text)) {
        return ctx.reply("❌ Telegram ID harus berupa angka. Coba lagi:");
      }
      await db.update(usersTable).set({ isActive: false }).where(eq(usersTable.telegramId, text));
      ctx.session = {};
      return ctx.reply(
        `✅ User \`${text}\` dinonaktifkan.`,
        { ...MD(""), ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", "back_admin")]]) }
      );
    }

    // Step: tunggu Telegram ID untuk extenduser
    if (step === "admin_extenduser_id") {
      if (!/^\d+$/.test(text)) {
        return ctx.reply("❌ Telegram ID harus berupa angka. Coba lagi:");
      }
      const user = await db.query.usersTable.findFirst({ where: eq(usersTable.telegramId, text) });
      if (!user) {
        return ctx.reply(
          `❌ User \`${text}\` tidak ditemukan.`,
          { ...MD(""), ...Markup.inlineKeyboard([[Markup.button.callback("❌ Batal", "back_admin")]]) }
        );
      }
      ctx.session = { step: "admin_extenduser_days", pendingTelegramId: text };
      return ctx.reply(
        `🆔 User: *${user.telegramName || text}*\nExpires: *${formatDate(user.expiresAt)}*\n\nBerapa hari ingin diperpanjang? (contoh: 30)`,
        { ...MD(""), ...Markup.inlineKeyboard([[Markup.button.callback("❌ Batal", "back_admin")]]) }
      );
    }

    // Step: tunggu jumlah hari untuk extenduser
    if (step === "admin_extenduser_days") {
      const days = parseInt(text);
      if (isNaN(days) || days <= 0) {
        return ctx.reply("❌ Jumlah hari tidak valid. Coba lagi:");
      }
      const telegramId = ctx.session.pendingTelegramId!;
      const user = await db.query.usersTable.findFirst({ where: eq(usersTable.telegramId, telegramId) });
      if (!user) return ctx.reply("❌ User tidak ditemukan.");

      const base = user.expiresAt > new Date() ? user.expiresAt : new Date();
      const newExpiry = addDays(base, days);
      await db.update(usersTable)
        .set({ expiresAt: newExpiry, isActive: true })
        .where(eq(usersTable.telegramId, telegramId));
      ctx.session = {};

      await ctx.reply(
        `✅ *Diperpanjang ${days} hari*\n\n🆔 \`${telegramId}\`\n📅 Expires baru: *${formatDate(newExpiry)}*`,
        { ...MD(""), ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Kembali", "back_admin")]]) }
      );
      try {
        await bot.telegram.sendMessage(telegramId,
          `🎉 *Yeay, langganan kamu diperpanjang sayang!* 🥳\nDitambahin *${days} hari* lagi buat kamu~\n📅 Aktif sampai: *${formatDate(newExpiry)}*`, MD("")
        );
      } catch (_) { }
    }
  });

  async function launchWithRetry(retries = 5, delayMs = 5000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // ── Fix 409: force-terminate any existing long-poll session ──────────
        // Calling deleteWebhook (even in polling mode) also terminates any
        // active getUpdates long-poll on Telegram's side, resolving 409 immediately
        // without having to wait 50-65s for the old poll to expire naturally.
        try {
          await bot.telegram.deleteWebhook({ drop_pending_updates: false });
          logger.info("[TelegramBot] deleteWebhook OK — old polling session cleared");
        } catch (hookErr: any) {
          logger.warn({ err: hookErr?.message }, "[TelegramBot] deleteWebhook failed (non-fatal, continuing)");
        }

        // Short settle window so Telegram registers the deleteWebhook before we poll
        await new Promise((r) => setTimeout(r, 1500));

        // drop_pending_updates: true on restart avoids processing a storm of
        // stale updates that accumulated while the server was down.
        await bot.launch({ dropPendingUpdates: true });
        logger.info("Telegram bot started successfully");
        await restorePendingPayments(bot, ADMIN_CHAT_ID, notifyAdmin);
        return;
      } catch (err: any) {
        const is409 = err?.response?.error_code === 409 || String(err?.message).includes("409");
        if (attempt < retries) {
          const wait = is409 ? 10_000 : delayMs;
          logger.warn({ attempt, retries, is409 }, `Telegram bot failed to start — retrying in ${wait / 1000}s...`);
          await new Promise((r) => setTimeout(r, wait));
        } else {
          logger.error({ err }, "Failed to start Telegram bot after all retries");
        }
      }
    }
  }

  launchWithRetry();

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));

  return bot;
}

async function restorePendingPayments(
  bot: Telegraf<BotContext>,
  adminChatId: string | undefined,
  notifyAdmin: (text: string) => Promise<void>
) {
  try {
    const pending = await db.query.pendingPaymentsTable.findMany();
    const now = new Date();

    for (const payment of pending) {
      if (payment.expiresAt <= now) {
        await db.delete(pendingPaymentsTable).where(eq(pendingPaymentsTable.donationId, payment.donationId));
        logger.info({ donationId: payment.donationId }, "Removed expired pending payment on restore");
        continue;
      }

      const plan = payment.plan as PlanKey;
      const planInfo = PLANS[plan];
      if (!planInfo) continue;

      logger.info({ donationId: payment.donationId }, "Restoring payment polling");

      startPaymentPolling(
        bot,
        payment.donationId,
        payment.chatId,
        payment.telegramId,
        payment.telegramUsername ?? undefined,
        payment.telegramName,
        plan,
        planInfo,
        parseFloat(String(payment.amount)),
        payment.expiresAt,
        adminChatId,
        notifyAdmin,
        payment.waitingMsgId ?? undefined
      );
    }

    if (pending.length > 0) {
      logger.info({ count: pending.length }, "Restored pending payment polling");
    }
  } catch (err) {
    logger.error({ err }, "Failed to restore pending payments");
  }
}
