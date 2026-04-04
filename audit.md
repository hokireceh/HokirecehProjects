# Audit Web Standar 2026 — Hokireceh Projects

> Tanggal audit: April 2026  
> Scope: `artifacts/HK-Projects` (React + Vite frontend) + `artifacts/api-server` (Express backend)  
> Standar referensi: Web Standards 2026 (Privasi, Aksesibilitas WCAG, Performa, Desain, W3C)

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

---

## 1. Kepatuhan & Privasi Data

| # | Item | Status | Prioritas | Catatan |
|---|------|--------|-----------|---------|
| 1.1 | HTTPS & SSL valid | ✅ | — | Nginx + SSL di VPS sudah aktif |
| 1.2 | Kebijakan Privasi | ❌ | 🟡 | Tidak ada halaman privacy policy |
| 1.3 | Cookie Consent Banner | ❌ | 🟢 | App tidak pakai cookie analytics, hanya session auth — risiko rendah |
| 1.4 | Security Headers HTTP | ❌ | 🔴 | Tidak ada `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, `Referrer-Policy` |
| 1.5 | Content Security Policy (CSP) | ❌ | 🔴 | Tidak ada header CSP — rentan XSS injection |
| 1.6 | Rate Limiting Login | ⚠️ | 🔴 | Ada limit 3x di sisi client (bisa di-bypass via curl). Perlu rate limit di API server |
| 1.7 | Data Minimalisasi | ✅ | — | Hanya menyimpan API key + session; tidak ada tracking/analytics pihak ketiga |
| 1.8 | Proteksi Private Key | ✅ | — | Private key disimpan server-side, tidak dikirim ke client |

### Saran Implementasi 1.4 & 1.5
Tambahkan di Nginx config:
```nginx
add_header X-Frame-Options "SAMEORIGIN";
add_header X-Content-Type-Options "nosniff";
add_header Referrer-Policy "strict-origin-when-cross-origin";
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' wss:;";
```

### Saran Implementasi 1.6
Tambahkan rate limiting di `api-server` menggunakan `express-rate-limit`:
```ts
import rateLimit from "express-rate-limit";
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }));
```

---

## 2. Aksesibilitas Digital (ADA & WCAG 2.1)

| # | Item | Status | Prioritas | Catatan |
|---|------|--------|-----------|---------|
| 2.1 | `lang` attribute HTML | ❌ | 🟡 | `<html lang="en">` padahal konten 100% Bahasa Indonesia — seharusnya `lang="id"` |
| 2.2 | Viewport `maximum-scale` | ❌ | 🔴 | `maximum-scale=1` mencegah zoom — **melanggar WCAG 1.4.4** (teks bisa dibesarkan) |
| 2.3 | Skip-to-content link | ❌ | 🟡 | Tidak ada link "Lewati navigasi" untuk screen reader |
| 2.4 | ARIA label ikon-only button | ⚠️ | 🟡 | Tombol "Keluar" dan "Lainnya" di mobile tidak punya `aria-label` eksplisit |
| 2.5 | Radix UI ARIA built-in | ✅ | — | Accordion, Dialog, Dropdown pakai Radix — ARIA roles sudah lengkap |
| 2.6 | Keyboard navigation | ✅ | — | Semua interaksi bisa via keyboard (Radix + semantic HTML) |
| 2.7 | Focus visible | ⚠️ | 🟡 | Tailwind default sudah ada `focus-visible:ring`, tapi perlu dicek kontras ring di dark mode |
| 2.8 | Color contrast teks | ⚠️ | 🟡 | `text-muted-foreground` (~#71717a) di atas `bg-background` (~#09090b) perlu diverifikasi ratio ≥ 4.5:1 |
| 2.9 | Alt text gambar | ✅ | — | Tidak ada `<img>` statis; logo menggunakan SVG/lucide dengan label teks di sampingnya |
| 2.10 | Error state accessible | ✅ | — | Error message muncul inline dengan ikon `AlertCircle` dan teks deskriptif |

### Saran Implementasi 2.1
```html
<!-- index.html -->
<html lang="id">
```

### Saran Implementasi 2.2
```html
<!-- Hapus maximum-scale=1 -->
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

### Saran Implementasi 2.3
```tsx
// Tambahkan di AppLayout.tsx sebelum <aside>
<a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-50 bg-background px-4 py-2 rounded">
  Lewati navigasi
</a>
<main id="main-content" ...>
```

---

## 3. Performa Teknis & Core Web Vitals

| # | Item | Status | Prioritas | Catatan |
|---|------|--------|-----------|---------|
| 3.1 | Code Splitting (lazy load) | ✅ | — | Semua halaman di-lazy dengan `React.lazy()` |
| 3.2 | Manual Chunks Vite | ✅ | — | `vendor-react`, `vendor-ui`, `vendor-charts` terpisah |
| 3.3 | React dedupe | ✅ | — | `resolve.dedupe: ["react", "react-dom"]` mencegah duplikasi |
| 3.4 | Bundle size `dist/index.mjs` | ❌ | 🔴 | **5.7MB** — terlalu besar untuk initial load. Target < 500KB per chunk |
| 3.5 | Google Fonts `font-display` | ❌ | 🟡 | Link Google Fonts tidak pakai `&display=swap` — menyebabkan FOIT |
| 3.6 | preconnect fonts | ✅ | — | `<link rel="preconnect" href="https://fonts.googleapis.com">` sudah ada |
| 3.7 | Image optimization | ✅ | — | Tidak ada gambar berat; ikon pakai SVG inline (Lucide) |
| 3.8 | Service Worker / PWA | ❌ | 🟢 | Tidak ada offline support / installable — opsional untuk dashboard |
| 3.9 | emptyOutDir: false | ⚠️ | 🟢 | Bisa tinggalkan file stale di `dist/`; pertimbangkan `true` |
| 3.10 | Mobile-friendly | ✅ | — | Bottom nav + responsive layout via Tailwind |
| 3.11 | Loading state | ✅ | — | `PageLoader` dengan animasi pulse selama lazy load |

### Saran Implementasi 3.4
Bundle 5.7MB disebabkan semua node_modules masuk ke satu chunk. Investigasi dengan:
```bash
pnpm run build -- --report
# atau
npx vite-bundle-visualizer
```
Kandidat penyebab besar: `recharts` + `d3-*`, `framer-motion`, `@tanstack/react-query`.
Pertimbangkan dynamic import untuk halaman yang jarang diakses (AI Advisor, Logs).

### Saran Implementasi 3.5
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```
→ Sudah ada `display=swap` di URL, tapi tidak di link tag. Pastikan URL berisi `&display=swap`.

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
| 5.3 | Viewport meta | ⚠️ | 🔴 | Ada `maximum-scale=1` — perlu dihapus (lihat 2.2) |
| 5.4 | Favicon | ✅ | — | `/favicon.ico` terdaftar |
| 5.5 | Meta description | ❌ | 🟡 | Tidak ada `<meta name="description">` |
| 5.6 | Open Graph tags | ❌ | 🟢 | Tidak ada OG tags — tidak masalah untuk dashboard private |
| 5.7 | TypeScript | ✅ | — | Full TypeScript dengan strict config |
| 5.8 | Semantic HTML | ⚠️ | 🟡 | `<aside>`, `<nav>`, `<main>` sudah ada; `<header>` / `<footer>` belum ada di beberapa halaman |
| 5.9 | Modern ES modules | ✅ | — | `type="module"` di script tag |
| 5.10 | robots.txt / sitemap | ❌ | 🟢 | Tidak ada — opsional untuk dashboard private (pertimbangkan `Disallow: /`) |

---

## Ringkasan Skor

| Kategori | Skor | Komentar |
|----------|------|----------|
| Privasi & Keamanan | 3/8 | Security headers & rate limit server-side perlu segera |
| Aksesibilitas WCAG | 5/10 | `maximum-scale=1` dan `lang="en"` harus diperbaiki |
| Performa | 7/11 | Bundle 5.7MB perlu investigasi lebih lanjut |
| Desain 2026 | 8/9 | Sudah sangat baik; toggle dark/light opsional |
| Teknologi W3C | 6/10 | Meta description dan semantic HTML perlu tambahan |
| **Total** | **29/48 (60%)** | |

---

## Roadmap Implementasi (Prioritas)

### 🔴 Segera (Security-critical)
1. **Hapus `maximum-scale=1`** — 5 menit, 1 baris di `index.html`
2. **Security headers di Nginx** — 15 menit, tambah di nginx.conf
3. **Rate limiting login di API server** — 30 menit, `express-rate-limit`

### 🟡 Jangka Menengah (Kualitas)
4. **Ganti `lang="en"` → `lang="id"`** — 2 menit
5. **Tambah `<meta name="description">`** — 5 menit
6. **Skip-to-content link** — 15 menit
7. **ARIA label pada icon-only button** — 15 menit
8. **Investigasi & optimasi bundle 5.7MB** — 2-4 jam

### 🟢 Nice-to-have (Enhancement)
9. **Toggle Light/Dark Mode** — 1 jam (pakai `next-themes` yang sudah ada)
10. **Privacy Policy page** — 2 jam
11. **robots.txt dengan `Disallow: /`** — 5 menit
12. **PWA / Service Worker** — 1 hari

---

*Audit ini berdasarkan inspeksi kode statis. Untuk audit performa runtime, gunakan Lighthouse atau PageSpeed Insights setelah deploy.*
