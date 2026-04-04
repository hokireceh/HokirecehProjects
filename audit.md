# Audit HK-Projects — Referensi Aktif

> Update terakhir: April 2026 | Skor: **63/65 (97%)** — semua item kritis selesai

---

## Audit Harian — 4 April 2026

> Docs di-fetch ulang: Lighter (90 halaman OK), Extended (12 halaman OK), Ethereal (21 halaman OK)
> Verifikasi dilakukan dari docs terbaru, bukan asumsi sesi sebelumnya.

---

### Temuan

---

**[Extended / extendedApi.ts] → [DEAD CODE: `getAllMarketStats` tidak punya caller] → [Hapus fungsi ini]**

Fungsi `getAllMarketStats` diekspor dari `extendedApi.ts` tapi tidak ada satu pun import atau panggilan di seluruh codebase (grep konfirmasi: 0 caller). Selain itu, implementasinya salah: membaca `(m as any).marketStats` dari response `/api/v1/info/markets`, padahal field `marketStats` tidak ada di schema API Extended — hasilnya selalu `"0"` untuk semua stats. Fungsi ini sepenuhnya dead dan broken.

---

**[Ethereal / etherealSigner.ts] → [DEAD CODE: `signWithdraw` dan `signLinkSigner` tidak punya caller] → [Hapus atau pindahkan ke file terpisah jika diperlukan nanti]**

`signWithdraw` dan `signLinkSigner` diekspor dari `etherealSigner.ts` tapi tidak ada caller di seluruh codebase. Bukan masalah kritis (tidak mengganggu runtime), tapi menambah noise saat audit.

---

**[SmartBroadcaster / smartBroadcaster.ts] → [DEAD CODE: `broadcastToAllUsers` sudah deprecated] → [Hapus fungsi ini]**

Fungsi `broadcastToAllUsers` sudah ditandai `@deprecated` oleh penulisnya sendiri dalam komentar: "Tidak lagi diimpor oleh modul manapun." Grep konfirmasi: 0 caller selain definisi fungsi itu sendiri.

---

**[Ethereal / etherealSigner.ts baris 27-29] → [TODO AKTIF: testnet `verifyingContract` = zero address] → [Fetch dari `GET https://api.etherealtest.net/v1/rpc/config` sebelum mengaktifkan testnet Ethereal]**

Alamat `verifyingContract` untuk testnet Ethereal diset ke `0x000...000` karena belum dikonfirmasi. Jika testnet pernah diaktifkan dengan nilai ini, semua order signing akan menghasilkan signature yang tidak valid. Tidak ada risiko di mainnet (mainnet address sudah benar: `0xB3cDC82035C495c484C9fF11eD5f3Ff6d342e3cc`).

---

**[Ethereal / etherealSigner.ts baris 41-45] → [TODO AKTIF: price MARKET order di EIP-712 belum dikonfirmasi] → [Verifikasi dengan Python SDK Ethereal atau coba `price=0` jika market order gagal]**

Komentar di kode: "Untuk MARKET order, nilai price yang tepat di EIP-712 belum dikonfirmasi. Apakah price=0 (no price limit) atau slippage price?" Saat ini mengirim slippage price. Docs EIP-712 Ethereal di path lama (`/protocol-reference/eip-712`) mengembalikan 404 — halaman sudah dipindahkan. Tidak ada cara memverifikasi dari docs saat ini tanpa akses ke Python SDK resmi.

---

**[Fetch Script / ethereal-docs] → [5 URL docs Ethereal mengembalikan 404] → [Update `fetch-ethereal-docs.js` dengan path yang benar atau skip halaman yang sudah dihapus]**

`gitbook/protocol-reference/eip-712.md`, `orders.md`, `positions.md`, `fills.md`, `funding.md`, `balances.md`, `withdrawals.md`, `linked-signers.md`, `subaccounts.md`, `websockets.md`, `products.md` — beberapa path ini mengembalikan "Page Not Found" di docs Ethereal. Docs tersebut sudah dipindahkan atau dihapus oleh Ethereal. File yang dihasilkan berisi konten "Page Not Found", bukan dokumentasi nyata.

---

### Tidak Ada Isu Baru di Area Berikut

| Area | Status |
|------|--------|
| Lighter endpoints (`/api/v1/orderBookDetails`, `/api/v1/nextNonce`, `/api/v1/sendTx`, `/api/v1/candles`) | Semua valid sesuai docs terbaru |
| Extended signing (Poseidon SNIP-12) | Implementasi sesuai Rust source |
| Ethereal EIP-712 mainnet signing | Domain, types, dan verifyingContract mainnet benar |
| Extended API endpoints (`/api/v1/info/markets`, `/api/v1/user/orders/external/{id}`) | Semua valid |
| Server logs | Tidak ada error kritis; Telegram bot 409 saat startup normal (resolved oleh retry) |
| Lighter sendTx / sendTxBatch | Format request, field, dan sequencer rejection check sudah benar |
| pendingPaymentsTable | Bukan dead code — aktif digunakan di `telegramBot.ts` dan `admin.ts` |

---

## Apa yang Masih Perlu Dikerjakan

| # | Item | Prioritas | Aksi |
|---|------|-----------|------|
| A | Verifikasi bundle size | 🟡 | Jalankan `pnpm run build` di VPS, cek ukuran chunk di `dist/assets/` |
| B | Toggle Light/Dark Mode | 🟢 | `next-themes` sudah terinstal — tinggal expose ke UI |
| C | Privacy Policy page | 🟢 | Halaman statis, belum ada |
| D | PWA / Service Worker | 🟢 | Offline support — opsional untuk dashboard |
| E | Open Graph tags | 🟢 | Hanya perlu jika app jadi publik |

---

## Infrastruktur — Referensi Cepat

### Arsitektur
```
Browser → HTTPS → Cloudflare (Flexible SSL) → HTTP :80 → Apache :80
                                                ├── dist/ (static files)
                                                └── ProxyPass /api → Node.js :8080
```

**Aturan wajib ingat:**
- Port 80 di origin **benar** untuk Cloudflare Flexible SSL — jangan diubah ke HTTPS
- `helmet` di Express hanya berlaku `/api/*` — security headers static files harus di Apache
- Cloudflare tidak inject CSP/X-Frame-Options — tetap harus ada di Apache

### Apache VirtualHost Config (hokireceh.online)

```apache
<VirtualHost *:80>
    ServerName hokireceh.online
    ServerAlias www.hokireceh.online
    DocumentRoot /www/wwwroot/HokirecehProjects/artifacts/HK-Projects/dist

    <IfModule mod_headers.c>
        Header always set X-Frame-Options "SAMEORIGIN"
        Header always set X-Content-Type-Options "nosniff"
        Header always set Referrer-Policy "strict-origin-when-cross-origin"
        Header always set Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://mainnet.zklighter.elliot.ai https://testnet.zklighter.elliot.ai https://api.starknet.extended.exchange https://api.starknet.sepolia.extended.exchange; object-src 'none'"
        Header set Cache-Control "no-cache, no-store, must-revalidate"
    </IfModule>

    <LocationMatch "\.(js|css|woff2?|ico|png|svg)$">
        Header set Cache-Control "public, max-age=31536000, immutable"
    </LocationMatch>

    <Directory /www/wwwroot/HokirecehProjects/artifacts/HK-Projects/dist>
        AllowOverride All
        Require all granted
        Options -Indexes
        RewriteEngine On
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteCond %{REQUEST_URI} !^/api
        RewriteRule ^ /index.html [L]
    </Directory>

    ProxyRequests Off
    ProxyPreserveHost On
    ProxyPass /api http://127.0.0.1:8080/api
    ProxyPassReverse /api http://127.0.0.1:8080/api
</VirtualHost>
```

### Cloudflare Settings

| Setting | Nilai |
|---------|-------|
| SSL mode | Flexible |
| Always Use HTTPS | On |
| HSTS | Max-Age 6 months, includeSubDomains, Preload |
| Bot Fight Mode | On, JS Detections On |

---

## Aturan HARD — Jangan Pernah Dilanggar

- **Jangan sentuh `src/lib/lighter/`** — production 24/7
- **Jangan ubah signing logic Extended (Poseidon) atau Ethereal (EIP-712)**
- **Jangan ubah field yang dikirim ke API backend exchange manapun**
- Lighter pakai `marketIndex` (integer) | Extended pakai `marketSymbol` (string) | Ethereal pakai `ticker` / `productUuid`

---

## Catatan Arsitektur Bot

- **Startup recovery**: `index.ts` — auto-restart bot `isRunning=true` setelah server restart (5s delay)
- **Graceful shutdown**: `stopBot(id, skipDbUpdate=true)` → `isRunning` tetap `true` di DB → recovery bekerja setelah `pm2 restart`
- **Telegram bot**: 2 jalur notif — main bot (`BOT_TOKEN`) untuk rerange + tombol interaktif; notification bot (`notifyBotToken`) untuk notif pasif
- **Rerange handler**: `telegramBot.ts` → `registerRerangeHandlers` — dispatch by exchange (Lighter/Extended/Ethereal guard)
- **Pause restart button**: callback `bot_restart_<strategyId>` dikirim via `_globalTelegram` (main bot) → handler di `telegramBot.ts`
- **Tick function guard**: `!strategy` → warn + return (bot tetap hidup) | `!isActive||!isRunning` → stopBot (intentional stop)
