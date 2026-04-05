# Audit Log — HokirecehPro

Catatan resolusi bug, fix, dan perbaikan yang telah diapply ke codebase.  
Format: tanggal · ID · deskripsi singkat · file yang diubah · catatan isolasi.

---

## 2026-04-05

### BUG-ETH-008 — Ethereal logs tidak muncul di Logs.tsx ✅ Resolved

**Root cause:** `GET /api/ethereal/strategies/logs/recent` mengembalikan raw array `[...]`, bukan `{ logs: [...] }` seperti Extended. `fetchEtherealLogs()` di `Logs.tsx` mem-parse dengan `json.logs ?? []` — pada raw array selalu `undefined`, selalu fallback ke `[]`. Log ter-fetch tapi langsung dibuang.

**Fix:** `artifacts/HK-Projects/src/pages/Logs.tsx`  
`(json.logs ?? [])` → `(Array.isArray(json) ? json : (json.logs ?? []))`

**Isolasi:** Frontend-only. Tidak ada perubahan backend. Tidak ada sentuhan kode Lighter atau Extended.

---

### BUG-ETH-009 — Ethereal logs tidak muncul di widget "Aktivitas Terbaru" Dashboard.tsx ✅ Resolved

**Root cause:** Identik dengan BUG-ETH-008. Hook `useEtherealLogs()` di `Dashboard.tsx` juga mem-parse dengan `json.logs ?? []` pada response raw array — hasilnya selalu `[]`. `combinedLogs` (Lighter + Extended + Ethereal) sudah dirakit dengan benar, tapi porsi Ethereal selalu array kosong karena parsing gagal.

**Fix:** `artifacts/HK-Projects/src/pages/Dashboard.tsx`  
`.then(json => setData(json.logs ?? []))` → `.then(json => setData(Array.isArray(json) ? json : (json.logs ?? [])))`  
Error fallback `{ logs: [] }` dikoreksi menjadi `[]` (konsisten dengan format aktual endpoint).

**Isolasi:** Frontend-only. Tidak ada perubahan backend. Tidak ada sentuhan kode Lighter atau Extended.

---

### Minor cosmetic — Label fallback "Sistem Extended" salah tampil untuk Ethereal ✅ Resolved

**Root cause:** Dua tempat menggunakan ternary 2-cabang `lighter ? "Sistem Lighter" : "Sistem Extended"` — semua exchange non-Lighter (termasuk Ethereal) mendapat label "Sistem Extended" sebagai fallback nama strategi.

**Fix:**  
- `artifacts/HK-Projects/src/pages/Logs.tsx` baris 307 — ternary 3-cabang: `lighter` → "Sistem Lighter", `ethereal` → "Sistem Ethereal", default → "Sistem Extended"  
- `artifacts/HK-Projects/src/pages/Dashboard.tsx` baris 659 — ternary 3-cabang: `lighter` → "Sistem Lighter DEX", `ethereal` → "Sistem Ethereal DEX", default → "Sistem Extended"

**Isolasi:** Frontend-only. Display-only change, tidak menyentuh data fetching, backend, atau logika Lighter/Extended.

---
