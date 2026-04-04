# Bug & Technical Debt Tracker

> Last updated: 2026-04-04
> Status: Temuan dari audit sesi ini — belum ada yang di-fix.

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

## [TODO-001] Ethereal Testnet — `verifyingContract` Belum Dikonfirmasi

**Severity:** LOW (testnet only, tidak mempengaruhi mainnet)  
**File:** `artifacts/api-server/src/lib/ethereal/etherealSigner.ts` baris 27-29

**Masalah:**  
Address `verifyingContract` untuk EIP-712 domain di testnet masih hardcoded `0x000...000`. Signing testnet akan menghasilkan signature yang invalid.

**Action item:**  
Fetch dari `GET https://api.etherealtest.net/v1/rpc/config` sebelum aktifkan testnet. Lihat scratchpad untuk detail.

---

## [TODO-002] Ethereal MARKET Order — `price` di EIP-712 Belum Dikonfirmasi

**Severity:** MEDIUM (bisa mempengaruhi mainnet jika market order dipakai)  
**File:** `artifacts/api-server/src/lib/ethereal/etherealSigner.ts` baris 39-45

**Masalah:**  
Untuk MARKET order, nilai `price` yang dimasukkan ke EIP-712 belum dikonfirmasi dari docs resmi. Saat ini pakai slippage price sebagai workaround.

**Action item:**  
Konfirmasi dari Ethereal docs atau support — apakah market order butuh `price = 0`, `price = slippage`, atau tidak perlu field price sama sekali.

---

## [TODO-003] Ethereal CancelOrder — EIP-712 Format Belum Dikonfirmasi

**Severity:** MEDIUM — Cancel order bisa broken  
**File:** `artifacts/api-server/src/lib/ethereal/etherealApi.ts` baris 258-260, 443-444

**Masalah:**  
EIP-712 untuk CancelOrder memiliki tipe `orderIds: bytes32[]` tapi REST body menerima UUID strings. Format konversi yang tepat belum dikonfirmasi.

**Action item:**  
Test cancel order di testnet dan verifikasi apakah UUID perlu di-encode ke bytes32 sebelum signing.

---

## [TODO-004] Ethereal WebSocket Testnet — URL Tidak Terdokumentasi

**Severity:** LOW (testnet only)  
**File:** `artifacts/api-server/src/lib/ethereal/etherealWs.ts` baris 10

**Masalah:**  
URL WebSocket untuk testnet Ethereal belum terdokumentasi di referensi yang tersedia. Koneksi testnet WS tidak bisa dibuat.

**Action item:**  
Cek Ethereal Discord/GitHub atau tanya support untuk URL WS testnet.

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

## Status Fix

| ID | Status | Priority |
|----|--------|----------|
| BUG-001 | ✅ Fixed (2026-04-04) | HIGH |
| BUG-002 | ⏳ Belum | MEDIUM |
| BUG-003 | ⏳ Belum | MEDIUM |
| TODO-001 | ⏳ Belum | LOW |
| TODO-002 | ⏳ Belum | MEDIUM |
| TODO-003 | ⏳ Belum | MEDIUM |
| TODO-004 | ⏳ Belum | LOW |
