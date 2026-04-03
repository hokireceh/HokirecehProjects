# Rate Limits

We enforce rate limits on both REST API and WebSocket usage. These limits apply to both IP address and L1 address. It's important to note that for premium accounts only, sendTx and sendTxBatch fall into a separate rate limit bucket [described below](https://apidocs.lighter.xyz/docs/rate-limits#sendtx-and-sendtxbatch-limits-premium-accounts), and are [linked to account type and staked tokens](https://apidocs.lighter.xyz/page/account-types).

***

## REST API Endpoint Limits

The following limits apply to the `https://mainnet.zklighter.elliot.ai/api/v1/` base URL, excluding  `sendTx` and `sendTxBatch` where different limits, listed [below](https://apidocs.lighter.xyz/docs/rate-limits#sendtx-and-sendtxbatch-limits-premium-accounts), apply. Different limits, also listed [below](https://apidocs.lighter.xyz/docs/rate-limits#explorer-rest-api-endpoint-limits), apply to `https://explorer.elliot.ai/api/`.

| Builder accounts                             | Premium accounts                            | Standard accounts              |
| :------------------------------------------- | :------------------------------------------ | :----------------------------- |
| 240,000 weighted requests per rolling minute | 24,000 weighted requests per rolling minute | 60 requests per rolling minute |

### Weights:

| Endpoint                                                                                                                       | Weight |
| :----------------------------------------------------------------------------------------------------------------------------- | :----- |
| `sendTx, sendTxBatch, nextNonce`                                                                                               | 6      |
| `publicPools, txFromL1TxHash`                                                                                                  | 50     |
| `accountInactiveOrders, deposit/latest`                                                                                        | 100    |
| `apikeys`                                                                                                                      | 150    |
| `transferFeeInfo`                                                                                                              | 500    |
| `trades, recentTrades`                                                                                                         | 600    |
| `changeAccountTier, tokens, tokens/revoke setAccountMetadata, notification/ack, createIntentAddress, fastwithdraw, referral/*` | 3000   |
| `tokens/create`                                                                                                                | 23000  |
| Other endpoints                                                                                                                | 300    |

While standard accounts rate limits are not weighted, whenever `{premium_weighted_requests}/{endpoint_weight} < {standard_requests}`, the former limit is going to be applied. For example, both standard and premium accounts will be able to make a maximum of 8 requests per rolling minute to the `changeAccountTier` endpoint.

You can apply for a Builder Account through our Discord support channel. It’s free of charge, but we reserve the right to review applications and verify the intended use. Builder Accounts include higher limits for querying our REST API endpoints; otherwise, standard account limits apply. Builders on this tier should authenticate every request, even when not explicitly required in our documentation.

***

## WebSocket Limits

To prevent resource exhaustion, we enforce the following usage limits **per IP**:

* **Connections**: 100
* **Subscriptions per connection**: 100
* **Total Subscriptions**: 1000
* **Max Connections Per Minute**: 80 (not to be confused with channel subscriptions)
* **Max Messages Sent By Client Per Minute**: 200 (sendTx and sendBatchTx are **not** counted here, and follow the same limits as REST requests)
* **Max Inflight Messages**: 50 (sendTx and sendBatchTx are **not** counted here)
* **Unique Accounts**: 10

Additionally, every connection is automatically dropped after 24 hours. It's recommended to have proper reconnection logic, in addition to ping/pong logic.

***

## SendTx and SendTxBatch Limits (premium accounts)

The following limits apply to `sendTx` and `sendTxBatch` requests, regardless of whether you send the requests using REST via HTTP, or via WebSocket. For these two types, we do not enforce IP limits, but only check rate limits at the L1 address level. Standard accounts are still bound to the 60 requests per minute limit. For rate limit purposes, fee credits count as staked LIT.`sendTx` and `sendTxBatch` are the only two types constrained by [Volume Quota](https://apidocs.lighter.xyz/docs/volume-quota-program), necessary to create and modify orders.

| Staked LIT | sendTx/sendTxBatch per minute |
| :--------- | :---------------------------- |
| 0          | 4000                          |
| 1000       | 5000                          |
| 3000       | 6000                          |
| 10000      | 7000                          |
| 30000      | 8000                          |
| 100000     | 12000                         |
| 300000     | 24000                         |
| 500000     | 40000                         |

***

## Explorer REST API Endpoint Limits

The following limits apply to the `https://explorer.elliot.ai/api/` Base URL.

Standard Users and Premium Users both have the same limit of 90 weighted requests per rolling minute window.

### Weights

| Endpoint        | Weight |
| :-------------- | :----- |
| `search`        | 3      |
| `accounts/*`    | 2      |
| Other endpoints | 1      |

***

## Transaction Type Limits (per user)

The following limits apply to both Standard and Premium accounts:

| Transaction Type     | Limit                  |
| -------------------- | ---------------------- |
| Default              | 40 requests / minute   |
| `L2Withdraw`         | 2 requests / minute    |
| `L2CreateSubAccount` | 2 requests / minute    |
| `L2CreatePublicPool` | 2 requests / minute    |
| `L2UpdateLeverage`   | 40 requests / minute   |
| `L2ChangePubKey`     | 300 requests / minute  |
| `L2Transfer`         | 120 request / minute   |
| `L2MintShares`       | 1 request / 15 seconds |
| `L2UnstakeAssets`    | 1 request / 15 seconds |

***

## Rate Limit Exceeding Behavior

If you exceed any rate limit:

* You will receive an HTTP `429 Too Many Requests` error
* For WebSocket connections, excessive messages may result in disconnection
* When you're rate-limited on REST, WebSocket connections also get rate-limited, and viceversa
* For premium accounts only, mainnet endpoints fall into a separate bucket from `sendTx` and `sendTxBatch`, meaning that getting rate-limited in one of the two buckets will not affect activity on the other. Put simply, sending too many transactions in a minute will not affect your ability to fetch data from the exchange, and viceversa.

To avoid this, please ensure your clients are implementing proper backoff and retry strategies.

## Cooldown

Depending on whether you have been rate-limited by our firewall, or by the api servers, the cooldown period varies:

* **Firewall**: 60 seconds, static
* **Api servers**: `weightOfEndpoint/(totalWeight/60)`

As an example, making a request to the `account` endpoint (which carries a `weight` of 300) after having exhausted your weighted requests in a given minute window, results in a 750ms cooldown period.