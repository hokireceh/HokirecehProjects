# Audit Web Standar 2026 — Hokireceh Projects

> Tanggal audit: April 2026  
> Scope: `artifacts/HK-Projects` (React + Vite frontend) + `artifacts/api-server` (Express backend)  
> Standar referensi: Web Standards 2026 (Privasi, Aksesibilitas WCAG, Performa, Desain, W3C)  
> **Infrastruktur: aaPanel + Apache 2.4 sebagai reverse proxy (bukan Nginx)**

---

## Legenda

| Simbol | Arti |
|--------|------|
| ✅ | Sudah memenuhi standar |
| ⚠️ | Sebagian / perlu perbaikan kecil |
| ❌ | Belum memenuhi / perlu implementasi |
| 🔴 | Prioritas tinggi |
| 🟡 | Prioritas sedang |
| 🟢 | Prioritas rendah / nice-to-have |
| 🏁 | **Selesai dikerjakan** |

---

## 1. Kepatuhan & Privasi Data

| # | Item | Status | Prioritas | Catatan |
|---|------|--------|-----------|---------|
| 1.1 | HTTPS & SSL valid | ✅ | — | aaPanel + Apache 2.4 + SSL di VPS sudah aktif |
| 1.2 | Kebijakan Privasi | ❌ | 🟡 | Tidak ada halaman privacy policy |
| 1.3 | Cookie Consent Banner | ❌ | 🟢 | App tidak pakai cookie analytics, hanya session auth — risiko rendah |
| 1.4 | Security Headers HTTP | ⚠️ | 🔴 | `helmet` hanya cover `/api/*`. Static files (HTML/JS/CSS) dilayani Apache langsung — header perlu ditambah di Apache `<Directory>` block |
| 1.5 | Content Security Policy (CSP) | ⚠️ | 🔴 | CSP di `helmet` tidak efektif untuk `index.html` karena Apache serve langsung. CSP harus ada di Apache `Header set` pada static file directory |
| 1.6 | Rate Limiting Login | ✅ 🏁 | — | `express-rate-limit` sudah aktif: 10x/15min untuk `/api/auth`, 200x/15min untuk `/api` umum |
| 1.7 | Data Minimalisasi | ✅ | — | Hanya menyimpan API key + session; tidak ada tracking/analytics pihak ketiga |
| 1.8 | Proteksi Private Key | ✅ | — | Private key disimpan server-side, tidak dikirim ke client |

---

## 2. Aksesibilitas Digital (ADA & WCAG 2.1)

| # | Item | Status | Prioritas | Catatan |
|---|------|--------|-----------|---------|
| 2.1 | `lang` attribute HTML | ✅ 🏁 | — | Diganti ke `lang="id"` di `index.html` |
| 2.2 | Viewport `maximum-scale` | ✅ 🏁 | — | `maximum-scale=1` sudah dihapus dari meta viewport |
| 2.3 | Skip-to-content link | ✅ 🏁 | — | Link "Lewati navigasi" ditambahkan di `AppLayout.tsx`, target `id="main-content"` |
| 2.4 | ARIA label ikon-only button | ✅ 🏁 | — | `aria-label` + `aria-expanded` ditambahkan ke tombol "Lainnya" dan "Keluar" |
| 2.5 | Radix UI ARIA built-in | ✅ | — | Accordion, Dialog, Dropdown pakai Radix — ARIA roles sudah lengkap |
| 2.6 | Keyboard navigation | ✅ | — | Semua interaksi bisa via keyboard (Radix + semantic HTML) |
| 2.7 | Focus visible | ⚠️ | 🟡 | Tailwind default sudah ada `focus-visible:ring`, tapi perlu dicek kontras ring di dark mode |
| 2.8 | Color contrast teks | ⚠️ | 🟡 | `text-muted-foreground` (~#71717a) di atas `bg-background` (~#09090b) perlu diverifikasi ratio ≥ 4.5:1 |
| 2.9 | Alt text gambar | ✅ | — | Tidak ada `<img>` statis; logo menggunakan SVG/lucide dengan label teks di sampingnya |
| 2.10 | Error state accessible | ✅ | — | Error message muncul inline dengan ikon `AlertCircle` dan teks deskriptif |

---

## 3. Performa Teknis & Core Web Vitals

| # | Item | Status | Prioritas | Catatan |
|---|------|--------|-----------|---------|
| 3.1 | Code Splitting (lazy load) | ✅ | — | Semua halaman di-lazy dengan `React.lazy()` |
| 3.2 | Manual Chunks Vite | ✅ 🏁 | — | Ditambah chunk `vendor-icons` (lucide-react) dan `vendor-motion` (framer-motion) |
| 3.3 | React dedupe | ✅ | — | `resolve.dedupe: ["react", "react-dom"]` mencegah duplikasi |
| 3.4 | Bundle size `dist/index.mjs` | ⚠️ | 🟡 | Chunking sudah dioptimasi; perlu verifikasi ulang dengan `pnpm run build` setelah deploy ke VPS |
| 3.5 | Google Fonts `font-display` | ✅ | — | URL Google Fonts sudah berisi `&display=swap` — tidak ada FOIT |
| 3.6 | preconnect fonts | ✅ | — | `<link rel="preconnect" href="https://fonts.googleapis.com">` sudah ada |
| 3.7 | Image optimization | ✅ | — | Tidak ada gambar berat; ikon pakai SVG inline (Lucide) |
| 3.8 | Service Worker / PWA | ❌ | 🟢 | Tidak ada offline support / installable — opsional untuk dashboard |
| 3.9 | emptyOutDir: false | ✅ 🏁 | — | Diubah ke `emptyOutDir: true` — dist bersih setiap build |
| 3.10 | Mobile-friendly | ✅ | — | Bottom nav + responsive layout via Tailwind |
| 3.11 | Loading state | ✅ | — | `PageLoader` dengan animasi pulse selama lazy load |

---

## 4. Tren Desain & Antarmuka 2026

| # | Item | Status | Prioritas | Catatan |
|---|------|--------|-----------|---------|
| 4.1 | Dark Mode | ✅ | — | App sepenuhnya dark mode by default |
| 4.2 | Toggle Light/Dark Mode | ❌ | 🟢 | `next-themes` sudah terinstal tapi tidak diekspos ke user |
| 4.3 | Minimalisme | ✅ | — | Layout bersih, shadcn/ui, tidak ada elemen berlebihan |
| 4.4 | Animasi & transisi | ✅ | — | `framer-motion` sudah terinstal; transisi sidebar & loader ada |
| 4.5 | Tipografi konsisten | ✅ | — | Inter font, ukuran konsisten via Tailwind |
| 4.6 | Responsive Mobile | ✅ | — | Desktop sidebar + mobile bottom nav |
| 4.7 | AI-integrated feature | ✅ | — | Halaman AI Advisor tersedia |
| 4.8 | Feedback visual interaksi | ✅ | — | Hover, active, loading state sudah ada di semua komponen |
| 4.9 | Empty state | ⚠️ | 🟢 | Beberapa halaman mungkin tidak punya empty state yang jelas saat data kosong |

---

## 5. Landasan Teknologi (W3C)

| # | Item | Status | Prioritas | Catatan |
|---|------|--------|-----------|---------|
| 5.1 | HTML5 DOCTYPE | ✅ | — | `<!DOCTYPE html>` sudah ada |
| 5.2 | Charset UTF-8 | ✅ | — | `<meta charset="UTF-8" />` |
| 5.3 | Viewport meta | ✅ 🏁 | — | `maximum-scale=1` sudah dihapus (lihat 2.2) |
| 5.4 | Favicon | ✅ | — | `/favicon.ico` terdaftar |
| 5.5 | Meta description | ✅ 🏁 | — | Ditambahkan `<meta name="description">` di `index.html` |
| 5.6 | Open Graph tags | ❌ | 🟢 | Tidak ada OG tags — tidak masalah untuk dashboard private |
| 5.7 | TypeScript | ✅ | — | Full TypeScript dengan strict config |
| 5.8 | Semantic HTML | ⚠️ | 🟡 | `<aside>`, `<nav>`, `<main>` sudah ada; `<header>` / `<footer>` belum ada di beberapa halaman |
| 5.9 | Modern ES modules | ✅ | — | `type="module"` di script tag |
| 5.10 | robots.txt / sitemap | ✅ 🏁 | — | `public/robots.txt` ditambahkan dengan `Disallow: /` (dashboard private) |

---

## 6. Konfigurasi Reverse Proxy — Apache 2.4 + aaPanel

> Analisa berdasarkan VirtualHost config aktual yang digunakan.

### Arsitektur Aktual

```
Browser → Apache :80 → serve dist/ langsung (static files)
                  └→ ProxyPass /api → Node.js :8080
```

**Implikasi kritis:** `helmet` di Express **hanya berlaku untuk `/api/*`**. File `index.html`, semua chunk JS, CSS → dilayani Apache langsung, tanpa security headers apapun.

| # | Item | Status | Prioritas | Catatan |
|---|------|--------|-----------|---------|
| 6.1 | Security headers untuk static files (HTML/JS/CSS) | ❌ | 🔴 | Apache serve `dist/` langsung tanpa `Header set` → CSP, X-Frame-Options, dll tidak dikirim ke browser untuk halaman utama |
| 6.2 | HTTPS / Redirect HTTP→HTTPS | ⚠️ | 🔴 | VirtualHost hanya port 80. Jika ada HTTPS VirtualHost via aaPanel SSL, pastikan port 80 redirect ke 443 |
| 6.3 | `RequestHeader set X-Forwarded-Proto` | ❌ | 🔴 | Tidak ada di config → Express `req.secure = false` → HSTS tidak dikirim, cookie Secure tidak aktif |
| 6.4 | `ProxyPreserveHost On` | ❌ | 🟡 | Tidak ada di config → Express tidak dapat hostname asli dari request |
| 6.5 | `trust proxy` di Express | ✅ | — | Sudah ada di `app.ts` — rate limiter baca IP dari `X-Forwarded-For` dengan benar |
| 6.6 | WebSocket proxy (`mod_proxy_wstunnel`) | ✅ | — | Tidak diperlukan — semua WS outbound dari server ke DEX |
| 6.7 | HTTP/2 via `mod_http2` | ❌ | 🟡 | Belum ada `Protocols h2 http/1.1` — perlu HTTPS VirtualHost dulu |
| 6.8 | Gzip compression static files | ⚠️ | 🟡 | aaPanel biasanya punya `mod_deflate` tapi perlu verifikasi aktif |

---

### Konfigurasi yang Disarankan

Ganti VirtualHost kamu dengan versi ini:

```apache
# ── Redirect HTTP → HTTPS ─────────────────────────────────────────────────────
<VirtualHost *:80>
    ServerName hokireceh.online
    ServerAlias www.hokireceh.online
    RewriteEngine On
    RewriteRule ^(.*)$ https://%{HTTP_HOST}$1 [R=301,L]
</VirtualHost>

# ── HTTPS (main config) ────────────────────────────────────────────────────────
<VirtualHost *:443>
    ServerName hokireceh.online
    ServerAlias www.hokireceh.online

    DocumentRoot /www/wwwroot/HokirecehProjects/artifacts/HK-Projects/dist

    # ── SSL (isi path sesuai aaPanel Let's Encrypt) ────────────────────────────
    SSLEngine on
    SSLCertificateFile      /www/server/panel/vhost/cert/hokireceh.online/fullchain.pem
    SSLCertificateKeyFile   /www/server/panel/vhost/cert/hokireceh.online/privkey.pem

    # ── Security Headers untuk static files ───────────────────────────────────
    <IfModule mod_headers.c>
        Header always set X-Frame-Options "SAMEORIGIN"
        Header always set X-Content-Type-Options "nosniff"
        Header always set Referrer-Policy "strict-origin-when-cross-origin"
        Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains" env=HTTPS
        Header always set Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://mainnet.zklighter.elliot.ai https://testnet.zklighter.elliot.ai https://api.starknet.extended.exchange https://api.starknet.sepolia.extended.exchange; object-src 'none'; frame-ancestors 'none'"
    </IfModule>

    # ── HTTP/2 ─────────────────────────────────────────────────────────────────
    Protocols h2 http/1.1

    # ── Gzip compression ───────────────────────────────────────────────────────
    <IfModule mod_deflate.c>
        AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json
    </IfModule>

    # ── Static files SPA routing ───────────────────────────────────────────────
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

    # ── Proxy /api ke backend Node.js ──────────────────────────────────────────
    ProxyRequests Off
    ProxyPreserveHost On
    ProxyPass /api http://127.0.0.1:8080/api
    ProxyPassReverse /api http://127.0.0.1:8080/api

    # Kirim info HTTPS ke Express (krusial untuk cookie Secure)
    RequestHeader set X-Forwarded-Proto "https"
    RequestHeader set X-Forwarded-Port "443"

    # ── Browser cache untuk static assets (hash di filename, aman di-cache lama) ─
    <LocationMatch "\.(js|css|woff2?|ico)$">
        Header set Cache-Control "public, max-age=31536000, immutable"
    </LocationMatch>
    # index.html jangan di-cache (SPA entry point)
    <LocationMatch "^/$|\.html$">
        Header set Cache-Control "no-cache, no-store, must-revalidate"
    </LocationMatch>
</VirtualHost>
```

> **Catatan path SSL:** aaPanel Let's Encrypt biasanya simpan cert di `/www/server/panel/vhost/cert/<domain>/`. Sesuaikan path jika berbeda. Kalau aaPanel yang generate HTTPS VirtualHost otomatis, tambahkan directive di atas ke dalam VirtualHost yang sudah ada.

---

### Yang Berubah dari Config Lama

| Sebelum | Sesudah | Alasan |
|---------|---------|--------|
| Port 80 saja | 80 redirect → 443, main di 443 | Enforce HTTPS |
| Tidak ada `Header set` | Security headers untuk semua static files | CSP & X-Frame-Options butuh ini |
| Tidak ada `ProxyPreserveHost` | `ProxyPreserveHost On` | Express dapat hostname asli |
| Tidak ada `RequestHeader` | `RequestHeader set X-Forwarded-Proto "https"` | Cookie Secure + HSTS aktif |
| Tidak ada cache control | Cache 1 tahun untuk JS/CSS, no-cache untuk HTML | Performa + correctness |
| Tidak ada HTTP/2 | `Protocols h2 http/1.1` | Load chunk JS paralel |

---

## Ringkasan Skor

| Kategori | Skor Awal | Skor Sekarang | Komentar |
|----------|-----------|---------------|----------|
| Privasi & Keamanan | 3/8 | **5/8** | 1.4 & 1.5 dikembalikan ⚠️ — helmet tidak cover static files |
| Aksesibilitas WCAG | 5/10 | **8/10** | lang, maximum-scale, skip-link, aria-label sudah fix |
| Performa | 7/11 | **9/11** | Chunking dioptimasi, emptyOutDir fix |
| Desain 2026 | 8/9 | **8/9** | Belum ada toggle dark/light |
| Teknologi W3C | 6/10 | **9/10** | Meta description, robots.txt, viewport fix |
| **Apache Proxy** | **0/8 (baru)** | **2/8** | `trust proxy` & WebSocket oke; 6 item perlu config di VPS |
| **Total** | **29/56 (52%)** | **41/56 (73%)** | Setelah revisi temuan Apache static file serving |

---

## Roadmap Implementasi (Prioritas)

### ✅ Selesai
1. ~~**Hapus `maximum-scale=1`**~~ — `index.html` ✅
2. ~~**Security headers di API layer**~~ — via `helmet` di `app.ts` (hanya berlaku untuk `/api/*`) ✅
3. ~~**Rate limiting login di API server**~~ — `express-rate-limit` sudah aktif ✅
4. ~~**Ganti `lang="en"` → `lang="id"`**~~ ✅
5. ~~**Tambah `<meta name="description">`**~~ ✅
6. ~~**Skip-to-content link**~~ — `AppLayout.tsx` ✅
7. ~~**ARIA label pada icon-only button**~~ — tombol "Lainnya" & "Keluar" ✅
8. ~~**robots.txt dengan `Disallow: /`**~~ ✅
9. ~~**emptyOutDir: true**~~ ✅
10. ~~**Optimasi chunk Vite**~~ — tambah `vendor-icons`, `vendor-motion` ✅

### 🔴 Segera — Apache VPS (dikerjakan manual di server)
> Gunakan config lengkap di Section 6 sebagai referensi.

11. **Tambah `Header always set` untuk security headers** di `<Directory dist>` block — CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
12. **Migrate ke HTTPS VirtualHost (:443)** + redirect 80 → 443 — jika belum ada
13. **Tambah `RequestHeader set X-Forwarded-Proto "https"`** di VirtualHost :443 — agar cookie Secure & HSTS aktif
14. **Tambah `ProxyPreserveHost On`** sebelum `ProxyPass`
15. **Tambah cache headers** — `max-age=31536000` untuk JS/CSS, `no-cache` untuk HTML

### 🟡 Jangka Menengah (Kualitas)
- **Enable HTTP/2** (`Protocols h2 http/1.1`) di VirtualHost :443
- **Verifikasi Gzip aktif** (`mod_deflate`) untuk JS/CSS/HTML
- **Verifikasi bundle size setelah build** — jalankan `pnpm run build` di VPS, cek ukuran tiap chunk
- **Color contrast audit** — verifikasi `text-muted-foreground` ratio ≥ 4.5:1

### 🟢 Nice-to-have (Enhancement)
- **Toggle Light/Dark Mode** — 1 jam (pakai `next-themes` yang sudah ada)
- **Privacy Policy page** — 2 jam
- **PWA / Service Worker** — 1 hari
- **Open Graph tags** — 15 menit (jika app jadi publik)

---

*Audit ini berdasarkan inspeksi kode statis. Untuk audit performa runtime, gunakan Lighthouse atau PageSpeed Insights setelah deploy.*
