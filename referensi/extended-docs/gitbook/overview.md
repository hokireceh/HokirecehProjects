# overview

> Source: https://docs.extended.exchange/
> Fetched: 2026-04-04T20:58:33.182Z


# Overview & Vision

### **Extended Overview**

Extended is a perpetuals DEX built by an ex-Revolut team, offering trading across 100+ markets including crypto, equities, FX, commodities, and indices, with up to 100x leverage, zero maker fees, and 0.025% taker fees.

The platform is designed to bridge crypto-native infrastructure with traditional financial markets. Extended is expanding its TradFi offering through integrations with established trading platforms, enabling a broader range of tradable markets and bringing deeper liquidity and institutional flow on-chain.

Extended uses USDC as the base collateral and introduces XVS as a core component of its capital efficiency model. Through the Community Vault, users can deposit USDC to earn yield and receive XVS, which can be used as collateral on the exchange. This enables users to generate yield while deploying capital across trading strategies.

### **What Sets Extended Apart**

Extended is building toward a unified margin system that combines perpetuals, spot, lending, and additional trading products within a single account.

The first component of this system is cross-asset collateral, which is currently in development. This will allow users to deposit a range of assets and use them as margin to trade USDC-settled markets, including both crypto and TradFi assets. For example, users will be able to use assets such as wBTC, ETH, EURC, and XVS as collateral to trade USDC-settled crypto markets, equities or commodities.

This unlocks several important use cases:

* Support for a broader set of collateral assets, one of the key reasons traders continue to rely on centralised exchanges
* Basis trading within a single account, i.e long spot and short perpetual
* Additional yield for the Vault, strengthening XVS economics

Cross-asset collateral will be introduced alongside a native lending layer, enabling borrowing against collateral as part of trading activity and forming the foundation of unified margin. The Vault will act as the primary lender, further reinforcing XVS yield.

The rollout of unified margin is structured in phases:

* Cross-asset collateral enabled by native lending
* Spot markets
* Additional trading products beyond perps, spot, and lending

For more details on the design and implementation of unified margin, see [link](https://x.com/rf_extended/status/2029898185561239566).

In parallel, Extended is working on integrations with both crypto-native applications and traditional trading platforms to embed trading functionality directly into user interfaces. This includes enabling seamless access to Extended’s markets within wallets, broker platforms, and other financial applications, allowing users to trade without leaving their primary interface. This approach is designed to significantly expand distribution, lower user acquisition costs, and bring both retail and institutional flow on-chain.

### Infrastructure Evolution

Extended is progressing toward full decentralisation of sequencing through a purpose-built, application-specific chain based on a custom high-throughput implementation of full BFT consensus. This architecture introduces an app-chain layered on top of the existing zk-enabled stack to handle matching and related services in a decentralised manner, while preserving Starknet’s security guarantees.

At the system level, security and fairness are ensured by independent validators. These validators execute the core business logic of unified margin and handle sequencing. The application state machines run by validators are open-sourced and optimised for financial applications, targeting latency below 100 milliseconds.

 Further details on this architecture will be shared in due course.

### Progress so far