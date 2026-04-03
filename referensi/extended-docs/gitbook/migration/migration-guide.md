# migration guide

> Source: https://docs.extended.exchange/starknet-migration/migration-guide
> Fetched: 2026-04-03T00:22:41.236Z


copyCopychevron-down

- [StarkEx-Specific Docs ](/starkex-specific-docs)

# Migration Guide

Extended is migrating from StarkEx to Starknet, with the process starting on August 12, 2025, at 9:00 UTC.


Please refer to [this article](/starkex-specific-docs/rationale-and-vision) to understand the rationale behind the move to Starknet and our longer-term vision for building the Extended ecosystem.

### 
[hashtag](#overarching-migration-logic)

Overarching Migration Logic


The migration will happen in three stages, outlined below. However, we encourage users to migrate as soon as possible, as **points will only accrue on the Starknet version of the exchange from the beginning of the migration process**. Additionally, we expect better liquidity on the Starknet instance.

Existing Extended users will need to migrate from the current StarkEx instance to the new Starknet instance, following the logic described below. With the launch of the Starknet instance, users will experience no disruption in their trading experience. Starknet will function purely as a settlement layer, with all chain-specific logic fully abstracted. This means:

- 


**EVM users will not need to set up a Starknet wallet or interact with the Starknet network for deposits or withdrawals.**


- 


Near-instant deposits and withdrawals will be supported across six major EVM-compatible chains, with Solana integration coming soon.


At any given time, only one version of the exchange will be available to each user — StarkEx before migrating, and Starknet after migrating. Once a user migrates to Starknet, they will no longer have access to the StarkEx version. However, **Points balances and complete trading history will be seamlessly transferred** to the Starknet instance.

After the migration begins, all new users will be onboarded directly to the Starknet instance.

### 
[hashtag](#migration-stages)

Migration Stages


#### 
[hashtag](#stage-1-dual-operation-mode)

Stage 1: Dual Operation Mode


- 


**Duration:** 2 weeks from the launch of the Starknet instance


- 


**Description:** During this stage, both StarkEx and Starknet instances will be fully operational for trading. Existing StarkEx users are encouraged to migrate at their convenience.


- 


**StarkEx Trading:** Fully operational


- 


**StarkEx Deposits & Withdrawals:** Fully operational


- 


**StarkEx Vault:**


New deposits are disabled


- 


All vault positions are closed


- 


No fee distributions


- 


Vault stops processing liquidations — these will be handled by a separate insurance fund


- 


**Points:** Distributed exclusively on Starknet. Once a user completes the migration, all points accrued on the StarkEx instance will be automatically migrated to the Starknet instance of the exchange.


- 


**Fees: **0 bps for reduce-only orders on StarkEx; otherwise, [regular trading fees](/extended-resources/trading/trading-fees-and-rebates) apply on both StarkEx and Starknet.


#### 
[hashtag](#stage-2-starkex-wind-down-mode)

Stage 2: StarkEx Wind-Down Mode


- 


**Duration:** 2 weeks after Stage 1


- 


**Description:** Users are strongly encouraged to complete their migration to Starknet during this period. The StarkEx instance begins winding down and limits trading activity.


- 


**StarkEx Trading:** Switched to reduce-only mode. Users can only decrease their exposure; opening new positions or increasing position sizes is disabled.


- 


**StarkEx Deposits & Withdrawals:**


Deposits: Disabled


- 


Withdrawals: Both Fast and Slow withdrawals are fully operational


- 


**StarkEx Vault:**


New deposits are disabled


- 


All vault positions are closed


- 


No fee distributions


- 


Vault stops processing liquidations — these will be handled by a separate insurance fund


- 


**Points:** Distributed exclusively on Starknet. Once a user completes the migration, all points accrued on the StarkEx instance will be automatically migrated to the Starknet instance of the exchange.


- 


**Fees: **0 bps for reduce-only orders on StarkEx; otherwise, [regular trading fees](/extended-resources/trading/trading-fees-and-rebates) apply on both StarkEx and Starknet.


#### 
[hashtag](#stage-3-starkex-freeze)

Stage 3: StarkEx Freeze


- 


**Duration:** Begins after Stage 2 and continues until all users withdraw their funds.


- 


**Description:** All remaining positions on StarkEx will be force-closed at the latest Mark Price. The trading interface will no longer be available. Users will only be able to withdraw remaining funds through a dedicated withdrawal UI using the slow withdrawal mechanism. To access the Starknet instance of the exchange, users will first need to complete a slow withdrawal from StarkEx. Once the withdrawal is processed, they will be able to log in to Extended’s Starknet instance.


- 


**StarkEx Trading:** Disabled. All positions force-closed at Mark Price


- 


**StarkEx Deposits & Withdrawals:**


Deposits: Disabled


- 


Withdrawals: Only slow withdrawals are supported through a dedicated withdrawal UI


- 


**StarkEx Vault:**


The vault is shut down


- 


All user funds are returned to depositors


- 


Users must withdraw these funds via slow withdrawals


- 


**Points:** Distributed exclusively on Starknet. To access points accrued on the StarkEx instance of the exchange, users must first complete a slow withdrawal from StarkEx. Once the withdrawal is processed, they will be able to log in to Extended’s Starknet instance and access their points balance.


### 
[hashtag](#migration-process-user-flow)

Migration Process: User Flow


Users will be guided through a dedicated migration page that handles all required steps. **The process includes:**

- 


Close All Open Orders and Positions. Close all open orders and positions across all sub-accounts. We recommend closing positions with reduce-only orders on StarkEx, as these will not incur trading fees.


- 


Consolidate Funds. Move funds from all sub-accounts into a single sub-account of your choice. 


- 


Vault Funds. Funds held in the StarkEx vault do not require manual withdrawal. They will be migrated automatically.


Once all of the above steps are completed, go to the Migration page and click “Migrate.” The StarkEx interface will then transition to the Starknet UI with:

- 


**Your funds—including your Vault balance—typically arriving within 45 minutes**. In rare cases, it may take up to 6 hours. You’ll receive a notification once the transfer is complete.


- 


Points balances and complete trading history seamlessly transferred to the Starknet instance.


Existing StarkEx users with no funds or Vault balance on the exchange will be automatically migrated to Starknet at the start of Stage 1. No action is required.

⚠️ Please note: After migration, the StarkEx version of the exchange will no longer be accessible.


### 
[hashtag](#migration-for-referrals-and-affiliates)

Migration for Referrals and Affiliates


As soon as the migration starts, all referral commissions—whether from users who have migrated to Starknet or remain on StarkEx—will be accrued on Starknet. If an affiliate hasn’t migrated yet, they will still receive referral commissions on the Starknet instance and will be able to access them after completing the migration.

Starting with Stage 1, it will no longer be possible to create new referral links or activate referral codes on StarkEx. To create a new link, you’ll first need to migrate to Starknet. New users who join via your existing referral link will be onboarded to the Starknet version of the exchange.

⚠️ **Please note:** Starting from Stage 1, affiliates and their referrals on StarkEx will no longer earn Points for their activity. Points will only be accrued on Starknet.

### 
[hashtag](#migration-for-api-traders)

Migration for API Traders


The API endpoints on the Starknet instance of the exchange will remain the same as on StarkEx, but the signing scheme will change.

You can find an example of the new Starknet signing scheme [herearrow-up-right](https://github.com/x10xchange/rust-crypto-lib-base/blob/main/src/lib.rs#L75), and we’ve also prepared a [Python SDKarrow-up-right](https://github.com/x10xchange/python_sdk/tree/starknet) for the Starknet instance for your convenience.

In addition to the signing scheme change, there are a few other minor differences for API traders between Starknet and StarkEx, which are covered in our [API documentationarrow-up-right](https://api.docs.extended.exchange/#starkex-to-starknet-migration).

We recommend implementing the new Starknet signing scheme as soon as possible to ensure a smooth migration. Our [testnetarrow-up-right](https://starknet.sepolia.extended.exchange/perp) is already live on Starknet Sepolia, and you can test your integration there. 

If you have any questions, feel free to ask the team in the [Discordarrow-up-right](https://discord.gg/extendedapp) #devs channel.

### 
[hashtag](#migration-faq)

Migration FAQ


#### 
[hashtag](#how-long-will-the-migration-of-funds-take)

How long will the migration of funds take?


Your funds — including your vault balance — will typically arrive within 45 minutes, though in rare cases, it may take up to 6 hours. You will receive a notification once the transfer is complete.

#### 
[hashtag](#will-my-points-be-migrated)

Will my points be migrated?


Yes, all of your accrued points will be migrated to the Starknet instance of the exchange.

**Will I need to pay fees to close my positions on StarkEx?**

At the start of the migration, fees for reduce-only orders on StarkEx will be waived. We recommend closing positions using reduce-only orders, as these will not incur trading fees.

#### 
[hashtag](#will-i-be-able-to-see-my-past-trading-history-after-migration)

Will I be able to see my past trading history after migration?


Yes, complete trading history will be seamlessly transferred to the Starknet instance.

#### 
[hashtag](#do-i-need-to-migrate-if-i-only-have-funds-in-the-vault)

Do I need to migrate if I only have funds in the vault?


Yes, you will need to manually confirm the migration. However, funds held in the Vault do not require manual withdrawal—they will be migrated automatically once you confirm.

**Do I need to migrate if I don't have any funds on the exchange?**

No—existing StarkEx users with no funds or Vault balance will be automatically migrated to Starknet at the start of Stage 1. No action is required.


Last updated 7 months ago