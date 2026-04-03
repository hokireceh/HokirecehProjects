# Rencana Implementasi Ethereal — Full Blueprint

> Status: RENCANA FINAL — belum ada kode yang ditulis
> Tanggal: April 2026
> Dasar: Analisis lengkap seluruh kode Lighter + Extended + DB schema + semua halaman frontend

---

## 0. Ringkasan Eksekutif

Ethereal diintegrasikan **di seluruh aplikasi** — bukan hanya halaman baru. Setiap halaman yang sudah ada (Dashboard, Logs, Trades, Settings, Strategies, AI Advisor) perlu disentuh agar Ethereal tampil berdampingan dengan Lighter dan Extended.

Arsitektur engine mengikuti Lighter dengan satu perbedaan kritis:
- **Signer Lighter** → Go `.so` binary via koffi (rumit)
- **Signer Ethereal** → `ethers.js` EIP-712 (lebih simpel, pure TypeScript)

---

## 1. Peta Touchpoint Seluruh Aplikasi

Ini daftar **setiap file yang perlu diubah** dan **kenapa**:

### Backend
| File | Status | Perubahan |
|---|---|---|
| `lib/ethereal/etherealSigner.ts` | BARU | EIP-712 signing |
| `lib/ethereal/etherealApi.ts` | BARU | REST client |
| `lib/ethereal/etherealWs.ts` | BARU | WebSocket price feed |
| `lib/ethereal/etherealMarkets.ts` | BARU | Product cache |
| `lib/ethereal/etherealBotEngine.ts` | BARU | Engine utama |
| `routes/ethereal/bot.ts` | BARU | Start/stop bot |
| `routes/ethereal/account.ts` | BARU | Balance, positions, orders |
| `routes/ethereal/config.ts` | BARU | Save/get credential |
| `routes/ethereal/index.ts` | BARU | Register routes |
| `routes/configService.ts` | MODIF | Tambah `getEtherealCredentials()` + `updateEtherealCredentials()` |
| `routes/index.ts` | MODIF | Daftarkan route `/ethereal` |

### Frontend — File BARU
| File | Keterangan |
|---|---|
| `pages/EtherealStrategies.tsx` | Halaman strategi Ethereal (seperti ExtendedStrategies.tsx) |
| `components/ethereal/EthCreateStrategyModal.tsx` | Modal buat strategi baru |
| `components/ethereal/EthEditStrategyModal.tsx` | Modal edit strategi |

### Frontend — File DIMODIFIKASI
| File | Yang Diubah |
|---|---|
| `components/ui/ExchangeLogo.tsx` | Tambah "ethereal" ke union type + logo |
| `components/layout/AppLayout.tsx` | Tambah navGroup Ethereal di sidebar |
| `pages/Dashboard.tsx` | Tambah EtherealSection + gabung log 3 exchange |
| `pages/Logs.tsx` | Tambah filter "ethereal" + fetch ethereal logs |
| `pages/Trades.tsx` | Tambah "ethereal" ke type cast + kondisi explorer link |
| `pages/Settings.tsx` | Tambah EtherealConfigSection |
| `pages/AIAdvisor.tsx` | Tambah "ethereal" ke DexType selector |
| `pages/Strategies.tsx` | Tambah "ethereal" ke DexType + market list |
| `App.tsx` | Tambah route `/ethereal` + lazy import |

---

## 2. Perbedaan Teknis Lighter vs Ethereal (Kritis untuk Implementasi)

| Aspek | Lighter | Ethereal |
|---|---|---|
| Signer | Go `.so` via koffi → `signCreateOrder()` | `ethers.Wallet.signTypedData()` — pure TS |
| Order submission | `POST /api/v1/sendTx` form-urlencoded | `POST /v1/order` JSON body dengan `signature` |
| Nonce | Numeric dari `GET /api/v1/nextNonce` | Nanoseconds: `BigInt(Date.now()) * 1_000_000n` |
| Market ID | `marketIndex` (int) | `productId` (int) |
| Fill detection | `GET /api/v1/tx?by=hash` → `status=2` | `GET /v1/fill?subaccountId=X` polling |
| WS library | Native `ws` | Socket.IO (`socket.io-client`) |
| WS subscribe | `{ type: "subscribe", channel: "ticker/1" }` | `ws.emit("subscribe", { type: "MarketPrice", productId })` |
| Margin | USDC | USDe |
| Account ID | `accountIndex` (int) + `apiKeyIndex` (int) | `subaccountId` (string/bytes32) |
| Batch orders | `sendTxBatch` tersedia | Tidak ada batch — sequential |
| Explorer link | `https://app.lighter.xyz/explorer/logs/<hash>` | `https://explorer.ethereal.trade/tx/<hash>` |

---

## 3. Urutan Build — Dependency Graph

```
[BACKEND]
Step 1 → etherealSigner.ts        (no deps — fondasi semua)
Step 2 → etherealApi.ts           (no deps)
Step 3 → etherealWs.ts            (no deps)
Step 4 → etherealMarkets.ts       (deps: etherealApi)
Step 5 → etherealBotEngine.ts     (deps: 1,2,3,4 + configService)
Step 6 → configService.ts update  (no deps, paralel dengan 1-4)
Step 7 → routes/ethereal/         (deps: 5,6)
Step 8 → routes/index.ts update   (deps: 7)

[FRONTEND]
Step 9  → ExchangeLogo.tsx        (no deps — harus pertama, dipakai semua halaman)
Step 10 → AppLayout.tsx           (deps: 9)
Step 11 → EtherealStrategies.tsx  (deps: 7,9 — halaman baru dulu)
Step 12 → App.tsx                 (deps: 11)
Step 13 → Dashboard.tsx           (deps: 7,9)
Step 14 → Logs.tsx                (deps: 7,9)
Step 15 → Trades.tsx              (deps: 7,9)
Step 16 → Settings.tsx            (deps: 6,9)
Step 17 → AIAdvisor.tsx           (deps: 9)
Step 18 → Strategies.tsx          (deps: 7,9)
```

**Milestone verifikasi**:
- Setelah Step 8: test via curl — bot paper trade berjalan, log masuk DB
- Setelah Step 12: halaman `/ethereal` bisa dibuka di browser
- Setelah Step 18: semua halaman menampilkan Ethereal berdampingan Lighter & Extended

---

## 4. Detail Setiap File Backend

---

### Step 1 — `etherealSigner.ts`
**Path**: `artifacts/api-server/src/lib/ethereal/etherealSigner.ts`
**Deps**: `ethers` (cek versi: v5 = `_signTypedData`, v6 = `signTypedData`)

```ts
// EIP-712 Domain (hardcoded)
export const ETHEREAL_DOMAINS = {
  mainnet: {
    name: "Ethereal", version: "1", chainId: 5064014,
    verifyingContract: "0xB3cDC82035C495c484C9fF11eD5f3Ff6d342e3cc"
  },
  testnet: {
    name: "Ethereal", version: "1", chainId: 13374202,
    verifyingContract: "<testnet_contract>" // ambil dari docs
  }
}

// Types yang diexport:
export type EtherealNetwork = "mainnet" | "testnet"

export interface TradeOrderData {
  sender: string        // wallet address (0x...)
  subaccount: string    // bytes32 hex
  quantity: bigint      // size dalam unit terkecil
  price: bigint         // price (0 = market)
  reduceOnly: boolean
  side: 0 | 1          // 0=buy, 1=sell
  engineType: number   // verify dari docs
  productId: number
  nonce: bigint        // nanoseconds
  signedAt: number     // unix seconds
}

// Fungsi yang diexport:
export function getWalletAddress(privateKey: string): string
export function generateNonce(): bigint           // Date.now() * 1_000_000n
export function generateSignedAt(): number        // Math.floor(Date.now() / 1000)
export async function signTradeOrder(pk, order, network): Promise<string>
export async function signWithdraw(pk, data, network): Promise<string>
export async function signLinkSigner(primaryKey, signerKey, data, network): Promise<{primarySig, signerSig}>
```

**Verifikasi setelah selesai**:
```ts
const sig = await signTradeOrder(testKey, testOrder, "testnet")
const recovered = ethers.verifyTypedData(domain, types, testOrder, sig)
// recovered === getWalletAddress(testKey) → ✅
```

---

### Step 2 — `etherealApi.ts`
**Path**: `artifacts/api-server/src/lib/ethereal/etherealApi.ts`
**Pola**: Identik `lighterApi.ts` — internal `etherealFetch()` dengan retry + timeout + 429 handling

```ts
export const BASE_URLS = {
  mainnet: "https://api.ethereal.trade",
  testnet: "https://api.etherealtest.net",
}

// Internal
async function etherealFetch<T>(path, network, options?): Promise<T>
  // timeout 15s, retry 3x, handle 429

// Public endpoints (no auth)
export async function listProducts(network): Promise<EtherealProduct[]>
export async function getMarketPrice(productId, network): Promise<{ price: string }>
export async function getSubaccounts(walletAddress, network): Promise<EtherealSubaccount[]>
export async function getBalances(subaccountId, network): Promise<EtherealBalance>
export async function getOrderBook(productId, network): Promise<{ bids, asks }>

// Authenticated (signature di dalam body JSON)
export async function placeOrder(order: SignedTradeOrder, network): Promise<{ orderId: string }>
export async function cancelOrder(orderId, cancelSig, network): Promise<void>
export async function listOrders(subaccountId, network): Promise<EtherealOrder[]>
export async function getPositions(subaccountId, network): Promise<EtherealPosition[]>
export async function getFills(subaccountId, params, network): Promise<EtherealFill[]>
export async function initiateWithdraw(data: SignedWithdraw, network): Promise<void>
export async function linkSigner(payload: LinkSignerPayload, network): Promise<void>
```

**Interface kritis** (verify format exact dari OpenAPI sebelum nulis):
```ts
export interface EtherealProduct {
  id: number           // productId
  ticker: string       // "BTCUSD"
  minOrderSize: string // minimum quantity
  maxOrderSize: string
  tickSize: string     // price increment
  stepSize: string     // quantity increment
}

export interface EtherealPosition {
  productId: number; ticker: string
  side: "long" | "short"; quantity: string
  entryPrice: string; markPrice: string
  unrealizedPnl: string; margin: string
}

export interface EtherealFill {
  id: string; productId: number
  side: "buy" | "sell"; quantity: string
  price: string; fee: string
  timestamp: number; orderId: string
}
```

---

### Step 3 — `etherealWs.ts`
**Path**: `artifacts/api-server/src/lib/ethereal/etherealWs.ts`
**Deps**: `socket.io-client` (cek package.json — Extended mungkin sudah ada)

```ts
// Interface publik identik lighterWs.ts
export type PriceCallback = (midPrice: Decimal, productId: number) => void
export const wsPriceCache = new Map<number, { price: Decimal; ts: number }>()

export function registerPriceCallback(productId, strategyId, callback, network): void
export function unregisterPriceCallback(productId, strategyId): void
export function getWsCachedPrice(productId, maxAgeMs?): Decimal | null
export function connect(network?): void

// Internal
// Socket.IO setup:
// socket = io(WS_URLS[network], { transports: ["websocket"], reconnection: true })
// subscribe: socket.emit("subscribe", { type: "MarketPrice", productId })
// receive:   socket.on("MarketPrice", (data) => { update wsPriceCache + call callbacks })
```

**Catatan**: Jika Ethereal sudah fully migrate ke native WebSocket saat build, ganti
`socket.io-client` dengan `ws` library — interface publik tidak berubah.

---

### Step 4 — `etherealMarkets.ts`
**Path**: `artifacts/api-server/src/lib/ethereal/etherealMarkets.ts`
**Pola**: Identik `marketCache.ts` — TTL 2 menit, fallback data

```ts
export interface ProductInfo {
  id: number           // productId (analog marketIndex)
  ticker: string       // "BTCUSD"
  baseAsset: string    // "BTC"
  quoteAsset: string   // "USD"
  minOrderSize: number
  maxOrderSize: number
  tickSize: number     // price rounding unit
  stepSize: number     // quantity rounding unit
  sizeDecimals: number // derived dari stepSize
  priceDecimals: number // derived dari tickSize
  lastPrice: number
}

export async function getProducts(network): Promise<ProductInfo[]>
export async function getProductInfo(productId, network): Promise<ProductInfo | null>
export async function getProductByTicker(ticker, network): Promise<ProductInfo | null>
// + FALLBACK_PRODUCTS (isi setelah ambil dari GET /v1/product)
```

**Helper untuk price/size rounding**:
```ts
// Analog toBaseAmount() dan toPriceInt() di lighterApi.ts
export function roundToStep(quantity: number, stepSize: number): number
export function roundToTick(price: number, tickSize: number): number
```

---

### Step 5 — `etherealBotEngine.ts`
**Path**: `artifacts/api-server/src/lib/ethereal/etherealBotEngine.ts`
**Pola**: Fork `botEngine.ts` — identik strukturnya, API calls diganti

**State management** (sama persis):
```ts
interface RunningBot { strategyId: number; timer: NodeJS.Timeout; nextRunAt: Date }
const runningBots = new Map<number, RunningBot>()
const gridStates  = new Map<number, GridState>()
const wsGridLastTriggered = new Map<number, number>()
const WS_GRID_COOLDOWN_MS    = 10_000
const GRID_FALLBACK_INTERVAL = 5 * 60 * 1000
```

**Export**:
```ts
export function isRunning(strategyId): boolean
export function getNextRunAt(strategyId): Date | null
export function getAllRunningBots(): { strategyId, nextRunAt }[]
export async function startEtherealBot(strategyId): Promise<void>
export async function stopEtherealBot(strategyId): Promise<void>
```

**Perbedaan dari `botEngine.ts`**:

| Fungsi/Pola | Lighter | Ethereal |
|---|---|---|
| Credential getter | `getBotConfig(userId)` | `getEtherealCredentials(userId)` |
| Cek credential | `botConfig.privateKey && botConfig.accountIndex` | `creds.privateKey && creds.subaccountId` |
| Init signer | `initSigner(url, pk, apiKeyIdx, accIdx)` | Tidak perlu — `ethers.Wallet` stateless |
| Generate nonce | `getNextNonce(accountIndex, apiKeyIndex, network)` | `generateNonce()` — lokal, no API call |
| Sign order | `signCreateOrder({...})` → `{ txType, txInfo, txHash }` | `signTradeOrder(pk, order, network)` → hex string |
| Submit order | `sendTx(txType, txInfo, network)` | `placeOrder({ ...order, signature }, network)` |
| Polling fill | `getTx(by:"hash", hash)` → `status===2` | `getFills(subaccountId, { orderId }, network)` |
| Price rounding | `toPriceInt(price, priceDecimals)` | `roundToTick(price, tickSize)` |
| Size rounding | `toBaseAmount(size, sizeDecimals)` | `roundToStep(size, stepSize)` |
| Log exchange field | `exchange: "lighter"` | `exchange: "ethereal"` |
| Explorer URL | `https://app.lighter.xyz/explorer/logs/<hash>` | `https://explorer.ethereal.trade/tx/<hash>` |

**Catatan batch orders**: Ethereal tidak punya `sendTxBatch` — grid harus sequential (tidak paralel). Max 1 order per tick untuk menghindari rate limit.

**Poll fills** (beda dari Lighter):
```ts
async function pollPendingTrades(): Promise<void> {
  // Ambil semua trade pending di DB dengan exchange = "ethereal"
  const pending = await db.query.tradesTable.findMany({
    where: and(
      eq(tradesTable.exchange, "ethereal"),
      eq(tradesTable.status, "pending"),
    )
  })
  for (const trade of pending) {
    const creds = await getEtherealCredentials(trade.userId)
    const fills = await getFills(creds.subaccountId, { orderId: trade.orderHash }, creds.etherealNetwork)
    if (fills.length > 0) {
      // update trade status → "filled"
      // updateStrategyStatsAtomic
      // notifyUser jika notifyOnBuy/notifyOnSell true
    }
    // timeout setelah 10 menit → mark "cancelled"
  }
}
```

---

### Step 6 — `configService.ts` (tambahan)
**File**: `artifacts/api-server/src/routes/configService.ts`
**Pola**: Identik `getExtendedCredentials` / `updateExtendedCredentials` yang sudah ada

Tambah keys baru:
```ts
const ETH_KEYS = {
  PRIVATE_KEY:    "eth_private_key",    // encrypted
  WALLET_ADDRESS: "eth_wallet_address", // plain (derive dari key saat save)
  SUBACCOUNT_ID:  "eth_subaccount_id",  // plain
  NETWORK:        "eth_network",        // "mainnet" | "testnet"
  SIGNER_KEY:     "eth_signer_key",     // encrypted (opsional: linked signer)
  SIGNER_ADDRESS: "eth_signer_address", // plain
  SIGNER_EXPIRES: "eth_signer_expires", // ISO string
}
// Tambah ETH_KEYS.PRIVATE_KEY dan ETH_KEYS.SIGNER_KEY ke ENCRYPTED_KEYS
```

Tambah fungsi:
```ts
export async function getEtherealCredentials(userId: number)
  // return: { privateKey, walletAddress, subaccountId, etherealNetwork,
  //           signerKey, signerAddress, signerExpiresAt,
  //           hasPrivateKey, hasSubaccountId, hasCredentials,
  //           isSignerExpiringSoon (< 7 hari) }

export async function updateEtherealCredentials(userId: number, updates: {
  privateKey?: string | null
  walletAddress?: string | null
  subaccountId?: string | null
  etherealNetwork?: "mainnet" | "testnet"
  signerKey?: string | null
  signerAddress?: string | null
  signerExpiresAt?: Date | null
})
```

---

### Step 7 — `routes/ethereal/`
**Path**: `artifacts/api-server/src/routes/ethereal/`

**`bot.ts`**:
```
POST /api/ethereal/bot/:strategyId/start  → startEtherealBot(strategyId)
POST /api/ethereal/bot/:strategyId/stop   → stopEtherealBot(strategyId)
GET  /api/ethereal/bot/status             → getAllRunningBots()
GET  /api/ethereal/bot/:strategyId/status → { isRunning, nextRunAt }
```

**`account.ts`**:
```
GET /api/ethereal/account/balance         → getBalances(subaccountId, network)
GET /api/ethereal/account/positions       → getPositions(subaccountId, network)
GET /api/ethereal/account/orders          → listOrders(subaccountId, network)
GET /api/ethereal/account/fills           → getFills(subaccountId, params, network)
```

**`config.ts`**:
```
GET    /api/ethereal/config               → getEtherealCredentials(userId)
POST   /api/ethereal/config               → updateEtherealCredentials(userId, body)
DELETE /api/ethereal/config               → hapus semua credential
POST   /api/ethereal/config/link-signer   → signLinkSigner + linkSigner()
GET    /api/ethereal/config/test          → test koneksi (getBalances) — untuk tombol "Test Connection"
```

**`strategies.ts`**:
```
GET  /api/ethereal/strategies             → list strategies user dengan exchange=ethereal
POST /api/ethereal/strategies             → buat strategi baru
GET  /api/ethereal/strategies/:id         → detail strategi
PUT  /api/ethereal/strategies/:id         → update
DELETE /api/ethereal/strategies/:id       → hapus
```

**`logs.ts`**:
```
GET /api/ethereal/logs/recent?limit=N     → bot logs dengan exchange="ethereal"
```

**`markets.ts`**:
```
GET /api/ethereal/markets                 → getProducts(network)
```

---

## 5. Detail Setiap File Frontend

---

### Step 9 — `ExchangeLogo.tsx` (MODIF — harus paling pertama)
**Path**: `artifacts/HK-Projects/src/components/ui/ExchangeLogo.tsx`

Perubahan:
```ts
// Sebelum:
exchange: "lighter" | "extended"

// Sesudah:
exchange: "lighter" | "extended" | "ethereal"

// Tambah kondisi:
const src = exchange === "lighter"
  ? "/images/lighter-icon.png"
  : exchange === "extended"
    ? "/images/extended-icon.png"
    : "/images/ethereal-icon.png"  // perlu siapkan logo Ethereal

const alt = exchange === "lighter" ? "Lighter DEX"
          : exchange === "extended" ? "Extended DEX"
          : "Ethereal DEX"
```

**Catatan**: Perlu satu file gambar logo Ethereal di `public/images/ethereal-icon.png` — bisa download dari branding Ethereal atau pakai placeholder.

---

### Step 10 — `AppLayout.tsx` (MODIF)
**Path**: `artifacts/HK-Projects/src/components/layout/AppLayout.tsx`

Perubahan:
```ts
// Tambah ethereal items (analog extendedItems)
const etherealItems = [
  { href: "/ethereal", label: "Strategi Ethereal", icon: Flame }, // atau icon lain
]

// Di sidebar desktop — tambah NavGroup baru setelah Extended:
<NavGroup label="Ethereal DEX" accentClass="text-orange-400/70">
  <ExchangeLogo exchange="ethereal" size={14} />
  {etherealItems.map(...)}
</NavGroup>

// Di mobile nav — tambah ethereal ke more items jika perlu
```

---

### Step 11 — `EtherealStrategies.tsx` (BARU)
**Path**: `artifacts/HK-Projects/src/pages/EtherealStrategies.tsx`
**Pola**: Fork `ExtendedStrategies.tsx` — ganti semua endpoint `/api/extended/` ke `/api/ethereal/`

Komponen di dalamnya:
- List strategi Ethereal
- Tombol Start / Stop per strategi
- Status running (polling `/api/ethereal/bot/:id/status`)
- Balance USDe di header
- Link ke Settings untuk config credential
- Modal buat strategi: `EthCreateStrategyModal.tsx`
- Modal edit strategi: `EthEditStrategyModal.tsx`

Modal create/edit punya field:
- Pilih market (dari `/api/ethereal/markets`)
- Strategy type: Grid / DCA
- Grid config: lower/upper price, grid levels, amount per grid, order type
- DCA config: amount, interval, side
- Stop Loss / Take Profit (opsional)
- Network: mainnet / testnet

---

### Step 12 — `App.tsx` (MODIF)
**Path**: `artifacts/HK-Projects/src/App.tsx`

```ts
// Tambah lazy import:
const EtherealStrategies = lazy(() => import("@/pages/EtherealStrategies"))

// Tambah route:
<Route path="/ethereal" component={EtherealStrategies} />
```

---

### Step 13 — `Dashboard.tsx` (MODIF)
**Path**: `artifacts/HK-Projects/src/pages/Dashboard.tsx`

Perubahan:
1. **Type union**: `exchange: "lighter" | "extended"` → tambah `"ethereal"`
2. **Hook baru**: `useEtherealBotStatus()`, `useEtherealBalance()`, `useEtherealLogs(limit)`
3. **EtherealSection**: Komponen baru (analog `ExtendedSection`) — tampilkan balance USDe, jumlah bot aktif, posisi terbuka
4. **Combined logs**: Gabungkan 3 sumber log:
   ```ts
   // Sebelum: lighter + extended
   const combined = [...lighterLogs, ...extLogs].sort(...)

   // Sesudah: lighter + extended + ethereal
   const combined = [...lighterLogs, ...extLogs, ...etherealLogs].sort(...)
   ```

---

### Step 14 — `Logs.tsx` (MODIF)
**Path**: `artifacts/HK-Projects/src/pages/Logs.tsx`

Perubahan:
```ts
// Sebelum:
type ExchangeFilter = "all" | "lighter" | "extended"
const EXCHANGE_OPTIONS = [
  { value: "all", label: "Semua DEX" },
  { value: "lighter", label: "Lighter" },
  { value: "extended", label: "Extended" },
]

// Sesudah:
type ExchangeFilter = "all" | "lighter" | "extended" | "ethereal"
const EXCHANGE_OPTIONS = [
  { value: "all", label: "Semua DEX" },
  { value: "lighter", label: "Lighter" },
  { value: "extended", label: "Extended" },
  { value: "ethereal", label: "Ethereal" },
]

// Tambah fetch:
async function fetchEtherealLogs(limit): Promise<UnifiedLog[]> {
  const res = await fetch(`/api/ethereal/logs/recent?limit=${limit}`, { credentials: "include" })
  // map ke UnifiedLog dengan exchange: "ethereal"
}

// Hook baru:
const { data: etherealLogs = [], isLoading: loadingEthereal } = useQuery(...)

// Merge 3 sumber:
const allLogs = useMemo(() => {
  return [...lighter, ...extendedLogs, ...etherealLogs].sort(...)
}, [lighterData, extendedLogs, etherealLogs])
```

---

### Step 15 — `Trades.tsx` (MODIF)
**Path**: `artifacts/HK-Projects/src/pages/Trades.tsx`

Perubahan:
```ts
// Sebelum:
exchange={(trade.exchange as "lighter" | "extended") ?? "lighter"}

// Sesudah:
exchange={(trade.exchange as "lighter" | "extended" | "ethereal") ?? "lighter"}

// Explorer link — sebelum:
{trade.orderHash && trade.exchange !== "extended" && (
  <a href={`https://app.lighter.xyz/explorer/logs/${trade.orderHash}`}>...)

// Sesudah: buat fungsi helper
function getExplorerUrl(exchange, hash): string | null {
  if (exchange === "lighter") return `https://app.lighter.xyz/explorer/logs/${hash}`
  if (exchange === "ethereal") return `https://explorer.ethereal.trade/tx/${hash}`
  return null  // extended tidak punya explorer link
}
// Gunakan getExplorerUrl() di kedua tempat
```

---

### Step 16 — `Settings.tsx` (MODIF)
**Path**: `artifacts/HK-Projects/src/pages/Settings.tsx`

Perubahan: Tambah `EtherealConfigSection` (analog `ExtendedConfigSection` yang sudah ada)

```tsx
// EtherealConfigSection form fields:
// - Private Key (password input, encrypted)
// - Network radio: mainnet / testnet
// - Subaccount ID (text input — atau tampilkan yang didapat dari API setelah connect)
// - [Optional] Linked Signer Key
// - Tombol "Test Connection" → GET /api/ethereal/config/test
// - Tampilkan: wallet address yang di-derive dari private key (read-only)
// - Tampilkan: signer expires (jika ada) + warning jika < 7 hari

// Mount setelah ExtendedConfigSection di Settings.tsx
```

---

### Step 17 — `AIAdvisor.tsx` (MODIF)
**Path**: `artifacts/HK-Projects/src/pages/AIAdvisor.tsx`

Perubahan:
```ts
// Sebelum:
type DexType = "lighter" | "extended"

// Sesudah:
type DexType = "lighter" | "extended" | "ethereal"

// Tambah tombol Ethereal di DEX selector:
<button onClick={() => onChange("ethereal")}>
  <ExchangeLogo exchange="ethereal" size={14} />
  Ethereal
</button>

// Fetch market Ethereal untuk dropdown:
// Sudah ada fetch extended markets — tambah fetch ethereal markets
fetch("/api/ethereal/markets", ...)
```

---

### Step 18 — `Strategies.tsx` (MODIF)
**Path**: `artifacts/HK-Projects/src/pages/Strategies.tsx`

Perubahan:
```ts
// Sebelum:
type DexType = "lighter" | "extended"
// dan market list hanya Lighter + Extended

// Sesudah:
type DexType = "lighter" | "extended" | "ethereal"

// Tambah tombol Ethereal di DEX selector di create modal
// Tambah fetch market Ethereal:
fetch("/api/ethereal/markets", ...)

// Jika user pilih Ethereal → create strategy dengan exchange = "ethereal"
// dan body yang sesuai dengan format Ethereal
```

---

## 6. Checklist Pre-Build (Wajib Sebelum Step 1)

### A. Fetch docs Ethereal
```bash
node referensi/fetch-ethereal-docs.js
```

### B. Jawab 6 pertanyaan teknis dari OpenAPI spec

Buka `referensi/ethereal-docs/openapi-trading-api-mainnet.json` dan konfirmasi:

- [ ] **Q1**: Format `quantity` dan `price` di `POST /v1/order` → float string atau integer scaled?
- [ ] **Q2**: Format `subaccountId` → bytes32 hex? Atau ambil dari `GET /v1/subaccount?sender=address`?
- [ ] **Q3**: Nonce → benar nanoseconds timestamp? Ada endpoint getNonce?
- [ ] **Q4**: WS event name untuk price → "MarketPrice"? Field mana yang berisi price?
- [ ] **Q5**: Detect fill → ada WS fill event? Atau poll `GET /v1/fill`?
- [ ] **Q6**: Cancel order → perlu signature? Format body-nya?

### C. Cek dependencies
```bash
cat artifacts/api-server/package.json | grep -E '"ethers"|"socket.io"'
```
- [ ] `ethers` ada? Versi berapa (v5 atau v6)?
- [ ] `socket.io-client` ada?

### D. Cek strategies table punya kolom `exchange`
```bash
# Grep schema definition
grep -r "exchange" artifacts/api-server/src/db/ --include="*.ts"
```
- [ ] Ada kolom `exchange` di `strategiesTable`? Apa yang dipakai Lighter?

### E. Siapkan logo Ethereal
- [ ] Download/buat `ethereal-icon.png` → simpan di `artifacts/HK-Projects/public/images/`

### F. Siapkan testnet wallet
- [ ] Generate wallet baru, deposit USDe testnet
- [ ] Catat actual `productId` untuk BTC, ETH dari `GET https://api.etherealtest.net/v1/product`

---

## 7. Risiko dan Mitigasi

| Risiko | Mitigasi |
|---|---|
| Format quantity/price beda asumsi | Fetch OpenAPI → test di testnet sebelum live |
| `ethers` v5 vs v6 API berbeda | Cek package.json → sesuaikan: v5=`_signTypedData`, v6=`signTypedData` |
| `socket.io-client` belum ada | Tambah ke package.json, install |
| Socket.IO deprecated mid-build | Buat WS dengan interface adapter → swap implementasi tanpa ubah engine |
| Linked Signer expire saat bot running | Check expiry di `startEtherealBot` → warn 7 hari sebelum via log + Telegram |
| Poll fills miss event | WS fill event sebagai primary + polling sebagai fallback |
| Logo Ethereal tidak ada | Pakai placeholder warna solid (CSS) dulu |
| Break Lighter/Extended | Semua code terisolasi — tidak ada import silang antar DEX engine |

---

## 8. Yang Sengaja Di-skip (Fase 2)

- Auto-Rerange untuk Ethereal (tunggu engine stabil dulu)
- Telegram menu Ethereal (tombol DEX selector)
- Linked Signer UI di Settings (advanced feature)
- Withdraw flow dari UI
- Batch orders (Ethereal tidak support)
- Archive API integration

---

## 9. Status Setiap Step

> Update kolom ini setiap kali sebuah step selesai dikerjakan.

| Step | File | Status | Catatan |
|---|---|---|---|
| 1 | `etherealSigner.ts` | ⬜ Belum |  |
| 2 | `etherealApi.ts` | ⬜ Belum |  |
| 3 | `etherealWs.ts` | ⬜ Belum |  |
| 4 | `etherealMarkets.ts` | ⬜ Belum |  |
| 5 | `etherealBotEngine.ts` | ⬜ Belum |  |
| 6 | `configService.ts` update | ⬜ Belum |  |
| 7 | `routes/ethereal/` | ⬜ Belum |  |
| 8 | `routes/index.ts` | ⬜ Belum |  |
| 9 | `ExchangeLogo.tsx` | ⬜ Belum |  |
| 10 | `AppLayout.tsx` | ⬜ Belum |  |
| 11 | `EtherealStrategies.tsx` | ⬜ Belum |  |
| 12 | `App.tsx` | ⬜ Belum |  |
| 13 | `Dashboard.tsx` | ⬜ Belum |  |
| 14 | `Logs.tsx` | ⬜ Belum |  |
| 15 | `Trades.tsx` | ⬜ Belum |  |
| 16 | `Settings.tsx` | ⬜ Belum |  |
| 17 | `AIAdvisor.tsx` | ⬜ Belum |  |
| 18 | `Strategies.tsx` | ⬜ Belum |  |
| PRE | Fetch docs + jawab 6 Q + cek deps | ⬜ Belum |  |
| PRE | Logo Ethereal | ⬜ Belum |  |
| PRE | Testnet wallet | ⬜ Belum |  |
