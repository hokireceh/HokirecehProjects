import { Router } from "express";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { getMarketInfo } from "../lib/lighter/marketCache";
import { getExtendedMarketInfo } from "../lib/extended/extendedMarkets";
import { getProductByTicker, getProductWithPrice } from "../lib/ethereal/etherealMarkets";
import { getEtherealWsCachedPrice } from "../lib/ethereal/etherealWs";
import { analyzeMarketForStrategy } from "../lib/groqAI";
import { getBotConfig, getEtherealCredentials } from "./configService";
import { getAccountByIndex } from "../lib/lighter/lighterApi";
import { logger } from "../lib/logger";
import type { ExtendedNetwork } from "../lib/extended/extendedApi";
import type { EtherealNetwork } from "../lib/ethereal/etherealApi";

const router = Router();
router.use(authMiddleware);

router.post("/analyze", async (req: AuthRequest, res) => {
  const { strategyType, marketIndex, marketSymbol, exchange } = req.body as {
    strategyType: "dca" | "grid";
    marketIndex?: number;
    marketSymbol?: string;
    exchange?: string;
  };

  if (!strategyType || !["dca", "grid"].includes(strategyType)) {
    return res.status(400).json({ error: "strategyType must be 'dca' or 'grid'" });
  }

  const isEthereal = exchange === "ethereal" && typeof marketSymbol === "string" && marketSymbol.trim().length > 0;
  const isExtended = !isEthereal && typeof marketSymbol === "string" && marketSymbol.trim().length > 0;
  const isLighter = !isEthereal && !isExtended && (marketIndex !== undefined && marketIndex !== null && !isNaN(Number(marketIndex)));

  if (!isEthereal && !isExtended && !isLighter) {
    return res.status(400).json({ error: "Sertakan marketIndex (Lighter) atau marketSymbol (Extended/Ethereal)" });
  }

  try {
    // ─── Ethereal branch ───────────────────────────────────────────────────────
    if (isEthereal) {
      const config = await getEtherealCredentials(req.userId!).catch(() => null);
      const network: EtherealNetwork = (config?.etherealNetwork === "testnet") ? "testnet" : "mainnet";

      const baseProduct = await getProductByTicker(marketSymbol!.trim(), network);
      if (!baseProduct) {
        return res.status(404).json({ error: `Market Ethereal '${marketSymbol}' tidak ditemukan` });
      }

      // Coba WS cache dulu (real-time, jika bot aktif), lalu REST API sebagai fallback
      let livePrice: number = 0;
      let enriched: Awaited<ReturnType<typeof getProductWithPrice>> | null = null;
      const wsPrice = getEtherealWsCachedPrice(baseProduct.id, 30_000);
      if (wsPrice && wsPrice.toNumber() > 0) {
        livePrice = wsPrice.toNumber();
      } else {
        enriched = await getProductWithPrice(baseProduct.id, network).catch(() => null);
        if (enriched && enriched.lastPrice > 0) {
          livePrice = enriched.lastPrice;
        }
      }
      logger.info({
        wsPrice: wsPrice?.toNumber() ?? null,
        livePrice,
        enrichedLastPrice: enriched?.lastPrice ?? null,
        enrichedError: "check catch",
      }, "[AI Debug] Ethereal price resolution");

      const product = { ...baseProduct, lastPrice: livePrice };

      const result = await analyzeMarketForStrategy(strategyType, {
        exchange: "ethereal",
        symbol: product.displayTicker || product.ticker,
        type: "perp",
        lastPrice: product.lastPrice,
        high24h: product.lastPrice > 0 ? product.lastPrice * 1.03 : 0,
        low24h: product.lastPrice > 0 ? product.lastPrice * 0.97 : 0,
        volume24h: 0,
        priceChangePct24h: 0,
        minBaseAmount: product.minOrderSize,
        minQuoteAmount: product.minOrderSize * (product.lastPrice || 1),
      });

      return res.json({ ...result, availableBalance: undefined });
    }

    // ─── Extended branch ───────────────────────────────────────────────────────
    if (isExtended) {
      const config = await getBotConfig(req.userId!).catch(() => null);
      const network: ExtendedNetwork = (config?.network === "testnet") ? "testnet" : "mainnet";

      const market = await getExtendedMarketInfo(marketSymbol!.trim(), undefined, network);
      if (!market) {
        return res.status(404).json({ error: `Market Extended '${marketSymbol}' tidak ditemukan` });
      }

      const minQuoteAmount = parseFloat(market.minOrderValue) || 1;
      const minBaseAmount = parseFloat(market.minOrderSize) || 0.001;

      const result = await analyzeMarketForStrategy(strategyType, {
        exchange: "extended",
        symbol: market.market,
        type: "perp",
        lastPrice: market.lastPrice,
        high24h: market.dailyHigh,
        low24h: market.dailyLow,
        volume24h: parseFloat(market.dailyVolume),
        priceChangePct24h: market.dailyChangePercent,
        minBaseAmount,
        minQuoteAmount,
      });

      return res.json({ ...result, availableBalance: undefined });
    }

    // ─── Lighter branch (tidak diubah sama sekali) ─────────────────────────────
    const [market, config] = await Promise.all([
      getMarketInfo(Number(marketIndex)),
      getBotConfig(req.userId!).catch(() => null),
    ]);

    if (!market) {
      return res.status(404).json({ error: "Market tidak ditemukan" });
    }

    let availableBalance: number | undefined;
    if (config?.accountIndex) {
      try {
        const accountRaw = await getAccountByIndex(config.accountIndex, config.network);
        const account = accountRaw?.accounts?.[0];
        if (account?.available_balance) {
          availableBalance = parseFloat(account.available_balance);
        }
      } catch {
        req.log.warn("Failed to fetch account balance for AI context, using default");
      }
    }

    const result = await analyzeMarketForStrategy(strategyType, {
      exchange: "lighter",
      symbol: market.symbol,
      type: market.type,
      lastPrice: market.lastTradePrice,
      high24h: market.dailyHigh,
      low24h: market.dailyLow,
      volume24h: market.dailyVolumeQuote,
      priceChangePct24h: market.dailyPriceChange,
      minBaseAmount: market.minBaseAmount,
      minQuoteAmount: market.minQuoteAmount,
      availableBalance,
    });

    res.json({ ...result, availableBalance });
  } catch (err: any) {
    req.log.error({ err }, "AI analysis failed");
    const msg = err?.message ?? "AI analysis failed";
    const isConfig = msg.includes("GROQ_API_KEY");
    res.status(isConfig ? 503 : 502).json({ error: msg });
  }
});

export default router;
