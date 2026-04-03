# order cost

> Source: https://docs.extended.exchange/extended-resources/trading/order-cost
> Fetched: 2026-04-03T17:37:19.918Z


copyCopychevron-down

- [EXTENDED Resources](/extended-resources)chevron-right
- [Trading](/extended-resources/trading)

# Order Cost


### 
[hashtag](#order-placement)

Order Placement


When a user places a new order, we check that the Available Balance for Trading is greater than or equal to the Order Cost, where:

- 


Available Balance for Trading = Equity - Initial Margin for Open Positions and Orders


- 


Order Cost for Buy Orders = max(Initial Margin Rate * New Order Price * (New Order Size + min(0, 2 * (Open Position Size + Triggered Buy Order Size 1+ … + Triggered Buy Order Size N))) - Open Loss, 0)


- 


Order Cost for Sell Orders = max(-Initial Margin Rate * New Order Price * (New Order Size + max(0, 2 * (Open Position Size + Triggered Sell Order Size 1+ … + Triggered Sell Order Size N))) - Open Loss, 0)


In the equations above:

- 


Open Loss =  min(New Order Size * (Mark Price - New Order Price), 0)


- 


Position / Order Size is positive for Long and Negative for Short


### 
[hashtag](#orders-cancellation)

Orders Cancellation


If the Available Balance for Trading becomes less than 0, all open orders except for reduce-only orders are canceled. Additionally, as long as the Available Balance is less than 0, the user can only place orders that reduce the size of existing positions.


[PreviousMargin Schedulechevron-left](/extended-resources/trading/margin-schedule)[NextOrder Typeschevron-right](/extended-resources/trading/order-types)


Last updated 3 months ago