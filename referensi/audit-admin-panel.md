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

### Gap 1 — KRITIS: Monitor hanya tampilkan strategi Lighter

**Lokasi backend:** `artifacts/api-server/src/routes/admin.ts` → `router.get("/all-strategies")`

Endpoint hanya query `strategiesTable` (Lighter). Extended dan Ethereal tidak terlihat.

| Exchange | Tabel DB | Admin Monitor |
|---|---|---|
| Lighter | `strategiesTable` | ✅ Terlihat |
| Extended | `extendedStrategiesTable` (perlu diverifikasi) | ❌ Tidak ada |
| Ethereal | `etherealStrategiesTable` (perlu diverifikasi) | ❌ Tidak ada |

**Dampak:**
- Stat card "Bot Running" di header juga hanya hitungan Lighter
- Admin tidak bisa monitor bot Extended/Ethereal user

**Fix plan:**
1. Cek nama tabel Extended + Ethereal di `@workspace/db` schema
2. Update endpoint `/admin/all-strategies` — join/union ketiga tabel
3. Tambah field `exchange: "lighter" | "extended" | "ethereal"` di response
4. Tampilkan badge exchange di setiap baris Monitor tab
5. Update stat card "Bot Running" agar hitung dari semua exchange

---

### Gap 2 — Minor: Tidak ada label exchange di Monitor rows

Bahkan jika hanya Lighter yang ada saat ini, baris strategi tidak menampilkan label exchange. Perlu disiapkan sebelum Extended/Ethereal masuk.

**Fix:** Tambah badge `Lighter` / `Extended` / `Ethereal` di setiap baris strategi di Monitor tab.

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
| 1 | Monitor: tambah Extended + Ethereal strategies | **Tinggi** | ~1-2 jam (tergantung schema DB) |
| 2 | Monitor: badge exchange per baris | **Tinggi** | ~15 menit (ikut fix #1) |
| 3 | Payments: aksi approve/reject | **Rendah** | Perlu diskusi (mungkin by design) |
| 4 | Users: search/filter | **Rendah** | ~30 menit |

---

## Catatan Implementasi

Sebelum fix Gap 1, perlu verifikasi:
```bash
# Cek schema tabel Extended dan Ethereal
grep -n "Table\|table" lib/db/src/schema.ts | grep -i "extended\|ethereal"
```

Kemungkinan nama tabel:
- Extended: `extendedStrategiesTable`
- Ethereal: `etherealStrategiesTable`

Jika tabel terpisah, gunakan union query atau multiple fetch + merge di backend.
Jika pakai tabel yang sama (`strategiesTable`) dengan kolom `exchange`, cukup filter/group saja.
