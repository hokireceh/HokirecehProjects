# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **AI**: Groq SDK (5-tier cascade model system)

## AI Agent — Groq 5-Tier Cascade

Endpoint: `POST /api/ai/analyze` — requires `GROQ_API_KEY` secret.

Model tiers (auto-cascade on rate limit):
1. `llama-3.3-70b-versatile` — Premium
2. `moonshotai/kimi-k2-instruct` — High
3. `compound-beta` — Good
4. `meta-llama/llama-4-scout-17b-16e-instruct` — Scout
5. `llama-3.1-8b-instant` — Standard

The AI analyzes real-time market data (price, 24h range, volume, volatility) and recommends optimal strategy parameters for DCA and Grid bots. Returns `recommendation`, `reasoning`, `marketCondition`, `riskLevel`, `confidence`.

## Strategy Features

### DCA Bot
- Market / Limit order type selection
- Limit Price Offset (USDC) — shown when orderType=limit
- AI Auto-Fill button (analyzes market → fills all parameters)

### Grid Bot
- Market / Limit order type selection (default: Limit ⭐ for maker fees)
- Limit Price Offset from crossing price
- Mode: Neutral / Long / Short
- Stop Loss / Take Profit
- AI Auto-Fill button (analyzes market → fills Lower/Upper/Levels/Amount/Mode/SL/TP)

## Prinsip Arsitektur Multi-DEX (WAJIB DIPATUHI)

Proyek ini adalah **multi-DEX trading bot tool**. Setiap penambahan fitur atau DEX baru harus mengikuti prinsip berikut:

### Graceful Shutdown (index.ts)
`src/index.ts` menangani `SIGTERM` dan `SIGINT` dengan urutan:
1. Stop HTTP server (no new connections)
2. Stop semua Lighter bots
3. Stop semua Extended bots
4. Stop semua Ethereal bots
5. Destroy Extended WS connections
6. Close DB pool
7. `process.exit(0)`

Ini memastikan pm2 restart bersih tanpa SIGKILL.

### Status DEX
| DEX | Status | Keterangan |
|---|---|---|
| **Lighter** | ✅ Production (24/7) | **JANGAN DISENTUH SAMA SEKALI** |
| **Extended** | ✅ Implemented | StarkNet perp DEX, berjalan paralel dengan Lighter |
| **Ethereal** | ✅ Implemented | EVM perps DEX (Ethena), EIP-712, margin USDe, Socket.IO WS |

### Aturan Isolasi (Non-Negotiable)
1. **Setiap DEX punya logika sendiri yang terisolasi penuh:**
   - API client: `src/lib/<dex>/`
   - Signing/auth: `src/lib/<dex>/`
   - Bot engine: `src/lib/<dex>/`
   - Routes: `src/routes/<dex>/`
   - Tidak ada kode Lighter yang boleh diimpor dari modul Extended, atau sebaliknya
2. **Menambahkan DEX baru = menambahkan folder baru**, bukan memodifikasi kode DEX yang ada
3. **Lighter tidak boleh disentuh** untuk alasan apapun — production, live 24/7, ada risiko finansial langsung

### Aturan UI
- Komponen UI yang sama (bot card, form strategi, log viewer, dsb.) **dipakai ulang via konfigurasi**, bukan diduplikasi per-DEX
- UI harus bisa menampilkan semua DEX secara berdampingan dalam tampilan yang konsisten
- Template UI Extended mengikuti pola Lighter, tetapi memanggil API endpoint Extended-nya sendiri

### Extended DEX — Frontend Hooks (React Query)
Data fetching Extended sudah **dimigrasikan ke React Query** (`artifacts/HK-Projects/src/hooks/useExtended.ts`):
- `useExtendedStrategies()` — refetchInterval 5s + refetchOnWindowFocus
- `useExtendedAccount()` — refetchInterval 15s
- `useExtendedLogs(strategyId, enabled)` — refetchInterval 15s saat dialog buka
- `useExtendedPnlChart(strategyId, enabled)` — fetch on demand
- `useStartExtendedBot()`, `useStopExtendedBot()`, `useDeleteExtendedStrategy()` — mutations dengan invalidateQueries

Komponen Extended yang sudah ada:
- `ExtLogDialog.tsx` — log per strategy card (baru)
- `ExtAccountWidget.tsx` — balance + uPnL widget (baru)
- `ExtCreateStrategyModal.tsx`, `ExtEditStrategyModal.tsx` — sudah ada sebelumnya

### Extended DEX — Implementasi Saat Ini
- API client: `src/lib/extended/extendedApi.ts`
- Signing: `src/lib/extended/extendedSigner.ts`
- Bot engine: `src/lib/extended/extendedBotEngine.ts`
- Order manager: `src/lib/extended/extendedOrderManager.ts`
- Market cache: `src/lib/extended/extendedMarkets.ts`
- WebSocket price: `src/lib/extended/extendedWs.ts`
- Account WS: `src/lib/extended/extendedAccountWs.ts`
- Routes: `src/routes/extended/bot.ts`
- Credentials disimpan via `bot_config` table (sama dengan Lighter, key berbeda)
- `l2Vault` (collateralPosition untuk signing) diambil dari API saat bot start, di-cache 24 jam — **bukan** accountId dari DB
- AI Advisor: system prompt terpisah per DEX (`LIGHTER_SYSTEM_PROMPT` vs `EXTENDED_SYSTEM_PROMPT`) di `src/lib/groqAI.ts`

#### Algoritma Signing Extended Exchange (CRITICAL — JANGAN UBAH)
Dikonfirmasi dari Rust source code x10xchange (`rust-crypto-lib-base/src/starknet_messages.rs`):

**ALGORITHM: Poseidon (bukan Pedersen!)**

```
ORDER_HASH = Poseidon([
  ORDER_SELECTOR,        // 0x36da8d51815527cabfaa9c982f564c80fa7429616739306036f1f9b608dd112
  position_id,           // u32 (l2Vault, e.g. 364658)
  base_asset_id,         // felt (syntheticId — SELALU synthetic, tidak swap berdasarkan BUY/SELL!)
  base_amount,           // i64 signed: BUY → +syntheticQty, SELL → -syntheticQty
  quote_asset_id,        // felt (collateralId — SELALU collateral)
  quote_amount,          // i64 signed: BUY → -collateralAmount, SELL → +collateralAmount
  fee_asset_id,          // felt (sama dengan collateralId)
  fee_amount,            // u64 unsigned
  expiration_seconds,    // u64 — Unix timestamp dalam DETIK (bukan jam! bukan milidetik!)
  salt,                  // felt (nonce acak)
])

MESSAGE_HASH = Poseidon([MESSAGE_FELT, domain_hash, public_key, order_hash])
DOMAIN_HASH  = Poseidon([DOMAIN_SELECTOR, "Perpetuals", "v0", chain_id, 1])
DOMAIN_SELECTOR = 0x1ff2f602e42168014d405a94f75e8a93d640751d71d16311266e140d8b0a210
```

**Aturan kritis:**
- `base_asset_id` **SELALU** syntheticId, **tidak pernah di-swap** berdasarkan BUY/SELL
- Arah dikodekan oleh **sign** dari `base_amount` dan `quote_amount` (i64 signed)
- Expiration: `ceil((expiryEpochMillis + 14 hari) / 1000)` → dalam **DETIK** (bukan jam!)
- i64 negatif → field element: `((n % FIELD_PRIME) + FIELD_PRIME) % FIELD_PRIME`
- `computePoseidonHashOnElements` dari starknet.js = setara dengan Rust `PoseidonHasher` (BUKAN menambahkan length di akhir)

### Ethereal DEX — Implementasi Saat Ini
- API client: `src/lib/ethereal/etherealApi.ts` — REST client dengan retry/rate-limit
- Signing: `src/lib/ethereal/etherealSigner.ts` — EIP-712 ethers v6 `wallet.signTypedData()`
- Bot engine: `src/lib/ethereal/etherealBotEngine.ts` — Grid+DCA logic, paper trade, fill polling
- Market cache: `src/lib/ethereal/etherealMarkets.ts` — product cache dengan UUID/onchainId mapping
- WebSocket price: `src/lib/ethereal/etherealWs.ts` — Socket.IO feed
- Routes: `src/routes/ethereal/bot.ts`
- Credentials: EVM private key + subaccountId (UUID) + etherealNetwork disimpan via `configService.ts`
- Frontend: `src/pages/EtherealStrategies.tsx` — halaman strategi Ethereal dengan inline modals

#### Ethereal EIP-712 Signing (CRITICAL — JANGAN UBAH)
- Domain: `{ name: "Ethereal", version: "1", chainId: 1, verifyingContract: "0x...perpetuals" }`
- Nonce: `BigInt(Date.now()) * 1_000_000n` (nanoseconds lokal)
- Amount scale: decimal strings ke API, scaled ×1e9 (uint128) saat signing
- `productId` untuk signing = `onchainId` (integer); untuk API/WS = UUID string
- `subaccountName` untuk signing = `nameToBytes32("primary")` (bytes32 hex)
- Fill detection: poll `GET /v1/order/fill?subaccountId=...&orderId=...`
- Order hash di DB: format `eth_{orderId}`

### AI Advisor — Multi-DEX
- Endpoint tunggal: `POST /api/ai/analyze`
- Lighter: kirim `marketIndex` (number) → menggunakan `LIGHTER_SYSTEM_PROMPT`
- Extended: kirim `marketSymbol` (string) → menggunakan `EXTENDED_SYSTEM_PROMPT`
- Ethereal: kirim `marketSymbol` (string ticker) → menggunakan `EXTENDED_SYSTEM_PROMPT`
- Masing-masing prompt berisi konteks spesifik DEX: nama exchange, fee structure, order types, dll.

### DB Schema — Kolom Multi-DEX
- `strategies.exchange` (text, default `'lighter'`) — menandai strategi milik DEX mana
- `trades.exchange` (text, default `'lighter'`) — menandai trade milik DEX mana

### Referensi Dokumentasi
`referensi/Extended-docs/`:
- `api-reference.md` — Full Extended API reference
- `overview.md` — Extended exchange overview
- `GAP-ANALYSIS.md` — Architecture diff (historical, sebagian sudah tidak relevan)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Replit Environment Setup

- **Frontend workflow**: `Start application` — runs `PORT=5000 pnpm --filter @workspace/HK-Projects run dev` on port 5000 (webview)
- **Backend workflow**: `Backend API` — runs `cd artifacts/api-server && PORT=8080 pnpm run dev` on port 8080 (console)
- **Vite proxy**: Frontend proxies `/api` → `http://localhost:8080`
- **Database**: Replit PostgreSQL provisioned, schema pushed via `pnpm --filter @workspace/db run push`
- **Deployment target**: `vm` (always-on, needed for Telegram bot + trading engine)

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- **Security**: `src/lib/encrypt.ts` — AES-256-GCM encryption for `private_key` and `notify_bot_token` fields in `botConfigTable`. Requires `ENCRYPTION_KEY` env var (64 hex chars = 32 bytes). Backward-compatible: unencrypted legacy values are read as-is.
- **Shared utilities**: `src/lib/utils.ts` — `generatePassword()` and `addDays()` shared across routes
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.mjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest
- `koffi` is in the externals list (native addon — not bundled by esbuild)
- Lighter-specific code is organized in `src/lib/lighter/` subfolder:
  - `lighterApi.ts` — REST client (`sendTx`, `sendTxBatch`, `toBaseAmount`, `toPriceInt`, etc.)
  - `lighterSigner.ts` — koffi FFI wrapper for Go signer .so
  - `lighterWs.ts` — WebSocket client for real-time price feeds
  - `marketCache.ts` — market info cache (2-min TTL)
  - `botEngine.ts` — DCA/Grid trading engine, paper mode, polling
- Lighter route handlers in `src/routes/lighter/`: `market.ts`, `history.ts`, `bot.ts`
- Lighter signing .so at `signers/lighter-signer-linux-amd64.so` (lighter-go v1.0.5, loaded lazily at runtime; `__dirname` in compiled bundle points to `dist/`, so `../signers/` resolves correctly)
- Bot engine delegates to `executeLiveOrder` when user credentials are present; falls back to paper trade otherwise

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.

Available scripts:
- `hello` — contoh script minimal
- `check-lighter-api` — validasi semua endpoint Lighter API di kode sudah sesuai dokumentasi resmi. Tambah flag `--ping` untuk live test ke mainnet.

## Lighter API Integration

### Base URLs
- Mainnet: `https://mainnet.zklighter.elliot.ai`
- Testnet: `https://testnet.zklighter.elliot.ai`

### Bug fixes history
- `getCandles`: parameter diganti dari `from`/`to` (detik) → `start_timestamp`/`end_timestamp` (milidetik), resolution dari angka (`"60"`) → enum string (`"1h"`), ditambah `count_back` yang sebelumnya hilang
- `getOrderBookDepth`: endpoint dari `/api/v1/orderBook` (tidak ada) → `/api/v1/orderBookOrders`, param `depth` → `limit`. **FIXED 2026-03-31 (live-verified via curl)**: response `bids`/`asks` ada di ROOT level (bukan nested `order_book`), field ukuran adalah `remaining_base_amount` (bukan `size`). Mapping `remaining_base_amount` → `size` dilakukan di `getOrderBookDepth`. Sebelumnya order book display selalu kosong.

### Candles resolution enum
`1m` | `5m` | `15m` | `30m` | `1h` | `4h` | `12h` | `1d` | `1w`

### Verifikasi endpoint
```bash
pnpm --filter @workspace/scripts run check-lighter-api           # cek kode vs docs
pnpm --filter @workspace/scripts run check-lighter-api -- --ping # + live test mainnet
```

### REFERENSI
Cek folder referensi/ — semua file sudah tersedia dan bisa langsung kamu jalankan. Jika ada perubahan terbaru, jalankan fetch-docs.js untuk menghasilkan dokumentasi .md resmi dari Lighter, lalu bandingkan hasilnya dengan implementasi yang ada.
Perhatian: Sistem ini berjalan 24/7 dan digunakan secara live. Jika ada bug, kerugian finansial bisa terjadi — jadi jangan asumsikan, verifikasi dulu dari docs sebelum menyimpulkan apapun.