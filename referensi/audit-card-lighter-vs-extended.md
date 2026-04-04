# Audit UI Card Strategi: Lighter vs Extended

> Tanggal: April 2026
> Update: April 2026 — Implementasi Langkah 1–3 selesai (Log Dialog + Order Type)
> File yang dibandingkan:
> - `artifacts/HK-Projects/src/pages/LighterStrategies.tsx`
> - `artifacts/HK-Projects/src/pages/ExtendedStrategies.tsx`

---

## Ringkasan Eksekutif

| Kategori | Lighter | Extended |
|---|---|---|
| DCA field "Order Type" | ✅ Ada (conditional, `as any` cast) | ✅ Ada |
| Tombol Log Dialog | ✅ Ada (teal theme, `LighterLogDialog`) | ✅ Ada (ScrollText icon) |
| Badge DEX di header | ❌ Tidak ada | ✅ Ada ("Extended") |
| Stats field path | Nested (`strategy.stats.X`) | Top-level (`strategy.X`) |
| Type safety gridConfig | `as any` cast | Properly typed |
| Warna tema card | Teal/Green | Violet |
| Struktur komponen | Inline (monolitik) | Sub-komponen `ExtStrategyCard` |

---

## 1. Card Header

### Running Indicator Bar (garis atas)
| | Lighter | Extended |
|---|---|---|
| Warna | `from-success/50 via-success` (hijau) | `from-violet-500/50 via-violet-400` (violet) |

### Market Ticker Badge
| | Lighter | Extended |
|---|---|---|
| Styling | `bg-muted` (abu polos) | `bg-violet-500/10 text-violet-300 border border-violet-500/20` |
| Warna label type | `text-primary` | `text-violet-400` |
| Badge label DEX | ❌ Tidak ada | ✅ Badge kecil `"Extended"` (`text-[10px] bg-muted`) |

### Status Badge (Berjalan / Berhenti)
| | Lighter | Extended |
|---|---|---|
| Running color | `bg-success/20 text-success` | `bg-violet-500/20 text-violet-300` |
| Dot color | `bg-success` | `bg-violet-400` |

---

## 2. Card Content — DCA Config Fields

| Field | Lighter | Extended |
|---|---|---|
| Jumlah (`amountPerOrder`) | ✅ | ✅ |
| Interval (`intervalMinutes`) | ✅ | ✅ |
| Sisi (`side`) | ✅ | ✅ |
| **Order Type** (`orderType`) | ✅ **Ada** (conditional `as any` cast, Apr 2026) | ✅ Ada |

---

## 3. Card Content — Grid Config Fields

| Field | Lighter | Extended |
|---|---|---|
| Rentang (`lowerPrice – upperPrice`) | ✅ | ✅ |
| Level (`gridLevels`) | ✅ | ✅ |
| Per Grid (`amountPerGrid`) | ✅ | ✅ |
| Mode | ✅ | ✅ |
| Stop Loss (conditional) | ✅ via `as any` cast | ✅ properly typed |
| Take Profit (conditional) | ✅ via `as any` cast | ✅ properly typed |

---

## 4. Card Content — Stats Section

### Kondisi tampil
| | Lighter | Extended |
|---|---|---|
| Kondisi render | `strategy.stats &&` | `strategy.totalOrders > 0 \|\| pnl !== 0` |
| Path PnL | `strategy.stats.realizedPnl` | `strategy.realizedPnl` (top-level) |
| Path trade count | `strategy.stats.successfulOrders / strategy.stats.totalOrders` | `strategy.successfulOrders / strategy.totalOrders` (top-level) |

> Catatan: Extended memaparkan stats langsung di root objek strategi. Lighter membutuhkan objek `stats` yang ada dulu (null-check berbeda).

---

## 5. Card Footer — Tombol Aksi

| Tombol | Icon | Lighter | Extended |
|---|---|---|---|
| Start / Stop | `Play` / `Square` | ✅ | ✅ |
| Grafik PnL | `Activity` | ✅ | ✅ |
| **Log Dialog** | `ScrollText` | ✅ **Ada** (`LighterLogDialog`, teal theme, Apr 2026) | ✅ Ada |
| Edit Strategi | `Pencil` | ✅ | ✅ |
| Hapus | `Trash2` | ✅ | ✅ |

### Warna hover tombol
| Tombol | Lighter | Extended |
|---|---|---|
| PnL Chart | `hover:bg-primary/10` | `hover:bg-violet-500/10 hover:text-violet-400` |
| Log | `hover:bg-teal-500/10 hover:text-teal-400` (Apr 2026) | `hover:bg-sky-500/10 hover:text-sky-400` |
| Edit | `hover:bg-blue-500/10 hover:text-blue-400` | `hover:bg-amber-500/10 hover:text-amber-400` |

---

## 6. Struktur Komponen

| | Lighter | Extended |
|---|---|---|
| Card | Inline di dalam loop `data.strategies.map()` | Dipisah ke sub-komponen `ExtStrategyCard` |
| Props pattern | Akses langsung ke state parent | Callback props (`onToggle`, `onDelete`, `onShowChart`, `onEdit`, `onShowLog`) |
| Log state | ✅ Ada (Apr 2026): `const [logStrategyId, setLogStrategyId] = useState<number \| null>(null)` | `const [logStrategyId, setLogStrategyId] = useState<number \| null>(null)` |
| Log dialog | ✅ Ada (Apr 2026): `<LighterLogDialog strategyId={logStrategyId} onClose={...} />` | `<ExtLogDialog strategyId={logStrategyId} onClose={...} />` |

---

## 7. Ringkasan: Ada di Extended, Tidak Ada di Lighter

| Item | Lokasi | Status |
|---|---|---|
| Field "Order Type" di DCA config | Card content | ✅ Selesai (Apr 2026) |
| Tombol Log Dialog (`ScrollText`) | Card footer | ✅ Selesai (Apr 2026) |
| Badge label DEX ("Extended") | Card header | ❌ Belum (tidak diminta) |
| Sub-komponen card terpisah | Arsitektur | ❌ Belum (tidak diminta) |
| Typed gridConfig (tanpa `as any`) | Type safety | ❌ Belum (tidak diminta) |

## 8. Ringkasan: Ada di Lighter, Tidak Ada di Extended

> Tidak ada — Lighter adalah subset dari Extended dari sisi fitur card UI.

---

## 9. Changelog Implementasi

### Apr 2026 — Langkah 1–3 (Log Dialog + Order Type)

**Backend** (`artifacts/api-server/src/routes/lighter/bot.ts`):
- Tambah filter `strategyId` opsional di `GET /logs`

**Komponen baru** (`artifacts/HK-Projects/src/components/lighter/LighterLogDialog.tsx`):
- Clone dari `ExtLogDialog`, menggunakan hook `useLighterLogs` inline
- Fetch ke `/api/bot/logs?strategyId=X&limit=50`
- Icon `ScrollText` berwarna teal (`text-teal-400`)

**LighterStrategies.tsx**:
- Import `ScrollText` + `LighterLogDialog`
- State: `const [logStrategyId, setLogStrategyId] = useState<number | null>(null)`
- Tombol Log di footer: `hover:bg-teal-500/10 hover:text-teal-400` (antara Activity dan Pencil)
- Field Order Type di DCA config: conditional `(strategy.dcaConfig as any).orderType`
- Dialog: `{logStrategy && <LighterLogDialog ... />}`
