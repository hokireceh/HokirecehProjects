import { Router } from "express";
import { db } from "@workspace/db";
import { botLogsTable, tradesTable, strategiesTable } from "@workspace/db";
import { desc, eq, and, gte, asc } from "drizzle-orm";
import {
  startBot,
  stopBot,
  getNextRunAt,
  getAllRunningBots,
} from "../../lib/lighter/lighterBotEngine";
import { getBotConfig } from "../configService";
import { getAccountByIndex } from "../../lib/lighter/lighterApi";
import { authMiddleware, type AuthRequest } from "../../middlewares/auth";

const router = Router();
router.use(authMiddleware as any);

router.post("/start/:strategyId", async (req: AuthRequest, res) => {
  const strategyId = parseInt(String(req.params.strategyId));
  try {
    const success = await startBot(strategyId);
    if (!success) {
      return res.status(404).json({ error: "Strategy not found" });
    }
    const nextRunAt = getNextRunAt(strategyId);
    res.json({
      strategyId,
      isRunning: true,
      message: "Bot started successfully",
      nextRunAt: nextRunAt?.toISOString() ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to start bot";
    if (msg.startsWith("BOT_VALIDATION_FAILED:")) {
      return res.status(400).json({ error: msg.replace("BOT_VALIDATION_FAILED: ", "") });
    }
    req.log.error({ err, strategyId }, "Failed to start bot");
    res.status(500).json({ error: "Failed to start bot" });
  }
});

router.post("/stop/:strategyId", async (req: AuthRequest, res) => {
  const strategyId = parseInt(String(req.params.strategyId));
  try {
    await stopBot(strategyId);
    res.json({
      strategyId,
      isRunning: false,
      message: "Bot stopped successfully",
      nextRunAt: null,
    });
  } catch (err) {
    req.log.error({ err, strategyId }, "Failed to stop bot");
    res.status(500).json({ error: "Failed to stop bot" });
  }
});

router.get("/status", async (_req, res) => {
  try {
    const runningBots = getAllRunningBots();
    const bots = runningBots.map((b) => ({
      strategyId: b.strategyId,
      isRunning: true,
      message: "Running",
      nextRunAt: b.nextRunAt.toISOString(),
    }));
    res.json({ bots });
  } catch (err) {
    res.status(500).json({ error: "Failed to get bot status" });
  }
});

router.get("/account", async (req: AuthRequest, res) => {
  try {
    const config = await getBotConfig(req.userId!);

    if (!config.accountIndex) {
      return res.json({
        isConfigured: false,
        network: config.network ?? "mainnet",
        accountIndex: null,
        l1Address: null,
        totalEquity: 0,
        availableBalance: 0,
        usedMargin: 0,
        positions: [],
      });
    }

    const accountRaw = await getAccountByIndex(config.accountIndex, config.network);

    if (!accountRaw || !accountRaw.accounts || accountRaw.accounts.length === 0) {
      res.setHeader("Cache-Control", "no-store");
      return res.json({
        isConfigured: true,
        network: config.network ?? "mainnet",
        accountIndex: config.accountIndex,
        l1Address: config.l1Address,
        totalEquity: 0,
        availableBalance: 0,
        usedMargin: 0,
        positions: [],
      });
    }

    const account = accountRaw.accounts[0];

    const positionsRaw = account.positions ?? [];

    const positions = positionsRaw
      .map((p) => {
        const size = parseFloat(p.position ?? "0");
        const posVal = parseFloat(p.position_value ?? "0");
        const markPrice = Math.abs(size) > 0 ? Math.abs(posVal) / Math.abs(size) : 0;

        // Lighter returns symbol ("BTC" for perp, "AAVE/USDC" for spot)
        // Convert to display format: "BTC" → "BTC-USDC", "AAVE/USDC" → "AAVE-USDC"
        let marketSymbol = p.symbol ?? "UNKNOWN";
        if (!marketSymbol.includes("-")) {
          marketSymbol = marketSymbol.includes("/")
            ? marketSymbol.replace("/", "-")
            : `${marketSymbol}-USDC`;
        }

        return {
          marketIndex: p.market_id ?? 0,
          marketSymbol,
          side: (p.sign ?? 1) >= 0 ? "long" : "short",
          size,
          entryPrice: parseFloat(p.avg_entry_price ?? "0"),
          markPrice,
          unrealizedPnl: parseFloat(p.unrealized_pnl ?? "0"),
          liquidationPrice: parseFloat(p.liquidation_price ?? "0"),
          allocatedMargin: parseFloat(p.allocated_margin ?? "0"),
        };
      })
      .filter((p) => Math.abs(p.size) > 0);

    const totalEquity = parseFloat(
      account.total_asset_value ?? account.collateral ?? account.available_balance ?? "0"
    );
    const availableBalance = parseFloat(account.available_balance ?? "0");
    // Use total_asset_value (equity incl. unrealized PnL) minus available_balance for accurate used margin
    const usedMargin = Math.max(0, totalEquity - availableBalance);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      isConfigured: true,
      network: config.network ?? "mainnet",
      accountIndex: config.accountIndex,
      l1Address: account.l1_address ?? config.l1Address,
      totalEquity,
      availableBalance,
      usedMargin,
      positions,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get account info");
    res.status(502).json({ error: "Failed to fetch account info" });
  }
});

router.get("/pnl-chart", async (req: AuthRequest, res) => {
  const strategyId = parseInt(String(req.query.strategyId));
  if (!strategyId) return res.status(400).json({ error: "strategyId is required" });

  try {
    const strategy = await db.query.strategiesTable.findFirst({
      where: and(
        eq(strategiesTable.id, strategyId),
        eq(strategiesTable.userId, req.userId!)
      ),
    });
    if (!strategy) return res.status(404).json({ error: "Strategy not found" });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const trades = await db.query.tradesTable.findMany({
      where: and(
        eq(tradesTable.strategyId, strategyId),
        eq(tradesTable.status, "filled"),
        gte(tradesTable.executedAt, thirtyDaysAgo)
      ),
      orderBy: [asc(tradesTable.executedAt)],
    });

    // AVCO (Average Cost) PnL — benar meski buy & sell terjadi di hari berbeda
    const dailyMap = new Map<string, { buys: number; sells: number; dailyPnl: number }>();
    let runningBuyVolume = 0;
    let runningBuyValue  = 0; // total cost basis

    for (const trade of trades) {
      const date = (trade.executedAt ?? trade.createdAt).toISOString().split("T")[0];
      if (!dailyMap.has(date)) {
        dailyMap.set(date, { buys: 0, sells: 0, dailyPnl: 0 });
      }
      const d = dailyMap.get(date)!;
      const size  = parseFloat(trade.size);
      const price = parseFloat(trade.price);

      if (trade.side === "buy") {
        d.buys++;
        runningBuyVolume += size;
        runningBuyValue  += size * price;
      } else {
        d.sells++;
        if (runningBuyVolume > 0) {
          const avgBuyPrice = runningBuyValue / runningBuyVolume;
          d.dailyPnl += size * (price - avgBuyPrice);
          // Kurangi cost basis proporsional
          const consumed = Math.min(size, runningBuyVolume);
          runningBuyValue  -= consumed * avgBuyPrice;
          runningBuyVolume -= consumed;
          if (runningBuyVolume < 1e-10) { runningBuyVolume = 0; runningBuyValue = 0; }
        }
      }
    }

    const sortedDates = Array.from(dailyMap.keys()).sort();
    let cumulativePnl = 0;
    const data = sortedDates.map((date) => {
      const d = dailyMap.get(date)!;
      cumulativePnl += d.dailyPnl;
      return {
        date,
        buys: d.buys,
        sells: d.sells,
        estimatedPnl: d.dailyPnl,
        cumulativePnl,
      };
    });

    res.json({ data });
  } catch (err) {
    req.log.error({ err }, "Failed to get PnL chart");
    res.status(500).json({ error: "Failed to get PnL chart" });
  }
});

router.get("/logs", async (req: AuthRequest, res) => {
  const limit = parseInt(String(req.query.limit ?? "100"));
  try {
    const logs = await db.query.botLogsTable.findMany({
      where: and(eq(botLogsTable.userId, req.userId!), eq(botLogsTable.exchange, "lighter")),
      orderBy: [desc(botLogsTable.createdAt)],
      limit: Math.min(limit, 500),
    });

    res.setHeader("Cache-Control", "no-store");
    res.json({
      logs: logs.map((l) => ({
        id: l.id,
        strategyId: l.strategyId ?? null,
        strategyName: l.strategyName ?? null,
        exchange: l.exchange ?? "lighter",
        level: l.level,
        message: l.message,
        details: l.details ?? null,
        createdAt: l.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get bot logs");
    res.status(500).json({ error: "Failed to get logs" });
  }
});

export default router;
