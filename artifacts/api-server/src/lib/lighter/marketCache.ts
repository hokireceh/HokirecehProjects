import { getOrderBooks, type Network } from "./lighterApi";
import { logger } from "../logger";

export interface MarketInfo {
  index: number;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  type: "perp" | "spot";
  sizeDecimals: number;
  priceDecimals: number;
  minBaseAmount: number;
  minQuoteAmount: number;
  lastTradePrice: number;
  dailyPriceChange: number;
  dailyVolume: number;
  dailyVolumeQuote: number;
  dailyHigh: number;
  dailyLow: number;
  listedAt?: string;
  openInterest?: number;
  maxLeverage?: number;
}

const marketCache = new Map<Network, { markets: MarketInfo[]; fetchedAt: Date }>();
const CACHE_TTL_MS = 2 * 60 * 1000;

// Fallback market data used ONLY if Lighter API is unreachable.
// IMPORTANT: minBaseAmount MUST reflect real exchange minimums.
// With minBaseAmount=0 the order-size validation is skipped entirely,
// meaning the sequencer would reject undersized orders with a cryptic error
// instead of a clear "below minimum" warning in the bot logs.
// Values below are sourced from Lighter's /api/v1/orderBookDetails as of 2026-Q1.
const FALLBACK_MARKETS: MarketInfo[] = [
  { index: 1, symbol: "BTC-USDC",  baseAsset: "BTC",  quoteAsset: "USDC", type: "perp", sizeDecimals: 5, priceDecimals: 1, minBaseAmount: 0.0002, minQuoteAmount: 10, lastTradePrice: 0, dailyPriceChange: 0, dailyVolume: 0, dailyVolumeQuote: 0, dailyHigh: 0, dailyLow: 0 },
  { index: 2, symbol: "ETH-USDC",  baseAsset: "ETH",  quoteAsset: "USDC", type: "perp", sizeDecimals: 4, priceDecimals: 2, minBaseAmount: 0.003,  minQuoteAmount: 10, lastTradePrice: 0, dailyPriceChange: 0, dailyVolume: 0, dailyVolumeQuote: 0, dailyHigh: 0, dailyLow: 0 },
  { index: 3, symbol: "SOL-USDC",  baseAsset: "SOL",  quoteAsset: "USDC", type: "perp", sizeDecimals: 2, priceDecimals: 3, minBaseAmount: 0.1,    minQuoteAmount: 10, lastTradePrice: 0, dailyPriceChange: 0, dailyVolume: 0, dailyVolumeQuote: 0, dailyHigh: 0, dailyLow: 0 },
];

export async function getMarkets(network: Network = "mainnet"): Promise<MarketInfo[]> {
  const now = new Date();
  const cached = marketCache.get(network);
  if (cached && cached.markets.length > 0 && (now.getTime() - cached.fetchedAt.getTime()) < CACHE_TTL_MS) {
    return cached.markets;
  }

  try {
    const data = await getOrderBooks(network);
    const markets = (data.order_books ?? []).map((ob) => ({
      index: ob.market_id,
      symbol: ob.pair_symbol,
      baseAsset: ob.base_asset_symbol,
      quoteAsset: ob.quote_asset_symbol,
      type: (ob.order_book_type === "perp" ? "perp" : "spot") as "perp" | "spot",
      sizeDecimals: ob.supported_size_decimals ?? 4,
      priceDecimals: ob.supported_price_decimals ?? 2,
      minBaseAmount: parseFloat(ob.min_base_amount ?? "0"),
      minQuoteAmount: parseFloat(ob.min_quote_amount ?? "0"),
      lastTradePrice: ob.last_trade_price ?? 0,
      dailyPriceChange: ob.daily_price_change ?? 0,
      dailyVolume: ob.daily_base_token_volume ?? 0,
      dailyVolumeQuote: ob.daily_quote_token_volume ?? 0,
      dailyHigh: ob.daily_price_high ?? 0,
      dailyLow: ob.daily_price_low ?? 0,
      listedAt: ob.created_at,
      openInterest: ob.open_interest,
      maxLeverage: ob.max_leverage,
    }));
    marketCache.set(network, { markets, fetchedAt: now });
    logger.info({ count: markets.length, network }, "Market cache refreshed");
    return markets;
  } catch (err) {
    logger.error({ err }, "Failed to fetch markets, using fallback");
    const existing = marketCache.get(network);
    return existing && existing.markets.length > 0 ? existing.markets : FALLBACK_MARKETS;
  }
}

export async function getMarketSymbol(marketIndex: number, network: Network = "mainnet"): Promise<string> {
  const markets = await getMarkets(network);
  return markets.find((m) => m.index === marketIndex)?.symbol ?? `MARKET-${marketIndex}`;
}

export async function getMarketInfo(marketIndex: number, network: Network = "mainnet"): Promise<MarketInfo | null> {
  const markets = await getMarkets(network);
  return markets.find((m) => m.index === marketIndex) ?? null;
}
