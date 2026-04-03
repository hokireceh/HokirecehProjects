import { ethers } from "ethers";
import { logger } from "../logger";

// ─── EIP-712 Domain ───────────────────────────────────────────────────────────
// Sumber: ETHEREAL_INTEGRATION.md + OpenAPI GET /v1/rpc/config
//
// Mainnet:
//   name: "Ethereal", version: "1", chainId: 5064014
//   verifyingContract: "0xB3cDC82035C495c484C9fF11eD5f3Ff6d342e3cc"
//
// TODO: verifyingContract testnet BELUM DIKONFIRMASI.
//   Docs hanya mendokumentasikan mainnet contract.
//   Sebelum menggunakan testnet secara live, verifikasi alamat contract yang benar
//   lewat GET https://api.etherealtest.net/v1/rpc/config (endpoint ini ada di OpenAPI).

export const ETHEREAL_DOMAINS = {
  mainnet: {
    name: "Ethereal",
    version: "1",
    chainId: 5064014,
    verifyingContract: "0xB3cDC82035C495c484C9fF11eD5f3Ff6d342e3cc",
  },
  testnet: {
    name: "Ethereal",
    version: "1",
    chainId: 13374202,
    // TODO: verifyingContract testnet belum dikonfirmasi — jangan pakai mainnet address untuk testnet.
    // Ambil dari: GET https://api.etherealtest.net/v1/rpc/config → field "verifyingContract"
    verifyingContract: "0x0000000000000000000000000000000000000000",
  },
} as const;

// ─── EIP-712 Types ────────────────────────────────────────────────────────────
// Dikonfirmasi dari docs: ETHEREAL_INTEGRATION.md §4 + OpenAPI schema
//
// Catatan field kritis:
// - quantity: uint128 → dalam satuan "precision 9" (× 1e9 dari decimal string)
// - price:    uint128 → dalam satuan "precision 9"
//   TODO: Untuk MARKET order, nilai price yang tepat di EIP-712 belum dikonfirmasi.
//         Apakah price=0 (no price limit) atau slippage price? Docs tidak menjelaskan.
//         Referensi: Python SDK belum bisa diakses untuk cek implementasi resminya.
//         Saat ini engine mengirim slippage price — jika order gagal, coba price=0.
// - nonce:    uint64 → nanoseconds sejak Unix epoch (bukan dari API endpoint)
//   Perbedaan kritis dari Lighter yang ambil nonce via GET /api/v1/nextNonce.

const TRADE_ORDER_TYPES = {
  TradeOrder: [
    { name: "sender",     type: "address" },
    { name: "subaccount", type: "bytes32" },
    { name: "quantity",   type: "uint128" },
    { name: "price",      type: "uint128" },
    { name: "reduceOnly", type: "bool"    },
    { name: "side",       type: "uint8"   },
    { name: "engineType", type: "uint8"   },
    { name: "productId",  type: "uint32"  },
    { name: "nonce",      type: "uint64"  },
    { name: "signedAt",   type: "uint64"  },
  ],
};

// CancelOrder: signedAt ada di EIP-712 tapi TIDAK dikirim di REST body (sesuai OpenAPI schema CancelOrderDtoData)
const CANCEL_ORDER_TYPES = {
  CancelOrder: [
    { name: "sender",     type: "address"  },
    { name: "subaccount", type: "bytes32"  },
    { name: "orderIds",   type: "bytes32[]" },
    { name: "nonce",      type: "uint64"   },
    { name: "signedAt",   type: "uint64"   },
  ],
};

const WITHDRAW_TYPES = {
  InitiateWithdraw: [
    { name: "account",    type: "address" },
    { name: "subaccount", type: "bytes32" },
    { name: "token",      type: "address" },
    { name: "amount",     type: "uint256" },
    { name: "nonce",      type: "uint64"  },
    { name: "signedAt",   type: "uint64"  },
  ],
};

const LINK_SIGNER_TYPES = {
  LinkSigner: [
    { name: "sender",     type: "address" },
    { name: "signer",     type: "address" },
    { name: "subaccount", type: "bytes32" },
    { name: "nonce",      type: "uint64"  },
    { name: "signedAt",   type: "uint64"  },
  ],
};

// ─── Public types ─────────────────────────────────────────────────────────────

export type EtherealNetwork = "mainnet" | "testnet";

export interface TradeOrderData {
  sender: string;
  subaccount: string;
  quantity: bigint;
  price: bigint;
  reduceOnly: boolean;
  side: 0 | 1;
  engineType: number;
  productId: number;
  nonce: bigint;
  signedAt: number;
}

export interface CancelOrderData {
  sender: string;
  subaccount: string;
  orderIds: string[];
  nonce: bigint;
  signedAt: number;
}

export interface WithdrawData {
  account: string;
  subaccount: string;
  token: string;
  amount: bigint;
  nonce: bigint;
  signedAt: number;
}

export interface LinkSignerData {
  sender: string;
  signer: string;
  subaccount: string;
  nonce: bigint;
  signedAt: number;
}

// ─── Precision constant ───────────────────────────────────────────────────────
// Ethereal precision 9 → multiply decimal strings by 1e9 untuk EIP-712
// Sumber: OpenAPI → quantity "precision: 9", price "precision: 9"

const PRECISION = 1_000_000_000n;

// ─── Decimal to BigInt (no floating point loss) ───────────────────────────────

export function decimalToBigInt(decimalStr: string, scale: bigint = PRECISION): bigint {
  const trimmed = decimalStr.trim();
  const dotIdx = trimmed.indexOf(".");
  if (dotIdx === -1) {
    return BigInt(trimmed) * scale;
  }
  const intPart = trimmed.slice(0, dotIdx);
  const fracPart = trimmed.slice(dotIdx + 1);
  const fracScale = 10n ** BigInt(fracPart.length);
  const intBig = BigInt(intPart === "" ? "0" : intPart) * scale;
  const fracBig = BigInt(fracPart === "" ? "0" : fracPart) * scale / fracScale;
  return intBig + fracBig;
}

// ─── Wallet helpers ───────────────────────────────────────────────────────────

export function getWalletAddress(privateKey: string): string {
  const pk = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  return new ethers.Wallet(pk).address;
}

// ─── Nonce helpers ────────────────────────────────────────────────────────────
// Perbedaan kritis dari Lighter:
//   Lighter → nonce diambil dari GET /api/v1/nextNonce (server-side counter)
//   Ethereal → nonce dibuat lokal: nanoseconds since Unix epoch
//   Sumber: OpenAPI SubmitOrderMarketDtoData.nonce → "nanoseconds since Unix Epoch"

export function generateNonce(): bigint {
  return BigInt(Date.now()) * 1_000_000n;
}

export function generateSignedAt(): number {
  return Math.floor(Date.now() / 1000);
}

// ─── Subaccount name helper ───────────────────────────────────────────────────
// Ethereal subaccount diidentifikasi dengan:
//   - subaccountId: UUID string (untuk REST query params)
//   - subaccount:   bytes32 hex (untuk EIP-712 signing dan REST order body)
// Konversi: ethers.encodeBytes32String("primary") → bytes32 hex

export function nameToBytes32(name: string): string {
  return ethers.encodeBytes32String(name);
}

export const DEFAULT_SUBACCOUNT: string = nameToBytes32("primary");

// ─── Sign TradeOrder ──────────────────────────────────────────────────────────

export async function signTradeOrder(
  privateKey: string,
  order: TradeOrderData,
  network: EtherealNetwork = "mainnet"
): Promise<string> {
  const pk = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  const wallet = new ethers.Wallet(pk);
  const domain = ETHEREAL_DOMAINS[network];

  const value = {
    sender:     order.sender,
    subaccount: order.subaccount,
    quantity:   order.quantity,
    price:      order.price,
    reduceOnly: order.reduceOnly,
    side:       order.side,
    engineType: order.engineType,
    productId:  order.productId,
    nonce:      order.nonce,
    signedAt:   order.signedAt,
  };

  logger.debug(
    {
      network,
      sender:    order.sender,
      productId: order.productId,
      side:      order.side,
      quantity:  order.quantity.toString(),
      price:     order.price.toString(),
      nonce:     order.nonce.toString(),
    },
    "[EtherealSigner] Signing TradeOrder"
  );

  const sig = await wallet.signTypedData(domain as any, TRADE_ORDER_TYPES, value);

  logger.debug({ sig: sig.slice(0, 20) + "..." }, "[EtherealSigner] TradeOrder signed");
  return sig;
}

// ─── UUID to bytes32 conversion ───────────────────────────────────────────────
// EIP-712 CancelOrder.orderIds type adalah bytes32[] (32 bytes per entry).
// REST body orderIds menerima UUID strings, tapi EIP-712 harus bytes32.
// Konversi: strip hyphens → 32 hex bytes (pad kanan dengan 0s) → prefix 0x
// UUID = 16 bytes = 32 hex chars → pad ke 64 hex chars untuk bytes32.
// Contoh: "80569be0-afba-43f8-ac20-767d0974c6a3"
//       → "0x80569be0afba43f8ac20767d0974c6a30000000000000000000000000000000000"

export function uuidToBytes32(uuid: string): string {
  const hex = uuid.replace(/-/g, "").padEnd(64, "0");
  return "0x" + hex;
}

// ─── Sign CancelOrder ─────────────────────────────────────────────────────────
// orderIds: UUID strings dari REST body di-encode ke bytes32[] untuk EIP-712.

export async function signCancelOrder(
  privateKey: string,
  data: CancelOrderData,
  network: EtherealNetwork = "mainnet"
): Promise<string> {
  const pk = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  const wallet = new ethers.Wallet(pk);
  const domain = ETHEREAL_DOMAINS[network];

  const sig = await wallet.signTypedData(
    domain as any,
    CANCEL_ORDER_TYPES,
    {
      sender:     data.sender,
      subaccount: data.subaccount,
      orderIds:   data.orderIds.map(uuidToBytes32),
      nonce:      data.nonce,
      signedAt:   data.signedAt,
    }
  );

  return sig;
}

// ─── Sign Withdraw ────────────────────────────────────────────────────────────

export async function signWithdraw(
  privateKey: string,
  data: WithdrawData,
  network: EtherealNetwork = "mainnet"
): Promise<string> {
  const pk = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  const wallet = new ethers.Wallet(pk);
  const domain = ETHEREAL_DOMAINS[network];

  return wallet.signTypedData(domain as any, WITHDRAW_TYPES, {
    account:    data.account,
    subaccount: data.subaccount,
    token:      data.token,
    amount:     data.amount,
    nonce:      data.nonce,
    signedAt:   data.signedAt,
  });
}

// ─── Sign LinkSigner ──────────────────────────────────────────────────────────

export async function signLinkSigner(
  privateKey: string,
  data: LinkSignerData,
  network: EtherealNetwork = "mainnet"
): Promise<string> {
  const pk = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  const wallet = new ethers.Wallet(pk);
  const domain = ETHEREAL_DOMAINS[network];

  return wallet.signTypedData(domain as any, LINK_SIGNER_TYPES, {
    sender:     data.sender,
    signer:     data.signer,
    subaccount: data.subaccount,
    nonce:      data.nonce,
    signedAt:   data.signedAt,
  });
}

// ─── Verify signature (untuk debug/testing) ───────────────────────────────────

export async function verifyTradeOrderSignature(
  sig: string,
  order: TradeOrderData,
  network: EtherealNetwork = "mainnet"
): Promise<string> {
  const domain = ETHEREAL_DOMAINS[network];
  const recovered = ethers.verifyTypedData(domain as any, TRADE_ORDER_TYPES, order, sig);
  return recovered;
}
