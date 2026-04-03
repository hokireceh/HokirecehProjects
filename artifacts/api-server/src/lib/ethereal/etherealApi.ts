import Decimal from "decimal.js";
import { logger } from "../logger";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ─── Base URLs ────────────────────────────────────────────────────────────────
// Sumber: ETHEREAL_INTEGRATION.md §2

export const BASE_URLS = {
  mainnet: "https://api.ethereal.trade",
  testnet: "https://api.etherealtest.net",
} as const;

export type EtherealNetwork = "mainnet" | "testnet";

export function getBaseUrl(network: EtherealNetwork = "mainnet"): string {
  return BASE_URLS[network];
}

const FETCH_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;
const USER_AGENT = "HokirecehProjects/1.0 EtherealIntegration";

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Internal fetch ───────────────────────────────────────────────────────────

async function etherealFetch<T>(
  path: string,
  network: EtherealNetwork = "mainnet",
  options?: RequestInit
): Promise<T> {
  const url = `${getBaseUrl(network)}${path}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
    ...(options?.headers as Record<string, string> | undefined),
  };

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers,
      });
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        throw new Error(`Ethereal API timeout after ${FETCH_TIMEOUT_MS}ms: ${path}`);
      }
      throw err;
    }
    clearTimeout(timer);

    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After");
      const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : 2_000 * Math.pow(2, attempt);
      logger.warn({ path, attempt, waitMs }, "[Ethereal] Rate limited (429), retrying...");
      if (attempt < MAX_RETRIES - 1) {
        await sleep(waitMs);
        continue;
      }
      throw new Error(`Ethereal API rate limited (429) after ${MAX_RETRIES} attempts: ${path}`);
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ethereal API error ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  throw new Error(`Ethereal API: max retries exceeded for ${path}`);
}

// ─── Types ─────────────────────────────────────────────────────────────────────
// Semua interface diturunkan dari OpenAPI schema Ethereal (openapi-trading-api-mainnet-.json)

export interface EtherealProduct {
  id: string;
  onchainId: number;
  ticker: string;
  displayTicker: string;
  engineType: number;
  status: string;
  minQuantity: string;
  maxQuantity: string;
  lotSize: string;
  tickSize: string;
  makerFee: string;
  takerFee: string;
  maxLeverage: string;
  volume24h?: string;
  fundingRate1h?: string;
  openInterest?: string;
}

export interface EtherealSubaccount {
  id: string;
  name: string;
  account: string;
  createdAt: number;
}

export interface EtherealBalance {
  subaccountId: string;
  tokenId?: string;
  tokenAddress?: string;
  tokenName?: string;
  amount: string;
  available: string;
  totalUsed?: string;
  updatedAt?: number;
}

export interface EtherealPosition {
  id: string;
  productId: string;
  side: "long" | "short";
  size: string;
  cost: string;
  unrealizedPnl: string;
  realizedPnl: string;
  liquidationPrice?: string;
  fundingUsd?: string;
  updatedAt: number;
  createdAt: number;
}

export interface EtherealOrder {
  id: string;
  clientOrderId?: string;
  productId: string;
  subaccountId: string;
  side: number;
  type: string;
  status: string;
  quantity: string;
  price?: string;
  filledQuantity?: string;
  remainingQuantity?: string;
  reduceOnly?: boolean;
  createdAt: number;
  updatedAt?: number;
}

// OrderFillDto dari OpenAPI — field yang dikonfirmasi:
//   id (uuid), orderId (uuid), price (decimal), filled (decimal), type, side,
//   reduceOnly, feeUsd, isMaker, productId (uuid), subaccountId (uuid), createdAt (ms)
export interface EtherealFill {
  id: string;
  orderId: string;
  clientOrderId?: string;
  productId: string;
  subaccountId: string;
  side: number;
  price: string;
  filled: string;
  type: string;
  feeUsd: string;
  isMaker?: boolean;
  reduceOnly?: boolean;
  createdAt: number;
}

export interface EtherealMarketPrice {
  productId: string;
  price: string;
}

// ─── Order submission types ────────────────────────────────────────────────────
// Dikonfirmasi dari OpenAPI SubmitOrderMarketDtoData + SubmitOrderLimitDtoData
//
// Perbedaan kritis dari cara submit order Lighter:
//   Lighter → POST /api/v1/sendTx dengan form-urlencoded, txType + txInfo + signature terpisah
//   Ethereal → POST /v1/order dengan JSON body: { data: {...}, signature: "0x..." }
//
// Field yang dikonfirmasi dari SubmitOrderMarketDtoData:
//   - subaccount: bytes32 hex (SAMA dengan yang dipakai di EIP-712)
//   - nonce: string decimal nanoseconds (bukan bigint — JSON tidak support bigint)
//   - quantity: decimal string dengan precision 9 (contoh: "5.5", bukan raw uint128)
//   - price: hanya untuk LIMIT orders (tidak ada di MARKET)
//   - onchainId: integer (bukan UUID productId — ini yang dipakai EIP-712 juga)
//   - engineType: 0=PERP, 1=SPOT
//   - signedAt: integer seconds

export interface SubmitOrderBody {
  data: {
    subaccount: string;
    sender: string;
    nonce: string;
    type: "LIMIT" | "MARKET";
    quantity: string;
    side: number;
    onchainId: number;
    engineType: number;
    signedAt: number;
    price?: string;
    reduceOnly?: boolean;
    clientOrderId?: string;
  };
  signature: string;
}

// SubmitOrderCreatedDto dari OpenAPI — dikonfirmasi:
//   - id: UUID order yang berhasil dibuat
//   - filled: decimal string — berapa yang sudah terisi langsung (bisa "0" untuk LIMIT)
//   - result: enum yang menunjukkan status submit
//     "Ok" = berhasil
//     "UnfilledMarketOrder" = market order tidak ada likuiditas
//     "InsufficientBalance" = balance kurang
//     "ImmediateMatchPostOnly" = post-only order akan langsung match
//     ... dll (lihat OpenAPI untuk daftar lengkap)
//
// PENTING: HTTP 200 tidak berarti order terisi! Selalu cek field "result".
export interface SubmitOrderResponse {
  id: string;
  clientOrderId?: string;
  filled: string;
  result:
    | "Ok"
    | "UnfilledMarketOrder"
    | "UnfilledFillOrKill"
    | "UnfilledImmediateOrCancel"
    | "InsufficientBalance"
    | "ImmediateMatchPostOnly"
    | "MarketOrderReachedMaxSlippage"
    | "OrderIncreasesPosition"
    | "RiskLimitExceeded"
    | "AccountSuspended"
    | "SignerRevoked"
    | "CausesImmediateLiquidation"
    | "OcoFilled"
    | "TriggerCanceledError"
    | "LiquidationError"
    | "OpenValueCapExceeded"
    | "DuplicateSameSideOco"
    | string;
}

// ─── Cancel order types ────────────────────────────────────────────────────────
// Dikonfirmasi dari OpenAPI CancelOrderDtoData:
//   - subaccount: bytes32 hex (sama dengan yang dipakai EIP-712)
//   - sender: wallet address
//   - nonce: string decimal nanoseconds
//   - orderIds: UUID strings (bukan bytes32 — berbeda dari field EIP-712!)
//   - signedAt: TIDAK ada di REST body (hanya ada di EIP-712 signature)
//
// TODO: EIP-712 CancelOrder memiliki tipe orderIds: bytes32[] tapi REST body menerima UUID strings.
//       Cara encode UUID ke bytes32 untuk EIP-712 belum dikonfirmasi dari docs.
//       Lihat etherealSigner.ts untuk detail TODO ini.

export interface CancelOrderBody {
  data: {
    subaccount: string;
    sender: string;
    nonce: string;
    orderIds?: string[];
    clientOrderIds?: string[];
  };
  signature: string;
}

// ─── Pagination wrapper ────────────────────────────────────────────────────────

export interface PageResult<T> {
  hasNext: boolean;
  nextCursor?: string;
  data: T[];
}

// ─── Public endpoints ─────────────────────────────────────────────────────────

export async function listProducts(
  network: EtherealNetwork = "mainnet"
): Promise<EtherealProduct[]> {
  const result = await etherealFetch<PageResult<EtherealProduct>>(
    "/v1/product?order=asc&orderBy=createdAt&limit=100",
    network
  );
  return result.data ?? [];
}

export async function getMarketPrice(
  productId: string,
  network: EtherealNetwork = "mainnet"
): Promise<EtherealMarketPrice | null> {
  try {
    const result = await etherealFetch<PageResult<EtherealMarketPrice>>(
      `/v1/product/market-price?productIds=${productId}`,
      network
    );
    return result.data?.[0] ?? null;
  } catch (err) {
    logger.error({ err, productId }, "[Ethereal] Failed to fetch market price");
    return null;
  }
}

export async function getSubaccounts(
  walletAddress: string,
  network: EtherealNetwork = "mainnet"
): Promise<EtherealSubaccount[]> {
  const result = await etherealFetch<PageResult<EtherealSubaccount>>(
    `/v1/subaccount?sender=${walletAddress}`,
    network
  );
  return result.data ?? [];
}

export async function getBalances(
  subaccountId: string,
  network: EtherealNetwork = "mainnet"
): Promise<EtherealBalance[]> {
  try {
    const result = await etherealFetch<PageResult<EtherealBalance>>(
      `/v1/subaccount/balance?subaccountId=${subaccountId}&limit=20`,
      network
    );
    return result.data ?? [];
  } catch (err) {
    logger.error({ err, subaccountId }, "[Ethereal] Failed to fetch balances");
    return [];
  }
}

export async function getPositions(
  subaccountId: string,
  network: EtherealNetwork = "mainnet"
): Promise<EtherealPosition[]> {
  try {
    const result = await etherealFetch<PageResult<EtherealPosition>>(
      `/v1/position?subaccountId=${subaccountId}&limit=50`,
      network
    );
    return result.data ?? [];
  } catch (err) {
    logger.error({ err, subaccountId }, "[Ethereal] Failed to fetch positions");
    return [];
  }
}

export async function listOrders(
  subaccountId: string,
  network: EtherealNetwork = "mainnet"
): Promise<EtherealOrder[]> {
  try {
    const result = await etherealFetch<PageResult<EtherealOrder>>(
      `/v1/order?subaccountId=${subaccountId}&limit=50`,
      network
    );
    return result.data ?? [];
  } catch (err) {
    logger.error({ err, subaccountId }, "[Ethereal] Failed to list orders");
    return [];
  }
}

// ─── getFills — fill detection untuk polling ───────────────────────────────────
// Perbedaan kritis dari Lighter:
//   Lighter → GET /api/v1/tx?by=hash&hash=<txHash> → cek status === 2
//   Ethereal → GET /v1/order/fill?subaccountId=<id> → array fills, filter by orderId client-side
//
// Catatan: API Ethereal TIDAK punya query param orderId untuk /v1/order/fill.
// Filter orderId dilakukan client-side setelah fetch.
// Untuk efisiensi, gunakan productIds filter jika tersedia untuk mempersempit hasil.
//
// Limitasi: jika ada banyak fills (> limit), fill yang dicari mungkin tidak ada di halaman pertama.
// Solusi sementara: gunakan limit yang cukup besar dan filter by productId.

export async function getFills(
  subaccountId: string,
  params: {
    limit?: number;
    productIds?: string[];
    orderId?: string;
  },
  network: EtherealNetwork = "mainnet"
): Promise<EtherealFill[]> {
  try {
    const qs = new URLSearchParams();
    qs.set("subaccountId", subaccountId);
    qs.set("limit", String(params.limit ?? 50));
    if (params.productIds?.length) {
      params.productIds.forEach((id) => qs.append("productIds", id));
    }
    const result = await etherealFetch<PageResult<EtherealFill>>(
      `/v1/order/fill?${qs.toString()}`,
      network
    );
    let fills = result.data ?? [];

    // Filter client-side by orderId (tidak ada query param ini di API)
    if (params.orderId) {
      fills = fills.filter((f) => f.orderId === params.orderId);
    }
    return fills;
  } catch (err) {
    logger.error({ err, subaccountId }, "[Ethereal] Failed to fetch fills");
    return [];
  }
}

// ─── Authenticated endpoints ──────────────────────────────────────────────────

// placeOrder: POST /v1/order
// Perbedaan dari Lighter (yang pakai form-urlencoded sendTx):
//   Body adalah JSON { data: {...}, signature: "0x..." }
//   Signature dihasilkan sebelumnya via EIP-712 signTradeOrder()
//
// PENTING: Response HTTP 200 tidak berarti order terisi.
//   Cek response.result === "Ok" untuk memastikan order accepted.
//   Cek response.filled untuk tahu berapa yang langsung terisi.

export async function placeOrder(
  body: SubmitOrderBody,
  network: EtherealNetwork = "mainnet"
): Promise<SubmitOrderResponse> {
  const result = await etherealFetch<SubmitOrderResponse>(
    "/v1/order",
    network,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
  return result;
}

// cancelOrder: POST /v1/order/cancel
// Body: { data: { subaccount, sender, nonce, orderIds? }, signature }
// Signature dibuat via signCancelOrder() di etherealSigner.ts
//
// TODO: Pastikan format EIP-712 untuk orderIds sudah benar sebelum menggunakan ini.
//       Lihat TODO di etherealSigner.ts.

export async function cancelOrder(
  body: CancelOrderBody,
  network: EtherealNetwork = "mainnet"
): Promise<void> {
  await etherealFetch<unknown>(
    "/v1/order/cancel",
    network,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
}

// ─── Test connection ──────────────────────────────────────────────────────────

export async function testConnection(
  walletAddress: string,
  network: EtherealNetwork = "mainnet"
): Promise<{ ok: boolean; reason?: string; balance?: string }> {
  try {
    const subaccounts = await getSubaccounts(walletAddress, network);
    if (subaccounts.length === 0) {
      return { ok: false, reason: "Tidak ada subaccount ditemukan untuk wallet ini" };
    }
    const balances = await getBalances(subaccounts[0].id, network);
    const usde = balances.find(
      (b) =>
        b.tokenName?.toLowerCase().includes("usde") ||
        b.tokenName?.toLowerCase().includes("usd")
    );
    return { ok: true, balance: usde?.amount ?? "0" };
  } catch (err: any) {
    return { ok: false, reason: err.message };
  }
}
