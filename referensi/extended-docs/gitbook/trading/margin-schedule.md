# margin schedule

> Source: https://docs.extended.exchange/extended-resources/trading/margin-schedule
> Fetched: 2026-04-04T20:58:36.789Z


# Margin Schedule

### Initial Margin

Initial Margin is the required deposit to place an order and open a position. It's calculated as 1 divided by the leverage. 

Leverage can range from 1 to the maximum leverage, which depends on the market and the value of open position and open orders in that market. Leverage may vary across different markets, but within a specific market, a single leverage rate is applied to both the open position and all open orders.

When a user modifies the leverage, this change is applied to both the open position and all open orders in that market. However, the change can fail if the total value of the open position and open orders exceeds the maximum allowed for the selected leverage, or if the initial margin requirement, recalculated with the new leverage, is not satisfied.

### Maintenance Margin

Maintenance Margin is the minimum amount of margin required to maintain a position after it has been opened. Positions are subject to liquidation when the account equity falls below the maintenance margin requirement.

Maintenance margin equals 50% of the initial margin at maximum leverage allowed for a given market and position value.

### Order Validation against Margin Schedule

When placing a new order, it must ensure that the position remains below the maximum position value for the selected leverage:

* If the new order increases the absolute sum of the position value, the new order value, and the value of any triggered orders in the same direction as the new order, then the following criteria should be met;$$Abs(Sum(Position Value, New Order Value, Value of Triggered Orders))≤Max Position Value For Given Leverage$$
* If the new order does not increase the absolute sum of the position value, the new order value, and the value of any triggered orders in the same direction as the new order, then the validation is auto-passed.

### Margin Schedule

The Margin Schedule varies across 6 Market Groups. Value brackets may be adjusted over time, depending on available liquidity or changes in asset price.

Group 1: BTC, ETH

| Position Bracket  | Max Leverage | Min Initial Margin | Maintenance Margin |
| ----------------- | ------------ | ------------------ | ------------------ |
| $ 0 - 3000 k      | 50.0         | 2%                 | 1%                 |
| $ 3000 - 6000 k   | 25.0         | 4%                 | 2%                 |
| $ 6000 - 9000 k   | 16.7         | 6%                 | 3%                 |
| $ 9000 - 12000 k  | 12.5         | 8%                 | 4%                 |
| $ 12000 - 15000 k | 10.0         | 10%                | 5%                 |
| $ 15000 - 18000 k | 8.3          | 12%                | 6%                 |
| $ 18000 - 21000 k | 7.1          | 14%                | 7%                 |
| $ 21000 - 24000 k | 6.3          | 16%                | 8%                 |
| $ 24000 - 27000 k | 5.6          | 18%                | 9%                 |
| $ 27000 - 30000 k | 5.0          | 20%                | 10%                |

Group 2: SOL, HYPE.

| Position Bracket | Max Leverage | Min Initial Margin | Maintenance Margin |
| ---------------- | ------------ | ------------------ | ------------------ |
| $ 0 - 1000 k     | 50.0         | 2%                 | 1%                 |
| $ 1000 - 2000 k  | 25.0         | 4%                 | 2%                 |
| $ 2000 - 3000 k  | 16.7         | 6%                 | 3%                 |
| $ 3000 - 4000 k  | 12.5         | 8%                 | 4%                 |
| $ 4000 - 5000 k  | 10.0         | 10%                | 5%                 |
| $ 5000 - 6000 k  | 8.3          | 12%                | 6%                 |
| $ 6000 - 7000 k  | 7.1          | 14%                | 7%                 |
| $ 7000 - 8000 k  | 6.3          | 16%                | 8%                 |
| $ 8000 - 9000 k  | 5.6          | 18%                | 9%                 |
| $ 9000 - 10000 k | 5.0          | 20%                | 10%                |
| $10000 - 11000k  | 4.5          | 22%                | 11%                |
| $11000 - 12000k  | 4.2          | 24%                | 12%                |
| $12000 - 13000k  | 3.8          | 26%                | 13%                |
| $13000 - 14000k  | 3.6          | 28%                | 14%                |
| $14000 - 15000k  | 3.3          | 30%                | 15%                |

*If a user's position exceeds the last margin tier, initial and maintenance margin requirements will increase by 2% and 1% respectively for every additional $1000k.*

Group 3: XRP, AAVE, DOGE, SUI, ENA, PUMP, ADA, BNB.

| Position Bracket | Max Leverage | Min Initial Margin | Maintenance Margin |
| ---------------- | ------------ | ------------------ | ------------------ |
| $ 0 - 500 k      | 50.0         | 2%                 | 1%                 |
| $ 500 - 1000 k   | 25.0         | 4%                 | 2%                 |
| $ 1000 - 1500 k  | 16.7         | 6%                 | 3%                 |
| $ 1500 - 2000 k  | 12.5         | 8%                 | 4%                 |
| $ 2000 - 2500 k  | 10.0         | 10%                | 5%                 |
| $ 2500 - 3000 k  | 8.3          | 12%                | 6%                 |
| $ 3000 - 3500 k  | 7.1          | 14%                | 7%                 |
| $ 3500 - 4000 k  | 6.3          | 16%                | 8%                 |
| $ 4000 - 4500 k  | 5.6          | 18%                | 9%                 |
| $ 4500 - 5000 k  | 5.0          | 20%                | 10%                |
| $ 5000 - 5500 k  | 4.5          | 22%                | 11%                |
| $5500 - 6000k    | 4.2          | 24%                | 12%                |
| $6000 - 6500k    | 3.8          | 26%                | 13%                |
| $6500 - 7000k    | 3.6          | 28%                | 14%                |

*If a user's position exceeds the last margin tier, initial and maintenance margin requirements will increase by 2% and 1% respectively for every additional $500k.*

Group 4:  NEAR, BNB, AVAX, TRUMP, LINK, CRV, TRX, ONDO, APT, UNI, WIF, TIA, JUP, LTC, ARB, kSHIB, TON, OP, SEI, LDO, XPL, FARTCOIN, kPEPE, kBONK, ASTER, XMR, DOT, BCH.

| Position Bracket | Max Leverage | Min Initial Margin | Maintenance Margin |
| ---------------- | ------------ | ------------------ | ------------------ |
| $ 0 - 400 k      | 25.0         | 4%                 | 2%                 |
| $ 400 - 800 k    | 12.5         | 8%                 | 4%                 |
| $ 800 - 1200 k   | 8.3          | 12%                | 6%                 |
| $ 1200 - 1600 k  | 6.3          | 16%                | 8%                 |
| $ 1600 - 2000 k  | 5.0          | 20%                | 10%                |
| $ 2000 - 2400 k  | 4.2          | 24%                | 12%                |
| $ 2400 - 2800 k  | 3.6          | 28%                | 14%                |
| $ 2800 - 3200 k  | 3.1          | 32%                | 16%                |
| $ 3200 - 3600 k  | 2.8          | 36%                | 18%                |
| $ 3600 - 4000 k  | 2.5          | 40%                | 20%                |
| $ 4000 - 4400k   | 2.3          | 44%                | 22%                |
| $ 4400 - 4800k   | 2.1          | 48%                | 24%                |
| $ 4800 - 5200k   | 1.9          | 52%                | 26%                |

*If a user's position exceeds the last margin tier, initial and maintenance margin requirements will increase by 4% and 2% respectively for every additional $400k.*

Group 5: KAITO, MOODENG, MON, AERO, SPX, ZRO, GOAT, EDEN, GRASS, IP, BERA, APEX, PENDLE, CAKE, VIRTUAL, POPCAT, EIGEN, AVNT, S, MNT, ZEC, STRK, LINEA, SNX, WLD, TAO, WLFI, PENGU, XLM.

| Position Bracket | Max Leverage | Min Initial Margin | Maintenance Margin |
| ---------------- | ------------ | ------------------ | ------------------ |
| $ 0 - 250 k      | 10.0         | 10%                | 5%                 |
| $ 250 - 500 k    | 5.0          | 20%                | 10%                |
| $ 500 - 750 k    | 3.3          | 30%                | 15%                |
| $ 750 - 1000 k   | 2.5          | 40%                | 20%                |
| $ 1000 - 1250 k  | 2.0          | 50%                | 25%                |
| $1250 - 1500k    | 1.7          | 60%                | 30%                |
| $1500 - 1750k    | 1.4          | 70%                | 35%                |
| $1750 - 2000k    | 1.3          | 80%                | 40%                |
| $2000 - 2250k    | 1.1          | 90%                | 45%                |
| $2250 - 2500k    | 1.0          | 100%               | 50%                |

*If a user's position exceeds the last margin tier, initial and maintenance margin requirements will increase by 10% and 5% respectively for every additional $250k.*

Group 6:  4, RESOLV, INIT, ZORA, MELANIA, MEGA, AZTEC, VVV, BP.

| Position Bracket | Max Leverage | Min Initial Margin | Maintenance Margin |
| ---------------- | ------------ | ------------------ | ------------------ |
| $ 0 - 100 k      | 5.0          | 20%                | 10%                |
| $ 100 - 200 k    | 2.5          | 40%                | 20%                |
| $ 200 - 300 k    | 1.7          | 60%                | 30%                |
| $ 300 - 400 k    | 1.3          | 80%                | 40%                |
| $ 400 - 500 k    | 1.0          | 100%               | 50%                |

*If a user's position exceeds the last margin tier, initial and maintenance margin requirements will increase by 20% and 10% respectively for every additional $100k.*

Group 7 (Pre-market):  EDGE

| Position Bracket | Max Leverage | Min Initial Margin | Maintenance Margin |
| ---------------- | ------------ | ------------------ | ------------------ |
| $ 0 - 100 k      | 3.0          | 33.3%              | 16.7%              |

*If a user's position exceeds the last margin tier, initial and maintenance margin requirements will increase by 33.3% and 16.7% respectively for every additional $100k.*