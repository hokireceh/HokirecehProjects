# Volume Quota

**Volume Quota** gives users higher rate limits on `SendTx` and `SendTxBatch`based on trading volume and is **only available to Premium accounts now**. The only types of transactions that consume volume quota are:

* `L2CreateOrder` (14)
* `L2CancelAllOrders` (16)
* `L2ModifyOrder` (17)
* `L2CreateGroupedOrders` (28)

Other types of transactions has separate rate limits, see [Transaction Type Limits](https://apidocs.lighter.xyz/docs/rate-limits#transaction-type-limits-per-user).

For more details on transaction types, see [constants.go](https://github.com/elliottech/lighter-go/blob/37514ad5630052c162fa0745ac59ae47ff33d148/types/txtypes/constants.go#L57). Grouped orders only consume one quota. Cancels do not consume quota. If you include `n` transactions in a `SendTxBatch` request, `n` quota will be consumed.

For every 3 USD of trading volume, traders receive an additional transaction limit (i.e. volume quota increases by 1). `SendTx` and `SendTxBatch` requests will return a response indicating the remaining quota, e.g. "10780 volume quota remaining.". Every 15 seconds, you get a free `SendTx` which won't consume volume quota (nor show remaining quota). Volume quota is shared across all sub-accounts under the same L1 address.

New accounts start at 1K quota, and you can stack at most 5.000.000 TX allowance in your volume quota, which does not expire.

This differs from Rate Limits, which enforce a maximum of **24000** weight per **60** seconds (rolling minute) for premium accounts. You can check the weight of the endpoints, and standard accounts limits here: [Rate Limits](https://apidocs.lighter.xyz/docs/rate-limits).

<br />