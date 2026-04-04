# Audit: Admin Panel

> Dibuat: Apr 2026
> File: `artifacts/HK-Projects/src/pages/Admin.tsx` + `artifacts/api-server/src/routes/admin.ts`

---

## Kondisi Terkini

Admin panel sudah solid dengan 4 tab fungsional.

### Fitur yang sudah ada

| Tab | Fitur |
|---|---|
| **Users** | Tambah user manual, perpanjang akses, reset password, nonaktifkan, hapus permanen, confirm dialog |
| **Monitor** | Daftar strategi semua user — status running/stopped, PnL, order count |
| **Payments** | Daftar pending payment Saweria (view only) |
| **Broadcast** | Kirim Telegram ke user aktif/semua, format HTML toolbar (bold/italic/code/link/spoiler/blockquote), preview, progress real-time, cancel, riwayat, circuit breaker |

### Stack

- Auth: Bearer token (password admin via env)
- DB: query langsung via Drizzle ORM
- Broadcast: `smartBroadcaster` lib (queue-based, rate-limited, circuit breaker)

---

## Gap yang Ditemukan

### Gap 1 — KRITIS: Field `exchange` tidak ada di response Monitor

> **Koreksi dari asumsi awal:** Ketiga exchange (Lighter, Extended, Ethereal) pakai tabel yang SAMA: `strategiesTable`. Ada kolom `exchange text default "lighter"` sebagai discriminator.

**Verifikasi:**
```
lib/db/src/schema/strategies.ts → baris 23:
  exchange: text("exchange").default("lighter").notNull()

artifacts/api-server/src/routes/extended/bot.ts → filter: eq(strategiesTable.exchange, "extended")
artifacts/api-server/src/routes/ethereal/bot.ts → filter: eq(strategiesTable.exchange, "ethereal")
```

**Kondisi aktual backend** (`admin.ts` baris 123–164):
- Query `strategiesTable.findMany()` tanpa filter exchange → **sudah fetch semua exchange** ✅
- Tapi response mapping **tidak include field `exchange`** → frontend tidak tahu mana exchange-nya ❌

```ts
// response saat ini — TIDAK ada exchange:
return {
  id: s.id, name: s.name, type: s.type, marketSymbol: s.marketSymbol,
  isActive: s.isActive, isRunning: s.isRunning, realizedPnl: ...,
  totalOrders: s.totalOrders, successfulOrders: s.successfulOrders,
  updatedAt: s.updatedAt.toISOString(), user: ...
};
```

**Dampak:**
- Monitor tab tidak bisa bedakan strategi Lighter vs Extended vs Ethereal
- Stat card "Bot Running" secara data sudah hitung semua exchange (karena query tidak filter) ✅ — tidak ada masalah di sini

---

### Gap 2 — Minor: Tidak ada badge exchange di Monitor rows

Setiap baris strategi di Monitor tab hanya tampilkan nama, symbol, type, user, PnL, dan status Running/Stopped. Tidak ada indikator exchange.

---

### Gap 3 — Minor: Payments tab hanya view, tidak ada aksi

Pending payments ditampilkan tapi tidak ada tombol "Approve" atau "Reject" manual.
Ini mungkin by design (Saweria webhook yang handle otomatis), tapi perlu dikonfirmasi.

---

### Gap 4 — Nice-to-have: Tidak ada search/filter di Users tab

Kalau userbase besar, daftar user sulit dinavigasi. Perlu search by nama/ID/status.

---

## Prioritas Fix

| # | Gap | Prioritas | Estimasi |
|---|---|---|---|
| 1 | Backend: expose field `exchange` di response | **Tinggi** | ~5 menit |
| 2 | Frontend: tambah badge exchange per baris | **Tinggi** | ~10 menit |
| 3 | Payments: aksi approve/reject | **Rendah** | Perlu diskusi |
| 4 | Users: search/filter | **Rendah** | ~30 menit |

---

## Cara Fix Manual

### Fix 1 — Backend: Tambah field `exchange` di response

**File:** `artifacts/api-server/src/routes/admin.ts`

Cari blok `router.get("/all-strategies"` (~baris 123). Di dalam `.map((s) => ({`, tambah satu field:

```ts
// SEBELUM:
return {
  id: s.id,
  name: s.name,
  type: s.type,
  marketSymbol: s.marketSymbol,
  isActive: s.isActive,
  isRunning: s.isRunning,
  realizedPnl: parseFloat(s.realizedPnl ?? "0"),
  totalOrders: s.totalOrders,
  successfulOrders: s.successfulOrders,
  updatedAt: s.updatedAt.toISOString(),
  user: user ? { ... } : null,
};

// SESUDAH — tambah field exchange:
return {
  id: s.id,
  name: s.name,
  type: s.type,
  exchange: s.exchange,           // ← tambah ini
  marketSymbol: s.marketSymbol,
  isActive: s.isActive,
  isRunning: s.isRunning,
  realizedPnl: parseFloat(s.realizedPnl ?? "0"),
  totalOrders: s.totalOrders,
  successfulOrders: s.successfulOrders,
  updatedAt: s.updatedAt.toISOString(),
  user: user ? { ... } : null,
};
```

---

### Fix 2 — Frontend: Tambah field `exchange` ke interface + badge di Monitor rows

**File:** `artifacts/HK-Projects/src/pages/Admin.tsx`

**Langkah A — Tambah field ke interface** (~baris 26):

```ts
// SEBELUM:
interface AdminStrategy {
  id: number;
  name: string;
  type: string;
  marketSymbol: string;
  ...
}

// SESUDAH:
interface AdminStrategy {
  id: number;
  name: string;
  type: string;
  exchange: string;   // ← tambah ini
  marketSymbol: string;
  ...
}
```

**Langkah B — Tambah helper warna badge** (taruh setelah `const PLAN_LABELS`):

```ts
const EXCHANGE_BADGE: Record<string, { label: string; className: string }> = {
  lighter:  { label: "Lighter",  className: "bg-teal-500/15 text-teal-400 border-teal-500/30" },
  extended: { label: "Extended", className: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  ethereal: { label: "Ethereal", className: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
};
```

**Langkah C — Tampilkan badge di baris Monitor** (~baris 505–509).

Cari:
```tsx
<span className="text-xs uppercase text-primary font-bold">{s.type}</span>
```

Tambah badge exchange tepat setelah baris itu:
```tsx
<span className="text-xs uppercase text-primary font-bold">{s.type}</span>
{/* tambah badge exchange ↓ */}
{(() => {
  const ex = EXCHANGE_BADGE[s.exchange] ?? { label: s.exchange, className: "bg-muted text-muted-foreground" };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${ex.className}`}>
      {ex.label}
    </span>
  );
})()}
```

---

## Changelog

### Apr 2026 — Gap 1 & Gap 2: Expose exchange field + badge Monitor

| # | Perubahan | File |
|---|---|---|
| Fix 1 | Tambah `exchange: s.exchange` di response mapping `/admin/all-strategies` | `admin.ts` baris ~141 |
| Fix 2a | Tambah field `exchange: "lighter" \| "extended" \| "ethereal"` ke `AdminStrategy` interface | `Admin.tsx` baris ~33 |
| Fix 2b | Tambah `EXCHANGE_BADGE` helper constant (teal/violet/purple per exchange) | `Admin.tsx` baris ~58 |
| Fix 2c | Render exchange badge di setiap baris Monitor tab, setelah `{s.type}` | `Admin.tsx` baris ~520 |

**Catatan:** `runningBots` stat card tidak diubah — query backend sudah fetch semua exchange tanpa filter sejak awal, hitungan sudah benar.
