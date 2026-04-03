# funding payments

> Source: https://docs.extended.exchange/extended-resources/trading/funding-payments
> Fetched: 2026-04-03T17:37:21.171Z


copy_Copychevron-down

- [EXTENDED Resources](/extended-resources)chevron-right
- [Trading](/extended-resources/trading)

# Funding Payments


### 
[hashtag](#overview)

Overview


Funding payments are recurring fees exchanged between counterparties of the perpetual contract (from long positions to short positions and vice versa), ensuring the perpetual's price remains aligned with the underlying spot price of the asset. In practice:

- 


If the perpetual price exceeds the spot price, long positions pay funding fees to short positions. 


- 


If the perpetual price is lower than the spot price, short positions pay funding fees to long positions.


The size of the funding payment is determined by the difference between the perpetual and spot prices, as well as the duration over which this difference is realized.

### 
[hashtag](#funding-payments-on-extended)

Funding Payments on Extended


At Extended, funding payments are charged every hour and are applied to all users with open positions at that time. If a user closes their position before the funding fee is charged, it is not applied.

**Funding Payment = Position Size * Mark Price * (-Funding Rate)**, which implies that:

- 


If the funding rate is positive, long positions pay to short positions.


- 


If the funding rate is negative, short positions pay to long positions.


**Funding Rate = (Average Premium + clamp(Interest Rate - Average Premium, 0.05%, -0.05%)) / 8**, which implies that:

- 


While funding payments are applied hourly, the funding rate realization period is 8 hours.


- 


The interest rate component is set at 0.01% per 8 hours for consistency with CEXs. It represents the difference between the cost of borrowing USD and the cost of borrowing the underlying crypto asset.


- 


The size of the hourly Funding Rate is capped as per the table below.


**Average Premium = (1*Premium Index_1 + ··· + N*Premium Index_N) / (1+···+N)**, where:

- 


Premium Index is calculated every 5 seconds and therefore 'N' is equal to 720.


- 


Premium Index = (Max(0, Impact Bid - Index Price) - Max(0, Index Price - Impact Ask)) / Index Price.


- 


Impact Bid / Ask refers to the average fill price to execute the Impact Notional on the Bid / Ask side.


- 


Impact Notional for different groups of markets is described below.


**Funding Rate Caps and Impact Notional Values across groups of markets.**


Group*

Rate Cap per hour

Impact Notional


1-2


0.25%


$10,000


3


0.5%


$5,000


4


0.75%


$5,000


5


1%


$2,500


6


2%


$2,500


7


2%


$500


*Refer to the section _[_Margin Schedule _](/extended-resources/trading/margin-schedule)_for grouping of markets._


[PreviousLiquidation Logicchevron-left](/extended-resources/trading/liquidation-logic)[NextOracle Priceschevron-right](/extended-resources/trading/oracle-prices)


Last updated 9 days ago