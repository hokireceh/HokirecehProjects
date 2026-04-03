import { getMarkets, type ExtendedNetwork } from "./extendedApi";
import { logger } from "../logger";

export interface ExtendedMarketInfo {
  market: string;
  baseAsset: string;
  quoteAsset: string;
  marketType: string;
  isActive: boolean;
  maxLeverage: number;
  tickSize: string;
  stepSize: string;
  minOrderSize: string;
  maxOrderSize: string;
  minOrderValue: string;
  lastPrice: number;
  dailyChange: number;
  dailyChangePercent: number;
  dailyVolume: string;
  dailyHigh: number;
  dailyLow: number;
  markPrice: number;
  indexPrice: number;
  openInterest: string;
  fundingRate: string;
}

interface CacheEntry {
  markets: ExtendedMarketInfo[];
  fetchedAt: Date;
}

const marketCache = new Map<ExtendedNetwork, CacheEntry>();
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes — same TTL as Lighter cache

export async function getExtendedMarkets(
  apiKey?: string,
  network: ExtendedNetwork = "mainnet"
): Promise<ExtendedMarketInfo[]> {
  const now = new Date();
  const cached = marketCache.get(network);
  if (cached && cached.markets.length > 0 && now.getTime() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
    return cached.markets;
  }

  try {
    // /api/v1/info/markets sudah include marketStats inline — tidak perlu fetch terpisah
    const markets = await getMarkets(network);

    const marketInfoList: ExtendedMarketInfo[] = markets.map((m) => {
      // marketStats ada di dalam objek market dari /api/v1/info/markets
      const stats = (m as any).marketStats ?? null;
      const [baseAsset, quoteAsset] = m.name.includes("-")
        ? m.name.split("-")
        : [m.name, m.collateralAsset ?? "USDT"];

      // Data sekarang dari /api/v1/info/markets — field ada di tradingConfig
      const tc = m.tradingConfig;

      // Ekstrak tickSize/stepSize dulu agar bisa log warning saat fallback hardcoded terpaksa digunakan.
      // Fallback "0.01"/"0.001" bisa salah untuk market tertentu — warning ini membantu deteksi
      // market baru atau perubahan struktur API yang belum ter-handle.
      const tickSizeRaw = tc?.minPriceChange ?? m.tickSize;
      const stepSizeRaw = tc?.minOrderSizeChange ?? m.stepSize;
      if (!tickSizeRaw) {
        logger.warn({ market: m.name }, "[ExtendedMarkets] tickSize fallback ke \"0.01\" — tradingConfig.minPriceChange tidak tersedia");
      }
      if (!stepSizeRaw) {
        logger.warn({ market: m.name }, "[ExtendedMarkets] stepSize fallback ke \"0.001\" — tradingConfig.minOrderSizeChange tidak tersedia");
      }

      return {
        market: m.name,
        baseAsset: baseAsset ?? m.name,
        quoteAsset: quoteAsset ?? (m.collateralAssetName ?? m.collateralAsset ?? "USDT"),
        marketType: m.marketType ?? "perpetual",
        isActive: m.active ?? m.isActive ?? (m.status === "ACTIVE"),
        maxLeverage: parseFloat(tc?.maxLeverage ?? m.maxLeverage ?? "100"),
        tickSize: tickSizeRaw ?? "0.01",
        stepSize: stepSizeRaw ?? "0.001",
        minOrderSize: tc?.minOrderSize ?? m.minOrderSize ?? "0",
        maxOrderSize: tc?.maxLimitOrderValue ?? m.maxOrderSize ?? "0",
        minOrderValue: m.minOrderValue ?? "0",
        lastPrice: stats ? parseFloat(stats.lastPrice ?? stats.lastTradedPrice ?? "0") : 0,
        dailyChange: stats ? parseFloat(stats.dailyPriceChange) : 0,
        dailyChangePercent: stats ? parseFloat(stats.dailyPriceChangePercentage ?? stats.dailyPriceChangePercent ?? "0") : 0,
        dailyVolume: stats?.dailyVolume ?? "0",
        dailyHigh: stats ? parseFloat(stats.dailyHigh ?? stats.dailyHighPrice ?? "0") : 0,
        dailyLow: stats ? parseFloat(stats.dailyLow ?? stats.dailyLowPrice ?? "0") : 0,
        markPrice: stats ? parseFloat(stats.markPrice) : 0,
        indexPrice: stats ? parseFloat(stats.indexPrice) : 0,
        openInterest: stats?.openInterest ?? "0",
        fundingRate: stats?.fundingRate ?? "0",
      };
    });

    marketCache.set(network, { markets: marketInfoList, fetchedAt: now });
    logger.info({ count: marketInfoList.length, network }, "[Extended] Market cache refreshed");

    return marketInfoList;
  } catch (err) {
    logger.error({ err }, "[Extended] Failed to fetch markets, returning cached data");
    const existing = marketCache.get(network);
    return existing && existing.markets.length > 0 ? existing.markets : [];
  }
}

export async function getExtendedMarketInfo(
  market: string,
  apiKey?: string,
  network: ExtendedNetwork = "mainnet"
): Promise<ExtendedMarketInfo | null> {
  const markets = await getExtendedMarkets(apiKey, network);
  return markets.find((m) => m.market === market) ?? null;
}

export async function refreshExtendedMarketCache(
  apiKey?: string,
  network: ExtendedNetwork = "mainnet"
): Promise<void> {
  marketCache.delete(network);
  await getExtendedMarkets(apiKey, network);
}

export function clearExtendedMarketCache(): void {
  marketCache.clear();
}
