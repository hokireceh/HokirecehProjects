# liquidation logic

> Source: https://docs.extended.exchange/extended-resources/trading/liquidation-logic
> Fetched: 2026-04-03T17:37:21.650Z


copy_Copychevron-down

- [EXTENDED Resources](/extended-resources)chevron-right
- [Trading](/extended-resources/trading)

# Liquidation Logic


### 
[hashtag](#liquidation-criteria)

**Liquidation Criteria**


When a trading account's equity falls below the maintenance margin requirement, or when the Margin Ratio exceeds 100%, the account becomes subject to liquidation. The Margin Ratio is calculated as the sum of Maintenance Margin Requirements for all open positions divided by the Equity, multiplied by 100%, where:

- 


Maintenance Margin Requirement for a single position = Abs (Position Size * Mark Price) * Maintenance Margin Rate


- 


Equity = Wallet Balance + Unrealised PnL


Before liquidation occurs, Extended issues two margin calls: the first when the Margin Ratio exceeds 66%, and the second when it exceeds 80%. Margin calls don't impose any restrictions on the account but rather serve as reminders that the account is at risk of liquidation. To avoid liquidation, users should either top up their balance or reduce their positions.

### 
[hashtag](#liquidation-process)

Liquidation Process


To safeguard users’ margin and minimize potential losses, Extended employs a partial liquidation process designed to avoid fully closing users’ positions whenever possible:

- 


The liquidation process begins with a partial liquidation of the user’s XVS balance.
(Refer to the details of XVS liquidation [here](/extended-resources/vault).)


- 


If the account remains in liquidation after the XVS balance has been fully converted to USDC, the system identifies the perpetual position with the largest unrealised loss.


- 


Gradually liquidate this position using a maximum of five Fill or Kill orders, each comprising 20% of the position's original size (with a minimum order value of $1,000), executed at the position's Bankruptcy Price. 


- 


If any of the partial liquidation orders fail, execute a single Fill or Kill order for the entire position size at a price 5% worse than the position's Bankruptcy Price.


- 


If, after liquidating the position with the largest Unrealised Loss, the account's Margin Ratio remains above 100%, proceed with the partial liquidation of the position with the second-largest Unrealised Loss. 


- 


The liquidation process ceases once the account's Margin Ratio becomes ≤ 100%.


If a position is liquidated at a price better than the position's bankruptcy price, a 1% Liquidation Fee is earned by the insurance fund. However, if the position is liquidated at a price worse than the bankruptcy price, the insurance fund absorbs the losses.

In cases where the position cannot be liquidated at a price 5% worse than the bankruptcy price, or if the insurance fund is unable to cover the losses, the Auto Deleveraging (ADL) process is triggered.

### 
[hashtag](#insurance-fund)

Insurance Fund


The Extended Vault serves as an insurance fund covering all pairs, but access to it — and the maximum absorbable loss per trade — depends on the specific market.


Group*

Access to % of the Fund in given 24H

Max Loss by the Fund per Trade


1


2.5%


$100k


2-4


1.25%


$50k


5


1.25%


$25k


6


1.25%


$15k


7


0.25%


$5k


TradFi markets


1.25%


$50k for FX and XAU, $25k for the rest


*Refer to the section _[_Margin Schedule _](/extended-resources/trading/margin-schedule)_for grouping of crypto markets._

Remaining Insurance Fund Limit for a given market = Daily Insurance Fund Limit - Insurance Fund Loss on a given market during this day.

Besides market-level usage limits, the insurance fund is also subject to a global constraint: it cannot be depleted by more than 5% in a single day.

Daily Insurance Fund Limits are updates once a day at 00:00 UTC.

### 
[hashtag](#auto-deleveraging-adl)

Auto Deleveraging (ADL)


If the account equity falls below zero and the position cannot be liquidated through the insurance fund, the Auto Deleveraging (ADL) process is initiated. During ADL, the liquidated position is closed against the most profitable trader with the highest leverage, as determined by the ADL ranking at the Bankruptcy Price of the Liquidated Position.

The ADL ranking is computed separately for long and short positions as follows:

For Profitable Position: ADL Ranking = PNL Percentage * Position Margin Ratio,

For Loss Making Position: ADL Ranking = PNL Percentage / Position Margin Ratio, where:

- 


PNL percentage = Unrealised Position PnL / Abs(Position Size * Entry Price),


- 


Position Margin Ratio = Abs (Position Size * Mark Price) * Maintenance Margin Rate / Max(Equity,1).


If a profitable user is selected for ADL in, their open orders in that market are canceled, while open orders for other markets remain unaffected. Trading and liquidation fees are not charged in ADL.

### 
[hashtag](#liquidation-and-bankruptcy-prices)

Liquidation and Bankruptcy Prices


The Liquidation Price is the position's Mark price at which the account Margin Ratio exceeds 100%, indicating that the liquidation process should begin. It's important to note that the Liquidation Price serves as a reference number, and actual liquidation occurs only when the Margin Ratio exceeds 100%.

Liquidation Price of Position A = (Maintenance Margin of Other Positions - Wallet Balance - Unrealised PnL of Other Positions + Position A Size * Position A Entry Price) / Position A Size, where:

- 


Wallet Balance = Deposits - Withdrawals + Realised PnL,


- 


Unrealised PnL of a Single Position = Position Size * (Mark Price - Entry Price),


- 


Position Size is positive for Long Positions and negative for Short Positions.


The Bankruptcy Price is the price at which liquidation orders are submitted, and the Auto Deleveraging (ADL) is performed. Bankruptcy Price represents the position's price at which the account Margin Ratio, in the event of position liquidation at this price, remains unchanged.

Bankruptcy Price of Position A = (Maintenance Margin of Other Positions / Margin Ratio - Wallet Balance - Unrealised PnL of Other Positions + Position A Size * Position A Entry Price) / Position A Size


[PreviousTrading Fees and Rebateschevron-left](/extended-resources/trading/trading-fees-and-rebates)[NextFunding Paymentschevron-right](/extended-resources/trading/funding-payments)


Last updated 9 days ago