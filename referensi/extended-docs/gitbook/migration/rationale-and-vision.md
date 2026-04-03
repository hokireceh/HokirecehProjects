# rationale and vision

> Source: https://docs.extended.exchange/starknet-migration/rationale-and-vision
> Fetched: 2026-04-03T00:22:39.985Z


copyCopychevron-down

- [StarkEx-Specific Docs ](/starkex-specific-docs)

# Rationale & Vision

Extended is migrating from StarkEx to Starknet, with the process starting on August 12, 2025, at 9:00 UTC.


Originally built on StarkEx, Extended established itself as a fast and efficient platform for perpetual trading. As we expand our product suite beyond perps — into **unified margin with integrated lending markets and spot trading** — we need a more composable and scalable foundation. Starknet aligns perfectly with this vision — and below, we’ll explain why.

### 
[hashtag](#what-does-this-mean-for-users)

What does this mean for users?


Existing Extended users will need to migrate from the current StarkEx instance to the new Starknet instance. The migration process has been designed to be as seamless as possible and is explained here. New users will be onboarded directly to the Starknet instance.

With the launch of the Starknet instance of the exchange, users will experience no disruption in their trading experience. Starknet will function purely as a settlement layer, with all chain-specific logic fully abstracted.

Extended will also support Starknet-native users. However, **EVM users won’t need to set up a Starknet wallet or interact with the network for deposits or withdrawals.** Near-instant deposits and withdrawals will be supported across six major EVM-compatible chains, with Solana integration coming soon.

### 
[hashtag](#why-starknet)

Why Starknet?


When selecting the optimal settlement layer for Extended, we focused on four key criteria:

- 


**Security**
Starknet stands out as one of the most secure Layer 2 solutions. Recognized as a Stage 1 rollup, it meets critical decentralization and security requirements — as [highlighted by Vitalik Buterinarrow-up-right](https://x.com/VitalikButerin/status/1923988377474330775).


- 


**Performance**
With [~2 seconds transaction confirmation timearrow-up-right](https://www.starknet.io/blog/bolt-version-upgrade/) and an [average cost user operation as low as $0.000057arrow-up-right](https://www.starknet.io/blog/march-2025-roundup/), Starknet is currently among the most cost-efficient rollups on Ethereum — enabling high throughput at a low cost essential for processing tens of thousands of trades.


- 


**Longevity**
StarkWare, the inventors of STARKs and the team behind Starknet, has been building cryptographic infrastructure for over seven years. Through multiple market cycles, they’ve demonstrated technical resilience and strategic continuity.


- 


**Vision Alignment**
Starknet’s ambition to become [the first Layer 2 to settle on both Bitcoin and Ethereumarrow-up-right](https://www.starknet.io/blog/starknet-bitcoin-scaling/) aligns with Extended’s roadmap to build a global unified margin. This will enable Extended to natively support BTC and its yield-bearing wrappers as collateral, marking a significant step toward broader capital efficiency and deeper liquidity.


### 
[hashtag](#what-are-we-building-at-extended)

What are we building at Extended?


Extended is building an open financial ecosystem powered by a global unified margin, enabling users to deploy their crypto assets in the most capital-efficient way.

The first phase of this roadmap focuses on **integrating a native lending and borrowing market into Extended**. This will allow users to post any supported asset — including yield-bearing ones — as collateral and earn additional yield through the integrated lending layer.

For example, if a user deposits wstETH as collateral and incurs a negative PnL while trading USDC-settled perpetuals, this effectively means borrowing USDC — with interest paid to USDC lenders.

Once the native lending market is in place, we’ll **add spot markets to Extended’s offering** — expanding toward a cross-asset collateral unified margin with integrated perpetuals, lending, and spot trading.

To support this architecture, we are migrating to Starknet, which will serve as the settlement layer — securing user balances and validating transactions. It is a foundational element that makes the Extended ecosystem trustless, with protocol logic verified by a decentralized and externally trusted network.

### 
[hashtag](#what-is-our-long-term-ambition)

What is our long-term ambition?


Unified margin will initially serve as a core internal product, designed to meet the needs of traders by enabling multi-asset collateral support and delivering one of the most capital-efficient trading systems in the market. However, the long-term vision for Extended goes far beyond that.

Following Hyperliquid’s success, many perpetual DEXs are now following the playbook of launching perps and then building a general-purpose chain — but Extended is taking a different path. We’ll be sharing more details soon, but briefly, the ambition is to build an **EVM-compatible network on top of Starknet, where unified margin logic is embedded directly into the base layer and exposed as an ERC-20 token accessible to all applications on the network**.


This means that core functions — such as margining with native, network-wide borrowing and lending, and liquidation — will be handled by the network itself rather than by individual applications.

The Extended network, with global unified margin at its core, will allow all applications within the network to access users’ available margin and share unified liquidity — reinforcing overall liquidity depth. From the user’s perspective, all activity will contribute to a single global margin account shared across applications, allowing them to manage one account instead of multiple app-specific ones and maximize capital efficiency by using the same margin across dApps.

### 
[hashtag](#roadmap)

Roadmap


We’re following a three-step roadmap — **evolving from a Perp DEX into a full Open Financial Ecosystem powered by Native Unified Margin.** With the migration to Starknet, we're one step closer to completing Stage 1 and bringing to life our long-term vision — the Extended Ecosystem.


Last updated 7 days ago