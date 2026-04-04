import { setGlobalDispatcher, ProxyAgent } from "undici";
import app from "./app";
import { logger } from "./lib/logger";
import { getAllRunningExtendedBots, startExtendedBot, stopExtendedBot } from "./lib/extended/extendedBotEngine";
import { getAllRunningEtherealBots, startEtherealBot, stopEtherealBot } from "./lib/ethereal/etherealBotEngine";
import { getAllRunningBots, startBot, stopBot } from "./lib/lighter/lighterBotEngine";
import { destroyExtendedWs } from "./lib/extended/extendedWs";
import { db, strategiesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const proxyUrl = process.env["HTTPS_PROXY"] || process.env["HTTP_PROXY"] || process.env["https_proxy"] || process.env["http_proxy"];
if (proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
  logger.info({ proxy: proxyUrl.replace(/:[^:@/]*@/, ":***@") }, "HTTP proxy configured for outbound requests");
} else {
  logger.warn("No HTTPS_PROXY configured — direct Lighter API calls may fail if server IP is geo-blocked");
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // ── Startup Recovery ──────────────────────────────────────────────────────
  // Setiap kali server restart (PM2 restart, VPS reboot, deploy ulang),
  // bot yang sebelumnya aktif (isRunning=true di DB) mati karena state in-memory
  // hilang. Fungsi ini otomatis menghidupkan kembali semua bot tersebut.
  // Delay 5 detik supaya DB + polling schedules sudah siap duluan.
  setTimeout(async () => {
    try {
      const activeBots = await db.query.strategiesTable.findMany({
        where: and(
          eq(strategiesTable.isRunning, true),
          eq(strategiesTable.isActive, true),
        ),
        columns: { id: true, exchange: true, name: true },
      });

      if (!activeBots.length) return;

      logger.info(
        { count: activeBots.length },
        "[Recovery] Memulai ulang bot yang aktif sebelum restart server..."
      );

      for (const bot of activeBots) {
        try {
          if (bot.exchange === "lighter") {
            await startBot(bot.id);
          } else if (bot.exchange === "extended") {
            await startExtendedBot(bot.id);
          } else if (bot.exchange === "ethereal") {
            await startEtherealBot(bot.id);
          }
          logger.info(
            { strategyId: bot.id, exchange: bot.exchange, name: bot.name },
            "[Recovery] ✓ Bot berhasil dihidupkan kembali"
          );
        } catch (err) {
          logger.error(
            { err, strategyId: bot.id, exchange: bot.exchange, name: bot.name },
            "[Recovery] ✗ Gagal menghidupkan bot — user perlu start manual dari dashboard"
          );
        }
        // Jeda 1 detik antar bot supaya tidak flooding API Exchange sekaligus
        await new Promise(r => setTimeout(r, 1000));
      }

      logger.info("[Recovery] Selesai — semua bot aktif dipulihkan");
    } catch (err) {
      logger.error({ err }, "[Recovery] Error saat startup recovery bots");
    }
  }, 5000);
  // ─────────────────────────────────────────────────────────────────────────
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, "[Shutdown] Signal received, shutting down gracefully...");

  // 1. Stop accepting new HTTP connections
  server.close((err) => {
    if (err) logger.warn({ err }, "[Shutdown] HTTP server close error");
  });

  try {
    // 2. Stop all Lighter bots
    const lighterBots = getAllRunningBots();
    if (lighterBots.length > 0) {
      logger.info({ count: lighterBots.length }, "[Shutdown] Stopping Lighter bots");
      await Promise.allSettled(lighterBots.map((b) => stopBot(b.strategyId, true)));
    }

    // 3. Stop all Extended bots
    const extendedBots = getAllRunningExtendedBots();
    if (extendedBots.length > 0) {
      logger.info({ count: extendedBots.length }, "[Shutdown] Stopping Extended bots");
      await Promise.allSettled(extendedBots.map((b) => stopExtendedBot(b.strategyId, true)));
    }

    // 4. Stop all Ethereal bots
    const etherealBots = getAllRunningEtherealBots();
    if (etherealBots.length > 0) {
      logger.info({ count: etherealBots.length }, "[Shutdown] Stopping Ethereal bots");
      await Promise.allSettled(etherealBots.map((b) => stopEtherealBot(b.strategyId, true)));
    }

    // 5. Close Extended WebSocket connections
    destroyExtendedWs();
    logger.info("[Shutdown] Extended WS connections closed");

    // 6. Close DB connection
    if (typeof (db as any).$client?.end === "function") {
      await (db as any).$client.end();
      logger.info("[Shutdown] DB connection closed");
    }
  } catch (err) {
    logger.error({ err }, "[Shutdown] Error during graceful shutdown");
  }

  logger.info("[Shutdown] Shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT",  () => gracefulShutdown("SIGINT"));

process.on("uncaughtException", (err) => {
  logger.error({ err }, "[Process] uncaughtException — process akan exit");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "[Process] unhandledRejection — process akan exit");
  process.exit(1);
});
