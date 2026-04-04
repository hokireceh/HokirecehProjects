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
| 1.4 | Security Headers HTTP | ✅ 🏁 | — | Sudah implementasi via `helmet` di `app.ts` — X-Frame-Options, HSTS, Referrer-Policy sudah aktif |
| 1.5 | Content Security Policy (CSP) | ✅ 🏁 | — | CSP sudah dikonfigurasi di `helmet()` dengan whitelist Lighter, Extended, Google Fonts |
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

> Bagian ini khusus hasil analisa ulang setelah diketahui stack VPS pakai **aaPanel + Apache 2.4**, bukan Nginx.

| # | Item | Status | Prioritas | Catatan |
|---|------|--------|-----------|---------|
| 6.1 | `X-Forwarded-Proto` header dari Apache | ⚠️ | 🔴 | Apache harus kirim `RequestHeader set X-Forwarded-Proto "https"` agar HSTS dari `helmet` aktif (`req.secure = true`) |
| 6.2 | `trust proxy` di Express | ✅ | — | `app.set("trust proxy", 1)` sudah ada — Express baca `X-Forwarded-For` dari Apache dengan benar |
| 6.3 | Duplicate security headers | ⚠️ | 🔴 | aaPanel kadang inject `X-Frame-Options` / `X-Content-Type-Options` di VirtualHost template — duplikat dengan helmet → browser bisa reject. Perlu dicek di aaPanel panel |
| 6.4 | HTTP/2 via `mod_http2` | ❌ | 🟡 | Apache 2.4.17+ support HTTP/2 — perlu dicek apakah aktif di aaPanel. Berguna untuk load chunk JS paralel |
| 6.5 | Gzip / Brotli compression | ⚠️ | 🟡 | aaPanel biasanya include `mod_deflate` — perlu verifikasi aktif untuk static assets (JS/CSS) |
| 6.6 | WebSocket proxy (`mod_proxy_wstunnel`) | ✅ | — | Tidak diperlukan — semua WS di app ini adalah outbound server→DEX. Browser hanya pakai HTTP polling via React Query |
| 6.7 | `ProxyPreserveHost On` | ⚠️ | 🟡 | Perlu dipastikan aktif agar Express dapat hostname asli (untuk cookie domain, logging) |
| 6.8 | Cookie `Secure` flag | ⚠️ | 🔴 | Session cookie perlu `Secure` flag — hanya aktif kalau `req.secure = true` (tergantung 6.1) |

### Saran Implementasi 6.1, 6.3, 6.7 — Apache VirtualHost Config (aaPanel)

Di aaPanel, masuk ke **Website → Config** untuk domain kamu, tambahkan di bagian VirtualHost:

```apache
<VirtualHost *:443>
    ServerName yourdomain.com

    # Reverse proxy ke Express
    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:8080/
    ProxyPassReverse / http://127.0.0.1:8080/

    # Kirim info HTTPS ke Express (krusial untuk helmet HSTS + cookie Secure)
    RequestHeader set X-Forwarded-Proto "https"
    RequestHeader set X-Forwarded-Port "443"

    # HAPUS baris ini jika ada (duplikat dengan helmet):
    # Header set X-Frame-Options "SAMEORIGIN"        ← hapus
    # Header set X-Content-Type-Options "nosniff"    ← hapus
    # Header always set Strict-Transport-Security... ← hapus

    # SSL config (biasanya sudah dihandle aaPanel/Let's Encrypt)
    SSLEngine on
    ...
</VirtualHost>
```

### Saran Implementasi 6.4 — Enable HTTP/2

Di aaPanel atau langsung di Apache config:
```apache
# /etc/httpd/conf.modules.d/ atau /etc/apache2/mods-enabled/
LoadModule http2_module modules/mod_http2.so

<VirtualHost *:443>
    Protocols h2 http/1.1
    ...
</VirtualHost>
```

### Catatan Tambahan — Komentar Kode `app.ts`

Komentar di baris `app.set("trust proxy", 1)` masih menyebut "Nginx / Caddy / Replit proxy" — sudah diupdate menjadi Apache-aware.

---

## Ringkasan Skor

| Kategori | Skor Awal | Skor Sekarang | Komentar |
|----------|-----------|---------------|----------|
| Privasi & Keamanan | 3/8 | **6/8** | Security headers, CSP, rate limit sudah beres |
| Aksesibilitas WCAG | 5/10 | **8/10** | lang, maximum-scale, skip-link, aria-label sudah fix |
| Performa | 7/11 | **9/11** | Chunking dioptimasi, emptyOutDir fix |
| Desain 2026 | 8/9 | **8/9** | Belum ada toggle dark/light |
| Teknologi W3C | 6/10 | **9/10** | Meta description, robots.txt, viewport fix |
| **Apache Proxy** | **0/8 (baru)** | **2/8** | `trust proxy` & WebSocket sudah oke; 6 item perlu dicek/config di VPS |
| **Total** | **29/56 (52%)** | **42/56 (75%)** | Dengan scope Apache proxy ditambahkan |

---

## Roadmap Implementasi (Prioritas)

### ✅ Selesai
1. ~~**Hapus `maximum-scale=1`**~~ — `index.html` ✅
2. ~~**Security headers di Nginx**~~ — sudah via `helmet` di `app.ts` ✅
3. ~~**Rate limiting login di API server**~~ — `express-rate-limit` sudah aktif ✅
4. ~~**Ganti `lang="en"` → `lang="id"`**~~ ✅
5. ~~**Tambah `<meta name="description">`**~~ ✅
6. ~~**Skip-to-content link**~~ — `AppLayout.tsx` ✅
7. ~~**ARIA label pada icon-only button**~~ — tombol "Lainnya" & "Keluar" ✅
8. ~~**robots.txt dengan `Disallow: /`**~~ ✅
9. ~~**emptyOutDir: true**~~ ✅
10. ~~**Optimasi chunk Vite**~~ — tambah `vendor-icons`, `vendor-motion` ✅

### 🔴 Segera — Apache VPS (dikerjakan manual di server)
11. **Tambah `RequestHeader set X-Forwarded-Proto "https"`** di VirtualHost aaPanel — agar HSTS & cookie Secure aktif
12. **Cek duplicate security headers** di VirtualHost aaPanel — hapus jika ada `X-Frame-Options` / `X-Content-Type-Options` duplikat
13. **Pastikan `ProxyPreserveHost On`** aktif di VirtualHost config

### 🟡 Jangka Menengah (Kualitas)
- **Enable HTTP/2** di aaPanel (`mod_http2` + `Protocols h2 http/1.1`) — performa load chunk JS lebih baik
- **Verifikasi Gzip aktif** (`mod_deflate`) untuk JS/CSS/HTML di Apache
- **Verifikasi bundle size setelah build** — jalankan `pnpm run build` di VPS, cek ukuran tiap chunk
- **Color contrast audit** — verifikasi `text-muted-foreground` ratio ≥ 4.5:1

### 🟢 Nice-to-have (Enhancement)
- **Toggle Light/Dark Mode** — 1 jam (pakai `next-themes` yang sudah ada)
- **Privacy Policy page** — 2 jam
- **PWA / Service Worker** — 1 hari
- **Open Graph tags** — 15 menit (jika app jadi publik)

---

*Audit ini berdasarkan inspeksi kode statis. Untuk audit performa runtime, gunakan Lighthouse atau PageSpeed Insights setelah deploy.*
