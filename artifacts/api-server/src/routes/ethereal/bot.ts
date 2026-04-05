import { Router } from "express";
import { db } from "@workspace/db";
import { botLogsTable, tradesTable, strategiesTable } from "@workspace/db";
import { desc, eq, and, gte, asc, or } from "drizzle-orm";
import {
  startEtherealBot,
  stopEtherealBot,
  isEtherealBotRunning,
  getEtherealBotNextRunAt,
  getAllRunningEtherealBots,
} from "../../lib/ethereal/etherealBotEngine";
import { authMiddleware, type AuthRequest } from "../../middlewares/auth";
import {
  getEtherealCredentials,
  updateEtherealCredentials,
  deleteEtherealCredentials,
} from "../configService";
import { getProducts, getProductWithPrice, invalidateProductCache } from "../../lib/ethereal/etherealMarkets";
import {
  getSubaccounts,
  getBalances,
  getPositions,
  listOrders,
  testConnection,
} from "../../lib/ethereal/etherealApi";
import type { EtherealNetwork } from "../../lib/ethereal/etherealApi";
import { getWalletAddress } from "../../lib/ethereal/etherealSigner";

const router = Router();
router.use(authMiddleware);

// ─── START BOT ────────────────────────────────────────────────────────────────

router.post("/start/:strategyId", async (req: AuthRequest, res) => {
  const strategyId = parseInt(String(req.params.strategyId));
  if (isNaN(strategyId)) return res.status(400).json({ error: "strategyId tidak valid" });

  try {
    const strategy = await db.query.strategiesTable.findFirst({
      where: and(
        eq(strategiesTable.id, strategyId),
        eq(strategiesTable.userId, req.userId!),
        eq(strategiesTable.exchange, "ethereal")
      ),
    });
    if (!strategy) return res.status(404).json({ error: "Strategy Ethereal tidak ditemukan" });

    const success = await startEtherealBot(strategyId);
    if (!success) return res.status(500).json({ error: "Gagal memulai bot Ethereal" });

    res.json({
      strategyId,
      isRunning: true,
      message: "Bot Ethereal berhasil dimulai",
      nextRunAt: getEtherealBotNextRunAt(strategyId)?.toISOString() ?? null,
    });
  } catch (err) {
    req.log.error({ err, strategyId }, "[EtherealBot] Failed to start bot");
    res.status(500).json({ error: "Gagal memulai bot Ethereal" });
  }
});

// ─── STOP BOT ─────────────────────────────────────────────────────────────────

router.post("/stop/:strategyId", async (req: AuthRequest, res) => {
  const strategyId = parseInt(String(req.params.strategyId));
  if (isNaN(strategyId)) return res.status(400).json({ error: "strategyId tidak valid" });

  try {
    const strategy = await db.query.strategiesTable.findFirst({
      where: and(
        eq(strategiesTable.id, strategyId),
        eq(strategiesTable.userId, req.userId!),
        eq(strategiesTable.exchange, "ethereal")
      ),
    });
    if (!strategy) return res.status(404).json({ error: "Strategy Ethereal tidak ditemukan" });

    await stopEtherealBot(strategyId);
    res.json({ strategyId, isRunning: false, message: "Bot Ethereal berhasil dihentikan", nextRunAt: null });
  } catch (err) {
    req.log.error({ err, strategyId }, "[EtherealBot] Failed to stop bot");
    res.status(500).json({ error: "Gagal menghentikan bot Ethereal" });
  }
});

// ─── LIST MARKETS ETHEREAL ────────────────────────────────────────────────────

router.get("/markets", async (req: AuthRequest, res) => {
  try {
    const creds = await getEtherealCredentials(req.userId!).catch(() => null);
    const network = (creds?.etherealNetwork ?? "mainnet") as EtherealNetwork;

    const products = await getProducts(network);

    res.json(products.map((p) => ({
      id: p.id,
      onchainId: p.onchainId,
      ticker: p.ticker,
      displayTicker: p.displayTicker,
      baseAsset: p.baseAsset,
      quoteAsset: p.quoteAsset,
      minOrderSize: p.minOrderSize,
      maxOrderSize: p.maxOrderSize,
      lotSize: p.lotSize,
      tickSize: p.tickSize,
      sizeDecimals: p.sizeDecimals,
      priceDecimals: p.priceDecimals,
      makerFee: p.makerFee,
      takerFee: p.takerFee,
      maxLeverage: p.maxLeverage,
      lastPrice: p.lastPrice,
      status: p.status,
    })));
  } catch (err) {
    req.log.error({ err }, "[EtherealBot] Failed to fetch markets");
    res.status(500).json({ error: "Gagal mengambil daftar market Ethereal" });
  }
});

// ─── REFRESH MARKET CACHE ─────────────────────────────────────────────────────

router.post("/markets/refresh", async (req: AuthRequest, res) => {
  try {
    const creds = await getEtherealCredentials(req.userId!).catch(() => null);
    const network = (creds?.etherealNetwork ?? "mainnet") as EtherealNetwork;
    invalidateProductCache(network);
    const products = await getProducts(network);
    res.json({ ok: true, count: products.length });
  } catch (err) {
    req.log.error({ err }, "[EtherealBot] Failed to refresh markets");
    res.status(500).json({ error: "Gagal refresh market cache" });
  }
});

// ─── ACCOUNT INFO ─────────────────────────────────────────────────────────────

router.get("/account", async (req: AuthRequest, res) => {
  try {
    const creds = await getEtherealCredentials(req.userId!);
    const network = creds.etherealNetwork;

    if (!creds.hasCredentials || !creds.privateKey) {
      return res.json({
        walletAddress: null,
        subaccounts: [],
        balances: [],
        positions: [],
        openOrders: [],
        hasCredentials: false,
        isConnected: false,
      });
    }

    let walletAddress = creds.walletAddress;
    if (!walletAddress) walletAddress = getWalletAddress(creds.privateKey);

    const [subaccounts] = await Promise.all([
      getSubaccounts(walletAddress, network),
    ]);

    const primarySubaccount = subaccounts.find((s) => s.id === creds.subaccountId) ?? subaccounts[0] ?? null;

    let balances: any[] = [];
    let positions: any[] = [];
    let openOrders: any[] = [];

    if (primarySubaccount) {
      [balances, positions, openOrders] = await Promise.all([
        getBalances(primarySubaccount.id, network).catch(() => []),
        getPositions(primarySubaccount.id, network).catch(() => []),
        listOrders(primarySubaccount.id, network).catch(() => []),
      ]);
    }

    res.json({
      walletAddress,
      subaccounts,
      primarySubaccountId: primarySubaccount?.id ?? null,
      balances,
      positions,
      openOrders,
      hasCredentials: true,
      isConnected: true,
      network,
    });
  } catch (err) {
    req.log.error({ err }, "[EtherealBot] Failed to fetch account");
    res.status(500).json({ error: "Gagal mengambil data akun Ethereal" });
  }
});

// ─── TEST CONNECTION ──────────────────────────────────────────────────────────

router.get("/test-connection", async (req: AuthRequest, res) => {
  try {
    const creds = await getEtherealCredentials(req.userId!);
    if (!creds.hasCredentials || !creds.privateKey) {
      return res.json({ ok: false, reason: "Credentials belum dikonfigurasi" });
    }

    let walletAddress = creds.walletAddress;
    if (!walletAddress) walletAddress = getWalletAddress(creds.privateKey);

    const result = await testConnection(walletAddress, creds.etherealNetwork);
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.json({ ok: false, reason: msg });
  }
});

// ─── LIST STRATEGIES ──────────────────────────────────────────────────────────

router.get("/", async (req: AuthRequest, res) => {
  try {
    const strategies = await db.query.strategiesTable.findMany({
      where: and(
        eq(strategiesTable.userId, req.userId!),
        eq(strategiesTable.exchange, "ethereal")
      ),
      orderBy: [desc(strategiesTable.createdAt)],
    });

    const runningBots = getAllRunningEtherealBots();
    const runningIds = new Set(runningBots.map((b) => b.strategyId));

    res.json(strategies.map((s) => ({
      ...s,
      isRunning: runningIds.has(s.id),
      nextRunAt: runningIds.has(s.id)
        ? (getEtherealBotNextRunAt(s.id)?.toISOString() ?? null)
        : null,
    })));
  } catch (err) {
    req.log.error({ err }, "[EtherealBot] Failed to list strategies");
    res.status(500).json({ error: "Gagal mengambil daftar strategy" });
  }
});

// ─── CREDENTIALS ─────────────────────────────────────────────────────────────

router.get("/credentials", async (req: AuthRequest, res) => {
  try {
    const creds = await getEtherealCredentials(req.userId!);
    res.json({
      hasPrivateKey: creds.hasPrivateKey,
      hasSubaccountId: creds.hasSubaccountId,
      hasCredentials: creds.hasCredentials,
      walletAddress: creds.walletAddress ?? null,
      subaccountId: creds.subaccountId ?? null,
      subaccountName: creds.subaccountName ?? null,
      etherealNetwork: creds.etherealNetwork,
      signerAddress: creds.signerAddress ?? null,
      signerExpiresAt: creds.signerExpiresAt?.toISOString() ?? null,
      isSignerExpiringSoon: creds.isSignerExpiringSoon,
    });
  } catch (err) {
    req.log.error({ err }, "[EtherealBot] Failed to fetch credentials");
    res.status(500).json({ error: "Gagal mengambil credentials" });
  }
});

// Fetch subaccount ID otomatis dari Ethereal API menggunakan wallet address yang tersimpan
router.get("/fetch-subaccount-id", async (req: AuthRequest, res) => {
  try {
    const creds = await getEtherealCredentials(req.userId!);
    const network = (creds.etherealNetwork ?? "mainnet") as "mainnet" | "testnet";

    let walletAddress = creds.walletAddress ?? null;
    if (!walletAddress && creds.privateKey) {
      walletAddress = getWalletAddress(creds.privateKey);
    }

    if (!walletAddress) {
      return res.status(400).json({
        error: "EVM Private Key atau Wallet Address belum diset. Simpan Private Key terlebih dahulu.",
      });
    }

    const subaccounts = await getSubaccounts(walletAddress, network);
    if (!subaccounts.length) {
      return res.status(404).json({
        error: `Tidak ada subaccount ditemukan untuk alamat ${walletAddress}. Pastikan wallet sudah terdaftar di Ethereal.`,
      });
    }

    const first = subaccounts[0];
    res.json({
      subaccountId: first.id,
      subaccountName: first.name ?? null,
      walletAddress,
      total: subaccounts.length,
    });
  } catch (err) {
    req.log.error({ err }, "[EtherealBot] Failed to fetch subaccount ID");
    res.status(500).json({ error: "Gagal mengambil Subaccount ID dari Ethereal API" });
  }
});

router.put("/credentials", async (req: AuthRequest, res) => {
  const {
    privateKey,
    walletAddress,
    subaccountId,
    subaccountName,
    etherealNetwork,
    signerKey,
    signerAddress,
  } = req.body;

  try {
    // Auto-derive walletAddress dari privateKey jika tidak diberikan
    let resolvedWalletAddress = walletAddress;
    if (privateKey && !resolvedWalletAddress) {
      try {
        resolvedWalletAddress = getWalletAddress(privateKey);
      } catch {
        return res.status(400).json({ error: "Private key tidak valid — pastikan format hex 32 bytes" });
      }
    }

    await updateEtherealCredentials(req.userId!, {
      ...(privateKey !== undefined && { privateKey }),
      ...(resolvedWalletAddress !== undefined && { walletAddress: resolvedWalletAddress }),
      ...(subaccountId !== undefined && { subaccountId }),
      ...(subaccountName !== undefined && { subaccountName }),
      ...(etherealNetwork !== undefined && { etherealNetwork }),
      ...(signerKey !== undefined && { signerKey }),
      ...(signerAddress !== undefined && { signerAddress }),
    });

    // Jika credentials baru disimpan, otomatis update walletAddress dari private key
    const updated = await getEtherealCredentials(req.userId!);

    // Auto-fetch subaccountId dari Ethereal API jika belum ada
    if (!updated.subaccountId && updated.walletAddress) {
      try {
        const network = updated.etherealNetwork ?? "mainnet";
        const subaccounts = await getSubaccounts(updated.walletAddress, network);
        const primary = subaccounts[0];
        if (primary?.id) {
          await updateEtherealCredentials(req.userId!, {
            subaccountId: primary.id,
            ...(primary.name && { subaccountName: primary.name }),
          });
          updated.subaccountId = primary.id;
          updated.subaccountName = primary.name ?? null;
        }
      } catch (e) {
        req.log.warn({ err: e }, "[EtherealBot] Auto-fetch subaccount gagal, user bisa isi manual");
      }
    }

    res.json({
      ok: true,
      hasCredentials: updated.hasCredentials,
      walletAddress: updated.walletAddress ?? null,
      subaccountId: updated.subaccountId ?? null,
      etherealNetwork: updated.etherealNetwork,
    });
  } catch (err) {
    req.log.error({ err }, "[EtherealBot] Failed to update credentials");
    res.status(500).json({ error: "Gagal menyimpan credentials" });
  }
});

router.delete("/credentials", async (req: AuthRequest, res) => {
  try {
    await deleteEtherealCredentials(req.userId!);
    res.json({ ok: true, message: "Credentials Ethereal berhasil dihapus" });
  } catch (err) {
    req.log.error({ err }, "[EtherealBot] Failed to delete credentials");
    res.status(500).json({ error: "Gagal menghapus credentials" });
  }
});

// ─── GET SINGLE STRATEGY ──────────────────────────────────────────────────────

router.get("/:strategyId", async (req: AuthRequest, res) => {
  const strategyId = parseInt(String(req.params.strategyId));
  if (isNaN(strategyId)) return res.status(400).json({ error: "strategyId tidak valid" });

  try {
    const strategy = await db.query.strategiesTable.findFirst({
      where: and(
        eq(strategiesTable.id, strategyId),
        eq(strategiesTable.userId, req.userId!),
        eq(strategiesTable.exchange, "ethereal")
      ),
    });
    if (!strategy) return res.status(404).json({ error: "Strategy tidak ditemukan" });

    res.json({
      ...strategy,
      isRunning: isEtherealBotRunning(strategyId),
      nextRunAt: getEtherealBotNextRunAt(strategyId)?.toISOString() ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "[EtherealBot] Failed to get strategy");
    res.status(500).json({ error: "Gagal mengambil strategy" });
  }
});

// ─── CREATE STRATEGY ──────────────────────────────────────────────────────────

router.post("/", async (req: AuthRequest, res) => {
  const {
    name,
    type,
    marketSymbol,
    marketIndex,
    gridConfig,
    dcaConfig,
    isActive,
  } = req.body;

  if (!name || !type || !marketSymbol) {
    return res.status(400).json({ error: "name, type, dan marketSymbol wajib diisi" });
  }

  if (!["grid", "dca"].includes(type)) {
    return res.status(400).json({ error: "type harus 'grid' atau 'dca'" });
  }

  try {
    const [strategy] = await db.insert(strategiesTable).values({
      userId: req.userId!,
      exchange: "ethereal",
      name,
      type,
      marketSymbol,
      marketIndex: marketIndex ?? 0,
      gridConfig: gridConfig ?? null,
      dcaConfig: dcaConfig ?? null,
      isActive: isActive ?? true,
      isRunning: false,
    }).returning();

    res.status(201).json(strategy);
  } catch (err) {
    req.log.error({ err }, "[EtherealBot] Failed to create strategy");
    res.status(500).json({ error: "Gagal membuat strategy" });
  }
});

// ─── UPDATE STRATEGY ──────────────────────────────────────────────────────────

router.put("/:strategyId", async (req: AuthRequest, res) => {
  const strategyId = parseInt(String(req.params.strategyId));
  if (isNaN(strategyId)) return res.status(400).json({ error: "strategyId tidak valid" });

  try {
    const strategy = await db.query.strategiesTable.findFirst({
      where: and(
        eq(strategiesTable.id, strategyId),
        eq(strategiesTable.userId, req.userId!),
        eq(strategiesTable.exchange, "ethereal")
      ),
    });
    if (!strategy) return res.status(404).json({ error: "Strategy tidak ditemukan" });

    if (isEtherealBotRunning(strategyId)) {
      return res.status(409).json({ error: "Hentikan bot sebelum mengubah strategy" });
    }

    const { name, type, marketSymbol, marketIndex, gridConfig, dcaConfig, isActive } = req.body;

    const [updated] = await db.update(strategiesTable)
      .set({
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type }),
        ...(marketSymbol !== undefined && { marketSymbol }),
        ...(marketIndex !== undefined && { marketIndex }),
        ...(gridConfig !== undefined && { gridConfig }),
        ...(dcaConfig !== undefined && { dcaConfig }),
        ...(isActive !== undefined && { isActive }),
        updatedAt: new Date(),
      })
      .where(eq(strategiesTable.id, strategyId))
      .returning();

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "[EtherealBot] Failed to update strategy");
    res.status(500).json({ error: "Gagal memperbarui strategy" });
  }
});

// ─── DELETE STRATEGY ──────────────────────────────────────────────────────────

router.delete("/:strategyId", async (req: AuthRequest, res) => {
  const strategyId = parseInt(String(req.params.strategyId));
  if (isNaN(strategyId)) return res.status(400).json({ error: "strategyId tidak valid" });

  try {
    const strategy = await db.query.strategiesTable.findFirst({
      where: and(
        eq(strategiesTable.id, strategyId),
        eq(strategiesTable.userId, req.userId!),
        eq(strategiesTable.exchange, "ethereal")
      ),
    });
    if (!strategy) return res.status(404).json({ error: "Strategy tidak ditemukan" });

    if (isEtherealBotRunning(strategyId)) {
      await stopEtherealBot(strategyId);
    }

    await db.delete(strategiesTable).where(eq(strategiesTable.id, strategyId));
    res.json({ ok: true, message: "Strategy berhasil dihapus" });
  } catch (err) {
    req.log.error({ err }, "[EtherealBot] Failed to delete strategy");
    res.status(500).json({ error: "Gagal menghapus strategy" });
  }
});

// ─── LOGS ─────────────────────────────────────────────────────────────────────

router.get("/logs/recent", async (req: AuthRequest, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 200);
  const strategyId = req.query.strategyId
    ? parseInt(String(req.query.strategyId))
    : null;

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const logs = await db.query.botLogsTable.findMany({
      where: and(
        eq(botLogsTable.userId, req.userId!),
        eq(botLogsTable.exchange, "ethereal"),
        gte(botLogsTable.createdAt, since),
        ...(strategyId !== null ? [eq(botLogsTable.strategyId, strategyId)] : [])
      ),
      orderBy: [desc(botLogsTable.createdAt)],
      limit,
    });

    res.json(logs);
  } catch (err) {
    req.log.error({ err }, "[EtherealBot] Failed to fetch logs");
    res.status(500).json({ error: "Gagal mengambil log" });
  }
});

router.get("/logs/strategy/:strategyId", async (req: AuthRequest, res) => {
  const strategyId = parseInt(String(req.params.strategyId));
  if (isNaN(strategyId)) return res.status(400).json({ error: "strategyId tidak valid" });

  const limit = Math.min(parseInt(String(req.query.limit ?? "100")), 500);

  try {
    const logs = await db.query.botLogsTable.findMany({
      where: and(
        eq(botLogsTable.userId, req.userId!),
        eq(botLogsTable.strategyId, strategyId),
        eq(botLogsTable.exchange, "ethereal")
      ),
      orderBy: [desc(botLogsTable.createdAt)],
      limit,
    });
    res.json(logs);
  } catch (err) {
    req.log.error({ err }, "[EtherealBot] Failed to fetch strategy logs");
    res.status(500).json({ error: "Gagal mengambil log strategy" });
  }
});

export default router;
