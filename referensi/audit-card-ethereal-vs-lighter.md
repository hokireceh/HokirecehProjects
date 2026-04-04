# Audit: EtherealStrategies vs LighterStrategies Pattern

> Dibuat: Apr 2026
> Referensi pembanding: `LighterStrategies.tsx` (setelah 3 sesi perbaikan)

---

## Ringkasan Eksekutif

Ethereal **sudah lebih maju** dari Lighter sebelum perbaikan. Mayoritas fitur pattern
Lighter sudah ada di Ethereal. Gap yang tersisa hanya bersifat kosmetik/minor.

---

## 1. Perbandingan Fitur Utama

| Fitur | Lighter (setelah sesi 1-3) | Ethereal (kondisi terkini) | Status |
|---|---|---|---|
| Sub-komponen card | ✅ `LighterStrategyCard` | ✅ `EthStrategyCard` | ✅ Sudah ada |
| Callback props | ✅ onToggle, onDelete, onShowLog, onEdit, onShowChart, isBusy | ✅ onToggle, onDelete, onShowLog, isBusy | ⚠️ Kurang onEdit, onShowChart (belum ada fitur tsb) |
| Log Dialog | ✅ `LighterLogDialog` (ScrollText icon, teal hover) | ✅ `EthLogDialog` (ScrollText icon, purple hover) | ✅ Sudah difix |
| Badge DEX di header | ✅ "Lighter" | ✅ "Ethereal" | ✅ Sudah ada |
| orderType di DCA card | ✅ Tampil di card | ✅ Tampil di card (line 903) | ✅ Sudah ada |
| orderType di Grid card | ✅ Tampil di card | ✅ Tampil di card (conditional) | ✅ Sudah difix |
| stopLoss/takeProfit di Grid card | ✅ | ✅ (line 912-913) | ✅ Sudah ada |
| Delete confirm dialog | ✅ | ✅ (lebih lengkap) | ✅ Sudah ada |
| logDialogId state | ✅ `number \| null` | ✅ `number \| null` | ✅ Sudah ada |

---

## 2. Fitur Eksklusif Ethereal (Tidak Ada di Lighter)

| Fitur | Deskripsi |
|---|---|
| AI Integration | `EthAiButton` + `AIInsightCard` — auto-fill parameter via OpenAI |
| EthConfigModal | Setup wallet credentials (private key + network) |
| EthMarketPicker | Popover + Command search untuk memilih market |
| EthAccountWidget | Tampilkan saldo USDe + posisi + uPnL di header |
| limitPriceOffset | Field khusus Ethereal di form create |
| EthLogSection | Inline log viewer (embedded di dalam dialog, auto-refresh 15s) |

---

## 3. Gap yang Perlu Diperbaiki

### Gap 1 — Icon Log Button (Minor Kosmetik)
**Lokasi:** `EthStrategyCard` line ~957

| | Lighter | Ethereal saat ini |
|---|---|---|
| Icon | `ScrollText` | `Activity` |
| Hover class | `hover:bg-teal-500/10 hover:text-teal-400` | Tidak ada |
| Warna tema | Teal | Purple |

**Fix:**
```tsx
// Sebelum
<Button variant="ghost" size="sm" onClick={onShowLog} title="Lihat log">
  <Activity className="w-4 h-4" />
</Button>

// Sesudah
<Button variant="ghost" size="sm" onClick={onShowLog} title="Lihat Log"
  className="hover:bg-purple-500/10 hover:text-purple-400">
  <ScrollText className="w-4 h-4" />
</Button>
```

Import tambahan: `ScrollText` dari `lucide-react`.

---

### Gap 2 — orderType Tidak Tampil di Grid Card
**Lokasi:** `EthStrategyCard` line ~906-914 (Grid config section)

Saat ini Grid menampilkan: Rentang, Level, Per Grid, Mode, Stop Loss, Take Profit.
**Belum menampilkan:** `orderType`.

**Fix:** Tambah 1 field di grid config section:
```tsx
<div>
  <div className="text-xs text-muted-foreground">Order</div>
  <div className="font-mono text-xs capitalize">{strategy.gridConfig.orderType}</div>
</div>
```

---

### Gap 3 — `as any` Cast di Tab Handler (Minor)
**Lokasi:** Line 493
```tsx
<Tabs value={tab} onValueChange={(v) => { setTab(v as any); setAiResult(null); }}>
```
Bisa diperbaiki dengan cast yang proper:
```tsx
onValueChange={(v) => { setTab(v as "dca" | "grid"); setAiResult(null); }}
```

---

## 4. Yang Tidak Perlu Diubah

- **Local interfaces** (`EthStrategy`, `EthAccount`, dll.) — Ethereal API tidak ada di OpenAPI spec, jadi tidak bisa pakai generated types. Ini intentional.
- **`onEdit`/`onShowChart` props** — Ethereal belum punya edit modal & chart feature. Tidak perlu dipaksakan.
- **`EthLogSection` vs fetch langsung** — Pattern Ethereal lebih modular (log section reusable), tidak perlu diubah.
- **AI + EthConfigModal** — Fitur tambahan yang tidak ada di Lighter, biarkan.

---

## 5. Rencana Implementasi

Total perubahan: **Kecil** — hanya 3 fix di `EthStrategyCard`:

1. Ganti icon `Activity` → `ScrollText`, tambah hover purple di log button
2. Tambah field `orderType` di Grid config display
3. Fix `as any` cast di tab handler (opsional)

**Estimasi:** < 30 menit, tidak ada risiko regresi.

---

## 6. Changelog

### Apr 2026 — Implementasi Gap 1 & Gap 2

**Commit:** `5e2820a6` — "Add order type display and update log button style"

| Gap | Perubahan | File |
|---|---|---|
| Gap 1 | Ganti icon `Activity` → `ScrollText`, tambah `hover:bg-purple-500/10 hover:text-purple-400` di log button | `EtherealStrategies.tsx` baris ~960-963 |
| Gap 1 | Import `ScrollText` ditambah ke lucide-react imports | `EtherealStrategies.tsx` baris 14 |
| Gap 2 | Tambah field `orderType` (conditional) di Grid config display | `EtherealStrategies.tsx` baris ~915 |

**Keputusan styling:** Button tetap `variant="ghost"` (Opsi B — minimal change), tidak diubah ke `outline`. Alasan: konsistensi internal Ethereal — semua button footer card (Toggle, Log, Delete) pakai `ghost`.

**Gap 3** (`as any` cast) — tidak diimplementasi, ditunda karena opsional dan tidak ada risiko runtime.

---

### Apr 2026 — Layout Alignment & Sidebar Fix

Perubahan di luar scope audit card, dilakukan sesi yang sama:

**Commit:** `0cedff31` — "Align Ethereal strategy layout with Extended and Lighter patterns"

| Bagian | Perubahan | File |
|---|---|---|
| Outer wrapper | Hapus `p-4 md:p-8 max-w-7xl`, ganti ke `space-y-8 animate-in fade-in` | `EtherealStrategies.tsx` |
| Header | `<div>` → `<header>` dengan `sm:flex-row`, judul `text-2xl` → `text-3xl`, "Ethereal DEX" → "Strategi Ethereal" | `EtherealStrategies.tsx` |
| Credential warning | Banner kuning besar → DEX badge compact (aktif ✓ / paper trade) | `EtherealStrategies.tsx` |
| Loading skeleton | Kotak polos → skeleton Card detail dengan CardHeader + CardFooter | `EtherealStrategies.tsx` |
| Empty state | `flex` sederhana → `bg-card rounded-2xl border`, icon `BarChart2` → `Zap` purple | `EtherealStrategies.tsx` |
| Grid gap | `gap-4` → `gap-6` | `EtherealStrategies.tsx` |
| Import | Tambah `CardFooter` ke card imports | `EtherealStrategies.tsx` |

**Commit:** `ba1a79cb` — "Improve header layout by removing redundant configuration status"

| Bug | Fix | File |
|---|---|---|
| `EthAccountWidget` render "Belum terkonfigurasi" saat account kosong, menyebabkan 3 item wrap di header | Ganti early return ke `return null` | `EtherealStrategies.tsx` |

**Commit:** `c80e0d29` + `71f4fee4` — "Add Ethereal network status to the sidebar"

| Bagian | Perubahan | File |
|---|---|---|
| AppLayout sidebar | Tambah `useQuery` untuk `/api/ethereal/strategies/credentials` | `AppLayout.tsx` |
| DEX status card | Ubah dari `grid-cols-2` (Lighter + Extended) → vertical stack `divide-y` (Lighter + Extended + Ethereal) | `AppLayout.tsx` |
| Layout status | Tiap DEX 1 baris: nama + network kiri, dot status kanan | `AppLayout.tsx` |
