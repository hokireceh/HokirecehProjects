# Error Log — Pre-existing Issues (Bukan Pelaku Baru)

> Dicatat: 2026-04-05  
> File ini berisi error TypeScript pre-existing yang ditemukan saat menjalankan `pnpm run typecheck` di `artifacts/api-server`. Error ini **bukan** diintroduksi oleh perubahan terbaru — sudah ada sebelumnya di codebase.

> **Run terbaru (2026-04-05 — IMPROVE-003 notification template centralization):**  
> `pnpm run typecheck` → **✅ 0 error** — semua formatter functions di telegramBot.ts + engine imports + call site replacements typecheck clean. Tidak ada error baru ditemukan.

---

## [ERR-TS-001] TS7006 Implicit `any` — `etherealBotEngine.ts`

**File:** `artifacts/api-server/src/lib/ethereal/etherealBotEngine.ts`  
**Severity:** MEDIUM — Type safety hilang, runtime risk jika shape object berubah  

**Error:**
```
Line 1060: Parameter 't' implicitly has an 'any' type.
Line 1069: Parameter 't' implicitly has an 'any' type.
Line 1069: Parameter 'id' implicitly has an 'any' type.
```

**Konteks:**  
Callback `.filter()` dan `.map()` pada array `pendingTrades` tidak memiliki type annotation. TypeScript tidak bisa meng-infer tipe karena sumber array bertipe `unknown` atau broad type.

**Contoh (sekitar baris 1060):**
```ts
(t) => t.orderHash?.startsWith("eth_") && !t.orderHash?.startsWith("eth_paper_")
// TS tidak tahu tipe 't'
```

**Fix yang diperlukan:**  
Annotasi parameter callback dengan tipe yang sesuai (misal `TradeRow` atau tipe dari schema drizzle).

---

## [ERR-TS-002] TS2345 `unknown` Not Assignable to `number` — `etherealBotEngine.ts`

**File:** `artifacts/api-server/src/lib/ethereal/etherealBotEngine.ts`  
**Severity:** HIGH — Bisa menyebabkan runtime error jika `uid` ternyata bukan number  

**Error:**
```
Line 1075: Argument of type 'unknown' is not assignable to parameter of type 'number'.
Line 1076: Argument of type 'unknown' is not assignable to parameter of type 'number'.
```

**Konteks:**
```ts
const c = await getEtherealConfig(uid).catch(() => null);  // uid: unknown
credsByUserId.set(uid, c?.hasCredentials ? c : null);     // uid: unknown
```

`uid` di-extract dari `.map((t) => t.userId)` yang bertipe `unknown[]` akibat ERR-TS-001.

**Fix yang diperlukan:**  
Perbaiki ERR-TS-001 terlebih dahulu, atau tambahkan explicit cast/guard: `const uid = id as number`.

---

## [ERR-TS-003] TS7006 Implicit `any` — `extendedBotEngine.ts`

**File:** `artifacts/api-server/src/lib/extended/extendedBotEngine.ts`  
**Severity:** MEDIUM  

**Error:**
```
Line 1649: Parameter 't' implicitly has an 'any' type.
```

**Konteks:**
```ts
const extPendingTrades = pendingTrades.filter(t =>
  // t tidak memiliki type annotation
```

**Fix yang diperlukan:**  
Annotasi parameter dengan tipe trade yang sesuai.

---

## [ERR-TS-004] TS7006 Implicit `any` — `routes/lighter/bot.ts`

**File:** `artifacts/api-server/src/routes/lighter/bot.ts`  
**Severity:** LOW  

**Error:**
```
Line 257: Parameter 'l' implicitly has an 'any' type.
```

**Konteks:**
```ts
logs: logs.map((l) => ({
  // l tidak memiliki type annotation
```

**Fix yang diperlukan:**  
Annotasi `l` dengan tipe `BotLog` atau schema type dari drizzle.

---

## [ERR-TS-005] TS7006 Implicit `any` — `routes/trades.ts`

**File:** `artifacts/api-server/src/routes/trades.ts`  
**Severity:** LOW  

**Error:**
```
Line 25: Parameter 't' implicitly has an 'any' type.
```

**Konteks:**
```ts
trades: trades.map((t) => ({
  // t tidak memiliki type annotation
```

**Fix yang diperlukan:**  
Annotasi `t` dengan tipe `Trade` dari schema drizzle.

---

## Catatan Tambahan

- Semua error TS7006 dan TS2345 di atas **tidak muncul saat build** (esbuild/bun bundler tidak enforce TypeScript strictness saat bundle), tapi muncul saat `tsc --noEmit` / typecheck.
- Error TS6305 (`db dist not built`) bukan code error — hanya kondisi environment (perlu `tsc -p lib/db/tsconfig.json` sebelum typecheck api-server). Sudah di-handle sebagai bagian dari build workflow.
