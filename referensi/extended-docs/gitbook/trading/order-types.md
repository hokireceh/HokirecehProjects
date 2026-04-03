# order types

> Source: https://docs.extended.exchange/extended-resources/trading/order-types
> Fetched: 2026-04-03T17:37:18.261Z


copyCopychevron-down

- [EXTENDED Resources](/extended-resources)chevron-right
- [Trading](/extended-resources/trading)

# Order Types


### 
[hashtag](#order-types)

Supported Order Types


Order Type

Description


Market Order


Executes immediately at the prevailing market price.


Limit Order


Executes at the chosen limit price or better.


Conditional Order 


Activates a Market or Limit order when the specified trigger price is reached. On Extended, trigger prices can be linked to Mark, Index, or Last Prices.


TWAP Order


Executes market orders over a specified period at defined frequency, aiming to minimize price impact by distributing the total order into smaller sub-orders. Users can opt to "randomize" these sub-orders, in which case each sub-order's size is automatically adjusted within ±20% of the original trade size.


Scaled Order


Places multiple limit orders across a defined price range, distributing the total order size into smaller sub-orders to manage execution impact and achieve a desired average entry or exit price. Users can opt to apply a size skew between 0.01 and 100.00, which adjusts the distribution of sub-order sizes according to a geometric progression.​


### 
[hashtag](#order-types-1)

Order Conditions


Condition

Description


Reduce Only


An order designed to decrease an existing position, rather than initiating a new position in the opposite direction.

If a user submits a market reduce-only order or has a market TPSL order triggered, but the order doesn't meet the [Order Cost](/extended-resources/trading/order-cost) or [Max Position Value](/extended-resources/trading/trading-rules#group-specific-trading-rules) requirement, the market reduce-only order will still be executed. However, all open non-reduce-only limit orders in the same direction will be canceled as a result.


Post Only


An order can only be added to the order book but not executed immediately.


Take Profit / Stop Loss (TPSL)


An order triggered when the market reaches the specified Take Profit or Stop Loss price.

Extended supports following types of TPSL orders:

- 


Position TPSL: This applies to the full size of the position. If the TPSL for the full position size is triggered, the entire position is closed. Position TPSL can be added when placing a new order or from the Positions Tab.


- 


Partial Position TPSL: The size of a single partial position TPSL can be anywhere up to the current open position size. Partial Position TPSL can only be added from the Positions Tab.


- 


Order TPSL: This applies to the specific order, with the size of the TPSL order being equal to the size of the original order. Order TPSL can only be added when placing a new order.


There can only be one Position TPSL but multiple Partial Position and Order TPSLs. If a user places a new Position TPSL, the old one is canceled. When a user places a new Order or Partial Position TPSL, it is added to the list of TPSL orders for this position, alongside any other existing TPSLs. The sum of all TPSL orders can be greater than the current position size. 

TPSL orders are always used as an exit strategy and are set as Reduce-only orders by default. Furthermore, linked Take Profit (TP) and Stop Loss (SL) orders are always configured as OCO (one cancels the other), ensuring that the execution of one will automatically cancel the other.


Time-in-Force Conditions


**Good Till Cancel (GTC):** An order that remains on the order book until it is either filled or manually canceled by the trader. 

**Immediate or Cancel (IOC):** An order that is executed immediately upon placement. Any portion of the order that cannot be filled immediately is canceled.


**Fill or Kill (FOK):** An order that must be filled entirely at the specified price upon placement. If the order cannot be filled immediately and completely, it is canceled in its entirety.


[
arrow-up-right](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/order-book)


[PreviousOrder Costchevron-left](/extended-resources/trading/order-cost)[NextTrading Fees and Rebateschevron-right](/extended-resources/trading/trading-fees-and-rebates)


Last updated 3 months ago