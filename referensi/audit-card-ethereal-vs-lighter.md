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
| Log Dialog | ✅ `LighterLogDialog` (ScrollText icon, teal hover) | ✅ `EthLogDialog` (Activity icon, no hover color) | ⚠️ Icon & hover beda |
| Badge DEX di header | ✅ "Lighter" | ✅ "Ethereal" | ✅ Sudah ada |
| orderType di DCA card | ✅ Tampil di card | ✅ Tampil di card (line 903) | ✅ Sudah ada |
| orderType di Grid card | ✅ Tampil di card | ❌ Belum tampil (mode saja) | ❌ Gap |
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

*(diisi setelah implementasi)*
