# HokirecehProjects

Trading bot otomatis untuk **Lighter.xyz DEX** dan **Extended Exchange (Starknet)** — dengan dashboard web React, strategi Grid/DCA, bot Telegram untuk subscription + notifikasi, dan analisis pasar berbasis AI (Groq).

---

## Fitur

- **Grid Bot & DCA Bot** — Lighter.xyz dan Extended Exchange
- **Dashboard web** (React + Vite)
- **Notifikasi Telegram** — per-user via Settings, admin otomatis via env
- **AI Market Advisor** — analisis parameter grid real-time pakai Groq
- **Pembayaran via Saweria** (QR QRIS otomatis)
- **Paper trading** — tanpa private key, simulasi order
- **Extended Exchange** — trading di Starknet dengan maker rebates, sub-akun isolated

---

## Environment Variables

### Wajib

| Key | Keterangan |
|-----|-----------|
| `DATABASE_URL` | PostgreSQL connection string |
| `ADMIN_PASSWORD` | Password login dashboard |
| `ENCRYPTION_KEY` | 32-byte key untuk enkripsi private key (64 karakter hex) |

### Telegram Bot

| Key | Keterangan |
|-----|-----------|
| `BOT_TOKEN` | Token bot Telegram dari @BotFather |
| `ADMIN_CHAT_ID` | Chat ID Telegram admin (dari @userinfobot) |

> **Auto-fill notifikasi admin:** Jika `BOT_TOKEN` dan `ADMIN_CHAT_ID` sudah diset di env/secrets, notifikasi trading bot untuk admin **otomatis aktif tanpa perlu konfigurasi manual di Settings**. User lain tetap mengisi `notifyBotToken` + `notifyChatId` sendiri via halaman Settings dashboard.

### Saweria (Pembayaran)

| Key | Keterangan |
|-----|-----------|
| `SAWERIA_USERNAME` | Username Saweria |
| `SAWERIA_USER_ID` | User ID Saweria (dari DevTools → request `/streams/me`) |

### AI Advisor (Groq)

| Key | Keterangan |
|-----|-----------|
| `GROQ_API_KEY` | API key utama Groq — wajib untuk fitur AI |
| `GROQ_API_KEY_2` s/d `GROQ_API_KEY_5` | *(Opsional)* Multi-key pool untuk rate limit rotation |

### Extended Exchange

| Key | Keterangan |
|-----|-----------|
| `EXTENDED_ENABLED` | Set `true` untuk mengaktifkan Extended Exchange routes dan polling |

### Opsional Lainnya

| Key | Keterangan |
|-----|-----------|
| `PORT` | Port API server (default: 8080) |
| `NODE_ENV` | `development` / `production` |
| `HTTPS_PROXY` | Proxy untuk koneksi keluar (opsional, untuk VPS tertentu) |

---

## Setup Kredensial

### Lighter.xyz

Buka **Settings** di dashboard dan isi:

| Field | Keterangan |
|-------|-----------|
| **Private Key** | Private key API kamu — didapat saat buat API key di Lighter |
| **Account Index** | Indeks akun Lighter — cek via Settings di [app.lighter.xyz](https://app.lighter.xyz) |
| **API Key Index** | Indeks API key yang dibuat — lihat di [app.lighter.xyz/apikeys](https://app.lighter.xyz/apikeys) |

> Tanpa ini, bot berjalan dalam mode **Paper Trading** (simulasi).

### Extended Exchange

Buka **Settings → Extended Exchange** dan isi:

| Field | Keterangan |
|-------|-----------|
| **API Key** | API key dari Extended Exchange |
| **Stark Private Key** | Private key Stark untuk signing order |
| **Account ID** | ID akun Extended kamu |

> Pastikan `EXTENDED_ENABLED=true` di env, atau tab Extended tidak akan muncul.

---

## Strategi Grid Bot

### Parameter

| Parameter | Keterangan | Contoh |
|-----------|-----------|--------|
| **Name** | Nama unik bot | `ETH Grid 1` |
| **Market** | Pasangan trading | `ETH/USDC` |
| **Lower Price** | Batas bawah range harga | `1800` |
| **Upper Price** | Batas atas range harga | `2200` |
| **Grid Levels** | Jumlah level (2–100) | `10` |
| **Amount per Grid** | Modal per level | `10` |
| **Mode** | `neutral` / `long` / `short` | `neutral` |

### Cara Kerja

- Bot berjalan setiap **60 detik** (atau triggered oleh WebSocket price update)
- Range harga dibagi rata sesuai jumlah grid level
- Setiap level = satu posisi buy/sell
- Harga keluar range → bot monitor sampai kembali

### Tips

- **Range sempit + level banyak** = grid rapat, cocok market sideways
- **Range lebar + level sedikit** = grid jarang, cocok market trending
- Modal total: `Grid Levels × Amount per Grid`
- Mode `neutral` paling aman untuk pemula

---

## AI Market Advisor

Klik tombol **Analisis AI** di form strategi untuk mendapatkan rekomendasi parameter grid berdasarkan kondisi pasar real-time.

- **Lighter**: mempertimbangkan latency 200–300ms, offset 0.2–0.5%, zero-fee taker
- **Extended**: offset lebih tipis (0.05–0.2%), maker rebates 0.002–0.013%, sub-akun isolated
- Hasil AI bisa langsung diaplikasikan ke form dengan klik **Perbarui Parameter Grid**

> Butuh `GROQ_API_KEY` yang valid. Tanpa itu tombol AI tidak aktif.

---

## Deploy di Replit

### Environment

| Service | Port |
|---------|------|
| Frontend (React) | **5000** |
| Backend API | **8080** |

Frontend proxy `/api` → `http://localhost:8080`

### Secrets yang harus diset

Masuk ke **Secrets** di sidebar Replit, tambahkan semua key dari tabel di atas. `DATABASE_URL` otomatis tersedia dari Replit PostgreSQL.

Minimal untuk fitur penuh:

```
DATABASE_URL=        ← dari Replit PostgreSQL (otomatis)
ADMIN_PASSWORD=      ← password login dashboard
ENCRYPTION_KEY=      ← 64 karakter hex (generate: openssl rand -hex 32)
BOT_TOKEN=           ← dari @BotFather
ADMIN_CHAT_ID=       ← dari @userinfobot
GROQ_API_KEY=        ← dari console.groq.com
SAWERIA_USER_ID=     ← dari DevTools Saweria
SAWERIA_USERNAME=    ← username Saweria kamu
EXTENDED_ENABLED=true
```

### Workflows

| Workflow | Command | Port |
|----------|---------|------|
| `artifacts/api-server: API Server` | `pnpm --filter @workspace/api-server run dev` | 8080 |
| `artifacts/HK-Projects: web` | `pnpm --filter @workspace/HK-Projects run dev` | 5000 |

> Gunakan dua workflow ini. Jangan pakai workflow `Backend API` (konflik port).

### Update setelah perubahan kode

```bash
pnpm install
pnpm --filter @workspace/db run push        # jika ada perubahan schema DB
```

Lalu restart kedua workflow di atas.

---

## Deploy di Home Server (aaPanel)

**Setup:** aaPanel + Apache | **Contoh domain:** `pay.bukitcuan.fun`
**Lokasi project:** `/www/wwwroot/HokirecehProjects`

### Prasyarat

```bash
node -v        # minimal v20
npm install -g pnpm pm2
```

### Langkah 1 — Database PostgreSQL

aaPanel → **Database → PostgreSQL → Add Database**:

| Field | Nilai |
|-------|-------|
| DB Name | `lighter` |
| Username | `lighter` |
| Password | *(buat password kuat)* |

### Langkah 2 — File .env

```bash
nano /www/wwwroot/HokirecehProjects/.env
```

```env
DATABASE_URL=postgresql://lighter:PASSWORD@localhost:5432/lighter
PORT=8080
NODE_ENV=production

# Auth & enkripsi
ADMIN_PASSWORD=password_kuat_kamu
ENCRYPTION_KEY=64_karakter_hex_random

# Telegram Bot
BOT_TOKEN=123456789:AAxxxxxxxx
ADMIN_CHAT_ID=123456789

# Saweria
SAWERIA_USER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SAWERIA_USERNAME=username_saweria

# Groq AI Advisor
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx
# GROQ_API_KEY_2=gsk_xxxxxxxxxxxx   ← opsional, untuk multi-key rotation
# GROQ_API_KEY_3=gsk_xxxxxxxxxxxx

# Extended Exchange (Starknet)
EXTENDED_ENABLED=true
```

> **Catatan admin notifikasi:** Cukup isi `BOT_TOKEN` + `ADMIN_CHAT_ID` di `.env` — semua notifikasi trading bot untuk akun admin (buy/sell/error/start/stop) otomatis terkirim ke Telegram kamu tanpa konfigurasi tambahan di dashboard.

### Langkah 3 — Install & Setup DB

```bash
cd /www/wwwroot/HokirecehProjects
pnpm install
export $(grep -v '^#' .env | xargs)
pnpm --filter @workspace/db run push
```

### Langkah 4 — Build

```bash
pnpm run build
```

### Langkah 5 — Jalankan dengan PM2

File `ecosystem.config.cjs` (sudah ada di root project):

```javascript
require('dotenv').config({ path: __dirname + '/.env' });

module.exports = {
  apps: [{
    name: "hokireceh-api",
    script: "artifacts/api-server/dist/index.mjs",
    cwd: "/www/wwwroot/HokirecehProjects",
    interpreter: "node",
    interpreter_args: "--enable-source-maps",
    env: {
      PORT: 8080,
      NODE_ENV: "production",
      DATABASE_URL: process.env.DATABASE_URL,
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
      BOT_TOKEN: process.env.BOT_TOKEN,
      ADMIN_CHAT_ID: process.env.ADMIN_CHAT_ID,
      SAWERIA_USERNAME: process.env.SAWERIA_USERNAME,
      SAWERIA_USER_ID: process.env.SAWERIA_USER_ID,
      HTTPS_PROXY: process.env.HTTPS_PROXY || "",
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || "",
      GROQ_API_KEY: process.env.GROQ_API_KEY || "",
      GROQ_API_KEY_2: process.env.GROQ_API_KEY_2 || "",
      GROQ_API_KEY_3: process.env.GROQ_API_KEY_3 || "",
      GROQ_API_KEY_4: process.env.GROQ_API_KEY_4 || "",
      GROQ_API_KEY_5: process.env.GROQ_API_KEY_5 || "",
      EXTENDED_ENABLED: process.env.EXTENDED_ENABLED || "false",
    }
  }]
};
```

```bash
cd /www/wwwroot/HokirecehProjects
pm2 start ecosystem.config.cjs
pm2 startup && pm2 save
```

> **Penting:** Gunakan `ecosystem.config.cjs`, bukan langsung `pm2 start`. Ini memastikan env vars dari `.env` tetap tersedia setelah reboot server.

### Langkah 6 — Konfigurasi Apache

Di aaPanel → **Website → domain → Config**, replace VirtualHost dengan config berikut:

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

```bash
/etc/init.d/httpd restart
```

### Langkah 7 — SSL & Cloudflare

**Jika pakai Cloudflare (direkomendasikan):**
- Cloudflare yang handle HTTPS — tidak perlu SSL cert di Apache
- Di Cloudflare dashboard:
  - SSL/TLS → Mode: **Flexible**
  - Edge Certificates → **Always Use HTTPS: On**
  - Edge Certificates → **HSTS: Enable**
  - Security → Bots → **Bot Fight Mode: On**

**Jika tidak pakai Cloudflare:**
- aaPanel → **Website → domain kamu → SSL → Let's Encrypt → Apply**

### Update Aplikasi

```bash
cat > /usr/local/bin/pull-hk << 'EOF'
#!/bin/bash
set -e
cd /www/wwwroot/HokirecehProjects
git pull origin main

echo "Checking TypeScript..."
cd artifacts/api-server
TS_ERRORS=$(pnpm tsc --noEmit 2>&1 | grep -v "TS6305" | grep "error TS" || true)
if [ -n "$TS_ERRORS" ]; then
  echo "$TS_ERRORS"
  echo "❌ TypeScript error ditemukan, deploy dibatalkan!"
  exit 1
fi
echo "✅ TypeScript OK"

echo "Building frontend..."
cd ../HK-Projects
pnpm build || { echo "❌ Frontend build gagal, deploy dibatalkan!"; exit 1; }
echo "✅ Frontend build OK"

echo "Building backend..."
cd ../api-server
pnpm build || { echo "❌ Backend build gagal, deploy dibatalkan!"; exit 1; }
echo "✅ Backend build OK"

echo "Restarting..."
cd ../HK-Projects
pm2 restart ecosystem.config.cjs --update-env
echo "✅ Deploy selesai!"
EOF
chmod +x /usr/local/bin/pull-hk
```

Selanjutnya tinggal ketik pull-hk dari mana saja.

> **Penting:** Selalu gunakan `--update-env` saat restart. Tanpa flag ini PM2 memakai env vars lama dari cache, sehingga perubahan di `.env` (seperti `ADMIN_PASSWORD`) tidak akan terbaca.

---

## Notifikasi Telegram

### Untuk Admin (Otomatis)

| Notifikasi | Trigger |
|-----------|---------|
| Pembayaran masuk | User berhasil bayar via Saweria |
| User baru ditambahkan | Admin tambah manual via bot |
| Bot buy/sell/error | Semua event trading bot admin |

Cukup set `BOT_TOKEN` + `ADMIN_CHAT_ID` di secrets/`.env` — tidak perlu konfigurasi di dashboard.

### Untuk User Lain

User mengisi sendiri di **Settings** dashboard:

| Field | Keterangan |
|-------|-----------|
| **Notify Bot Token** | Token bot Telegram notifikasi (bisa bot yang sama atau beda) |
| **Notify Chat ID** | Chat ID Telegram user |

Lalu centang jenis notifikasi yang diinginkan (Buy / Sell / Error / Start / Stop).

---

## Troubleshooting

| Masalah | Solusi |
|---------|--------|
| API tidak merespons | `pm2 logs hokireceh-api --lines 50` |
| Database error | `psql $DATABASE_URL -c "SELECT 1"` |
| Frontend blank/404 | Cek `ls artifacts/HK-Projects/dist/` — pastikan sudah build |
| Port sudah dipakai | `ss -tlnp \| grep 8080` — ganti port di `.env` dan Apache config |
| Bot tidak mulai | Cek kredensial Lighter/Extended di Settings dashboard |
| AI tidak merespons | Pastikan `GROQ_API_KEY` valid dan quota tidak habis |
| Extended tab tidak muncul | Set `EXTENDED_ENABLED=true` di env lalu restart |
| Notifikasi Telegram gagal | Pastikan sudah `/start` ke bot, cek BOT_TOKEN dan chat ID |

---

## Keamanan

- Port PostgreSQL (5432) **jangan dibuka ke internet**
- Aktifkan Firewall — hanya buka port 80, 443, 22
- Gunakan password kuat untuk `ADMIN_PASSWORD` dan database
- `ENCRYPTION_KEY` harus 64 karakter hex random — generate dengan `openssl rand -hex 32`
- Jangan commit file `.env` ke Git

---

## Perintah PM2

```bash
pm2 status                          # lihat semua process
pm2 logs hokireceh-api                           # log realtime
pm2 restart hokireceh-api                        # restart (env tidak berubah)
pm2 restart ecosystem.config.cjs --update-env   # restart + reload .env
pm2 monit                           # monitor CPU/RAM
```
