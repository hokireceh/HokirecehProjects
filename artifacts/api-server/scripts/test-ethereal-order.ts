/**
 * Test Script: Place & Cancel Order di Ethereal
 *
 * Test yang dicakup:
 *   1. Place LIMIT order kecil (BUY, 5% di bawah mark → passive, tidak langsung filled)
 *   2. Place MARKET order kecil (BUY → langsung filled)
 *   3. Cancel LIMIT order yang belum filled
 *   4. Verifikasi unrealizedPnl tersedia dari API positions
 *
 * Jalankan:
 *   ETH_PRIVATE_KEY=0x... ETH_SUBACCOUNT_NAME=primary ETH_SUBACCOUNT_ID=<uuid> \
 *   ETH_NETWORK=mainnet pnpm --filter @workspace/api-server test:ethereal
 *
 * Atau testnet:
 *   ETH_NETWORK=testnet ...
 *
 * ENV VARS:
 *   ETH_PRIVATE_KEY      — private key wallet (0x prefix)
 *   ETH_SUBACCOUNT_NAME  — nama subaccount, default "primary"
 *   ETH_SUBACCOUNT_ID    — UUID subaccount (dari GET /v1/subaccount)
 *   ETH_NETWORK          — "mainnet" | "testnet", default "mainnet"
 *   ETH_TICKER           — ticker produk, default "BTCUSD"
 *   ETH_ORDER_QTY        — quantity order, default "0.001"
 */

import Decimal from "decimal.js";
import {
  signTradeOrder,
  signCancelOrder,
  getWalletAddress,
  decimalToBigInt,
  generateNonce,
  generateSignedAt,
  nameToBytes32,
} from "../src/lib/ethereal/etherealSigner.js";
import {
  listProducts,
  getMarketPrice,
  getSubaccounts,
  getBalances,
  getPositions,
  listOrders,
  placeOrder,
  cancelOrder,
  type EtherealNetwork,
} from "../src/lib/ethereal/etherealApi.js";
import {
  getProductByTicker,
  roundToTickStr,
  roundToStepStr,
} from "../src/lib/ethereal/etherealMarkets.js";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ─── Config dari env vars ──────────────────────────────────────────────────────

const PRIVATE_KEY  = process.env.ETH_PRIVATE_KEY ?? "";
const SUBACCOUNT_N = process.env.ETH_SUBACCOUNT_NAME ?? "primary";
const SUBACCOUNT_ID = process.env.ETH_SUBACCOUNT_ID ?? "";
const NETWORK      = (process.env.ETH_NETWORK ?? "mainnet") as EtherealNetwork;
const TICKER       = process.env.ETH_TICKER ?? "BTCUSD";
const ORDER_QTY    = process.env.ETH_ORDER_QTY ?? "0.001";

// ─── Logger ───────────────────────────────────────────────────────────────────

const G = "\x1b[32m", R = "\x1b[31m", C = "\x1b[36m", Y = "\x1b[33m", X = "\x1b[0m";
const ts  = () => new Date().toISOString().slice(11, 23);
const ok   = (m: string, d?: unknown) => console.log(`${G}✓${X} [${ts()}] ${m}`, d !== undefined ? JSON.stringify(d, null, 2) : "");
const fail = (m: string, d?: unknown) => { console.error(`${R}✗${X} [${ts()}] ${m}`, d !== undefined ? JSON.stringify(d, null, 2) : ""); };
const info = (m: string, d?: unknown) => console.log(`${C}ℹ${X} [${ts()}] ${m}`, d !== undefined ? JSON.stringify(d, null, 2) : "");
const warn = (m: string, d?: unknown) => console.log(`${Y}⚠${X} [${ts()}] ${m}`, d !== undefined ? JSON.stringify(d, null, 2) : "");

// ─── Helper: build & submit order ─────────────────────────────────────────────

async function submitOrder(params: {
  walletAddress: string;
  subaccountBytes32: string;
  productInfo: Awaited<ReturnType<typeof getProductByTicker>>;
  side: 0 | 1;
  orderType: "MARKET" | "LIMIT";
  priceStr: string;
  qtyStr: string;
}) {
  const { walletAddress, subaccountBytes32, productInfo, side, orderType, priceStr, qtyStr } = params;

  if (!productInfo) throw new Error("productInfo null");

  const nonce    = generateNonce();
  const signedAt = generateSignedAt();

  const orderData = {
    sender:     walletAddress,
    subaccount: subaccountBytes32,
    quantity:   decimalToBigInt(qtyStr),
    price:      orderType === "MARKET" ? 0n : decimalToBigInt(priceStr),
    reduceOnly: false,
    side,
    engineType: productInfo.engineType,
    productId:  productInfo.onchainId,
    nonce,
    signedAt,
  };

  info(`Signing ${orderType} order…`, {
    side: side === 0 ? "BUY" : "SELL",
    qty: qtyStr,
    price: orderType === "MARKET" ? "0 (market)" : priceStr,
    productId: productInfo.onchainId,
  });

  const signature = await signTradeOrder(PRIVATE_KEY, orderData, NETWORK);
  ok(`Signature: ${signature.slice(0, 20)}...`);

  const body = {
    data: {
      subaccount: subaccountBytes32,
      sender:     walletAddress,
      nonce:      nonce.toString(),
      type:       orderType,
      quantity:   qtyStr,
      side,
      onchainId:  productInfo.onchainId,
      engineType: productInfo.engineType,
      signedAt,
      price:      orderType === "LIMIT" ? priceStr : undefined,
      reduceOnly: false,
    },
    signature,
  };

  const result = await placeOrder(body, NETWORK);
  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${C}════════════════════════════════════════════════════════${X}`);
  console.log(`  Ethereal Order Test — ${TICKER} on ${NETWORK}`);
  console.log(`${C}════════════════════════════════════════════════════════${X}\n`);

  // ── STEP 1: Validasi env ───────────────────────────────────────────────────
  info("STEP 1: Validasi environment");
  if (!PRIVATE_KEY || !PRIVATE_KEY.startsWith("0x")) {
    fail("ETH_PRIVATE_KEY tidak ada atau tidak valid (harus 0x...)");
    process.exit(1);
  }
  if (!SUBACCOUNT_ID) {
    fail("ETH_SUBACCOUNT_ID tidak ada (UUID subaccount)");
    process.exit(1);
  }

  const walletAddress       = getWalletAddress(PRIVATE_KEY);
  const subaccountBytes32   = nameToBytes32(SUBACCOUNT_N);

  ok("Env valid", {
    walletAddress,
    subaccountName: SUBACCOUNT_N,
    subaccountBytes32,
    subaccountId: SUBACCOUNT_ID,
    network: NETWORK,
    ticker: TICKER,
    qty: ORDER_QTY,
  });

  // ── STEP 2: Product info ───────────────────────────────────────────────────
  info("\nSTEP 2: Fetch product info");
  const productInfo = await getProductByTicker(TICKER, NETWORK).catch(() => null);
  if (!productInfo) {
    fail(`Product ${TICKER} tidak ditemukan di ${NETWORK}`);
    const products = await listProducts(NETWORK).catch(() => []);
    info(`Products tersedia: ${products.map(p => p.ticker).join(", ")}`);
    process.exit(1);
  }
  ok(`Product OK`, {
    ticker: productInfo.ticker,
    onchainId: productInfo.onchainId,
    engineType: productInfo.engineType,
    lotSize: productInfo.lotSize,
    tickSize: productInfo.tickSize,
    minQuantity: productInfo.minQuantity,
  });

  // ── STEP 3: Harga pasar ────────────────────────────────────────────────────
  info("\nSTEP 3: Fetch market price");
  const priceData = await getMarketPrice(productInfo.id, NETWORK).catch(() => null);
  if (!priceData?.price) {
    fail("Gagal fetch market price");
    process.exit(1);
  }
  const markPrice = new Decimal(priceData.price);
  ok(`Mark price ${TICKER}: $${markPrice.toFixed(2)}`);

  // Limit price: 5% di bawah mark → passive, tidak langsung filled
  const limitPriceRaw = markPrice.mul("0.95");
  const limitPriceStr = roundToTickStr(limitPriceRaw.toNumber(), productInfo.tickSize, productInfo.priceDecimals);
  const qtyStr        = roundToStepStr(parseFloat(ORDER_QTY), productInfo.lotSize, productInfo.sizeDecimals);

  info(`Order params: qty=${qtyStr}, limitPrice=$${limitPriceStr} (5% di bawah mark)`);

  // ── STEP 4: Balance ────────────────────────────────────────────────────────
  info("\nSTEP 4: Fetch balances");
  const balances = await getBalances(SUBACCOUNT_ID, NETWORK).catch(() => []);
  const usde = balances.find(b => b.tokenName?.toLowerCase().includes("usde") || b.tokenName?.toLowerCase().includes("usd"));
  if (usde) {
    ok(`USDe: ${usde.amount} (available: ${usde.available})`);
    if (parseFloat(usde.available) < 1) {
      warn(`Available USDe < $1 — order mungkin gagal karena balance kurang`);
    }
  } else {
    warn("Tidak ada USDe balance (mungkin akun kosong)");
  }

  // ── STEP 5: TEST 1 — LIMIT order ──────────────────────────────────────────
  console.log(`\n${C}── TEST 1: Place LIMIT BUY Order${X}`);
  let limitOrderId: string | null = null;

  try {
    const result = await submitOrder({
      walletAddress,
      subaccountBytes32,
      productInfo,
      side: 0,
      orderType: "LIMIT",
      priceStr: limitPriceStr,
      qtyStr,
    });

    if (result.result === "Ok") {
      limitOrderId = result.id;
      ok(`LIMIT order accepted`, { orderId: result.id, filled: result.filled, result: result.result });
    } else {
      warn(`LIMIT order tidak diterima: ${result.result}`, result);
    }
  } catch (e: any) {
    fail(`LIMIT order gagal: ${e.message}`);
    info("(Bisa karena balance kurang, productId salah, atau EIP-712 issue)");
  }

  // ── STEP 6: TEST 2 — MARKET order ─────────────────────────────────────────
  console.log(`\n${C}── TEST 2: Place MARKET BUY Order (price=0n di EIP-712)${X}`);

  try {
    const result = await submitOrder({
      walletAddress,
      subaccountBytes32,
      productInfo,
      side: 0,
      orderType: "MARKET",
      priceStr: "0",
      qtyStr,
    });

    if (result.result === "Ok") {
      ok(`MARKET order accepted`, { orderId: result.id, filled: result.filled, result: result.result });
      if (parseFloat(result.filled ?? "0") > 0) {
        ok(`Order FILLED: ${result.filled} ${TICKER}`);
      } else {
        warn(`Order accepted tapi filled=0 (UnfilledMarketOrder atau likuiditas kosong)`);
      }
    } else {
      warn(`MARKET order tidak diterima: ${result.result}`, result);
    }
  } catch (e: any) {
    fail(`MARKET order gagal: ${e.message}`);
  }

  // ── STEP 7: TEST 3 — Cancel LIMIT order ───────────────────────────────────
  console.log(`\n${C}── TEST 3: Cancel LIMIT Order${X}`);

  if (limitOrderId) {
    try {
      const nonce    = generateNonce();
      const signedAt = generateSignedAt();

      const cancelSig = await signCancelOrder(
        PRIVATE_KEY,
        {
          sender:     walletAddress,
          subaccount: subaccountBytes32,
          orderIds:   [limitOrderId],
          nonce,
          signedAt,
        },
        NETWORK
      );
      ok(`Cancel signature: ${cancelSig.slice(0, 20)}...`);

      await cancelOrder({
        data: {
          subaccount: subaccountBytes32,
          sender:     walletAddress,
          nonce:      nonce.toString(),
          orderIds:   [limitOrderId],
        },
        signature: cancelSig,
      }, NETWORK);

      ok(`Cancel order accepted`, { orderId: limitOrderId });

      // Verifikasi cancel: cek order list
      await new Promise(r => setTimeout(r, 1500));
      const orders = await listOrders(SUBACCOUNT_ID, NETWORK).catch(() => []);
      const stillOpen = orders.find(o => o.id === limitOrderId && o.status === "NEW");
      if (stillOpen) {
        warn(`Order masih NEW setelah cancel — mungkin propagating`);
      } else {
        ok(`Order tidak ada lagi di active orders (cancel berhasil)`);
      }

    } catch (e: any) {
      fail(`Cancel gagal: ${e.message}`);
      info("(Bisa karena EIP-712 orderIds encoding salah, atau order sudah expired)");
    }
  } else {
    warn("Skip cancel test — tidak ada limitOrderId (LIMIT order gagal di step 5)");
  }

  // ── STEP 8: TEST 4 — unrealizedPnl dari positions ─────────────────────────
  console.log(`\n${C}── TEST 4: unrealizedPnl dari API positions${X}`);

  const positions = await getPositions(SUBACCOUNT_ID, NETWORK).catch(() => []);
  if (positions.length === 0) {
    info("Tidak ada posisi terbuka — unrealizedPnl tidak bisa diverifikasi");
    info("(Buka posisi terlebih dahulu untuk test ini, atau tunggu MARKET order terisi)");
  } else {
    ok(`${positions.length} posisi aktif:`);
    let totalUPnl = new Decimal(0);
    for (const p of positions) {
      const upnl = new Decimal(p.unrealizedPnl ?? "0");
      totalUPnl = totalUPnl.add(upnl);
      ok(`  ${p.productId} | side: ${p.side} | size: ${p.size} | uPnL: $${upnl.toFixed(4)}`);
    }
    ok(`Total unrealizedPnl: $${totalUPnl.toFixed(4)}`);
    info("Field unrealizedPnl tersedia — dashboard akan menampilkan angka ini");
  }

  // ── Ringkasan ──────────────────────────────────────────────────────────────
  console.log(`\n${G}════════════════════════════════════════════════════════${X}`);
  console.log(`${G}  ETHEREAL ORDER TEST COMPLETE${X}`);
  console.log(`${G}════════════════════════════════════════════════════════${X}`);
  console.log(`  Network  : ${NETWORK}`);
  console.log(`  Market   : ${TICKER}`);
  console.log(`  Qty      : ${qtyStr}`);
  console.log(`  LimitId  : ${limitOrderId ?? "n/a"}`);
  console.log(`${G}════════════════════════════════════════════════════════${X}\n`);
}

main().catch((e: any) => {
  fail(`Uncaught: ${e.message}`);
  console.error(e.stack);
  process.exit(1);
});
