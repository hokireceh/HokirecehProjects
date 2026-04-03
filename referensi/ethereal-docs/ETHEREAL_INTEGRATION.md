# Ethereal Trade — Referensi Integrasi

> Ditulis: April 2026  
> Sumber: https://docs.ethereal.trade | https://meridianxyz.github.io/ethereal-py-sdk/  
> Tujuan: Panduan integrasi Ethereal sebagai DEX ke-3 di HokirecehProjects

---

## 1. Apa itu Ethereal?

Perps DEX (perpetual futures) dengan performa institutional-grade.  
- Order matching via sequencer sendiri — CEX speed, onchain security  
- Margin token: **USDe** (bukan ETH/USDC)  
- Mainnet aktif, testnet tersedia  
- Python SDK resmi tersedia (`ethereal-sdk`)

---

## 2. API Endpoints

### Mainnet
| Service | URL |
|---|---|
| HTTP API | `https://api.ethereal.trade/` |
| HTTP Docs | `https://api.ethereal.trade/docs` |
| OpenAPI Spec | `https://api.ethereal.trade/openapi.json` |
| Archive API | `https://archive.ethereal.trade` |
| WebSocket | `wss://ws.ethereal.trade` |
| RPC | `https://rpc.ethereal.trade/` |
| Explorer | `https://explorer.ethereal.trade/` |
| App | `https://app.ethereal.trade` |

### Testnet
| Service | URL |
|---|---|
| HTTP API | `https://api.etherealtest.net` |
| HTTP Docs | `https://api.etherealtest.net/docs` |
| RPC | `https://rpc.etherealtest.net` |
| Explorer | `https://explorer.etherealtest.net/` |
| App | `https://testnet.ethereal.trade` |

---

## 3. Chain Info

| Property | Value |
|---|---|
| Chain ID | `5064014` |
| Gas Token | USDe (18 decimals) |
| Verifying Contract | `0xB3cDC82035C495c484C9fF11eD5f3Ff6d342e3cc` |

### Testnet
| Property | Value |
|---|---|
| Chain ID | `13374202` |
| Gas Token | USDe (18 decimals) |

---

## 4. Autentikasi — EIP-712

Endpoint public (read) tidak butuh auth.  
Endpoint yang mutate (place/cancel order, withdraw) pakai **EIP-712 signature** dengan private key.

### EIP-712 Domain
```json
{
  "name": "Ethereal",
  "version": "1",
  "chainId": 5064014,
  "verifyingContract": "0xB3cDC82035C495c484C9fF11eD5f3Ff6d342e3cc"
}
```

### Tipe Signature
```
TradeOrder:      address sender, bytes32 subaccount, uint128 quantity, uint128 price,
                 bool reduceOnly, uint8 side, uint8 engineType, uint32 productId,
                 uint64 nonce, uint64 signedAt

InitiateWithdraw: address account, bytes32 subaccount, address token,
                  uint256 amount, uint64 nonce, uint64 signedAt

LinkSigner:      address sender, address signer, bytes32 subaccount,
                 uint64 nonce, uint64 signedAt
```

### Library yang bisa dipakai (TypeScript)
```ts
import { createWalletClient, http } from 'viem'
// atau
import { ethers } from 'ethers'
// ethers.TypedDataEncoder.hash(...) untuk EIP-712
```

---

## 5. Linked Signers

- Delegate trading ke signer address terpisah
- Primary wallet tetap eksklusif handle withdrawal
- Signer expire setelah **90 hari** — harus di-refresh
- Endpoint: `POST /v1/linked-signer/link`

```json
{
  "signature": "<primary_wallet_sig>",
  "signerSignature": "<signer_sig>",
  "data": {
    "subaccountId": "<id>",
    "sender": "<primary_wallet>",
    "subaccount": "<bytes32_name>",
    "signer": "<linked_signer_address>",
    "nonce": "<nonce_nanoseconds>",
    "signedAt": <unix_timestamp>
  }
}
```

---

## 6. Key API Endpoints

### Products (Public)
```bash
GET /v1/product?order=asc&orderBy=createdAt
GET /v1/product/market-price?productIds=<id>
```

### Subaccounts & Balances (Public)
```bash
GET /v1/subaccount?sender=0xWALLET
GET /v1/subaccount/balance?subaccountId=<id>
```

### Orders (Authenticated)
```bash
POST /v1/order          # place order
DELETE /v1/order/<id>   # cancel order
GET  /v1/order          # list orders
```

### Positions & Fills
```bash
GET /v1/position?subaccountId=<id>
GET /v1/fill?subaccountId=<id>
```

### RPC Config
```bash
GET /v1/rpc/config
```

---

## 7. WebSocket

Pakai **Socket.IO** (sedang transisi ke native WS — track update ini).

```js
import { io } from 'socket.io-client';
const ws = io('wss://ws.ethereal.trade/v1/stream', { transports: ['websocket'] });

ws.on('connect', () => {
  ws.emit('subscribe', { type: 'BookDepth',   productId: '<id>' });
  ws.emit('subscribe', { type: 'MarketPrice', productId: '<id>' });
});
```

Stream tersedia: `BookDepth`, `MarketPrice`, `Trades`, `FundingRate`, dll.

---

## 8. Python SDK (untuk referensi logika)

```bash
pip install ethereal-sdk
```

```python
from ethereal import RESTClient
from decimal import Decimal

client = RESTClient({
    "base_url": "https://api.ethereal.trade",
    "chain_config": {
        "rpc_url": "https://rpc.ethereal.trade",
        "private_key": "0x..."
    }
})

products = client.list_products()
order = client.create_order(
    order_type="LIMIT",
    quantity=Decimal("1.0"),
    side=0,            # 0 = buy, 1 = sell
    price=Decimal("100.0"),
    ticker="BTCUSD"
)
```

SDK reference: https://meridianxyz.github.io/ethereal-py-sdk/

---

## 9. Perbandingan dengan DEX yang Sudah Ada

| Aspek | Lighter | Extended (x10) | **Ethereal** |
|---|---|---|---|
| Signing | Native Go `.so` lib | Starknet Poseidon | **EIP-712 (Ethereum)** |
| SDK resmi | Tidak | Tidak | **Python SDK** |
| Chain | zklighter L2 | Starknet | Chain ID 5064014 |
| Margin | USDC | USDC | **USDe** |
| Market ID | numeric `marketIndex` | string `"BTC-USD"` | numeric `productId` |
| WebSocket | Custom | Socket.IO-like | Socket.IO → native WS |
| Auth | API key + signer | Stark key | Private key + EIP-712 |

---

## 10. Rencana Integrasi — Step by Step

### Step 1 — EIP-712 Signer (`etherealSigner.ts`)
File baru: `artifacts/api-server/src/lib/ethereal/etherealSigner.ts`

```ts
import { ethers } from 'ethers';

const DOMAIN = {
  name: 'Ethereal',
  version: '1',
  chainId: 5064014,
  verifyingContract: '0xB3cDC82035C495c484C9fF11eD5f3Ff6d342e3cc',
};

const TRADE_ORDER_TYPES = {
  TradeOrder: [
    { name: 'sender',     type: 'address' },
    { name: 'subaccount', type: 'bytes32' },
    { name: 'quantity',   type: 'uint128' },
    { name: 'price',      type: 'uint128' },
    { name: 'reduceOnly', type: 'bool'    },
    { name: 'side',       type: 'uint8'   },
    { name: 'engineType', type: 'uint8'   },
    { name: 'productId',  type: 'uint32'  },
    { name: 'nonce',      type: 'uint64'  },
    { name: 'signedAt',   type: 'uint64'  },
  ],
};

export async function signTradeOrder(privateKey: string, order: TradeOrderData): Promise<string> {
  const wallet = new ethers.Wallet(privateKey);
  return wallet.signTypedData(DOMAIN, TRADE_ORDER_TYPES, order);
}
```

### Step 2 — REST Client (`etherealApi.ts`)
File baru: `artifacts/api-server/src/lib/ethereal/etherealApi.ts`

Wrapper untuk:
- `listProducts()` → GET /v1/product
- `getMarketPrice(productId)` → GET /v1/product/market-price
- `getSubaccounts(sender)` → GET /v1/subaccount
- `getBalances(subaccountId)` → GET /v1/subaccount/balance
- `placeOrder(signedOrder)` → POST /v1/order
- `cancelOrder(orderId)` → DELETE /v1/order/:id
- `getPositions(subaccountId)` → GET /v1/position
- `linkSigner(data)` → POST /v1/linked-signer/link

### Step 3 — Bot Engine (`etherealBotEngine.ts`)
File baru: `artifacts/api-server/src/lib/ethereal/etherealBotEngine.ts`

Struktur sama persis seperti `extendedBotEngine.ts`:
- `startEtherealBot(strategyId)` / `stopEtherealBot(strategyId)`
- `executeGridCheck` / `executeDcaOrder`
- `etherNotifyUser` — wrapper notifikasi Telegram
- WebSocket price feed via Socket.IO

### Step 4 — User Config
Tambah field di `botConfigsTable` (atau tabel terpisah):
```sql
ethereal_private_key    TEXT
ethereal_subaccount_id  TEXT
ethereal_signer_address TEXT
ethereal_signer_key     TEXT   -- optional: linked signer
```

### Step 5 — Routes
Tambah di `artifacts/api-server/src/routes/`:
- `ethereal.ts` — start/stop bot, get config, get positions

### Step 6 — Frontend (HK-Projects)
Tambah tab "Ethereal" di dashboard:
- `artifacts/HK-Projects/src/pages/Ethereal.tsx`
- Komponen: Config form, Strategy list, Position viewer
- Mirip struktur `Extended.tsx` yang sudah ada

### Step 7 — Telegram Bot
Tambah exchange filter "Ethereal" di Log page.  
Tambah handling di `registerRerangeHandlers` jika strategy.exchange === "ethereal".

---

## 11. Hal yang Perlu Dicek Sebelum Build

- [ ] Apakah `productId` untuk market yang diinginkan (BTC, ETH, dll)?
  → Cek: `GET https://api.ethereal.trade/v1/product`
- [ ] Format `subaccount` (bytes32) — apakah ada konvensi naming?
- [ ] Minimum order size per market
- [ ] Fee structure (maker/taker)
- [ ] Cara deposit USDe ke subaccount
- [ ] Apakah ada rate limit di API?
- [ ] Linked signer: apakah wajib atau opsional untuk bot?

---

## 12. Sumber & Link Penting

| Resource | URL |
|---|---|
| Docs utama | https://docs.ethereal.trade |
| Trading API | https://docs.ethereal.trade/developer-guides/trading-api |
| API Hosts | https://docs.ethereal.trade/protocol-reference/api-hosts |
| Python SDK | https://docs.ethereal.trade/developer-guides/sdk/python-sdk |
| SDK Reference | https://meridianxyz.github.io/ethereal-py-sdk/ |
| PyPI | https://pypi.org/project/ethereal-sdk/ |
| OpenAPI Spec | https://api.ethereal.trade/openapi.json |
| App | https://app.ethereal.trade |
| Discord | Developer support: #developer-support |
