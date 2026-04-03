import Decimal from "decimal.js";
import { listProducts, getMarketPrice } from "./etherealApi";
import type { EtherealProduct, EtherealNetwork } from "./etherealApi";
import { logger } from "../logger";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProductInfo {
  id: string;
  onchainId: number;
  ticker: string;
  displayTicker: string;
  baseAsset: string;
  quoteAsset: string;
  minOrderSize: number;
  maxOrderSize: number;
  lotSize: number;
  tickSize: number;
  sizeDecimals: number;
  priceDecimals: number;
  makerFee: number;
  takerFee: number;
  maxLeverage: number;
  lastPrice: number;
  engineType: number;
  status: string;
}

// ─── Produk cache (TTL 2 menit) ───────────────────────────────────────────────

interface ProductCache {
  products: ProductInfo[];
  fetchedAt: number;
}

const CACHE_TTL_MS = 2 * 60 * 1000;
const productCaches = new Map<EtherealNetwork, ProductCache>();

// ─── Fallback products (diisi saat pertama kali berhasil fetch) ───────────────
// Array ini di-populate dari live API, bukan hardcoded, untuk selalu up-to-date.

const runtimeFallback = new Map<EtherealNetwork, ProductInfo[]>();

// ─── Parsing helpers ──────────────────────────────────────────────────────────

function countDecimals(numStr: string): number {
  const dotIdx = numStr.indexOf(".");
  if (dotIdx === -1) return 0;
  return numStr.length - dotIdx - 1;
}

function parseProduct(p: EtherealProduct): ProductInfo {
  const tickerParts = p.ticker.replace("USD", "/USDE").replace("PERP", "").trim();
  const displayParts = tickerParts.split("/");
  const baseAsset = displayParts[0] ?? p.ticker.replace("USD", "").replace("PERP", "").trim();
  const quoteAsset = displayParts[1] ?? "USDE";

  const minOrderSize = parseFloat(p.minQuantity ?? "0.001");
  const maxOrderSize = parseFloat(p.maxQuantity ?? "100000");
  const lotSize = parseFloat(p.lotSize ?? "0.001");
  const tickSize = parseFloat(p.tickSize ?? "0.01");

  // Warn jika field kritis tidak ada di response API — silent fallback berbahaya
  const _missingFields = [
    !p.minQuantity && "minQuantity",
    !p.lotSize     && "lotSize",
    !p.tickSize    && "tickSize",
  ].filter(Boolean);
  if (_missingFields.length > 0) {
    logger.warn(
      { ticker: p.ticker, missingFields: _missingFields },
      "[EtherealMarkets] Field tidak ada di response API, pakai default hardcoded"
    );
  }

  return {
    id: p.id,
    onchainId: p.onchainId,
    ticker: p.ticker,
    displayTicker: p.displayTicker ?? p.ticker,
    baseAsset,
    quoteAsset,
    minOrderSize,
    maxOrderSize,
    lotSize,
    tickSize,
    sizeDecimals: countDecimals(p.lotSize ?? "0.001"),
    priceDecimals: countDecimals(p.tickSize ?? "0.01"),
    makerFee: parseFloat(p.makerFee ?? "0"),
    takerFee: parseFloat(p.takerFee ?? "0"),
    maxLeverage: parseFloat(p.maxLeverage ?? "20"),
    lastPrice: 0,
    engineType: p.engineType ?? 0,
    status: p.status ?? "active",
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getProducts(
  network: EtherealNetwork = "mainnet"
): Promise<ProductInfo[]> {
  const cached = productCaches.get(network);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.products;
  }

  try {
    const rawProducts = await listProducts(network);
    const products = rawProducts
      .filter((p) => p.status === "active" || p.status === "ACTIVE" || !p.status)
      .map(parseProduct);

    productCaches.set(network, { products, fetchedAt: Date.now() });
    runtimeFallback.set(network, products);

    logger.info({ count: products.length, network }, "[EtherealMarkets] Products cached");
    return products;
  } catch (err) {
    logger.error({ err, network }, "[EtherealMarkets] Failed to fetch products");

    const fallback = runtimeFallback.get(network);
    if (fallback?.length) {
      logger.warn({ count: fallback.length, network }, "[EtherealMarkets] Using runtime fallback products");
      return fallback;
    }

    const stale = productCaches.get(network);
    if (stale?.products.length) {
      logger.warn({ count: stale.products.length, network }, "[EtherealMarkets] Using stale cache");
      return stale.products;
    }

    return [];
  }
}

export async function getProductInfo(
  productId: string,
  network: EtherealNetwork = "mainnet"
): Promise<ProductInfo | null> {
  const products = await getProducts(network);
  return products.find((p) => p.id === productId) ?? null;
}

export async function getProductByOnchainId(
  onchainId: number,
  network: EtherealNetwork = "mainnet"
): Promise<ProductInfo | null> {
  const products = await getProducts(network);
  return products.find((p) => p.onchainId === onchainId) ?? null;
}

export async function getProductByTicker(
  ticker: string,
  network: EtherealNetwork = "mainnet"
): Promise<ProductInfo | null> {
  const products = await getProducts(network);
  const upper = ticker.toUpperCase();
  return (
    products.find((p) => p.ticker === upper) ??
    products.find((p) => p.ticker.includes(upper)) ??
    null
  );
}

export async function getProductWithPrice(
  productId: string,
  network: EtherealNetwork = "mainnet"
): Promise<ProductInfo | null> {
  const product = await getProductInfo(productId, network);
  if (!product) return null;

  try {
    const priceData = await getMarketPrice(productId, network);
    if (priceData?.price) {
      return { ...product, lastPrice: parseFloat(priceData.price) };
    }
  } catch {
    // ignore price fetch error
  }

  return product;
}

export function invalidateProductCache(network?: EtherealNetwork): void {
  if (network) {
    productCaches.delete(network);
  } else {
    productCaches.clear();
  }
}

// ─── Price/size rounding ──────────────────────────────────────────────────────

export function roundToStep(quantity: number, lotSize: number): number {
  if (lotSize <= 0) return quantity;
  const q = new Decimal(quantity);
  const step = new Decimal(lotSize);
  // ROUND_DOWN: jangan pernah over-order dari yang dikonfigurasi user
  return q.div(step).toDecimalPlaces(0, Decimal.ROUND_DOWN).mul(step).toNumber();
}

export function roundToTick(price: number, tickSize: number): number {
  if (tickSize <= 0) return price;
  const p = new Decimal(price);
  const tick = new Decimal(tickSize);
  // ROUND_HALF_UP: standar untuk rounding harga
  return p.div(tick).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).mul(tick).toNumber();
}

export function roundToStepStr(quantity: number, lotSize: number, sizeDecimals: number): string {
  const rounded = roundToStep(quantity, lotSize);
  return rounded.toFixed(sizeDecimals);
}

export function roundToTickStr(price: number, tickSize: number, priceDecimals: number): string {
  const rounded = roundToTick(price, tickSize);
  return rounded.toFixed(priceDecimals);
}
