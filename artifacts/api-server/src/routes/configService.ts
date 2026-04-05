import { db } from "@workspace/db";
import { botConfigTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { encrypt, decrypt } from "../lib/encrypt";

const CONFIG_KEYS = {
  ACCOUNT_INDEX: "account_index",
  API_KEY_INDEX: "api_key_index",
  PRIVATE_KEY: "private_key",
  NETWORK: "network",
  L1_ADDRESS: "l1_address",
  NOTIFY_ON_BUY: "notify_on_buy",
  NOTIFY_ON_SELL: "notify_on_sell",
  NOTIFY_ON_ERROR: "notify_on_error",
  NOTIFY_ON_START: "notify_on_start",
  NOTIFY_ON_STOP: "notify_on_stop",
  NOTIFY_BOT_TOKEN: "notify_bot_token",
  NOTIFY_CHAT_ID: "notify_chat_id",
};

// ── Extended DEX credential keys (stored in bot_config, NOT in users table) ──
const EXT_KEYS = {
  API_KEY: "ext_api_key",
  STARK_PRIVATE_KEY: "ext_stark_private_key",
  ACCOUNT_ID: "ext_account_id",
  NETWORK: "ext_network",
};

// ── Ethereal DEX credential keys ──────────────────────────────────────────────
const ETH_KEYS = {
  PRIVATE_KEY:    "eth_private_key",
  WALLET_ADDRESS: "eth_wallet_address",
  SUBACCOUNT_ID:  "eth_subaccount_id",
  SUBACCOUNT_NAME: "eth_subaccount_name",
  NETWORK:        "eth_network",
  SIGNER_KEY:     "eth_signer_key",
  SIGNER_ADDRESS: "eth_signer_address",
  SIGNER_EXPIRES: "eth_signer_expires",
};

const ENCRYPTED_KEYS = new Set([
  CONFIG_KEYS.PRIVATE_KEY,
  CONFIG_KEYS.NOTIFY_BOT_TOKEN,
  EXT_KEYS.API_KEY,
  EXT_KEYS.STARK_PRIVATE_KEY,
  ETH_KEYS.PRIVATE_KEY,
  ETH_KEYS.SIGNER_KEY,
]);

async function getConfigValue(userId: number, key: string): Promise<string | null> {
  const row = await db.query.botConfigTable.findFirst({
    where: and(eq(botConfigTable.userId, userId), eq(botConfigTable.key, key)),
  });
  if (!row?.value) return null;
  return ENCRYPTED_KEYS.has(key) ? decrypt(row.value) : row.value;
}

async function setConfigValue(userId: number, key: string, value: string) {
  const storedValue = ENCRYPTED_KEYS.has(key) ? encrypt(value) : value;
  const existing = await db.query.botConfigTable.findFirst({
    where: and(eq(botConfigTable.userId, userId), eq(botConfigTable.key, key)),
  });
  if (existing) {
    await db.update(botConfigTable)
      .set({ value: storedValue, updatedAt: new Date() })
      .where(and(eq(botConfigTable.userId, userId), eq(botConfigTable.key, key)));
  } else {
    await db.insert(botConfigTable).values({ userId, key, value: storedValue });
  }
}

async function deleteConfigValue(userId: number, key: string) {
  await db.delete(botConfigTable).where(
    and(eq(botConfigTable.userId, userId), eq(botConfigTable.key, key))
  );
}

export async function getBotConfig(userId: number) {
  const [accountIndex, apiKeyIndex, privateKey, network, l1Address,
    notifyOnBuy, notifyOnSell, notifyOnError, notifyOnStart, notifyOnStop,
    notifyBotToken, notifyChatId] = await Promise.all([
    getConfigValue(userId, CONFIG_KEYS.ACCOUNT_INDEX),
    getConfigValue(userId, CONFIG_KEYS.API_KEY_INDEX),
    getConfigValue(userId, CONFIG_KEYS.PRIVATE_KEY),
    getConfigValue(userId, CONFIG_KEYS.NETWORK),
    getConfigValue(userId, CONFIG_KEYS.L1_ADDRESS),
    getConfigValue(userId, CONFIG_KEYS.NOTIFY_ON_BUY),
    getConfigValue(userId, CONFIG_KEYS.NOTIFY_ON_SELL),
    getConfigValue(userId, CONFIG_KEYS.NOTIFY_ON_ERROR),
    getConfigValue(userId, CONFIG_KEYS.NOTIFY_ON_START),
    getConfigValue(userId, CONFIG_KEYS.NOTIFY_ON_STOP),
    getConfigValue(userId, CONFIG_KEYS.NOTIFY_BOT_TOKEN),
    getConfigValue(userId, CONFIG_KEYS.NOTIFY_CHAT_ID),
  ]);

  const effectiveNotifyBotToken = notifyBotToken || process.env.BOT_TOKEN || null;
  const effectiveNotifyChatId = notifyChatId || process.env.ADMIN_CHAT_ID || null;

  return {
    accountIndex: accountIndex !== null ? parseInt(accountIndex) : null,
    apiKeyIndex: apiKeyIndex !== null ? parseInt(apiKeyIndex) : null,
    privateKey,
    network: (network ?? "mainnet") as "mainnet" | "testnet",
    l1Address,
    hasPrivateKey: !!privateKey,
    notifyOnBuy: notifyOnBuy !== null ? notifyOnBuy === "true" : true,
    notifyOnSell: notifyOnSell !== null ? notifyOnSell === "true" : true,
    notifyOnError: notifyOnError !== null ? notifyOnError === "true" : true,
    notifyOnStart: notifyOnStart !== null ? notifyOnStart === "true" : true,
    notifyOnStop: notifyOnStop !== null ? notifyOnStop === "true" : false,
    notifyBotToken: effectiveNotifyBotToken,
    notifyChatId: effectiveNotifyChatId,
    hasNotifyBotToken: !!effectiveNotifyBotToken,
  };
}

export async function getNotificationConfig(userId: number) {
  const config = await getBotConfig(userId);
  return {
    notifyOnBuy: config.notifyOnBuy,
    notifyOnSell: config.notifyOnSell,
    notifyOnError: config.notifyOnError,
    notifyOnStart: config.notifyOnStart,
    notifyOnStop: config.notifyOnStop,
  };
}

// ─── Extended DEX credentials (stored in bot_config key-value table) ─────────

export async function getExtendedCredentials(userId: number) {
  const [apiKey, privateKey, accountId, network] = await Promise.all([
    getConfigValue(userId, EXT_KEYS.API_KEY),
    getConfigValue(userId, EXT_KEYS.STARK_PRIVATE_KEY),
    getConfigValue(userId, EXT_KEYS.ACCOUNT_ID),
    getConfigValue(userId, EXT_KEYS.NETWORK),
  ]);
  return {
    apiKey,
    privateKey,
    accountId,
    extendedNetwork: (network ?? "mainnet") as "mainnet" | "testnet",
    hasApiKey: !!apiKey,
    hasPrivateKey: !!privateKey,
    hasAccountId: !!accountId,
    hasCredentials: !!(apiKey && privateKey && accountId),
  };
}

export async function updateExtendedCredentials(userId: number, updates: {
  apiKey?: string | null;
  privateKey?: string | null;
  accountId?: string | null;
  extendedNetwork?: "mainnet" | "testnet";
}) {
  const promises: Promise<void>[] = [];

  if (updates.apiKey !== undefined) {
    promises.push(
      updates.apiKey
        ? setConfigValue(userId, EXT_KEYS.API_KEY, updates.apiKey)
        : deleteConfigValue(userId, EXT_KEYS.API_KEY)
    );
  }
  if (updates.privateKey !== undefined) {
    promises.push(
      updates.privateKey
        ? setConfigValue(userId, EXT_KEYS.STARK_PRIVATE_KEY, updates.privateKey)
        : deleteConfigValue(userId, EXT_KEYS.STARK_PRIVATE_KEY)
    );
  }
  if (updates.accountId !== undefined) {
    promises.push(
      updates.accountId
        ? setConfigValue(userId, EXT_KEYS.ACCOUNT_ID, updates.accountId)
        : deleteConfigValue(userId, EXT_KEYS.ACCOUNT_ID)
    );
  }
  if (updates.extendedNetwork !== undefined) {
    promises.push(setConfigValue(userId, EXT_KEYS.NETWORK, updates.extendedNetwork));
  }

  await Promise.all(promises);
}

export async function deleteExtendedCredentials(userId: number) {
  await Promise.all(
    Object.values(EXT_KEYS).map((key) => deleteConfigValue(userId, key))
  );
}

// ─── Ethereal DEX credentials ─────────────────────────────────────────────────

export async function getEtherealCredentials(userId: number) {
  const [privateKey, walletAddress, subaccountId, subaccountName, network,
    signerKey, signerAddress, signerExpiresAt] = await Promise.all([
    getConfigValue(userId, ETH_KEYS.PRIVATE_KEY),
    getConfigValue(userId, ETH_KEYS.WALLET_ADDRESS),
    getConfigValue(userId, ETH_KEYS.SUBACCOUNT_ID),
    getConfigValue(userId, ETH_KEYS.SUBACCOUNT_NAME),
    getConfigValue(userId, ETH_KEYS.NETWORK),
    getConfigValue(userId, ETH_KEYS.SIGNER_KEY),
    getConfigValue(userId, ETH_KEYS.SIGNER_ADDRESS),
    getConfigValue(userId, ETH_KEYS.SIGNER_EXPIRES),
  ]);

  const signerExpiresDate = signerExpiresAt ? new Date(signerExpiresAt) : null;
  const isSignerExpiringSoon = signerExpiresDate
    ? signerExpiresDate.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000
    : false;

  return {
    privateKey,
    walletAddress,
    subaccountId,
    subaccountName,
    etherealNetwork: (network ?? "mainnet") as "mainnet" | "testnet",
    signerKey,
    signerAddress,
    signerExpiresAt: signerExpiresDate,
    hasPrivateKey: !!privateKey,
    hasSubaccountId: !!subaccountId,
    hasCredentials: !!(privateKey && subaccountId),
    isSignerExpiringSoon,
  };
}

export async function updateEtherealCredentials(userId: number, updates: {
  privateKey?: string | null;
  walletAddress?: string | null;
  subaccountId?: string | null;
  subaccountName?: string | null;
  etherealNetwork?: "mainnet" | "testnet";
  signerKey?: string | null;
  signerAddress?: string | null;
  signerExpiresAt?: Date | null;
}) {
  const promises: Promise<void>[] = [];

  if (updates.privateKey !== undefined) {
    promises.push(
      updates.privateKey
        ? setConfigValue(userId, ETH_KEYS.PRIVATE_KEY, updates.privateKey)
        : deleteConfigValue(userId, ETH_KEYS.PRIVATE_KEY)
    );
  }
  if (updates.walletAddress !== undefined) {
    promises.push(
      updates.walletAddress
        ? setConfigValue(userId, ETH_KEYS.WALLET_ADDRESS, updates.walletAddress)
        : deleteConfigValue(userId, ETH_KEYS.WALLET_ADDRESS)
    );
  }
  if (updates.subaccountId !== undefined) {
    promises.push(
      updates.subaccountId
        ? setConfigValue(userId, ETH_KEYS.SUBACCOUNT_ID, updates.subaccountId)
        : deleteConfigValue(userId, ETH_KEYS.SUBACCOUNT_ID)
    );
  }
  if (updates.subaccountName !== undefined) {
    promises.push(
      updates.subaccountName
        ? setConfigValue(userId, ETH_KEYS.SUBACCOUNT_NAME, updates.subaccountName)
        : deleteConfigValue(userId, ETH_KEYS.SUBACCOUNT_NAME)
    );
  }
  if (updates.etherealNetwork !== undefined) {
    promises.push(setConfigValue(userId, ETH_KEYS.NETWORK, updates.etherealNetwork));
  }
  if (updates.signerKey !== undefined) {
    promises.push(
      updates.signerKey
        ? setConfigValue(userId, ETH_KEYS.SIGNER_KEY, updates.signerKey)
        : deleteConfigValue(userId, ETH_KEYS.SIGNER_KEY)
    );
  }
  if (updates.signerAddress !== undefined) {
    promises.push(
      updates.signerAddress
        ? setConfigValue(userId, ETH_KEYS.SIGNER_ADDRESS, updates.signerAddress)
        : deleteConfigValue(userId, ETH_KEYS.SIGNER_ADDRESS)
    );
  }
  if (updates.signerExpiresAt !== undefined) {
    promises.push(
      updates.signerExpiresAt
        ? setConfigValue(userId, ETH_KEYS.SIGNER_EXPIRES, updates.signerExpiresAt.toISOString())
        : deleteConfigValue(userId, ETH_KEYS.SIGNER_EXPIRES)
    );
  }

  await Promise.all(promises);
}

export async function deleteEtherealCredentials(userId: number) {
  await Promise.all(
    Object.values(ETH_KEYS).map((key) => deleteConfigValue(userId, key))
  );
}

export async function deleteLighterCredentials(userId: number) {
  await Promise.all([
    deleteConfigValue(userId, CONFIG_KEYS.PRIVATE_KEY),
    deleteConfigValue(userId, CONFIG_KEYS.API_KEY_INDEX),
    deleteConfigValue(userId, CONFIG_KEYS.ACCOUNT_INDEX),
    deleteConfigValue(userId, CONFIG_KEYS.L1_ADDRESS),
  ]);
}

export async function updateBotConfig(userId: number, updates: {
  accountIndex?: number | null;
  apiKeyIndex?: number | null;
  privateKey?: string | null;
  network?: "mainnet" | "testnet";
  l1Address?: string | null;
  notifyOnBuy?: boolean | null;
  notifyOnSell?: boolean | null;
  notifyOnError?: boolean | null;
  notifyOnStart?: boolean | null;
  notifyOnStop?: boolean | null;
  notifyBotToken?: string | null;
  notifyChatId?: string | null;
}) {
  const promises: Promise<void>[] = [];

  if (updates.accountIndex !== undefined) {
    promises.push(
      updates.accountIndex !== null
        ? setConfigValue(userId, CONFIG_KEYS.ACCOUNT_INDEX, String(updates.accountIndex))
        : deleteConfigValue(userId, CONFIG_KEYS.ACCOUNT_INDEX)
    );
  }
  if (updates.apiKeyIndex !== undefined) {
    promises.push(
      updates.apiKeyIndex !== null
        ? setConfigValue(userId, CONFIG_KEYS.API_KEY_INDEX, String(updates.apiKeyIndex))
        : deleteConfigValue(userId, CONFIG_KEYS.API_KEY_INDEX)
    );
  }
  if (updates.privateKey !== undefined) {
    promises.push(
      updates.privateKey !== null
        ? setConfigValue(userId, CONFIG_KEYS.PRIVATE_KEY, updates.privateKey)
        : deleteConfigValue(userId, CONFIG_KEYS.PRIVATE_KEY)
    );
  }
  if (updates.network !== undefined) {
    promises.push(setConfigValue(userId, CONFIG_KEYS.NETWORK, updates.network));
  }
  if (updates.l1Address !== undefined) {
    promises.push(
      updates.l1Address !== null
        ? setConfigValue(userId, CONFIG_KEYS.L1_ADDRESS, updates.l1Address)
        : deleteConfigValue(userId, CONFIG_KEYS.L1_ADDRESS)
    );
  }
  if (updates.notifyOnBuy !== undefined && updates.notifyOnBuy !== null) {
    promises.push(setConfigValue(userId, CONFIG_KEYS.NOTIFY_ON_BUY, String(updates.notifyOnBuy)));
  }
  if (updates.notifyOnSell !== undefined && updates.notifyOnSell !== null) {
    promises.push(setConfigValue(userId, CONFIG_KEYS.NOTIFY_ON_SELL, String(updates.notifyOnSell)));
  }
  if (updates.notifyOnError !== undefined && updates.notifyOnError !== null) {
    promises.push(setConfigValue(userId, CONFIG_KEYS.NOTIFY_ON_ERROR, String(updates.notifyOnError)));
  }
  if (updates.notifyOnStart !== undefined && updates.notifyOnStart !== null) {
    promises.push(setConfigValue(userId, CONFIG_KEYS.NOTIFY_ON_START, String(updates.notifyOnStart)));
  }
  if (updates.notifyOnStop !== undefined && updates.notifyOnStop !== null) {
    promises.push(setConfigValue(userId, CONFIG_KEYS.NOTIFY_ON_STOP, String(updates.notifyOnStop)));
  }
  if (updates.notifyBotToken !== undefined) {
    promises.push(
      updates.notifyBotToken
        ? setConfigValue(userId, CONFIG_KEYS.NOTIFY_BOT_TOKEN, updates.notifyBotToken)
        : deleteConfigValue(userId, CONFIG_KEYS.NOTIFY_BOT_TOKEN)
    );
  }
  if (updates.notifyChatId !== undefined) {
    promises.push(
      updates.notifyChatId
        ? setConfigValue(userId, CONFIG_KEYS.NOTIFY_CHAT_ID, updates.notifyChatId)
        : deleteConfigValue(userId, CONFIG_KEYS.NOTIFY_CHAT_ID)
    );
  }

  await Promise.all(promises);
  return getBotConfig(userId);
}
