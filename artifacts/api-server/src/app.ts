import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { restoreRunningBots, startLogCleanupSchedule, startTradePollSchedule } from "./lib/lighter/botEngine";
import { restoreRunningExtendedBots, startExtendedTradePollSchedule } from "./lib/extended/extendedBotEngine";
import { restoreRunningEtherealBots, startEtherealTradePollSchedule } from "./lib/ethereal/etherealBotEngine";
import { startTelegramBot } from "./lib/telegramBot";

const EXTENDED_ENABLED = process.env["EXTENDED_ENABLED"] === "true";

const app: Express = express();

// ─── Reverse Proxy Trust ──────────────────────────────────────────────────────
// Required when running behind Nginx / Caddy / Replit proxy.
// Without this, express-rate-limit cannot read the real client IP from
// X-Forwarded-For and throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
app.set("trust proxy", 1);

// ─── Security Headers ─────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: [
          "'self'",
          // Lighter DEX
          "wss://mainnet.zklighter.elliot.ai", "wss://testnet.zklighter.elliot.ai",
          "https://mainnet.zklighter.elliot.ai", "https://testnet.zklighter.elliot.ai",
          // Extended DEX
          "wss://api.starknet.extended.exchange", "wss://api.starknet.sepolia.extended.exchange",
          "https://api.starknet.extended.exchange", "https://api.starknet.sepolia.extended.exchange",
        ],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// ─── Rate Limiters ────────────────────────────────────────────────────────────
// Auth endpoints: 10 attempts per 15 minutes per IP (brute force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Terlalu banyak percobaan login. Coba lagi dalam 15 menit." },
});

// General API: 200 requests per 15 minutes per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: (req) => req.path.startsWith("/health"),
  message: { error: "Rate limit exceeded. Silakan tunggu sebentar." },
});

// ─── Logging ──────────────────────────────────────────────────────────────────
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply rate limiters
app.use("/api/auth", authLimiter);
app.use("/api", apiLimiter);

app.use("/api", router);

// ─── Auto DB Migration ────────────────────────────────────────────────────────
// Membuat semua tabel dan kolom yang belum ada secara otomatis saat startup.
// Menggunakan CREATE TABLE IF NOT EXISTS dan ALTER TABLE ADD COLUMN IF NOT EXISTS
// sehingga aman dijalankan berulang kali — tidak merusak data yang sudah ada.
async function runAutoMigration() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        telegram_id text NOT NULL UNIQUE,
        telegram_username text,
        telegram_name text,
        password text NOT NULL UNIQUE,
        password_hash text,
        plan text NOT NULL,
        expires_at timestamp NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        extended_api_key text,
        extended_stark_private_key text,
        extended_stark_public_key text,
        extended_account_id text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS bot_config (
        id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        user_id integer,
        key text NOT NULL,
        value text NOT NULL,
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS strategies (
        id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        user_id integer,
        name text NOT NULL,
        type text NOT NULL,
        market_index integer NOT NULL,
        market_symbol text NOT NULL,
        is_active boolean NOT NULL DEFAULT false,
        is_running boolean NOT NULL DEFAULT false,
        dca_config jsonb,
        grid_config jsonb,
        total_orders integer NOT NULL DEFAULT 0,
        successful_orders integer NOT NULL DEFAULT 0,
        total_bought numeric(20,8) NOT NULL DEFAULT 0,
        total_sold numeric(20,8) NOT NULL DEFAULT 0,
        avg_buy_price numeric(20,8) NOT NULL DEFAULT 0,
        avg_sell_price numeric(20,8) NOT NULL DEFAULT 0,
        realized_pnl numeric(20,8) NOT NULL DEFAULT 0,
        exchange text NOT NULL DEFAULT 'lighter',
        next_run_at timestamp,
        last_run_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS trades (
        id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        user_id integer,
        strategy_id integer NOT NULL,
        strategy_name text NOT NULL,
        market_index integer NOT NULL,
        market_symbol text NOT NULL,
        side text NOT NULL,
        size numeric(20,8) NOT NULL DEFAULT 0,
        price numeric(20,8) NOT NULL DEFAULT 0,
        fee numeric(20,8) NOT NULL DEFAULT 0,
        status text NOT NULL DEFAULT 'pending',
        order_hash text,
        client_order_index bigint,
        exchange text NOT NULL DEFAULT 'lighter',
        error_message text,
        executed_at timestamp,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS bot_logs (
        id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        user_id integer,
        strategy_id integer,
        strategy_name text,
        level text NOT NULL DEFAULT 'info',
        message text NOT NULL,
        details text,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pending_payments (
        id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        donation_id text NOT NULL UNIQUE,
        chat_id text NOT NULL,
        telegram_id text NOT NULL,
        telegram_username text,
        telegram_name text NOT NULL,
        plan text NOT NULL,
        amount numeric(12,2) NOT NULL,
        qr_string text NOT NULL,
        waiting_msg_id integer,
        expires_at timestamp NOT NULL,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);

    // Kolom tambahan yang mungkin belum ada pada DB lama (backward-compatible)
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS extended_api_key text`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS extended_stark_private_key text`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS extended_stark_public_key text`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS extended_account_id text`);
    await db.execute(sql`ALTER TABLE strategies ADD COLUMN IF NOT EXISTS exchange text NOT NULL DEFAULT 'lighter'`);
    await db.execute(sql`ALTER TABLE trades ADD COLUMN IF NOT EXISTS exchange text NOT NULL DEFAULT 'lighter'`);

    logger.info("DB migration: semua tabel berhasil dipastikan ada");
  } catch (err) {
    logger.error({ err }, "DB migration: gagal — server tetap berjalan tapi mungkin ada fitur yang tidak berfungsi");
  }
}

runAutoMigration();

// Restore bots after startup
setTimeout(() => {
  restoreRunningBots().catch((err) => {
    logger.error({ err }, "Failed to restore running bots");
  });

  // Extended: hanya aktif jika EXTENDED_ENABLED=true
  if (EXTENDED_ENABLED) {
    restoreRunningExtendedBots().catch((err) => {
      logger.error({ err }, "[ExtendedBot] Failed to restore running extended bots");
    });
  }

  // Ethereal: selalu aktif
  restoreRunningEtherealBots().catch((err) => {
    logger.error({ err }, "[EtherealBot] Failed to restore running ethereal bots");
  });
}, 3000);

// Start log cleanup schedule (runs daily, keeps last 30 days)
startLogCleanupSchedule();

// Poll pending trades for status updates every 15 seconds
startTradePollSchedule();

// Extended trade polling — hanya aktif jika EXTENDED_ENABLED=true
if (EXTENDED_ENABLED) {
  startExtendedTradePollSchedule();
  logger.info("Extended bot engine enabled (EXTENDED_ENABLED=true)");
} else {
  logger.info("Extended bot engine disabled — set EXTENDED_ENABLED=true to enable");
}

// Ethereal trade polling — selalu aktif
startEtherealTradePollSchedule();

// Start Telegram bot
setTimeout(() => {
  try {
    startTelegramBot();
  } catch (err) {
    logger.error({ err }, "Failed to start Telegram bot");
  }
}, 1000);

export default app;
