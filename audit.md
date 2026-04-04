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

> Analisa berdasarkan VirtualHost config aktual + **Cloudflare DNS/Proxy** di depan server.

### Arsitektur Aktual (dengan Cloudflare)

```
Browser → HTTPS → Cloudflare CDN → HTTP :80 → Apache :80
                                              ├── serve dist/ (static files)
                                              └── ProxyPass /api → Node.js :8080
```

**Port 80 adalah benar** untuk setup Cloudflare Flexible SSL — Cloudflare yang terminate HTTPS, origin server cukup terima HTTP.

**Implikasi kritis yang tetap berlaku:** `helmet` di Express **hanya berlaku untuk `/api/*`**. File `index.html`, semua chunk JS, CSS → dilayani Apache langsung, tanpa security headers apapun. Cloudflare **tidak** inject CSP atau X-Frame-Options secara otomatis.

| # | Item | Status | Prioritas | Catatan |
|---|------|--------|-----------|---------|
| 6.1 | Security headers untuk static files | ❌ | 🔴 | Apache serve `dist/` tanpa `Header set` → CSP, X-Frame-Options dll tidak sampai ke browser. Cloudflare tidak inject ini. |
| 6.2 | HTTPS enforcement | ✅ | — | Cloudflare handle — aktifkan **Always Use HTTPS** di Cloudflare dashboard (SSL/TLS → Edge) |
| 6.3 | `X-Forwarded-Proto` ke Express | ✅ | — | Cloudflare otomatis kirim header ini — Apache pass-through ke Express via ProxyPass |
| 6.4 | `ProxyPreserveHost On` | ❌ | 🟡 | Belum ada di config → Express tidak dapat hostname asli |
| 6.5 | `trust proxy` di Express | ✅ | — | Sudah ada — Express baca `X-Forwarded-For` dari Cloudflare dengan benar |
| 6.6 | WebSocket proxy | ✅ | — | Tidak diperlukan — semua WS outbound dari server ke DEX |
| 6.7 | HTTP/2 | ✅ | — | Cloudflare sudah HTTP/2 antara browser↔Cloudflare. Origin ke Apache HTTP/1.1 tidak masalah. |
| 6.8 | Gzip / compression | ✅ | — | Cloudflare compress di edge. `mod_deflate` di Apache tetap boleh aktif sebagai backup. |
| 6.9 | HSTS | ⚠️ | 🟡 | Aktifkan di Cloudflare: SSL/TLS → Edge Certificates → HSTS. Lebih efektif dari Apache level. |
| 6.10 | Cloudflare WAF / Bot protection | ⚠️ | 🟡 | Free tier: aktifkan **Bot Fight Mode** + **Security Level: Medium** di Cloudflare dashboard |

---

### Cara Ubah Config di aaPanel

Masuk **aaPanel → Website → domain → Config** (tombol pensil/edit), cari VirtualHost block yang ada, tambahkan baris yang ditandai `← TAMBAH`:

```apache
<VirtualHost *:80>
    ServerName hokireceh.online
    ServerAlias www.hokireceh.online

    DocumentRoot /www/wwwroot/HokirecehProjects/artifacts/HK-Projects/dist

    # ── Security Headers (TAMBAH semua ini) ────────────────────────────────────
    <IfModule mod_headers.c>
        Header always set X-Frame-Options "SAMEORIGIN"
        Header always set X-Content-Type-Options "nosniff"
        Header always set Referrer-Policy "strict-origin-when-cross-origin"
        Header always set Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://mainnet.zklighter.elliot.ai https://testnet.zklighter.elliot.ai https://api.starknet.extended.exchange https://api.starknet.sepolia.extended.exchange; object-src 'none'"
        # Cache headers
        Header set Cache-Control "no-cache, no-store, must-revalidate"
    </IfModule>

    # Cache panjang untuk aset JS/CSS (nama file sudah include hash dari Vite)
    <LocationMatch "\.(js|css|woff2?|ico|png|svg)$">
        Header set Cache-Control "public, max-age=31536000, immutable"
    </LocationMatch>

    <Directory /www/wwwroot/HokirecehProjects/artifacts/HK-Projects/dist>
        AllowOverride All
        Require all granted
        Options -Indexes

        # SPA routing (sudah ada — tetap)
        RewriteEngine On
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteCond %{REQUEST_URI} !^/api
        RewriteRule ^ /index.html [L]
    </Directory>

    # Proxy /api ke backend PM2 (sudah ada — tambah ProxyPreserveHost)
    ProxyRequests Off
    ProxyPreserveHost On                          ← TAMBAH
    ProxyPass /api http://127.0.0.1:8080/api
    ProxyPassReverse /api http://127.0.0.1:8080/api
</VirtualHost>
```

Setelah edit, klik **Save** di aaPanel lalu restart Apache dari panel atau:
```bash
/etc/init.d/httpd restart
```

---

### Checklist Cloudflare Dashboard (gratis)

| Lokasi | Setting | Nilai |
|--------|---------|-------|
| SSL/TLS → Overview | SSL mode | **Flexible** (origin HTTP) |
| SSL/TLS → Edge Certificates | Always Use HTTPS | **On** |
| SSL/TLS → Edge Certificates | HSTS | Enable, max-age 6 bulan |
| Security → Settings | Security Level | **Medium** |
| Security → Bots | Bot Fight Mode | **On** |
| Speed → Optimization | Auto Minify | JS ✅ CSS ✅ HTML ✅ |

---

### Yang Berubah dari Analisa Sebelumnya (koreksi)

| Item | Analisa Lama (tanpa Cloudflare) | Koreksi (dengan Cloudflare) |
|------|--------------------------------|---------------------------|
| Port 80 VirtualHost | ⚠️ Harus migrate ke :443 | ✅ Sudah benar untuk Flexible SSL |
| HTTPS redirect | Harus tambah di Apache | Cloudflare handle — aktifkan di dashboard |
| `X-Forwarded-Proto` | Harus set manual di Apache | Cloudflare sudah kirim otomatis |
| HTTP/2 | Harus enable mod_http2 | Cloudflare sudah HTTP/2 |
| Security headers static | ❌ Tetap perlu di Apache | ❌ Tetap perlu di Apache (tidak berubah) |

---

## Ringkasan Skor

| Kategori | Skor Awal | Skor Sekarang | Komentar |
|----------|-----------|---------------|----------|
| Privasi & Keamanan | 3/8 | **5/8** | 1.4 & 1.5 dikembalikan ⚠️ — helmet tidak cover static files |
| Aksesibilitas WCAG | 5/10 | **8/10** | lang, maximum-scale, skip-link, aria-label sudah fix |
| Performa | 7/11 | **9/11** | Chunking dioptimasi, emptyOutDir fix |
| Desain 2026 | 8/9 | **8/9** | Belum ada toggle dark/light |
| Teknologi W3C | 6/10 | **9/10** | Meta description, robots.txt, viewport fix |
| **Apache + Cloudflare** | **0/10 (baru)** | **6/10** | HTTPS/HTTP2/Gzip/X-Forwarded-Proto sudah oke via CF; security headers static files + ProxyPreserveHost perlu ditambah |
| **Total** | **29/58 (50%)** | **45/58 (78%)** | Setelah revisi dengan konteks Cloudflare |

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

### 🔴 Segera — aaPanel Apache (edit config di GUI aaPanel)
> Masuk **aaPanel → Website → domain → Config**, tambahkan ke VirtualHost yang ada.  
> Config lengkap ada di Section 6 audit ini.

11. **Tambah `<IfModule mod_headers.c>` block** dengan CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
12. **Tambah `ProxyPreserveHost On`** sebelum `ProxyPass`
13. **Tambah cache headers** — JS/CSS `max-age=31536000 immutable`, HTML `no-cache`

### 🟡 Jangka Menengah (Cloudflare Dashboard — gratis)
- **SSL/TLS → Edge Certificates → Always Use HTTPS: On**
- **SSL/TLS → Edge Certificates → HSTS: Enable**
- **Security → Bots → Bot Fight Mode: On**
- **Speed → Optimization → Auto Minify: On** (JS/CSS/HTML)

### 🟡 Jangka Menengah (Kualitas Kode)
- **Verifikasi bundle size setelah build** — jalankan `pnpm run build` di VPS, cek ukuran tiap chunk
- **Color contrast audit** — verifikasi `text-muted-foreground` ratio ≥ 4.5:1

### 🟢 Nice-to-have (Enhancement)
- **Toggle Light/Dark Mode** — 1 jam (pakai `next-themes` yang sudah ada)
- **Privacy Policy page** — 2 jam
- **PWA / Service Worker** — 1 hari
- **Open Graph tags** — 15 menit (jika app jadi publik)

---

*Audit ini berdasarkan inspeksi kode statis. Untuk audit performa runtime, gunakan Lighthouse atau PageSpeed Insights setelah deploy.*
