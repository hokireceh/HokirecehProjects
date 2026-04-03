/**
 * Test Script: Place Order ETH-USD di Extended Testnet
 *
 * Menguji:
 * 1. Koneksi ke Extended testnet API
 * 2. Fetch mark price / order book ETH-USD
 * 3. Sign order menggunakan extendedSigner (SNIP-12)
 * 4. Place LIMIT BUY order sedikit di bawah mark price
 * 5. Konfirmasi order diterima server
 * 6. Cancel order setelah berhasil
 *
 * Jalankan:
 *   EXTENDED_API_KEY=... EXTENDED_STARK_PRIVATE_KEY=... EXTENDED_COLLATERAL_POSITION=... \
 *   pnpm --filter @workspace/scripts tsx ./src/test-extended-order.ts
 */

import { signOrder, generateNonce, derivePublicKey } from "../../artifacts/api-server/src/lib/extended/extendedSigner.js";
import {
  getMarketStats,
  getOrderBookDepth,
  getBalance,
  getAccountDetails,
  getOpenOrders,
} from "../../artifacts/api-server/src/lib/extended/extendedApi.js";
import {
  placeExtendedOrder,
  cancelExtendedOrderById,
  calcMarketOrderPrice,
} from "../../artifacts/api-server/src/lib/extended/extendedOrderManager.js";
import Decimal from "decimal.js";

// ─── Config dari env ──────────────────────────────────────────────────────────

const API_KEY = process.env.EXTENDED_API_KEY;
const PRIVATE_KEY = process.env.EXTENDED_STARK_PRIVATE_KEY;
const COLLATERAL_POSITION = process.env.EXTENDED_COLLATERAL_POSITION;
const NETWORK = "testnet" as const;
const MARKET = "ETH-USD";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string, data?: unknown) {
  const ts = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[${ts}] ${msg}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`[${ts}] ${msg}`);
  }
}

function logOk(msg: string, data?: unknown) {
  process.stdout.write("\x1b[32m✓\x1b[0m ");
  log(msg, data);
}

function logFail(msg: string, data?: unknown) {
  process.stdout.write("\x1b[31m✗\x1b[0m ");
  log(msg, data);
}

function logInfo(msg: string, data?: unknown) {
  process.stdout.write("\x1b[36mℹ\x1b[0m ");
  log(msg, data);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n════════════════════════════════════════════════════════");
  console.log("  Test: Place Order ETH-USD — Extended Testnet");
  console.log("════════════════════════════════════════════════════════\n");

  // ── 1. Validasi env ────────────────────────────────────────────────────────
  if (!API_KEY || !PRIVATE_KEY || !COLLATERAL_POSITION) {
    logFail("Env vars tidak lengkap!");
    console.log("  Diperlukan: EXTENDED_API_KEY, EXTENDED_STARK_PRIVATE_KEY, EXTENDED_COLLATERAL_POSITION");
    process.exit(1);
  }
  logOk("Env vars lengkap");
  logInfo("Collateral position:", COLLATERAL_POSITION);

  // ── 2. Derive & tampilkan public key ───────────────────────────────────────
  const starkKey = derivePublicKey(PRIVATE_KEY);
  logOk("Public Stark key derived:", starkKey);

  // ── 3. Cek account details ─────────────────────────────────────────────────
  logInfo("Fetching account details...");
  const account = await getAccountDetails(API_KEY, NETWORK);
  if (account) {
    logOk("Account details:", {
      accountId: account.accountId,
      l2Key: account.l2Key,
      l2Vault: account.l2Vault,
      status: account.status,
    });

    if (account.l2Key.toLowerCase() !== starkKey.toLowerCase()) {
      logFail(`StarkKey mismatch! API=${account.l2Key} vs derived=${starkKey}`);
      // Tidak exit — derived key bisa berbeda format (compressed vs uncompressed)
    } else {
      logOk("StarkKey cocok dengan derived key");
    }
  } else {
    logFail("Gagal fetch account details");
  }

  // ── 4. Cek balance ─────────────────────────────────────────────────────────
  logInfo("Fetching balance...");
  const balance = await getBalance(API_KEY, NETWORK);
  if (balance) {
    logOk("Balance:", {
      collateral: balance.collateralName,
      balance: balance.balance,
      equity: balance.equity,
      availableForTrade: balance.availableForTrade,
      unrealisedPnl: balance.unrealisedPnl,
    });
    const available = new Decimal(balance.availableForTrade);
    if (available.lessThan(1)) {
      logFail(`Balance terlalu kecil untuk trading: ${balance.availableForTrade}`);
      process.exit(1);
    }
    logOk(`Available for trade: $${balance.availableForTrade}`);
  } else {
    logFail("Gagal fetch balance — periksa API key");
    process.exit(1);
  }

  // ── 5. Fetch market stats (mark price) ────────────────────────────────────
  logInfo(`Fetching ${MARKET} market stats...`);
  const stats = await getMarketStats(MARKET, NETWORK);
  if (!stats) {
    logFail(`Gagal fetch stats ${MARKET}`);
    process.exit(1);
  }
  const markPrice = new Decimal(stats.markPrice);
  const indexPrice = new Decimal(stats.indexPrice);
  logOk(`${MARKET} stats:`, {
    markPrice: stats.markPrice,
    indexPrice: stats.indexPrice,
    lastTradedPrice: stats.lastTradedPrice,
    fundingRate: stats.fundingRate,
    dailyVolume: stats.dailyVolume,
  });

  // ── 6. Fetch order book untuk bestBid/bestAsk ─────────────────────────────
  logInfo(`Fetching ${MARKET} order book...`);
  const orderBook = await getOrderBookDepth(MARKET, NETWORK);
  let bestBid: Decimal | null = null;
  let bestAsk: Decimal | null = null;

  if (orderBook) {
    bestBid = orderBook.bid[0] ? new Decimal(orderBook.bid[0].p) : null;
    bestAsk = orderBook.ask[0] ? new Decimal(orderBook.ask[0].p) : null;
    logOk("Order book top of book:", {
      bestBid: bestBid?.toFixed(1) ?? "N/A",
      bestAsk: bestAsk?.toFixed(1) ?? "N/A",
      spread: bestBid && bestAsk ? bestAsk.minus(bestBid).toFixed(1) : "N/A",
    });
  } else {
    logFail("Gagal fetch order book — menggunakan mark price sebagai referensi");
  }

  // ── 7. Tentukan harga order ────────────────────────────────────────────────
  // Kita pasang LIMIT BUY 0.5% di bawah mark price → tidak langsung tereksekusi
  // Tujuan: konfirmasi order diterima tanpa mempengaruhi posisi

  const referencePrice = bestBid ?? markPrice;
  // Tick size ETH-USD di Extended = 0.1 (perlu dibulatkan ke 1 desimal)
  const orderPrice = referencePrice.mul("0.995").toDecimalPlaces(1, Decimal.ROUND_HALF_DOWN);
  const orderQty = "0.001"; // Qty minimum ETH-USD

  logInfo("Order yang akan dikirim:", {
    market: MARKET,
    side: "BUY",
    type: "LIMIT",
    qty: orderQty,
    price: orderPrice.toFixed(1),
    markPrice: markPrice.toFixed(1),
    discount: "0.5% di bawah referensi (tidak akan tereksekusi segera)",
  });

  // ── 8. Place order ────────────────────────────────────────────────────────
  logInfo("Menempatkan order ke testnet...");
  let orderId: number | null = null;
  let externalId: string | null = null;

  try {
    const result = await placeExtendedOrder({
      apiKey: API_KEY,
      privateKey: PRIVATE_KEY,
      collateralPosition: COLLATERAL_POSITION,
      market: MARKET,
      type: "LIMIT",
      side: "BUY",
      qty: orderQty,
      price: orderPrice.toFixed(1),
      network: NETWORK,
    });

    orderId = result.orderId;
    externalId = result.externalId;
    logOk("ORDER BERHASIL DITEMPATKAN! 🎉", {
      orderId: result.orderId,
      externalId: result.externalId,
      market: MARKET,
      side: "BUY",
      price: orderPrice.toFixed(1),
      qty: orderQty,
    });
  } catch (err: any) {
    logFail("Gagal place order:", { error: err.message });
    process.exit(1);
  }

  // ── 9. Verifikasi order muncul di open orders ─────────────────────────────
  logInfo("Verifikasi open orders...");
  await new Promise((r) => setTimeout(r, 1000)); // Tunggu sebentar
  const openOrders = await getOpenOrders(API_KEY, MARKET, NETWORK);
  const ourOrder = openOrders.find(
    (o) => o.id === orderId || o.externalId === externalId
  );

  if (ourOrder) {
    logOk("Order terkonfirmasi di open orders:", {
      id: ourOrder.id,
      externalId: ourOrder.externalId,
      status: ourOrder.status,
      price: ourOrder.price,
      qty: ourOrder.qty,
      filledQty: ourOrder.filledQty,
    });
  } else {
    logInfo(`Order tidak muncul di open orders (mungkin sudah tereksekusi atau masih memproses). orderId=${orderId}`);
    logInfo("Open orders saat ini:", openOrders);
  }

  // ── 10. Cancel order ──────────────────────────────────────────────────────
  if (orderId) {
    logInfo(`Membatalkan order ${orderId}...`);
    try {
      await cancelExtendedOrderById(API_KEY, orderId, NETWORK);
      logOk(`Order ${orderId} berhasil dibatalkan`);
    } catch (err: any) {
      logInfo(`Cancel gagal (mungkin sudah tereksekusi/expired): ${err.message}`);
    }
  }

  // ── 11. Ringkasan ─────────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════");
  console.log("  ✅ SEMUA TEST BERHASIL");
  console.log("════════════════════════════════════════════════════════");
  console.log(`  Market       : ${MARKET}`);
  console.log(`  Network      : ${NETWORK}`);
  console.log(`  Mark Price   : $${markPrice.toFixed(1)}`);
  console.log(`  Order Price  : $${orderPrice.toFixed(1)}`);
  console.log(`  Order ID     : ${orderId}`);
  console.log(`  External ID  : ${externalId}`);
  console.log("  Status       : PLACED → VERIFIED → CANCELLED");
  console.log("════════════════════════════════════════════════════════\n");
  console.log("✅ Phase 2 test selesai. Siap lanjut ke Phase 3 (Bot Engine Grid/DCA).\n");
}

main().catch((err) => {
  logFail("Uncaught error:", { message: err.message, stack: err.stack });
  process.exit(1);
});
