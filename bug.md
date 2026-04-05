# Bug & Technical Debt Tracker

> Last updated: 2026-04-05
> Status: 2 bug kritis Ethereal di-fix (2026-04-05). BUG-ETH-005 + 3 DESIGN issues (DESIGN-002, 004, 005) di-fix di sesi yang sama. DESIGN-003 di-fix di sesi selanjutnya (badge status Lighter).

---

## [BUG-001] JSONB Columns Tanpa Type — Silent Zero Order Amount

**Severity:** HIGH — Risiko produksi nyata  
**File:** `lib/db/src/schema/strategies.ts` baris 14-15  
**Dampak:** `lighterBotEngine.ts`, `extendedBotEngine.ts`, `autoRerange.ts` (6 lokasi)

**Masalah:**  
`gridConfig` dan `dcaConfig` dideklarasikan sebagai raw `jsonb()` tanpa `.$type<T>()`.  
TypeScript menganggap nilainya `unknown`, sehingga semua bot engine terpaksa pakai `as any`:

```ts
// 6x muncul di 3 engine berbeda
const amount = (strategy.gridConfig as any)?.amountPerGrid ?? 0;
const amount = (strategy.dcaConfig as any)?.amountPerOrder ?? 0;
```

**Risiko:** Kalau nama field typo atau struktur berubah, bot silently eksekusi order dengan `amount = 0` — tanpa error, tanpa log warning. Order size nol akan gagal di sisi exchange atau tidak pernah terisi.

**Fix yang diperlukan:**  
Tambah `.$type<T>()` ke kolom JSONB di `strategies.ts`:

```ts
export type DcaConfig  = { amountPerOrder: number; [k: string]: unknown };
export type GridConfig = { amountPerGrid: number; upperPrice: number; lowerPrice: number; gridCount: number; [k: string]: unknown };

dcaConfig:  jsonb("dca_config").$type<DcaConfig>(),
gridConfig: jsonb("grid_config").$type<GridConfig>(),
```

Setelah ini, semua `as any` di bot engines bisa dihapus dan TypeScript akan enforce structure-nya.

---

## [BUG-002] `router.use(authMiddleware as any)` — 7 File Route

**Severity:** MEDIUM — Type safety hilang di layer auth  
**File:** Semua file di `artifacts/api-server/src/routes/`

```
routes/lighter/bot.ts:16
routes/lighter/history.ts:13
routes/extended/bot.ts:20
routes/ethereal/bot.ts:30
routes/config.ts:14
routes/trades.ts:8
routes/ai.ts:13
routes/index.ts:25  (adminMiddleware)
```

**Masalah:**  
`authMiddleware` ditulis dengan signature `(req: AuthRequest, ...)` tapi Express `router.use()` expect `RequestHandler` dengan plain `Request`. Diakali dengan `as any` — kalau middleware ini pecah, TypeScript tidak akan kasih warning apapun di caller-nya.

**Fix yang diperlukan:**  
Ubah signature `authMiddleware` di `auth.ts` jadi `RequestHandler` standard:

```ts
// Sekarang:
export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) { ... }

// Seharusnya:
export const authMiddleware: RequestHandler = async (req, res, next) => {
  const authReq = req as AuthRequest;
  // ... gunakan authReq di dalam
};
```

Lalu hapus semua `as any` di route files.

---

## [BUG-003] Extended API — Field Name Guessing (Defensive Code Berbahaya)

**Severity:** MEDIUM — Signing bisa pakai nilai `null` secara diam-diam  
**File:** `artifacts/api-server/src/lib/extended/extendedBotEngine.ts` baris 1371, 1434

**Masalah:**  
Kode mencoba beberapa nama field berbeda karena dokumentasi API tidak konsisten:

```ts
// baris 1371 — mencoba 3 nama field untuk starkKey
accountDetails.l2Key ?? (accountDetails as any).starkKey ?? (accountDetails as any).stark_key ?? null

// baris 1434 — mencoba 2 nama field untuk l2Vault
(accountDetails as any).l2Vault ?? (accountDetails as any).l2_vault ?? null
```

**Risiko:** Kalau API Exchange berubah ke nama field ke-4, semua signing akan menggunakan `null` sebagai starkKey/l2Vault. Order akan dikirim dengan signature yang salah, tanpa error eksplisit di log.

**Fix yang diperlukan:**  
- Konfirmasi satu nama field resmi dari Extended API docs terbaru.  
- Tambah assertion eksplisit — jika field tidak ditemukan, throw error daripada fallback ke `null`.
- Log warning jika harus pakai fallback field.

---

## [TODO-001] ~~Ethereal Testnet — `verifyingContract` Belum Dikonfirmasi~~ — N/A

**Status:** N/A — testnet tidak dipakai  
**Severity:** LOW (testnet only, tidak mempengaruhi mainnet)  
**File:** `artifacts/api-server/src/lib/ethereal/etherealSigner.ts` baris 27-29

**Masalah:**  
Address `verifyingContract` untuk EIP-712 domain di testnet masih hardcoded `0x000...000`. Signing testnet akan menghasilkan signature yang invalid.

**Resolution:**  
Testnet tidak digunakan — item ini tidak relevan dan tidak perlu di-fix.

---

## [TODO-002] ~~Ethereal MARKET Order — `price` di EIP-712 Belum Dikonfirmasi~~ — RESOLVED

**Status:** ✅ RESOLVED — `price = 0n` dikonfirmasi dari OpenAPI spec  
**Severity:** MEDIUM (bisa mempengaruhi mainnet jika market order dipakai)  
**File:** `artifacts/api-server/src/lib/ethereal/etherealSigner.ts` baris 39-45

**Masalah:**  
Untuk MARKET order, nilai `price` yang dimasukkan ke EIP-712 belum dikonfirmasi dari docs resmi. Saat ini pakai slippage price sebagai workaround.

**Resolution:**  
`price = 0n` dikonfirmasi dari OpenAPI spec Ethereal — implementasi saat ini sudah benar.

---

## [TODO-003] ~~Ethereal CancelOrder — EIP-712 Format Belum Dikonfirmasi~~ — RESOLVED

**Status:** ✅ RESOLVED — `uuidToBytes32()` sudah diimplementasi  
**Severity:** MEDIUM — Cancel order bisa broken  
**File:** `artifacts/api-server/src/lib/ethereal/etherealApi.ts` baris 258-260, 443-444

**Masalah:**  
EIP-712 untuk CancelOrder memiliki tipe `orderIds: bytes32[]` tapi REST body menerima UUID strings. Format konversi yang tepat belum dikonfirmasi.

**Resolution:**  
`uuidToBytes32()` sudah diimplementasi dan dipakai — konversi UUID → bytes32 untuk signing sudah benar.

---

## [TODO-004] ~~Ethereal WebSocket Testnet — URL Tidak Terdokumentasi~~ — N/A

**Status:** N/A — testnet tidak dipakai  
**Severity:** LOW (testnet only)  
**File:** `artifacts/api-server/src/lib/ethereal/etherealWs.ts` baris 10

**Masalah:**  
URL WebSocket untuk testnet Ethereal belum terdokumentasi di referensi yang tersedia. Koneksi testnet WS tidak bisa dibuat.

**Resolution:**  
Testnet tidak digunakan — item ini tidak relevan dan tidak perlu di-fix.

---

## [INFO] `as any` yang Legitimate (Tidak Perlu Diubah)

Berikut `as any` yang sudah dikonfirmasi memang diperlukan dan tidak berbahaya:

| Lokasi | Alasan |
|--------|--------|
| `etherealSigner.ts` — `domain as any` (3x) | ethers.js `signTypedData` tidak menerima union domain type |
| `extendedWs.ts` — `ws as any` untuk ping/pong (3x) | Node.js WebSocket events tidak typed di standard types |
| `extendedWs.ts:435` — `@ts-ignore` | Node.js ≥21 WebSocket options belum di-typing di `@types/node` |
| `auth.ts:19` — `(req as any).cookies` | `cookie-parser` tidak augment Express `Request` secara otomatis |
| `index.ts:136` — `(db as any).$client` | Internal Drizzle client tidak diekspos di public type |
| `extendedSigner.ts:393` — `sigHex as any` | `starknet.js` ec.starkCurve.verify menerima `string` tapi typed sebagai `Uint8Array` |

---

## [BUG-ETH-001] `stopEtherealBot` — `db.update()` Tanpa `.set()` (Duplicate Broken Line)

**Status:** ✅ Fixed (2026-04-05)
**Severity:** KRITIS — Bot tidak bisa stop di DB, restart server akan restore semua bot yang seharusnya sudah berhenti
**File:** `artifacts/api-server/src/lib/ethereal/etherealBotEngine.ts` baris 981 (sebelum fix)

**Masalah:**
Terdapat dua baris `await db.update(strategiesTable)` yang berurutan. Baris pertama tidak punya `.set()`:

```ts
// SEBELUM (broken):
await db.update(strategiesTable)         // ← BROKEN: tanpa .set(), SQL error
if (!skipDbUpdate) await db.update(strategiesTable)
  .set({ isRunning: false, ... })
  .where(eq(strategiesTable.id, strategyId));
```

JavaScript ASI menyisipkan semicolon setelah baris pertama → `db.update(tableName)` tanpa `.set()` dieksekusi, menyebabkan Drizzle error atau SQL syntax error. Setiap pemanggilan `stopEtherealBot` (stop manual, stop loss, take profit, rerange timeout) akan throw exception → `isRunning` tetap `true` di DB.

**Fix:**
Hapus baris pertama yang broken. Hanya conditional block yang valid yang dipertahankan:

```ts
// SESUDAH (fixed):
if (!skipDbUpdate) await db.update(strategiesTable)
  .set({ isRunning: false, updatedAt: new Date(), nextRunAt: null })
  .where(eq(strategiesTable.id, strategyId));
```

---

## [BUG-ETH-002] `pollPendingEtherealTrades` — Order Timeout Tidak Di-Cancel On-Chain

**Status:** ✅ Fixed (2026-04-05)
**Severity:** KRITIS — Ghost order tetap terbuka di exchange, bisa fill diam-diam tanpa tercatat di DB
**File:** `artifacts/api-server/src/lib/ethereal/etherealBotEngine.ts` — blok `else if (ageMs > ETH_TRADE_TIMEOUT_MS)`

**Masalah:**
Ketika LIMIT order melewati timeout 30 menit tanpa fill terdeteksi, kode langsung mark trade sebagai `"failed"` di DB tanpa memanggil `cancelOrder`. Order tetap hidup di Ethereal dan bisa terisi kapan saja saat harga kembali ke level tersebut — mengubah posisi user secara tersembunyi tanpa tercatat.

**Fix:**
Tambah blok `try/catch` sebelum mark failed: panggil `signCancelOrder` + `cancelOrder` menggunakan top-level imports yang sudah ada. Jika cancel gagal, error di-log tapi flow tetap mark `"failed"` (fail-safe):

```ts
try {
  const cancelNonce = generateNonce();
  const cancelSignedAt = generateSignedAt();
  const cancelSig = await signCancelOrder(creds.privateKey, { ... }, creds.network);
  await cancelOrder({ data: { ... }, signature: cancelSig }, creds.network);
  logger.info(..., "[EtherealBot] Poll: order cancelled on-chain before timeout mark");
} catch (cancelErr) {
  logger.error(..., "[EtherealBot] Poll: cancelOrder gagal — tetap mark failed");
}
// baru mark failed di DB
await db.update(tradesTable).set({ status: "failed", ... })
```

---

## [BUG-ETH-003] AI Auto-fill Tidak Mengisi Harga Bawah dan Harga Atas di Form Strategi Ethereal

**Status:** ✅ Fixed (2026-04-05)
**Severity:** MEDIUM — Field harga tetap 0, user harus isi manual setelah AI fill
**File:** `artifacts/api-server/src/lib/groqAI.ts`

**Gejala:**
Setelah klik "Isi Otomatis Parameter (AI)", field **Harga Bawah** dan **Harga Atas** tetap bernilai `0`. Field lain (Level Grid, Jumlah per Grid, Mode Grid, Tipe Order, Limit Price Offset) terisi dengan benar dari respons AI.

**Root cause (2 lapisan, keduanya di groqAI.ts):**

Layer 1 — `ETHEREAL_SYSTEM_PROMPT` (baris ~204): `grid_params` hanya ditulis `{...}|null` tanpa field spec. Lighter dan Extended prompt sudah mendefinisikan semua field secara eksplisit. Karena field tidak dispesifikasikan, AI mengembalikan `lowerPrice: 0` dan `upperPrice: 0` sebagai default numerik.

Layer 2 — `analyzeMarketForStrategy` (baris ~414–415): Fallback pakai `??` (nullish coalescing), yang tidak menangkap nilai `0`. Sehingga `0 ?? market.lastPrice * 0.95` = `0` — fallback tidak aktif.

**Fix (hanya groqAI.ts):**

FIX 1 — Tambah field spec lengkap ke `ETHEREAL_SYSTEM_PROMPT` (sama persis dengan Lighter/Extended).

FIX 2 — Ganti `??` dengan `||` untuk `lowerPrice` dan `upperPrice` di grid_params parsing, sehingga nilai `0` akan trigger fallback ke `market.lastPrice * 0.95/1.05`.

---

## [NAV-001] Mobile Navigasi — Ethereal Tidak Ada di Menu "Lainnya"

**Status:** ✅ Fixed (2026-04-05)  
**Severity:** LOW — UI only, tidak mempengaruhi fungsi trading  
**File:** `artifacts/HK-Projects/src/components/layout/AppLayout.tsx` baris 119–123

**Masalah:**  
Menu "Lainnya" di bottom navigation mobile tidak mencantumkan link ke `/ethereal`. Pengguna mobile tidak bisa berpindah ke halaman Strategi Ethereal tanpa mengetik URL manual.

**Fix:**  
Tambah satu entry ke `moreItems`:
```ts
{ href: "/ethereal", label: "Strategi Ethereal", icon: Zap },
```
Icon `Zap` sudah di-import. Tidak ada perubahan lain yang diperlukan.

---

## [BUG-ETH-004] Market Dropdown Stuck "Memuat market..." di Modal Buat Strategi

**Status:** ✅ Fixed (2026-04-05) — Fix A applied (rate limiter dinaikkan)  
**Severity:** HIGH — blocker UX: user tidak bisa buat strategi Ethereal sama sekali  
**File:** `artifacts/HK-Projects/src/pages/EtherealStrategies.tsx` (fetch logic) + `artifacts/api-server/src/app.ts` (rate limiter)

---

### Temuan Audit

**1. Kapan markets di-fetch?**

`markets` di-fetch **saat halaman load**, bukan saat modal dibuka. Flow:
```
useEffect → loadAll() → Promise.all([apiFetch("/"), apiFetch("/markets")])
                                                            ↓
                                              setMarkets(mks ?? [])
```
`markets` kemudian dipass sebagai prop ke `EthCreateModal`:
```tsx
<EthCreateModal markets={markets} />   // EtherealStrategies.tsx baris 1221-1226
```
Modal tidak punya fetch sendiri. Jika `markets.length === 0`, dropdown menampilkan spinner + "Memuat market..." (baris 234–238).

**Tidak ada retry**: 10-second interval hanya poll `/` (strategies), bukan `/markets`.

---

**2. Endpoint `/markets` — ada dan berfungsi?**

✅ Endpoint ada di `artifacts/api-server/src/routes/ethereal/bot.ts` baris 89.  
✅ Endpoint berfungsi normal — log server menunjukkan:
```
[EtherealMarkets] Products cached — count: 15, network: "mainnet"
GET /api/ethereal/strategies/markets → 200 (576ms)
```
Ketika berhasil, endpoint mengembalikan 15 market Ethereal mainnet.

---

**3. Root cause: HTTP 429 dari server's own rate limiter**

`app.ts` baris 64–71:
```ts
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 menit
  limit: 200,                  // 200 request per 15 menit per IP
  ...
});
app.use("/api", apiLimiter);   // baris 104 — semua /api/* kena limiter ini
```

Log server **konfirmasi 429 pada saat `/markets` di-fetch saat page load**:
```
GET /api/ethereal/strategies/markets → 429   (req id 555, 04:31:49)
GET /api/ethereal/strategies/credentials → 429   (req id 557, 04:31:49)
```

Limit 200 req/15min = ~13 req/menit = ~1 req/4.5 detik. Terlalu ketat karena ada **banyak polling interval aktif sekaligus** dari berbagai halaman:
- `/api/ethereal/strategies/` — setiap 10 detik
- `/api/ethereal/strategies/logs/recent` — setiap 5 detik
- `/api/extended/strategies/logs/recent` — setiap 5 detik
- `/api/bot/logs` — setiap 5 detik
- Plus: `/api/auth/me`, `/api/config`, `/api/ethereal/strategies/account`

Dalam 15 menit dengan semua halaman aktif → 200 request habis dalam beberapa menit.

---

**4. Root cause chain lengkap**

```
Page load
  → loadAll()
  → Promise.all(["/", "/markets"])
  → /markets kena rate limit → HTTP 429 → apiFetch() throws
  → Promise.all reject
  → catch { // ignore }   ← ERROR DITELAN, TIDAK ADA RETRY, TIDAK ADA TOAST
  → setMarkets([]) tidak pernah dipanggil
  → markets tetap []
  → modal buka → markets.length === 0 → "Memuat market..."
  → tidak ada auto-recovery (interval hanya poll strategies)
  → stuck selamanya sampai hard-refresh
```

---

**5. Ada 2 root cause independen:**

| # | Root Cause | Lokasi |
|---|---|---|
| A | Rate limiter terlalu ketat (200/15min) untuk app dengan banyak polling | `app.ts` baris 64 |
| B | Error `/markets` ditelan diam-diam tanpa retry/toast/recovery | `EtherealStrategies.tsx` baris 1057 |

Keduanya harus difix agar bug tidak muncul lagi:
- Fix A saja: rate limit longgar → `/markets` berhasil saat page load → selesai untuk skenario normal
- Fix B saja: recovery setelah 429 → tapi rate limit tetap bisa memukul endpoint lain
- Fix A + B: solusi proper

---

**Opsi fix (belum diapply — menunggu konfirmasi):**

- **Fix A** — Naikkan `apiLimiter.limit` dari 200 → 1000 (atau lebih) di `app.ts` (hanya 1 baris)
- **Fix B** — Di `loadAll()`, pisahkan `/markets` dari `Promise.all`, tangkap error-nya sendiri dengan retry/toast
- **Fix C** — Di `EthCreateModal`, jika `open=true` dan `markets.length === 0`, fetch markets langsung dari modal (tidak bergantung pada page-level state)

---

## [BUG-ETH-005] Settings Ethereal — Subaccount ID Tidak Sync + Tombol Reset Tidak Ada di Semua DEX

**Status:** ✅ Fixed (2026-04-05)  
**Severity:** MEDIUM — UX rusak: field tidak update setelah save; user tidak bisa clear credentials  
**File:** `artifacts/HK-Projects/src/pages/Settings.tsx`, `artifacts/api-server/src/routes/configService.ts`, `artifacts/api-server/src/routes/lighter/bot.ts`, `artifacts/api-server/src/routes/extended/bot.ts`

**Masalah (3 lapisan):**

**1 — Subaccount ID tidak update setelah save (frontend)**  
Setelah `handleSave` Ethereal berhasil, `setCreds(updated)` dipanggil tapi `setSubaccountId(updated.subaccountId)` tidak dipanggil. Field Subaccount ID tetap menampilkan nilai lama meski backend sudah menyimpan nilai baru yang di-auto-fetch dari API.

**2 — Tombol "Ambil Otomatis" Subaccount ID membingungkan (frontend)**  
Terdapat tombol "Ambil Otomatis" + state `fetchingSubId` + fungsi `handleFetchSubaccountId` yang membuat flow dua langkah padahal backend sudah auto-fetch Subaccount ID setiap kali Private Key disimpan (via `PUT /api/ethereal/strategies/credentials`). Tombol dan instruksinya menyesatkan user.

**3 — Tombol Reset tidak ada di Lighter dan Extended (frontend + backend)**  
Hanya Ethereal yang punya endpoint `DELETE /credentials`. Lighter dan Extended tidak punya endpoint maupun tombol Reset untuk menghapus credentials dari server.

**Fix yang diapply:**

| Fix | File | Perubahan |
|-----|------|-----------|
| FIX-1 | `Settings.tsx` — `handleSave` Ethereal | Tambah `setSubaccountId(updated.subaccountId ?? "")` setelah `setCreds(updated)` |
| FIX-2 | `Settings.tsx` — EtherealConfigSection | Hapus state `fetchingSubId`, fungsi `handleFetchSubaccountId`, tombol "Ambil Otomatis", import `RefreshCw`, dan teks instruksi yang menyesatkan. Deskripsi diganti: "Diambil otomatis saat menyimpan Private Key." |
| FIX-3a | `configService.ts` | Tambah `deleteExtendedCredentials()` dan `deleteLighterCredentials()` |
| FIX-3b | `lighter/bot.ts` | Tambah route `DELETE /api/bot/credentials` |
| FIX-3c | `extended/bot.ts` | Tambah route `DELETE /api/extended/strategies/credentials` |
| FIX-3d | `Settings.tsx` | Tambah tombol Reset + AlertDialog konfirmasi di ketiga section: Lighter (kiri bawah card), Extended (kiri bawah card), Ethereal (kiri tombol Simpan Ethereal) |

---

## [DESIGN-001] Lighter: Account Index Tidak Ada Tombol Deteksi Otomatis yang Eksplisit

**Severity:** LOW — UI consistency  
**File:** `artifacts/HK-Projects/src/pages/Settings.tsx`

**Baris relevan:**
- Baris 662–682: `handleLookupAccount` — fungsi yang memanggil API lookup via `GET /api/config/lookup-account?l1Address=...` dan mengisi `accountIndex` via `form.setValue`
- Baris 805–815: Tombol Search (ikon `<Search>`) di sebelah field L1 Address yang memanggil `handleLookupAccount`
- Baris 817: Teks bantuan `"Klik ikon cari untuk deteksi otomatis Account Index kamu."` — tersembunyi di bawah field L1 Address
- Baris 820–831: Field Account Index — plain `<Input>` tanpa tombol auto-derive di sampingnya

**Masalah:**  
Mekanisme auto-deteksi Account Index sudah ada (via Search icon di L1 Address), tetapi UX-nya tidak eksplisit dan tidak konsisten dengan pola Ethereal. Tombol hanya berupa ikon kaca pembesar kecil tanpa label teks, dan posisinya di field L1 Address — bukan di field Account Index yang merupakan target hasilnya. Field Account Index sendiri tidak memiliki tombol deteksi yang berdampingan langsung.

**Yang seharusnya terjadi:**  
Tombol deteksi otomatis berlabel eksplisit (mis. "Deteksi Otomatis") berada di field Account Index, atau paling tidak ada feedback visual yang jelas (mis. badge "Terdeteksi dari L1 Address") di bawah field Account Index setelah lookup berhasil. Pola ini seharusnya konsisten dengan cara Ethereal auto-fetch Subaccount ID dari Private Key.

---

## [DESIGN-002] Lighter: Header Section Tidak Punya Logo DEX dan Nama DEX Eksplisit

**Severity:** LOW — UI consistency  
**File:** `artifacts/HK-Projects/src/pages/Settings.tsx`

**Baris relevan:**
- Baris 768–774: CardTitle Lighter — menggunakan `<KeyRound>` icon + teks `"Kredensial API"` (generik)
- Baris 884–886: CardTitle Telegram — menggunakan `<Bell>` icon + `"Notifikasi Telegram"`
- Baris 164–172 (ExtendedConfigSection): CardTitle Extended — `<ExchangeLogo exchange="extended">` + `"Kredensial Extended DEX"`
- Baris 434–441 (EtherealConfigSection): CardTitle Ethereal — `<ExchangeLogo exchange="ethereal">` + `"Kredensial Ethereal DEX"`

**Masalah:**  
Section Lighter menggunakan judul generik `"Kredensial API"` dengan ikon `<KeyRound>` biasa. Extended dan Ethereal masing-masing menampilkan logo DEX (`<ExchangeLogo>`) beserta nama DEX yang eksplisit di judul (`"Kredensial Extended DEX"`, `"Kredensial Ethereal DEX"`). Lighter tidak menyebut nama "Lighter" sama sekali di header section credentials-nya.

**Yang seharusnya terjadi:**  
Header section Lighter seharusnya: `<ExchangeLogo exchange="lighter">` + `"Kredensial Lighter DEX"` — konsisten dengan Extended dan Ethereal.

---

## [DESIGN-003] Lighter: Tidak Ada Badge Status Credential

**Status:** ✅ Fixed (2026-04-05)  
**Severity:** LOW — UI consistency  
**File:** `artifacts/HK-Projects/src/pages/Settings.tsx`

**Baris relevan:**
- Baris 778–785: Lighter hanya punya banner kondisional `"Brankas Aman"` saat `config?.hasPrivateKey === true` — tidak ada badge chip status
- Baris 180–196 (ExtendedConfigSection): Extended punya badge chip: `"API Key belum diset"`, `"Stark Private Key belum diset"`, `"Account ID belum diset"` — selalu ditampilkan, berubah warna hijau saat field sudah diset
- Baris 451–466 (EtherealConfigSection): Ethereal punya badge chip: `"Private Key belum diset"`, `"Subaccount ID belum diset"` — selalu ditampilkan, berubah warna hijau saat sudah diset

**Masalah:**  
Lighter tidak memiliki badge status credential di bagian atas form. Extended dan Ethereal menampilkan badge per-field yang selalu visible, sehingga user bisa langsung melihat status credential apa saja yang sudah diset tanpa harus scroll atau mengisi form. Lighter hanya menampilkan banner "Brankas Aman" (hanya muncul jika `hasPrivateKey = true`) yang tidak memberi informasi lengkap tentang status tiap field.

**Fix yang diapply:**  
Tambah blok badge di `<CardContent>` Lighter, tepat sebelum banner "Brankas Aman":
```tsx
<div className="flex flex-wrap gap-3 mb-2">
  {[
    { label: "Private Key", ok: !!config?.hasPrivateKey },
    { label: "Account Index", ok: config?.accountIndex != null },
  ].map(({ label, ok }) => (
    <div key={label} className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${ok ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-muted/50 border-border text-muted-foreground"}`}>
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <Zap className="w-3 h-3 opacity-50" />}
      {label} {ok ? "✓" : "belum diset"}
    </div>
  ))}
</div>
```
Menggunakan `config?.hasPrivateKey` dan `config?.accountIndex` dari `useGetBotConfig()` yang sudah ada — tidak ada perubahan backend.

---

## [DESIGN-004] Tombol Simpan Tidak Konsisten Antar DEX Section

**Severity:** LOW — UI consistency  
**File:** `artifacts/HK-Projects/src/pages/Settings.tsx`

**Baris relevan:**
- Baris 526–534: Ethereal punya tombol `"Simpan Ethereal"` sendiri di dalam card — `type="button"`, memanggil `handleSave()` langsung
- Baris 653–660: `onSubmit` (form submit handler) — memanggil `updateMutation.mutate()` untuk Lighter config + `extendedRef.current?.save()` + `etherealRef.current?.save()` (artinya Ethereal disimpan dua kali jika user klik Simpan Konfigurasi setelah sudah Simpan Ethereal)
- Baris 964–974: Tombol `"Simpan Konfigurasi"` (`type="submit"`) di bawah halaman — menyimpan Lighter + Extended + memanggil ulang `etherealRef.current?.save()`
- Baris 164–396 (ExtendedConfigSection): Extended tidak punya tombol Simpan sendiri — disimpan via `extendedRef.current?.save()` dari `onSubmit`

**Masalah:**  
Tiga DEX memiliki pola save yang berbeda-beda:
- **Ethereal**: punya tombol Simpan sendiri di dalam card + ikut tersimpan via "Simpan Konfigurasi" (double-save berpotensi)
- **Extended**: tidak punya tombol Simpan sendiri — hanya bisa disimpan via "Simpan Konfigurasi" di bawah halaman
- **Lighter**: tidak punya tombol Simpan sendiri — hanya bisa disimpan via "Simpan Konfigurasi" di bawah halaman

**Yang seharusnya terjadi:**  
Semua tiga DEX section seharusnya konsisten: masing-masing punya tombol Simpan sendiri di dalam card-nya, atau semuanya bergantung pada satu tombol global "Simpan Konfigurasi". Pola Ethereal (tombol sendiri) lebih baik dari UX standpoint karena user bisa menyimpan credentials tanpa menyentuh settings lain.

---

## [DESIGN-005] Subaccount ID Ethereal Adalah Input Field — Seharusnya Read-Only Display

**Severity:** LOW — UI consistency  
**File:** `artifacts/HK-Projects/src/pages/Settings.tsx`

**Baris relevan:**
- Baris 499–513: Field Subaccount ID Ethereal — `<Input type="text">` dengan `onChange={e => setSubaccountId(e.target.value)}` dan placeholder `"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"`, dengan teks bantuan `"Diambil otomatis saat menyimpan Private Key. Isi manual jika ingin mengganti."`
- Baris 370–394 (handleSave): saat save, `subaccountId` dari state dikirim ke backend — jika user mengetik nilai sembarang, nilai tersebut akan dikirim dan menimpa hasil auto-fetch
- Baris 362–368 (handleSave → response): setelah save, backend mengembalikan `updated.subaccountId` yang di-set kembali ke state via `setSubaccountId(updated.subaccountId ?? "")`

**Masalah:**  
Subaccount ID adalah nilai yang seharusnya **hanya** datang dari API Ethereal (auto-derive dari Private Key). Field ini bisa diedit bebas oleh user, membuka risiko user memasukkan Subaccount ID yang salah. Teks bantuan menyebut "Isi manual jika ingin mengganti" — tapi mengganti Subaccount ID secara manual akan menyebabkan mismatch dengan akun Ethereal yang terdaftar.

**Yang seharusnya terjadi:**  
Subaccount ID ditampilkan sebagai read-only display (bukan `<Input>`): tampilkan nilai yang sudah tersimpan sebagai teks monospace, atau placeholder `"Belum diset — akan diambil otomatis saat menyimpan Private Key"` jika belum ada. Jika memang ingin bisa override manual, berikan warning eksplisit bahwa perubahan manual bisa menyebabkan signing error.

---

## Status Fix

| ID | Status | Priority |
|----|--------|----------|
| BUG-001 | ✅ Fixed (2026-04-04) | HIGH |
| BUG-002 | ✅ Fixed (2026-04-04) | MEDIUM |
| BUG-003 | ✅ Fixed (2026-04-04) | MEDIUM |
| TODO-001 | N/A — testnet tidak dipakai | LOW |
| TODO-002 | ✅ Resolved — `price=0n` dari OpenAPI spec | MEDIUM |
| TODO-003 | ✅ Resolved — `uuidToBytes32()` implemented | MEDIUM |
| TODO-004 | N/A — testnet tidak dipakai | LOW |
| NAV-001 | ✅ Fixed (2026-04-05) | LOW |
| BUG-ETH-001 | ✅ Fixed (2026-04-05) | KRITIS |
| BUG-ETH-002 | ✅ Fixed (2026-04-05) | KRITIS |
| BUG-ETH-003 | ✅ Fixed (2026-04-05) | MEDIUM |
| BUG-ETH-004 | ✅ Fixed (2026-04-05) — Fix A | HIGH |
| BUG-ETH-005 | ✅ Fixed (2026-04-05) | MEDIUM |
| DESIGN-001 | ⏳ Open | LOW |
| DESIGN-002 | ✅ Fixed (2026-04-05) | LOW |
| DESIGN-003 | ✅ Fixed (2026-04-05) | LOW |
| DESIGN-004 | ✅ Fixed (2026-04-05) | LOW |
| DESIGN-005 | ✅ Fixed (2026-04-05) | LOW |
