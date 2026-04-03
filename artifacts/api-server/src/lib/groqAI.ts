import Groq from "groq-sdk";
import { logger } from "./logger";

// ─── Multi-Key Pool ───────────────────────────────────────────────────────────
function loadApiKeys(): string[] {
  const keys: string[] = [];
  const primary = process.env.GROQ_API_KEY;
  if (primary) keys.push(primary);
  for (let i = 2; i <= 10; i++) {
    const k = process.env[`GROQ_API_KEY_${i}`];
    if (k) keys.push(k);
  }
  return keys;
}

let _keyIndex = 0;
function getNextKey(keys: string[]): string {
  const key = keys[_keyIndex % keys.length];
  _keyIndex = (_keyIndex + 1) % keys.length;
  return key;
}

// ─── Auto Cascade - 5 Tier Model System ──────────────────────────────────────
const MODEL_TIERS = [
  { name: "llama-3.3-70b-versatile",                   dailyLimit: 1000,  quality: 10, description: "Premium (10/10)"  },
  { name: "moonshotai/kimi-k2-instruct",                dailyLimit: 1000,  quality: 9,  description: "High (9/10)"     },
  { name: "compound-beta",                              dailyLimit: 250,   quality: 8,  description: "Good (8/10)"     },
  { name: "meta-llama/llama-4-scout-17b-16e-instruct",  dailyLimit: 1000,  quality: 7,  description: "Scout (7/10)"    },
  { name: "llama-3.1-8b-instant",                       dailyLimit: 14400, quality: 6,  description: "Standard (6/10)" },
];

// ─── System Prompt: Lighter DEX ───────────────────────────────────────────────
const LIGHTER_SYSTEM_PROMPT = `You are an expert algo trading assistant for the Lighter DEX (ZK-rollup on Ethereum). Analyze market data → recommend optimal DCA/Grid params.

IMPORTANT: "reasoning" in JSON MUST be Bahasa Indonesia (santai tapi expert). All other fields: English enums, numbers only.

<dex_context>
DEX: Lighter DEX (ZK-rollup Ethereum, perpetuals + spot)

Fees:
- Standard Account: maker 0%, taker 0% → LIMIT/Post-Only always superior to MARKET (no fee advantage either way, but Post-Only guarantees maker execution)
- Premium Account (LIT stake): maker 0.004%, taker 0.028% (up to 30% discount)

Latency: Standard 200-300ms | Premium LIT 140ms → Offset LEBAR wajib untuk mitigasi slippage
Latency-Offset Mapping:
  - DCA/Grid buy: 0.2-0.5% offset below market (+0.2% extra saat high vol >20% 24h range)
  - DCA/Grid sell: 0.2-0.5% offset above market (+0.2% extra saat high vol)
  - Alasan: Konfirmasi order 200-300ms → harga bisa bergerak sebelum fill, offset lebar jaga fill rate

Order Types: limit, post_only, market (avoid market — no fee benefit + slippage risk)
</dex_context>

## CORE STRATEGY LOGIC

### DCA
- Best for: trending markets (buy uptrend dips, sell downtrend rallies)
- Amount/order: 1-5% capital
- Interval: 30-60min high vol, 2-6h stable
  - +1 tier interval if volume <$2B (wider spreads); -1 tier if volume >$10B (tight execution)
- Order: POST-ONLY preferred (guaranteed maker); LIMIT fallback
- Offset: apply Latency-Offset Mapping above

### GRID
- Best for: sideways/ranging markets, support/resistance bounds
- Range: ±5-10% conservative | ±10-20% moderate | ±20-40% aggressive (vol >15% 24h)
- Levels: 5-10 tight (<10%) | 10-15 medium (10-20%) | 15-20 wide (>20%)
- Amount/grid: must fill all levels simultaneously; above exchange minimum
- Mode: neutral (range), long (bullish bias), short (bearish bias)
- SL: 5-10% below range (required for aggressive grids)
- TP: 5-10% above range (optional)
- Order: POST-ONLY strongly preferred; LIMIT fallback if fills too rare

## RESPONSE FORMAT
Valid JSON only, no markdown, no extra text:
{
  "strategy": "dca" | "grid",
  "dca_params": {
    "amountPerOrder": number,
    "intervalMinutes": number,
    "side": "buy" | "sell",
    "orderType": "limit" | "post_only",
    "limitPriceOffset": number
  } | null,
  "grid_params": {
    "lowerPrice": number,
    "upperPrice": number,
    "gridLevels": number,
    "amountPerGrid": number,
    "mode": "neutral" | "long" | "short",
    "orderType": "limit" | "post_only",
    "limitPriceOffset": number,
    "stopLoss": number | null,
    "takeProfit": number | null
  } | null,
  "reasoning": string,
  "marketCondition": "bullish" | "bearish" | "sideways" | "volatile",
  "riskLevel": "low" | "medium" | "high",
  "volumeContext": "low" | "normal" | "high",
  "confidence": number
}`;

// ─── System Prompt: Extended Exchange ────────────────────────────────────────
const EXTENDED_SYSTEM_PROMPT = `You are an expert algo trading assistant for the Extended Exchange (hybrid off-chain/on-chain DEX on Starknet). Analyze market data → recommend optimal DCA/Grid params.

IMPORTANT: "reasoning" in JSON MUST be Bahasa Indonesia (santai tapi expert). All other fields: English enums, numbers only.

<dex_context>
DEX: Extended Exchange (Starknet hybrid off-chain, all markets are perpetual contracts, USDC-collateralized)

Fees:
- Maker: 0% base (+rebates 0.002-0.013% jika volume share >0.5% → PRIORITAS POST-ONLY untuk dapat rebates)
- Taker: 0.025% → HINDARI MARKET orders
→ POST-ONLY adalah pilihan terbaik: zero fee + potensi rebates aktif

Latency: <10ms (hybrid off-chain Starknet) → Offset TIPIS cukup karena eksekusi hampir instan
Latency-Offset Mapping:
  - DCA/Grid buy: 0.05-0.2% offset below market (+0.1% extra saat high vol >20% 24h range)
  - DCA/Grid sell: 0.05-0.2% offset above market (+0.1% extra saat high vol)
  - Alasan: Latency <10ms → slippage minimal, offset tipis sudah cukup → maksimalkan fill rate + rebates

Accounts: Cross-margin default + hingga 10 isolated sub-akun → Gunakan sub-akun terpisah untuk grid isolation, hindari cross-margin blow-up antar strategi
Collateral: USDC dan XVS vault (90% equity bisa dipakai, 24h lockup withdrawal)
Liquidation: Partial liquidation (margin call 66%/80%), insurance fund cap 15% per hari
Order Types: limit, post_only, market (avoid market — taker fee 0.025% + melewatkan rebates maker)
</dex_context>

## CORE STRATEGY LOGIC

### DCA
- Best for: trending perpetual markets (buy uptrend dips, sell downtrend rallies)
- Amount/order: 1-5% capital
- Interval: 30-60min high vol, 2-6h stable
  - +1 tier interval if volume <$2B; -1 tier if volume >$10B
- Order: POST-ONLY preferred (maker 0% + rebates aktif); LIMIT fallback
- Offset: apply Latency-Offset Mapping above (tipis karena latency <10ms)
- Perhatikan arah funding rate untuk menentukan sisi DCA pada perpetuals

### GRID
- Best for: sideways/ranging perpetual markets, support/resistance bounds
- Range: ±5-10% conservative | ±10-20% moderate | ±20-40% aggressive (vol >15% 24h)
- Levels: 5-10 tight (<10%) | 10-15 medium (10-20%) | 15-20 wide (>20%)
- Amount/grid: must fill all levels simultaneously; above exchange minimum
- Mode: neutral (range), long (bullish bias), short (bearish bias)
- SL: 5-10% below range (wajib untuk aggressive grid, lindungi dari liquidation)
- TP: 5-10% above range (optional)
- Order: POST-ONLY strongly preferred (zero fee + rebates); LIMIT fallback
- Manfaatkan sub-akun isolated untuk setiap grid strategy — hindari cross-margin exposure

## RESPONSE FORMAT
Valid JSON only, no markdown, no extra text:
{
  "strategy": "dca" | "grid",
  "dca_params": {
    "amountPerOrder": number,
    "intervalMinutes": number,
    "side": "buy" | "sell",
    "orderType": "limit" | "post_only",
    "limitPriceOffset": number
  } | null,
  "grid_params": {
    "lowerPrice": number,
    "upperPrice": number,
    "gridLevels": number,
    "amountPerGrid": number,
    "mode": "neutral" | "long" | "short",
    "orderType": "limit" | "post_only",
    "limitPriceOffset": number,
    "stopLoss": number | null,
    "takeProfit": number | null
  } | null,
  "reasoning": string,
  "marketCondition": "bullish" | "bearish" | "sideways" | "volatile",
  "riskLevel": "low" | "medium" | "high",
  "volumeContext": "low" | "normal" | "high",
  "confidence": number
}`;

// ─── System Prompt: Ethereal Exchange ────────────────────────────────────────
const ETHEREAL_SYSTEM_PROMPT = `You are an expert algo trading assistant for the Ethereal Exchange (USDe-native perp/spot DEX on Arbitrum, Hyperliquid tech). Analyze market data → recommend optimal DCA/Grid params.

IMPORTANT: "reasoning" in JSON MUST be Bahasa Indonesia (santai tapi expert). All other fields: English enums, numbers only.

<dex_context>
DEX: Ethereal (Mainnet Alpha, cross-margin, all margin earns USDe rewards + points program)

Fees:
- Maker: -0.002% (rebate!) → POST-ONLY wajib.
- Taker: 0.025% → Hindari market.

Latency: <5ms → Offset super tipis.
Latency-Offset Mapping:
  - DCA/Grid buy: 0.01-0.05% below (+0.05% high vol).
  - DCA/Grid sell: 0.01-0.05% above (+0.05% high vol).

Order Types: limit, post_only, market (avoid).
</dex_context>

## CORE STRATEGY LOGIC
### DCA: FR-aware (FR>0.01% hindari long).
Amount: 1-3% capital. Interval: 15-30min vol tinggi.
### GRID: Levels 20-50 rapat (low latency). Range ±3-12%.

## RESPONSE FORMAT
Valid JSON only:
{
  "strategy": "dca"|"grid",
  "dca_params": {...}|null,
  "grid_params": {...}|null,
  "reasoning": string,
  "marketCondition": "bullish"|"bearish"|"sideways"|"volatile",
  "riskLevel": "low"|"medium"|"high",
  "volumeContext": "low"|"normal"|"high",
  "confidence": number
}`;

export interface MarketContext {
  exchange: "lighter" | "extended" | "ethereal";
  symbol: string;
  type: "perp" | "spot";
  lastPrice: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  priceChangePct24h: number;
  minBaseAmount: number;
  minQuoteAmount: number;
  availableBalance?: number;
}

export interface DCAParams {
  amountPerOrder: number;
  intervalMinutes: number;
  side: "buy" | "sell";
  orderType: "limit" | "post_only";
  limitPriceOffset: number;
}

export interface GridParams {
  lowerPrice: number;
  upperPrice: number;
  gridLevels: number;
  amountPerGrid: number;
  mode: "neutral" | "long" | "short";
  orderType: "limit" | "post_only";
  limitPriceOffset: number;
  stopLoss: number | null;
  takeProfit: number | null;
}

export interface AIAnalysisResult {
  strategy: "dca" | "grid";
  dca_params: DCAParams | null;
  grid_params: GridParams | null;
  reasoning: string;
  marketCondition: "bullish" | "bearish" | "sideways" | "volatile";
  riskLevel: "low" | "medium" | "high";
  volumeContext: "low" | "normal" | "high";
  confidence: number;
  modelUsed: string;
  modelTier: string;
}

function buildUserPrompt(strategyType: "dca" | "grid", market: MarketContext): string {
  const range24h = market.high24h > 0 && market.low24h > 0
    ? `$${market.low24h.toFixed(2)} - $${market.high24h.toFixed(2)}`
    : "N/A";
  const volatility = market.high24h > 0 && market.low24h > 0
    ? (((market.high24h - market.low24h) / market.low24h) * 100).toFixed(1)
    : "N/A";

  const volumeContext = market.volume24h > 10e9 ? "high ($10B+)"
    : market.volume24h > 2e9 ? "normal ($2-10B)"
    : "low (<$2B)";

  const exchangeLabel = market.exchange === "ethereal" ? "Ethereal Exchange (Arbitrum perp DEX)"
    : market.exchange === "extended"
    ? "Extended Exchange (StarkNet perp DEX)"
    : "Lighter DEX";

  const feeContext = market.exchange === "ethereal" ? "Maker rebate -0.002%, Taker fee 0.025% — POST-ONLY wajib untuk dapat rebates"
    : market.exchange === "extended"
    ? "Maker fee 0%, Taker fee 0.025% — always use LIMIT/Post-Only to avoid taker fees"
    : "Standard Account: zero maker/taker fees — always prefer LIMIT/Post-Only";

  return `Analyze this ${exchangeLabel} market and recommend optimal ${strategyType.toUpperCase()} strategy parameters.
IMPORTANT: All numbers in your JSON response MUST use a dot (.) as the decimal separator, never a comma. Example: 64956.4 not 64956,4.

Market: ${market.symbol} (${market.type})
Current Price: $${market.lastPrice.toFixed(4)}
24h Range: ${range24h}
24h Volatility: ${volatility}%
24h Volume: $${market.volume24h.toFixed(0)} (${volumeContext})
24h Price Change: ${market.priceChangePct24h > 0 ? "+" : ""}${market.priceChangePct24h.toFixed(2)}%
Min Order Size (HARD LIMIT — MUST NOT GO BELOW): ${market.minBaseAmount} ${market.symbol.split("-")[0]} base OR $${market.minQuoteAmount} USDC quote, whichever is LARGER.
At current price $${market.lastPrice.toFixed(4)}, the minimum order in USDC = max($${market.minQuoteAmount}, ${market.minBaseAmount} × $${market.lastPrice.toFixed(4)}) = $${Math.max(market.minQuoteAmount, market.minBaseAmount * market.lastPrice).toFixed(2)} USDC.
You MUST set amountPerGrid (grid) or amountPerOrder (DCA) to AT LEAST 1.5× this value = $${(Math.max(market.minQuoteAmount, market.minBaseAmount * market.lastPrice) * 1.5).toFixed(2)} USDC. Orders below minimum are silently skipped by the exchange.

Strategy Type: ${strategyType.toUpperCase()}
Execution: ${feeContext}
${(() => {
  const capital = market.availableBalance !== undefined
    ? `$${market.availableBalance.toFixed(2)} USDC (user's real available balance)`
    : "$1000 USDC (estimated)";
  return strategyType === "grid"
    ? `Capital Available: ${capital}. Size amountPerGrid so all grid levels can be filled simultaneously, AND above the minimum stated above. Provide appropriate stop-loss.`
    : `Capital Available: ${capital}. Size amountPerOrder conservatively (1-5% of capital per order), AND above the minimum stated above.`;
})()}

Return ONLY valid JSON matching the specification. Ensure strategy and appropriate params are set, others null.`;
}

async function callWithCascade(
  keys: string[],
  messages: Groq.Chat.ChatCompletionMessageParam[],
  startTierIndex: number = 0
): Promise<{ content: string; modelUsed: string; tierDescription: string }> {
  for (let i = startTierIndex; i < MODEL_TIERS.length; i++) {
    const tier = MODEL_TIERS[i];

    let lastErrMsg = "";
    let modelUnavailable = false;
    for (let k = 0; k < keys.length; k++) {
      const apiKey = getNextKey(keys);
      const client = new Groq({ apiKey });
      try {
        logger.info({ model: tier.name, tier: tier.description, keySlot: k + 1, totalKeys: keys.length }, "Trying AI model tier");
        const response = await client.chat.completions.create({
          model: tier.name,
          messages,
          temperature: 0.3,
          max_tokens: 800,
          response_format: { type: "json_object" },
        });

        const content = response.choices[0]?.message?.content ?? "";
        if (!content) throw new Error("Empty response from model");

        logger.info({ model: tier.name, keySlot: k + 1 }, "AI model responded successfully");
        return { content, modelUsed: tier.name, tierDescription: tier.description };
      } catch (err: any) {
        lastErrMsg = err?.message ?? String(err);
        const isRateLimit = lastErrMsg.includes("429") || lastErrMsg.includes("rate_limit") || lastErrMsg.includes("rate limit");
        modelUnavailable = lastErrMsg.includes("model") || lastErrMsg.includes("404") || lastErrMsg.includes("not found") || lastErrMsg.includes("decommissioned");

        logger.warn({ model: tier.name, keySlot: k + 1, err: lastErrMsg }, isRateLimit ? "Key rate-limited, trying next key" : "Model error");

        if (!isRateLimit) break;
      }
    }

    logger.warn({ model: tier.name, err: lastErrMsg }, `All keys failed for this tier, ${i < MODEL_TIERS.length - 1 ? "cascading to next tier" : "all tiers exhausted"}`);

    if (i === MODEL_TIERS.length - 1) {
      throw new Error(`All ${MODEL_TIERS.length} model tiers and ${keys.length} API key(s) exhausted. Last error: ${lastErrMsg}`);
    }
  }
  throw new Error("Cascade failed unexpectedly");
}

export async function analyzeMarketForStrategy(
  strategyType: "dca" | "grid",
  market: MarketContext
): Promise<AIAnalysisResult> {
  const keys = loadApiKeys();
  if (keys.length === 0) {
    throw new Error("GROQ_API_KEY is not configured. Please add it in Settings → Environment.");
  }

  const systemPrompt = market.exchange === "ethereal" ? ETHEREAL_SYSTEM_PROMPT
    : market.exchange === "extended"
    ? EXTENDED_SYSTEM_PROMPT
    : LIGHTER_SYSTEM_PROMPT;

  logger.info({ totalKeys: keys.length, exchange: market.exchange }, "AI analysis started with key pool");

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: buildUserPrompt(strategyType, market) },
  ];

  const { content, modelUsed, tierDescription } = await callWithCascade(keys, messages);

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`AI returned invalid JSON: ${content.substring(0, 200)}`);
  }

  const hasDCA = parsed.dca_params && typeof parsed.dca_params === "object";
  const hasGrid = parsed.grid_params && typeof parsed.grid_params === "object";

  if (!hasDCA && !hasGrid) {
    throw new Error("AI response missing both dca_params and grid_params");
  }

  const effectiveMinUsdc = Math.ceil(
    Math.max(market.minQuoteAmount, market.minBaseAmount * market.lastPrice) * 1.5 * 100
  ) / 100;

  const clampAmount = (raw: number | undefined, fallback: number): number =>
    Math.max(raw ?? fallback, effectiveMinUsdc);

  return {
    strategy: hasDCA ? "dca" : "grid",
    dca_params: hasDCA ? {
      amountPerOrder: clampAmount(parsed.dca_params.amountPerOrder, 100),
      intervalMinutes: parsed.dca_params.intervalMinutes ?? 60,
      side: parsed.dca_params.side ?? "buy",
      orderType: parsed.dca_params.orderType ?? "limit",
      limitPriceOffset: parsed.dca_params.limitPriceOffset ?? 0.2,
    } : null,
    grid_params: hasGrid ? {
      lowerPrice: parsed.grid_params.lowerPrice ?? market.lastPrice * 0.95,
      upperPrice: parsed.grid_params.upperPrice ?? market.lastPrice * 1.05,
      gridLevels: parsed.grid_params.gridLevels ?? 10,
      amountPerGrid: clampAmount(parsed.grid_params.amountPerGrid, 100),
      mode: parsed.grid_params.mode ?? "neutral",
      orderType: parsed.grid_params.orderType ?? "post_only",
      limitPriceOffset: parsed.grid_params.limitPriceOffset ?? 0.1,
      stopLoss: parsed.grid_params.stopLoss ?? null,
      takeProfit: parsed.grid_params.takeProfit ?? null,
    } : null,
    reasoning: parsed.reasoning ?? "Analysis complete.",
    marketCondition: parsed.marketCondition ?? "sideways",
    riskLevel: parsed.riskLevel ?? "medium",
    volumeContext: parsed.volumeContext ?? "normal",
    confidence: parsed.confidence ?? 70,
    modelUsed,
    modelTier: tierDescription,
  };
}
