import { Router } from "express";
import { db } from "@workspace/db";
import { strategiesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getBotConfig, updateBotConfig, getExtendedCredentials } from "./configService";
import { stopBot } from "../lib/lighter/lighterBotEngine";
import { getMarketSymbol } from "../lib/lighter/marketCache";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { getAccountByL1Address, getNextNonce, sendTx, getBaseUrl } from "../lib/lighter/lighterApi";
import { generateApiKey, initSigner, signChangePubKey, isSignerAvailable } from "../lib/lighter/lighterSigner";
import { sendMessageToUser } from "../lib/telegramBot";

const router = Router();
router.use(authMiddleware as any);

router.get("/", async (req: AuthRequest, res) => {
  try {
    const [config, extCreds] = await Promise.all([
      getBotConfig(req.userId!),
      getExtendedCredentials(req.userId!).catch(() => null),
    ]);
    res.json({
      accountIndex: config.accountIndex,
      apiKeyIndex: config.apiKeyIndex,
      hasPrivateKey: config.hasPrivateKey,
      network: config.network,
      l1Address: config.l1Address,
      notifyOnBuy: config.notifyOnBuy,
      notifyOnSell: config.notifyOnSell,
      notifyOnError: config.notifyOnError,
      notifyOnStart: config.notifyOnStart,
      notifyOnStop: config.notifyOnStop,
      hasNotifyBotToken: config.hasNotifyBotToken,
      notifyChatId: config.notifyChatId,
      hasExtCredentials: extCreds?.hasCredentials ?? false,
      extendedNetwork: extCreds?.extendedNetwork ?? "mainnet",
      extendedEnabled: process.env["EXTENDED_ENABLED"] === "true",
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get bot config");
    res.status(500).json({ error: "Failed to get config" });
  }
});

router.get("/lookup-account", async (req: AuthRequest, res) => {
  const l1Address = req.query.l1Address as string;
  if (!l1Address) return res.status(400).json({ error: "l1Address is required" });

  const config = await getBotConfig(req.userId!);
  const result = await getAccountByL1Address(l1Address.trim(), config.network);
  const account = result?.accounts?.[0];

  if (!account) return res.status(404).json({ error: "Account not found for this L1 address" });

  res.json({
    accountIndex: account.index ?? account.account_index,
    l1Address: account.l1_address,
    availableBalance: account.available_balance,
  });
});

router.put("/", async (req: AuthRequest, res) => {
  try {
    const body = req.body as {
      accountIndex?: number | null;
      apiKeyIndex?: number | null;
      privateKey?: string | null;
      network?: "mainnet" | "testnet";
      l1Address?: string | null;
      notifyOnBuy?: boolean | null;
      notifyOnSell?: boolean | null;
      notifyOnError?: boolean | null;
      notifyOnStart?: boolean | null;
      notifyOnStop?: boolean | null;
      notifyBotToken?: string | null;
      notifyChatId?: string | null;
    };

    const config = await updateBotConfig(req.userId!, body);

    res.json({
      accountIndex: config.accountIndex,
      apiKeyIndex: config.apiKeyIndex,
      hasPrivateKey: config.hasPrivateKey,
      network: config.network,
      l1Address: config.l1Address,
      notifyOnBuy: config.notifyOnBuy,
      notifyOnSell: config.notifyOnSell,
      notifyOnError: config.notifyOnError,
      notifyOnStart: config.notifyOnStart,
      notifyOnStop: config.notifyOnStop,
      hasNotifyBotToken: config.hasNotifyBotToken,
      notifyChatId: config.notifyChatId,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to update bot config");
    res.status(500).json({ error: "Failed to update config" });
  }
});

router.get("/strategies", async (req: AuthRequest, res) => {
  try {
    const strategies = await db.query.strategiesTable.findMany({
      where: and(
        eq(strategiesTable.userId, req.userId!),
        eq(strategiesTable.exchange, "lighter")
      ),
      orderBy: (s, { desc }) => [desc(s.createdAt)],
    });

    const result = strategies.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      marketIndex: s.marketIndex,
      marketSymbol: s.marketSymbol,
      isActive: s.isActive,
      isRunning: s.isRunning,
      dcaConfig: s.dcaConfig ?? null,
      gridConfig: s.gridConfig ?? null,
      stats: {
        totalOrders: s.totalOrders,
        successfulOrders: s.successfulOrders,
        totalBought: parseFloat(String(s.totalBought)),
        totalSold: parseFloat(String(s.totalSold)),
        avgBuyPrice: parseFloat(String(s.avgBuyPrice)),
        avgSellPrice: parseFloat(String(s.avgSellPrice)),
        realizedPnl: parseFloat(String(s.realizedPnl)),
        unrealizedPnl: 0,
      },
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }));

    res.json({ strategies: result });
  } catch (err) {
    req.log.error({ err }, "Failed to get strategies");
    res.status(500).json({ error: "Failed to get strategies" });
  }
});

router.post("/strategies", async (req: AuthRequest, res) => {
  try {
    const body = req.body as {
      name: string;
      type: "dca" | "grid";
      marketIndex: number;
      dcaConfig?: object;
      gridConfig?: object;
    };

    const config = await getBotConfig(req.userId!);
    const marketSymbol = await getMarketSymbol(body.marketIndex, config.network);

    const [strategy] = await db.insert(strategiesTable).values({
      userId: req.userId!,
      name: body.name,
      type: body.type,
      marketIndex: body.marketIndex,
      marketSymbol,
      dcaConfig: body.dcaConfig ?? null,
      gridConfig: body.gridConfig ?? null,
    }).returning();

    res.status(201).json({
      id: strategy.id,
      name: strategy.name,
      type: strategy.type,
      marketIndex: strategy.marketIndex,
      marketSymbol: strategy.marketSymbol,
      isActive: strategy.isActive,
      isRunning: strategy.isRunning,
      dcaConfig: strategy.dcaConfig ?? null,
      gridConfig: strategy.gridConfig ?? null,
      stats: null,
      createdAt: strategy.createdAt.toISOString(),
      updatedAt: strategy.updatedAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create strategy");
    res.status(500).json({ error: "Failed to create strategy" });
  }
});

router.put("/strategies/:id", async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  try {
    const body = req.body as {
      name?: string;
      isActive?: boolean;
      dcaConfig?: object;
      gridConfig?: object;
    };

    const existing = await db.query.strategiesTable.findFirst({
      where: and(
        eq(strategiesTable.id, id),
        eq(strategiesTable.userId, req.userId!),
        eq(strategiesTable.exchange, "lighter")
      ),
    });
    if (!existing) return res.status(404).json({ error: "Strategy not found" });

    const [updated] = await db.update(strategiesTable)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.dcaConfig !== undefined && { dcaConfig: body.dcaConfig }),
        ...(body.gridConfig !== undefined && { gridConfig: body.gridConfig }),
        updatedAt: new Date(),
      })
      .where(and(eq(strategiesTable.id, id), eq(strategiesTable.userId, req.userId!)))
      .returning();

    res.json({
      id: updated.id,
      name: updated.name,
      type: updated.type,
      marketIndex: updated.marketIndex,
      marketSymbol: updated.marketSymbol,
      isActive: updated.isActive,
      isRunning: updated.isRunning,
      dcaConfig: updated.dcaConfig ?? null,
      gridConfig: updated.gridConfig ?? null,
      stats: null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to update strategy");
    res.status(500).json({ error: "Failed to update strategy" });
  }
});

// Generate a new API key pair using the signer library
router.post("/generate-api-key", async (req: AuthRequest, res) => {
  if (!isSignerAvailable()) {
    return res.status(503).json({ error: "Signer library not available on this platform" });
  }
  try {
    const result = generateApiKey();
    if (result.err) {
      return res.status(500).json({ error: `Key generation failed: ${result.err}` });
    }
    res.json({ privateKey: result.privateKey, publicKey: result.publicKey });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "Failed to generate API key");
    res.status(500).json({ error: msg });
  }
});

// Register an API key on-chain via changePubKey (must be run once per new key)
// The frontend signs the messageToSign with the user's L1 Ethereum private key,
// then calls POST /config/change-pub-key/submit with the signed tx_info.
router.post("/change-pub-key/prepare", async (req: AuthRequest, res) => {
  if (!isSignerAvailable()) {
    return res.status(503).json({ error: "Signer library not available on this platform" });
  }

  const { newPublicKey, newPrivateKey, apiKeyIndex } = req.body as {
    newPublicKey: string;
    newPrivateKey: string;
    apiKeyIndex: number;
  };

  if (!newPublicKey || !newPrivateKey || apiKeyIndex === undefined) {
    return res.status(400).json({ error: "newPublicKey, newPrivateKey, and apiKeyIndex are required" });
  }
  if (apiKeyIndex < 3 || apiKeyIndex > 254) {
    return res.status(400).json({ error: "apiKeyIndex must be between 3 and 254 (0-2 are reserved by Lighter)" });
  }

  try {
    const config = await getBotConfig(req.userId!);
    if (config.accountIndex === null) {
      return res.status(400).json({ error: "Account index not configured. Set it in Settings first." });
    }

    const network = config.network;
    const url = getBaseUrl(network);

    // Initialize signer with the NEW private key
    initSigner(url, newPrivateKey, apiKeyIndex, config.accountIndex);

    const nonce = await getNextNonce(config.accountIndex, apiKeyIndex, network);

    const signResult = signChangePubKey({
      url,
      newPubKey: newPublicKey,
      nonce,
      apiKeyIndex,
      accountIndex: config.accountIndex,
    });

    if (signResult.err) {
      return res.status(500).json({ error: `Signing failed: ${signResult.err}` });
    }

    // Return the tx info and message to sign with L1 key
    res.json({
      txType: signResult.txType,
      txInfo: signResult.txInfo,
      txHash: signResult.txHash,
      messageToSign: signResult.messageToSign,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "Failed to prepare changePubKey");
    res.status(500).json({ error: msg });
  }
});

// Submit a signed changePubKey transaction
router.post("/change-pub-key/submit", async (req: AuthRequest, res) => {
  const { txType, txInfo, newPrivateKey, newApiKeyIndex } = req.body as {
    txType: number;
    txInfo: string;
    newPrivateKey: string;
    newApiKeyIndex: number;
  };

  if (txType == null || !txInfo) {
    return res.status(400).json({ error: "txType and txInfo are required" });
  }

  try {
    const config = await getBotConfig(req.userId!);

    await sendTx(txType, txInfo, config.network, false);

    // If submission succeeded and user wants to save the new key/index, update config
    if (newPrivateKey && newApiKeyIndex !== undefined) {
      await updateBotConfig(req.userId!, {
        privateKey: newPrivateKey,
        apiKeyIndex: newApiKeyIndex,
      });
    }

    res.json({ success: true, message: "changePubKey submitted successfully. API key is now registered on-chain." });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "Failed to submit changePubKey");
    res.status(500).json({ error: msg });
  }
});

router.post("/test-notification", async (req: AuthRequest, res) => {
  try {
    const config = await getBotConfig(req.userId!);
    if (!config.notifyBotToken) {
      return res.status(400).json({ ok: false, error: "Bot token belum dikonfigurasi. Isi Bot Token di Settings terlebih dahulu." });
    }
    if (!config.notifyChatId) {
      return res.status(400).json({ ok: false, error: "Chat ID belum dikonfigurasi. Isi Chat ID di Settings terlebih dahulu." });
    }
    const result = await sendMessageToUser(
      config.notifyChatId,
      `🔔 *Test Notifikasi Sepi Bukan Sapi*\n\nKonfigurasi Telegram kamu berhasil terhubung!\nKamu akan menerima notifikasi trading di sini.`,
      config.notifyBotToken
    );
    if (result.ok) {
      return res.json({ ok: true, message: "Pesan test berhasil dikirim ke Telegram kamu!" });
    } else {
      return res.status(400).json({ ok: false, error: result.error ?? "Gagal mengirim pesan. Cek bot token dan chat ID." });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "test-notification error");
    return res.status(500).json({ ok: false, error: msg });
  }
});

router.delete("/strategies/:id", async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  try {
    const existing = await db.query.strategiesTable.findFirst({
      where: and(
        eq(strategiesTable.id, id),
        eq(strategiesTable.userId, req.userId!),
        eq(strategiesTable.exchange, "lighter")
      ),
    });
    if (!existing) return res.status(404).json({ error: "Strategy not found" });

    if (existing.isRunning) {
      await stopBot(id);
    }

    await db.delete(strategiesTable)
      .where(and(eq(strategiesTable.id, id), eq(strategiesTable.userId, req.userId!)));

    res.json({ success: true, message: "Strategy deleted" });
  } catch (err) {
    req.log.error({ err }, "Failed to delete strategy");
    res.status(500).json({ error: "Failed to delete strategy" });
  }
});

export default router;
