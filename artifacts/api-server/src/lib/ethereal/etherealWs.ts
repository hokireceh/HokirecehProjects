import { io, type Socket } from "socket.io-client";
import Decimal from "decimal.js";
import { logger } from "../logger";
import type { EtherealNetwork } from "./etherealApi";

// ─── WebSocket URLs ───────────────────────────────────────────────────────────
// Ethereal menggunakan Socket.IO dengan path /v1/stream.
// Sumber: ETHEREAL_INTEGRATION.md → io('wss://ws.ethereal.trade/v1/stream', ...)
//
// TODO: URL WebSocket testnet belum terdokumentasi di referensi yang tersedia.
//       Sementara pakai mainnet URL sebagai fallback — perlu diverifikasi ke
//       Discord/docs Ethereal sebelum mode testnet digunakan secara live.

const WS_URLS: Record<EtherealNetwork, string> = {
  mainnet: "wss://ws.ethereal.trade/v1/stream",
  testnet: "wss://ws.ethereal.trade/v1/stream",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type EtherealPriceCallback = (midPrice: Decimal, productId: string) => void;

// ─── Isolated state ───────────────────────────────────────────────────────────

// productId (UUID) → { price, timestamp }
export const etherealWsPriceCache = new Map<string, { price: Decimal; ts: number }>();

// productId → Map<strategyId, callback>
const priceCallbacks = new Map<string, Map<number, EtherealPriceCallback>>();

// productId → subscriber count
const productRefCount = new Map<string, number>();

// Satu koneksi Socket.IO per proses (multiple subscriptions di atas satu koneksi)
let socket: Socket | null = null;
let currentNetwork: EtherealNetwork = "mainnet";
let isDestroyed = false;
let isConnected = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 2_000;

// ─── Internal helpers ─────────────────────────────────────────────────────────

function subscribeProduct(productId: string): void {
  if (!socket || !isConnected) return;
  socket.emit("subscribe", { type: "MarketPrice", productId });
  logger.info({ productId }, "[Ethereal WS] Subscribed to MarketPrice");
}

function resubscribeAll(): void {
  for (const productId of priceCallbacks.keys()) {
    subscribeProduct(productId);
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer || isDestroyed) return;
  logger.info({ delayMs: reconnectDelay }, "[Ethereal WS] Scheduling reconnect");
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!isDestroyed) {
      connect(currentNetwork);
    }
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
}

// ─── Price message handler ────────────────────────────────────────────────────
// Ethereal MarketPrice event format (dari docs: { type: "MarketPrice", productId, price })
// Referensi ETHEREAL_INTEGRATION.md — stream types: BookDepth, MarketPrice, Trades, FundingRate

function handleMarketPrice(data: unknown): void {
  try {
    let productId: string | undefined;
    let priceStr: string | undefined;

    if (typeof data === "object" && data !== null) {
      const obj = data as Record<string, any>;

      // Shape utama: { productId, price } atau { productId, lastPrice }
      // Ethereal mainnet mengirim: bestAskPrice, bestBidPrice, oraclePrice (tanpa field "price")
      if (typeof obj.productId === "string") {
        productId = obj.productId;
        if (obj.price ?? obj.lastPrice ?? obj.markPrice ?? obj.midPrice) {
          priceStr = obj.price ?? obj.lastPrice ?? obj.markPrice ?? obj.midPrice;
        } else if (obj.bestAskPrice && obj.bestBidPrice) {
          // Mid price dari best ask + best bid
          priceStr = String((parseFloat(obj.bestAskPrice) + parseFloat(obj.bestBidPrice)) / 2);
        } else if (obj.oraclePrice) {
          priceStr = obj.oraclePrice;
        }
      }

      // Shape alternatif: { data: { productId, price } }
      if (!productId && typeof obj.data === "object" && obj.data !== null) {
        const inner = obj.data as Record<string, any>;
        productId = inner.productId ?? inner.id;
        priceStr = inner.price ?? inner.lastPrice ?? inner.markPrice;
      }
    }

    if (!productId || !priceStr) return;

    const price = new Decimal(priceStr);
    if (!price.isFinite() || price.lte(0)) return;

    etherealWsPriceCache.set(productId, { price, ts: Date.now() });

    const callbacks = priceCallbacks.get(productId);
    if (callbacks) {
      for (const cb of callbacks.values()) {
        try {
          cb(price, productId);
        } catch {
          // ignore callback errors
        }
      }
    }
  } catch {
    // ignore parse errors
  }
}

// ─── Connect ──────────────────────────────────────────────────────────────────

export function connect(network: EtherealNetwork = "mainnet"): void {
  if (isDestroyed) return;
  currentNetwork = network;

  if (socket) {
    if (isConnected) return;
    try { socket.disconnect(); } catch { /* ignore */ }
    socket = null;
  }

  const url = WS_URLS[network];
  logger.info({ url, network }, "[Ethereal WS] Connecting via Socket.IO");

  const s = io(url, {
    transports: ["websocket"],
    reconnection: false,
    timeout: 10_000,
  });
  socket = s;

  s.on("connect", () => {
    logger.info({ network }, "[Ethereal WS] Connected");
    isConnected = true;
    reconnectDelay = 2_000;
    resubscribeAll();
  });

  // Event name yang dikonfirmasi dari docs: "MarketPrice"
  s.on("MarketPrice", (data: unknown) => {
    handleMarketPrice(data);
  });

  s.on("disconnect", (reason: string) => {
    logger.warn({ reason, network }, "[Ethereal WS] Disconnected");
    isConnected = false;
    scheduleReconnect();
  });

  s.on("connect_error", (err: Error) => {
    logger.error({ err: err.message, network }, "[Ethereal WS] Connection error");
    isConnected = false;
    scheduleReconnect();
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function registerEtherealPriceCallback(
  productId: string,
  strategyId: number,
  callback: EtherealPriceCallback,
  network: EtherealNetwork = "mainnet"
): void {
  isDestroyed = false;

  if (!priceCallbacks.has(productId)) {
    priceCallbacks.set(productId, new Map());
  }
  priceCallbacks.get(productId)!.set(strategyId, callback);

  const prev = productRefCount.get(productId) ?? 0;
  productRefCount.set(productId, prev + 1);

  if (!socket || !isConnected) {
    connect(network);
  } else {
    if (prev === 0) {
      subscribeProduct(productId);
    }
  }
}

export function unregisterEtherealPriceCallback(productId: string, strategyId: number): void {
  const callbacks = priceCallbacks.get(productId);
  if (callbacks) {
    callbacks.delete(strategyId);
    if (callbacks.size === 0) priceCallbacks.delete(productId);
  }

  const newCount = Math.max(0, (productRefCount.get(productId) ?? 0) - 1);
  if (newCount === 0) {
    productRefCount.delete(productId);
    etherealWsPriceCache.delete(productId);
  } else {
    productRefCount.set(productId, newCount);
  }

  if (priceCallbacks.size === 0 && socket) {
    socket.disconnect();
    socket = null;
    isConnected = false;
  }
}

export function getEtherealWsCachedPrice(productId: string, maxAgeMs = 5_000): Decimal | null {
  const entry = etherealWsPriceCache.get(productId);
  if (!entry) return null;
  if (Date.now() - entry.ts > maxAgeMs) return null;
  return entry.price;
}

export function destroyEtherealWs(): void {
  isDestroyed = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  isConnected = false;
  priceCallbacks.clear();
  productRefCount.clear();
  etherealWsPriceCache.clear();
}
