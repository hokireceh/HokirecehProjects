# LAPORAN AUDIT PENUH — PERBANDINGAN TIGA ENGINE BOT

**File referensi:**
- Lighter: `artifacts/api-server/src/lib/lighter/botEngine.ts`
- Extended: `artifacts/api-server/src/lib/extended/extendedBotEngine.ts`
- Ethereal: `artifacts/api-server/src/lib/ethereal/etherealBotEngine.ts`

---

## GRID — FORMULA LEVEL

| Exchange | Komponen | Implementasi | Beda dari Lighter? |
|---|---|---|---|
| Lighter | Formula level | `Math.min(Math.floor(price.sub(lower).div(spacing).toNumber()), levels-1)` — Decimal arithmetic + clamp | **REFERENSI** |
| Extended | Formula level | `Math.min(Math.floor(price.sub(lower).div(spacing).toNumber()), levels-1)` — identik | Tidak ada |
| Ethereal | Formula level | `Math.floor((currentPriceNum - lowerPrice) / gridSize)` — plain JS number, **tanpa clamp** | ⚠️ Ya — dua perbedaan: (1) plain number bukan Decimal, (2) tidak ada `Math.min(..., gridLevels-1)` |

---

## GRID — CROSSING DETECTION (LOGIKA SIDE)

| Exchange | Komponen | Implementasi | Beda dari Lighter? |
|---|---|---|---|
| Lighter | Mode neutral | down-cross → BUY; up-cross → SELL | **REFERENSI** |
| Lighter | Mode long | down-cross saja → BUY; up-cross → null (tidak ada aksi) | **REFERENSI** |
| Lighter | Mode short | up-cross saja → SELL; down-cross → null (tidak ada aksi) | **REFERENSI** |
| Extended | Mode neutral | down-cross → BUY; up-cross → SELL | Tidak ada |
| Extended | Mode long | down-cross saja → BUY; up-cross → null | Tidak ada |
| Extended | Mode short | up-cross saja → SELL; down-cross → null | Tidak ada |
| Ethereal | Mode neutral | `levelDelta > 0` → SELL; `levelDelta < 0` → BUY | Tidak ada (sama) |
| Ethereal | Mode long | `orderSide = "buy"` — **selalu BUY tanpa cek arah** | ⚠️ Ya — up-cross pun tetap BUY; Lighter hanya BUY saat down-cross |
| Ethereal | Mode short | `orderSide = "sell"` — **selalu SELL tanpa cek arah** | ⚠️ Ya — down-cross pun tetap SELL; Lighter hanya SELL saat up-cross |

---

## GRID — UKURAN ORDER PER GRID

| Exchange | Komponen | Implementasi | Beda dari Lighter? |
|---|---|---|---|
| Lighter | Size calculation | `size = amountPerGrid.div(currentPrice)` — Decimal, tanpa rounding ke step | **REFERENSI** |
| Lighter | Minimum check | Hanya di `startBot()` pre-flight (min_base/min_quote dari market info) | **REFERENSI** |
| Extended | Size calculation | `rawSize = amountPerGrid.div(currentPrice)` → `roundToStepSize(rawSize, stepSize)` | Ya — dibulatkan ke stepSize market sebelum dikirim |
| Extended | Minimum check | Tidak ada cek minimum di grid (diserahkan ke exchange) | Ya — lebih permissive dari Lighter |
| Ethereal | Size calculation | `rawSize.div(currentPrice)` → `roundToStepStr(rawSize, productInfo.lotSize, productInfo.sizeDecimals)` | Ya — dibulatkan ke lotSize |
| Ethereal | Minimum check | **Cek eksplisit**: `sizeNum < productInfo.minOrderSize` sebelum order (line 643) | Ya — lebih ketat dari Lighter; cek dilakukan per-tick bukan hanya di start |

---

## GRID — MAX ORDER PER TICK

| Exchange | Komponen | Implementasi | Beda dari Lighter? |
|---|---|---|---|
| Lighter | Batas order | `MAX_BATCH_ORDERS = 5` (konstanta, line 519) | **REFERENSI** |
| Extended | Batas order | `EXT_MAX_GRID_ORDERS = 5` (konstanta, line 75) | Tidak ada |
| Ethereal | Batas order | `Math.min(orderCount, 3)` — hardcoded inline (line 657) | ⚠️ Ya — batas 3, bukan 5 |

---

## GRID — MEKANISME PENGIRIMAN ORDER

| Exchange | Komponen | Implementasi | Beda dari Lighter? |
|---|---|---|---|
| Lighter | Single order | `executeLiveOrder()` → `sendTx()` (form-urlencoded) | **REFERENSI** |
| Lighter | Multi-level | `executeBatchLiveOrders()` → `sendTxBatch()` (satu request untuk semua order) | **REFERENSI** |
| Extended | Single order | `extExecuteLiveOrder()` → REST JSON POST | Ya — protokol JSON, bukan form-urlencoded |
| Extended | Multi-level | `extExecuteMultipleLiveOrders()` — sequential loop, **tidak ada batch endpoint** | Ya — sequential, bukan batch |
| Ethereal | Single order | `ethExecuteLiveOrder()` → REST JSON POST + EIP-712 sign | Ya — EIP-712, bukan ZK-signer |
| Ethereal | Multi-level | Loop `for (let i = 0; i < maxOrders; i++)` — sequential, **tidak ada batch endpoint** | Ya — sequential, bukan batch |

---

## GRID — HARGA EKSEKUSI ORDER

| Exchange | Komponen | Implementasi | Beda dari Lighter? |
|---|---|---|---|
| Lighter | Market order | `currentPrice * 1.05` (buy) / `currentPrice * 0.95` (sell) — 5% slippage buffer | **REFERENSI** |
| Lighter | Limit order | `currentPrice ± limitPriceOffset`, orderType=LimitOrder/PostOnly, GTT/PostOnly TIF | **REFERENSI** |
| Extended | Market order | `calcMarketOrderPrice()` — 0.75% buffer, type=MARKET, timeInForce=IOC | Ya — buffer lebih kecil (0.75% vs 5%) |
| Extended | Limit order | `currentPrice ± offset` dibulatkan ke tickSize, type=LIMIT, timeInForce=GTT | Ya — round ke tickSize, Lighter tidak |
| Ethereal | Market order | `price = "0"` — native MARKET type, exchange tentukan harga fill | Ya — tidak ada buffer sama sekali; harga 0 = market |
| Ethereal | Limit order | `currentPrice ± offset` → `roundToTickStr(...)` | Ya — round ke tickSize |

---

## GRID — SIGNING & PROTOKOL

| Exchange | Komponen | Implementasi | Beda dari Lighter? |
|---|---|---|---|
| Lighter | Signing | ZK-Lighter ECDSA via Go signer (`signCreateOrder`) | **REFERENSI** |
| Lighter | Nonce | Dari server: `getNextNonce(accountIndex, apiKeyIndex, network)` | **REFERENSI** |
| Lighter | Submit | `sendTx()` — form-urlencoded, field: txType + txInfo | **REFERENSI** |
| Extended | Signing | Starknet Poseidon hash (SNIP-12) via `placeExtendedOrder()` | Ya — Starknet EIP-712 equivalent |
| Extended | Nonce | UUID lokal, dikelola internal di `placeExtendedOrder()` | Ya — client-side, bukan server |
| Extended | Submit | REST JSON POST ke Extended API | Ya |
| Ethereal | Signing | EIP-712 via `ethers.Wallet.signTypedData()` (`signTradeOrder`) | Ya — Ethereum standard |
| Ethereal | Nonce | `BigInt(Date.now()) * 1_000_000n` (nanoseconds lokal) | Ya — timestamp-based, bukan server |
| Ethereal | Submit | REST JSON `{ data: {...}, signature: "0x..." }` | Ya |

---

## GRID — AUTO-RERANGE (OUT-OF-RANGE)

| Exchange | Komponen | Implementasi | Beda dari Lighter? |
|---|---|---|---|
| Lighter | Deteksi out-of-range | `pendingRerangeAt` short-circuit di awal fungsi (sebelum fetch harga) | **REFERENSI** |
| Lighter | Auto-rerange | `handleAutoRerange(strategy, currentPrice)` — counter 5 tick, cooldown 2 jam, daily limit 3x, AI call, kirim konfirmasi Telegram | **REFERENSI** |
| Lighter | Timeout | 20 menit tanpa konfirmasi → `clearRerangeState`, pause bot, Telegram notif | **REFERENSI** |
| Extended | Deteksi out-of-range | `pendingRerangeAt` short-circuit di awal fungsi (identik Lighter) | Tidak ada |
| Extended | Auto-rerange | `handleAutoRerange(strategy, currentPrice)` — modul shared dengan Lighter | Tidak ada — modul sama |
| Extended | Timeout | 20 menit → pause + notif (identik Lighter) | Tidak ada |
| Ethereal | Deteksi out-of-range | Hanya `if (currentPriceNum < lowerPrice \|\| currentPriceNum > upperPrice)` — log info + return | ⚠️ Ya — **tidak ada auto-rerange sama sekali** |
| Ethereal | Auto-rerange | **Tidak ada** — bot hanya menunggu harga kembali ke range | ⚠️ Ya — fitur seluruhnya tidak ada |
| Ethereal | `pendingRerangeAt` | **Tidak dicek** — field ini tidak dibaca di grid check Ethereal | ⚠️ Ya — short-circuit block tidak ada |

---

## GRID — UPDATE STATISTIK (totalBought / avgBuyPrice)

| Exchange | Komponen | Implementasi | Beda dari Lighter? |
|---|---|---|---|
| Lighter | Stats update | Dilakukan di `pollPendingTrades()` saat txStatus=2 (confirmed on-chain) — **tidak langsung** | **REFERENSI** |
| Extended | Stats update (IOC/market) | Langsung saat REST response diterima (`isIoc ? "filled"`) — line 732 | Ya — lebih cepat; tidak menunggu konfirmasi L2 |
| Extended | Stats update (GTT/limit) | Melalui WS account event (`handleExtendedOrderEvent`) atau REST polling | Ya |
| Ethereal | Stats update (MARKET) | Langsung jika `immediatelyFilled` (submitResult.filled > 0) — line 503-504 | Ya — conditional immediate |
| Ethereal | Stats update (LIMIT) | Melalui `pollPendingEtherealTrades()` setiap 1 menit — line 947 | Ya — polling 1 menit (Lighter 5 detik) |

---

## GRID — SL/TP CHECK

| Exchange | Komponen | Implementasi | Beda dari Lighter? |
|---|---|---|---|
| Lighter | Stop Loss | `currentPrice.lt(config.stopLoss)` — Decimal, strict less-than | **REFERENSI** |
| Lighter | Take Profit | `currentPrice.gt(config.takeProfit)` — Decimal, strict greater-than | **REFERENSI** |
| Lighter | Notifikasi SL/TP | Telegram notif via `notifyUser()` jika `notifyOnStop` | **REFERENSI** |
| Extended | Stop Loss | `currentPrice.lt(config.stopLoss)` — identik | Tidak ada |
| Extended | Take Profit | `currentPrice.gt(config.takeProfit)` — identik | Tidak ada |
| Extended | Notifikasi SL/TP | Telegram notif identik | Tidak ada |
| Ethereal | Stop Loss | `currentPriceNum <= config.stopLoss` — plain JS, **inklusif** (≤ bukan <) | Ya — batas inklusif vs eksklusif (minor) |
| Ethereal | Take Profit | `currentPriceNum >= config.takeProfit` — plain JS, **inklusif** (≥ bukan >) | Ya — minor, efek praktis sama |
| Ethereal | Notifikasi SL/TP | **Tidak ada Telegram notif** di SL/TP block — hanya log ke DB | ⚠️ Ya — user tidak diberitahu via Telegram saat SL/TP triggered |

---

## DCA — INTERVAL & TRIGGER

| Exchange | Komponen | Implementasi | Beda dari Lighter? |
|---|---|---|---|
| Lighter | Interval | `dcaConfig.intervalMinutes * 60 * 1000` — setInterval timer | **REFERENSI** |
| Lighter | Trigger | Timer saja — tidak ada WS callback untuk DCA | **REFERENSI** |
| Extended | Interval | Identik — `intervalMinutes * 60 * 1000` | Tidak ada |
| Extended | Trigger | Timer saja | Tidak ada |
| Ethereal | Interval | Identik — `intervalMinutes * 60 * 1000` | Tidak ada |
| Ethereal | Trigger | Timer saja | Tidak ada |

---

## DCA — UKURAN ORDER

| Exchange | Komponen | Implementasi | Beda dari Lighter? |
|---|---|---|---|
| Lighter | Size | `amountPerOrder.div(currentPrice)` — Decimal, **tanpa rounding** | **REFERENSI** |
| Lighter | Minimum check | Market orders exempt dari min_base/min_quote per Lighter docs | **REFERENSI** |
| Extended | Size | `rawSize.div(currentPrice)` → `roundToStepSize(rawSize, stepSize)` | Ya — dibulatkan ke stepSize |
| Extended | Minimum check | Tidak ada cek eksplisit | Tidak ada beda signifikan |
| Ethereal | Size | `rawSize.div(currentPrice)` → `roundToStepStr(rawSize, productInfo.lotSize, sizeDecimals)` | Ya — dibulatkan ke lotSize |
| Ethereal | Minimum check | `size.toNumber() < productInfo.minOrderSize` — line 707, skip jika terlalu kecil | ⚠️ Ya — lebih ketat; Lighter tidak cek per-DCA-tick |

---

## DCA — HARGA ORDER & MARKET TYPE

| Exchange | Komponen | Implementasi | Beda dari Lighter? |
|---|---|---|---|
| Lighter | Market | 5% slippage buffer, orderType=MarketOrder IOC | **REFERENSI** |
| Lighter | Limit | `currentPrice ± limitPriceOffset`, GTT/PostOnly | **REFERENSI** |
| Extended | Market | 0.75% buffer via `calcMarketOrderPrice()`, IOC | Ya — buffer lebih kecil |
| Extended | Limit | `currentPrice ± offset`, rounded ke tickSize, GTT | Ya |
| Ethereal | Market | `price = "0"`, native MARKET type | Ya — tidak ada buffer |
| Ethereal | Limit | `currentPrice ± offset`, rounded via `roundToTickStr` | Ya |

---

## DCA — TAKE PROFIT / STOP LOSS

| Exchange | Komponen | Implementasi | Beda dari Lighter? |
|---|---|---|---|
| Lighter | SL/TP di DCA | **Tidak ada** — SL/TP hanya di grid check | **REFERENSI** |
| Extended | SL/TP di DCA | **Tidak ada** | Tidak ada |
| Ethereal | SL/TP di DCA | **Tidak ada** | Tidak ada |

---

## DCA — STATS UPDATE

| Exchange | Komponen | Implementasi | Beda dari Lighter? |
|---|---|---|---|
| Lighter | Stats update | Di `pollPendingTrades()` saat txStatus=2 — **tidak langsung** | **REFERENSI** |
| Extended | Stats update | Langsung saat IOC response diterima | Ya |
| Ethereal | Stats update | Langsung jika `immediatelyFilled`; polling 1 menit jika pending | Ya |

---

## DCA — WS vs POLLING FILL DETECTION

| Exchange | Komponen | Implementasi | Beda dari Lighter? |
|---|---|---|---|
| Lighter | Fill detection | `pollPendingTrades()` setiap 5 detik, cek `txStatus=2` dari Lighter indexer | **REFERENSI** |
| Extended | Fill detection | WS account event (ORDER/TRADE) + REST polling fallback setiap 30 menit | Ya — WS lebih cepat; REST sebagai backup |
| Ethereal | Fill detection | `pollPendingEtherealTrades()` setiap 1 menit via `/v1/order/fill` endpoint | Ya — polling 1 menit (lebih lambat dari Lighter 5 detik) |

---

---

## TEMUAN BUG

---

### ⚠️ BUG #1 — Missing clamp pada formula level grid Ethereal

**File:** `artifacts/api-server/src/lib/ethereal/etherealBotEngine.ts`
**Baris:** 601

**Kode bermasalah:**
```ts
const currentLevel = Math.floor((currentPriceNum - lowerPrice) / gridSize);
```

**Referensi Lighter (benar):**
```ts
const currentLevel = Math.min(
  Math.floor(currentPrice.sub(lower).div(gridSpacing).toNumber()),
  levels - 1
);
```

**Dampak:** Jika harga tepat di `upperPrice` (atau sangat dekat dari atas karena floating point), `currentLevel` bisa sama dengan `gridLevels` (bukan `gridLevels - 1`). Crossing detection kemudian menghitung `levelDelta = gridLevels - lastLevel`, memicu order dengan count yang jauh lebih besar dari yang seharusnya. Dalam skenario ekstrem (harga turun tajam dari tepat di upper bound), bisa memicu burst order sebesar seluruh jumlah level sekaligus. **Dampak finansial: order lebih banyak dari yang dikonfigurasikan user.**

---

### ⚠️ BUG #2 — Mode long/short Ethereal mengabaikan arah crossing

**File:** `artifacts/api-server/src/lib/ethereal/etherealBotEngine.ts`
**Baris:** 628–634

**Kode bermasalah:**
```ts
if (mode === "neutral") {
  orderSide = levelDelta > 0 ? "sell" : "buy";
} else if (mode === "long") {
  orderSide = "buy";   // tidak cek arah
} else if (mode === "short") {
  orderSide = "sell";  // tidak cek arah
}
```

**Referensi Lighter (benar):**
```ts
if (direction === "down" && (mode === "neutral" || mode === "long")) side = "buy";
else if (direction === "up" && (mode === "neutral" || mode === "short")) side = "sell";
```

**Dampak:**
- **Mode long:** Saat harga naik melewati level (up-cross), bot **tetap BUY** — membeli di harga lebih tinggi, berlawanan dengan tujuan akumulasi. User mode long berharap hanya BUY saat harga turun.
- **Mode short:** Saat harga turun melewati level (down-cross), bot **tetap SELL** — menjual di harga lebih rendah, berlawanan dengan intent. **Dampak finansial langsung: user bisa membeli di harga tinggi atau menjual di harga rendah secara tidak sengaja sesuai mode yang dipilih.**

---

### ⚠️ BUG #3 — Tidak ada auto-rerange pada Ethereal grid

**File:** `artifacts/api-server/src/lib/ethereal/etherealBotEngine.ts`
**Baris:** 593–598

**Kode bermasalah:**
```ts
if (currentPriceNum < lowerPrice || currentPriceNum > upperPrice) {
  await ethAddLog(userId, strategy.id, strategy.name, "info",
    `Harga $${currentPrice.toFixed(2)} di luar range [$${lowerPrice}–$${upperPrice}] — menunggu`,
  );
  return;
}
```

**Referensi Lighter (benar):** `handleAutoRerange()` dipanggil — counter 5 tick, cooldown 2 jam, daily limit, AI suggest range baru, Telegram konfirmasi, pending state di DB, timeout 20 menit.

**Dampak:** Bot Ethereal yang keluar range **berhenti selamanya tanpa pemberitahuan apapun** kecuali log info yang tidak ada notifikasi Telegram. User tidak tahu bot sudah "diam". Tidak ada counter, tidak ada AI rerange, tidak ada konfirmasi. Bot bisa idle berhari-hari tanpa user sadar. **Dampak finansial: zero trade saat range terlewat, opportunity cost tidak terdeteksi.**

---

### ⚠️ BUG #4 — Tidak ada Telegram notifikasi saat SL/TP triggered di Ethereal

**File:** `artifacts/api-server/src/lib/ethereal/etherealBotEngine.ts`
**Baris:** 577–590

**Kode bermasalah:**
```ts
if (config.stopLoss && currentPriceNum <= config.stopLoss) {
  await ethAddLog(userId, strategy.id, strategy.name, "warn",
    `Stop Loss triggered! Harga: $${currentPrice.toFixed(2)} ≤ SL: $${config.stopLoss}`
  );
  await stopEtherealBot(strategy.id);
  return;
}
```

**Referensi Lighter (benar):** Setelah log, Lighter memanggil `getNotificationConfig()` dan `notifyUser()` dengan pesan Telegram.

**Dampak:** User yang mengandalkan notifikasi Telegram untuk SL/TP Ethereal tidak akan menerima apapun. Bot berhenti diam-diam. **Dampak: user tidak tahu posisi sudah di-stop-loss secara otomatis.**

---

### ⚠️ BUG #5 — Plain JS number arithmetic di grid Ethereal (precision risk)

**File:** `artifacts/api-server/src/lib/ethereal/etherealBotEngine.ts`
**Baris:** 572–574, 601

**Kode bermasalah:**
```ts
const priceRange = upperPrice - lowerPrice;   // plain JS
const gridSize = priceRange / gridLevels;     // plain JS
const currentPriceNum = currentPrice.toNumber();
const currentLevel = Math.floor((currentPriceNum - lowerPrice) / gridSize);
```

**Referensi Lighter/Extended (benar):** Semua kalkulasi grid menggunakan `Decimal.js` untuk presisi arbitrari.

**Dampak:** Pada market dengan harga besar (BTC: $70,000+) atau banyak level (50+), floating point rounding bisa menyebabkan `currentLevel` off-by-one. Misalnya harga tepat di batas level bisa dihitung masuk ke level yang salah, memicu crossing palsu. **Dampak: order yang tidak seharusnya terjadi terpicu.**
