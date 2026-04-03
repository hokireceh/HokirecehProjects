import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import { logger } from "../logger";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface SignResult {
  txType: number;
  txInfo: string;
  txHash: string;
  err: string | null;
}

export interface GenerateApiKeyResult {
  privateKey: string;
  publicKey: string;
  err: string | null;
}

// Chain IDs from official lighter-python SDK:
// self.chain_id = 304 if ("mainnet" in url or "api" in url) else 300
const CHAIN_ID_MAINNET = 304;
const CHAIN_ID_TESTNET = 300;

function getChainId(url: string): number {
  return url.includes("mainnet") || url.includes("api") ? CHAIN_ID_MAINNET : CHAIN_ID_TESTNET;
}

let koffi: any = null;
let lib: any = null;
let fnCreateClient: any = null;
let fnSignCreateOrder: any = null;
let fnSignChangePubKey: any = null;
let fnGenerateAPIKey: any = null;
let fnFree: any = null;
let SignedTxResponseType: any = null;
let ApiKeyResponseType: any = null;

function loadLib(): void {
  if (lib) return;

  try {
    koffi = require("koffi");
  } catch (err) {
    throw new Error(`Failed to import koffi: ${err}`);
  }

  const soPath = path.join(__dirname, "..", "signers", "lighter-signer-linux-amd64.so");

  try {
    lib = koffi.load(soPath);
  } catch (err) {
    throw new Error(`Failed to load lighter signer .so from ${soPath}: ${err}`);
  }

  SignedTxResponseType = koffi.struct("SignedTxResponse", {
    txType: "uint8",
    txInfo: "char *",
    txHash: "char *",
    messageToSign: "char *",
    err: "char *",
  });

  ApiKeyResponseType = koffi.struct("ApiKeyResponse", {
    privateKey: "char *",
    publicKey: "char *",
    err: "char *",
  });

  fnCreateClient = lib.func(
    "CreateClient",
    "char *",
    ["char *", "char *", "int", "int", "long long"]
  );

  fnGenerateAPIKey = lib.func(
    "GenerateAPIKey",
    ApiKeyResponseType,
    []
  );

  // SignChangePubKey(newPubKey char*, nonce int64, apiKeyIndex int, accountIndex int64) SignedTxResponse
  fnSignChangePubKey = lib.func(
    "SignChangePubKey",
    SignedTxResponseType,
    [
      "char *",    // newPubKey
      "long long", // nonce
      "int",       // apiKeyIndex
      "long long", // accountIndex
    ]
  );

  fnSignCreateOrder = lib.func(
    "SignCreateOrder",
    SignedTxResponseType,
    [
      "int",       // cMarketIndex
      "long long", // cClientOrderIndex
      "long long", // cBaseAmount
      "int",       // cPrice
      "int",       // cIsAsk
      "int",       // cOrderType
      "int",       // cTimeInForce
      "int",       // cReduceOnly
      "int",       // cTriggerPrice
      "long long", // cOrderExpiry
      "long long", // cIntegratorAccountIndex
      "int",       // cIntegratorTakerFee
      "int",       // cIntegratorMakerFee
      "long long", // cNonce
      "int",       // cApiKeyIndex
      "long long", // cAccountIndex
    ]
  );

  fnFree = lib.func("Free", "void", ["void *"]);

  logger.info({ soPath }, "Lighter signer library loaded");
}

function readCStr(ptr: any): string | null {
  if (!ptr) return null;
  // koffi auto-converts char* struct fields to JS strings — handle both cases
  if (typeof ptr === "string") return ptr || null;
  try {
    return koffi.decode(ptr, "string") || null;
  } catch {
    return null;
  }
}

export function initSigner(
  url: string,
  privateKey: string,
  apiKeyIndex: number,
  accountIndex: number
): void {
  loadLib();
  const errPtr = fnCreateClient(url, privateKey, getChainId(url), apiKeyIndex, accountIndex);
  const err = readCStr(errPtr);
  if (errPtr) fnFree(errPtr);
  if (err) {
    throw new Error(`CreateClient failed: ${err}`);
  }
  logger.info({ apiKeyIndex, accountIndex, chainId: getChainId(url) }, "Lighter signer client initialized");
}

export function generateApiKey(): GenerateApiKeyResult {
  loadLib();
  const resp = fnGenerateAPIKey();
  const privateKey = readCStr(resp.privateKey);
  const publicKey = readCStr(resp.publicKey);
  const err = readCStr(resp.err);
  return {
    privateKey: privateKey ?? "",
    publicKey: publicKey ?? "",
    err,
  };
}

export interface ChangePubKeySignResult extends SignResult {
  messageToSign: string;
}

export function signChangePubKey(params: {
  url: string;
  newPubKey: string;
  nonce: number;
  apiKeyIndex: number;
  accountIndex: number;
}): ChangePubKeySignResult {
  loadLib();

  // CreateClient must be called first with the NEW private key so the signer
  // knows which key to use for signing
  const resp = fnSignChangePubKey(
    params.newPubKey,
    params.nonce,
    params.apiKeyIndex,
    params.accountIndex,
  );

  const txInfo = readCStr(resp.txInfo);
  const txHash = readCStr(resp.txHash);
  const messageToSign = readCStr(resp.messageToSign);
  const err = readCStr(resp.err);

  return {
    txType: resp.txType,
    txInfo: txInfo ?? "",
    txHash: txHash ?? "",
    messageToSign: messageToSign ?? "",
    err,
  };
}

export function signCreateOrder(params: {
  marketIndex: number;
  clientOrderIndex: number;
  baseAmount: number;
  price: number;
  isAsk: boolean;
  orderType: number;
  timeInForce: number;
  reduceOnly: boolean;
  triggerPrice: number;
  orderExpiry: number;
  nonce: number;
  apiKeyIndex: number;
  accountIndex: number;
}): SignResult {
  loadLib();

  const resp = fnSignCreateOrder(
    params.marketIndex,
    params.clientOrderIndex,
    params.baseAmount,
    params.price,
    params.isAsk ? 1 : 0,
    params.orderType,
    params.timeInForce,
    params.reduceOnly ? 1 : 0,
    params.triggerPrice,
    params.orderExpiry,
    0,  // integratorAccountIndex
    0,  // integratorTakerFee
    0,  // integratorMakerFee
    params.nonce,
    params.apiKeyIndex,
    params.accountIndex
  );

  const txInfo = readCStr(resp.txInfo);
  const txHash = readCStr(resp.txHash);
  const err = readCStr(resp.err);

  // Do NOT call fnFree on struct fields returned by value — koffi already
  // decoded them to JS strings; passing JS values to C Free() crashes the process.

  return {
    txType: resp.txType,
    txInfo: txInfo ?? "",
    txHash: txHash ?? "",
    err,
  };
}

export function isSignerAvailable(): boolean {
  try {
    loadLib();
    return true;
  } catch {
    return false;
  }
}
