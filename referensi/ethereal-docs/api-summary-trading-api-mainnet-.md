# Ethereal Exchange API — Ringkasan Endpoint

> Label   : Trading API (mainnet)
> Versi   : 0.1.0
> Base URL: https://api.ethereal.trade/
> Dibuat  : 2026-04-03T06:57:47.596Z

Ethereal HTTP API for real-time trading, order management, and market data access.

## Daftar Endpoint

### `GET /v1/order`
**Tags**: Order
**Summary**: Returns a filtered array of orders by the subaccount

**Parameter:**
- `order` (query, string) — Direction to paginate through objects
- `limit` (query, integer) — Limit the number of objects to return
- `cursor` (query, string) — Pointer to the current object in pagination dataset
- `subaccountId` (query, string) *(required)* — Id of the subaccount to query for
- `clientOrderId` (query, string) — Client-generated order id to query for (either a valid UUID or alphanumeric string up to 32 characters)
- `productIds` (query, array) — Array of product ids to filter for
- `createdAfter` (query, integer) — Filter by orders created after timestamp exclusive (ms since Unix epoch)
- `createdBefore` (query, integer) — Filter by orders created before timestamp inclusive (ms since Unix epoch)
- `side` (query, number) — Side of the order to filter for
- `close` (query, boolean) — Whether the order is a position close order
- `stopTypes` (query, array) — Array of StopTypes to filter by
- `isWorking` (query, boolean) — Filter by orders that are working: NEW, FILLED_PARTIAL
- `isPending` (query, boolean) — Filter by orders that are pending
- `orderBy` (query, string) — Order by field

### `POST /v1/order`
**Tags**: Order
**Summary**: Place an order for trading

**Request Body:**
```json
{
  "$ref": "#/components/schemas/SubmitOrderDto"
}
```

### `POST /v1/order/dry-run`
**Tags**: Order
**Summary**: Submits a dry-mode to simulate an order submission

**Request Body:**
```json
{
  "$ref": "#/components/schemas/SubmitDryOrderDto"
}
```

### `POST /v1/order/cancel`
**Tags**: Order
**Summary**: Cancels one or more orders given an array of order ids

**Request Body:**
```json
{
  "$ref": "#/components/schemas/CancelOrderDto"
}
```

### `GET /v1/order/fill`
**Tags**: Order
**Summary**: Returns a filtered array of order fills

**Parameter:**
- `order` (query, string) — Direction to paginate through objects
- `limit` (query, integer) — Limit the number of objects to return
- `cursor` (query, string) — Pointer to the current object in pagination dataset
- `subaccountId` (query, string) *(required)* — Id of the subaccount to filter fills by
- `productIds` (query, array) — Array of product ids to filter for
- `createdAfter` (query, integer) — Filter by order fills created before timestamp exclusive (ms since Unix epoch)
- `createdBefore` (query, integer) — Filter by order fills created before timestamp inclusive (ms since Unix epoch)
- `side` (query, number) — Side of the maker as either BUY (0) or SELL (1)
- `orderBy` (query, string) — Order by field
- `includeSelfTrades` (query, boolean) — Explicitly include self trades (excluded by default)
- `expandSelfTrades` (query, boolean) — When true and includeSelfTrades is also true, returns both maker and taker perspectives for self-trades as separate rows.

### `GET /v1/order/trade`
**Tags**: Order
**Summary**: Returns a filtered array of trades

**Parameter:**
- `order` (query, string) — Direction to paginate through objects
- `limit` (query, integer) — Limit the number of objects to return
- `cursor` (query, string) — Pointer to the current object in pagination dataset
- `productId` (query, string) *(required)* — Id of the product to filter trades by
- `orderBy` (query, string) — Order by fields

### `GET /v1/order/{id}/group`
**Tags**: Order
**Summary**: Returns all orders in the same contingency group as the specified order

**Parameter:**
- `id` (path, string) *(required)* — 
- `order` (query, string) — Direction to paginate through objects
- `limit` (query, integer) — Limit the number of objects to return
- `cursor` (query, string) — Pointer to the current object in pagination dataset
- `orderBy` (query, string) — Order by field

### `GET /v1/order/{id}`
**Tags**: Order
**Summary**: Returns an order by their id

**Parameter:**
- `id` (path, string) *(required)* — 

### `GET /v1/position`
**Tags**: Position
**Summary**: Returns a filtered list of positions for a given subaccount

**Parameter:**
- `order` (query, string) — Direction to paginate through objects
- `limit` (query, integer) — Limit the number of objects to return
- `cursor` (query, string) — Pointer to the current object in pagination dataset
- `subaccountId` (query, string) *(required)* — Id representing the registered subaccount
- `productIds` (query, array) — Array of product ids to filter for
- `open` (query, boolean) — Include or exclude open positions (i.e. non-zero size)
- `orderBy` (query, string) — Order by field
- `createdAfter` (query, integer) — Filter by order fills created before timestamp exclusive (ms since Unix epoch)
- `createdBefore` (query, integer) — Filter by order fills created before timestamp inclusive (ms since Unix epoch)
- `side` (query, number) — Side as either BUY (0) or SELL (1)
- `isLiquidated` (query, boolean) — Filter by liquidated positions

### `GET /v1/position/active`
**Tags**: Position
**Summary**: Returns the active position for a subaccount and product

**Parameter:**
- `subaccountId` (query, string) *(required)* — Id representing the registered subaccount
- `productId` (query, string) *(required)* — Id of product to filter position by

### `GET /v1/position/{id}`
**Tags**: Position
**Summary**: Returns position by id

**Parameter:**
- `id` (path, string) *(required)* — 

### `GET /v1/position/fill`
**Tags**: Position
**Summary**: Returns a filtered list of fills for a given position

**Parameter:**
- `order` (query, string) — Direction to paginate through objects
- `limit` (query, integer) — Limit the number of objects to return
- `cursor` (query, string) — Pointer to the current object in pagination dataset
- `positionId` (query, string) *(required)* — Id of the position to filter fills by
- `orderBy` (query, string) — Order by field

### `GET /v1/position/liquidation`
**Tags**: Position
**Summary**: Returns a list of liquidations

**Parameter:**
- `order` (query, string) — Direction to paginate through objects
- `limit` (query, integer) — Limit the number of objects to return
- `cursor` (query, string) — Pointer to the current object in pagination dataset
- `orderBy` (query, string) — Order by field

### `GET /v1/product`
**Tags**: Product
**Summary**: Returns a list of all products and its configuration

**Parameter:**
- `order` (query, string) — Direction to paginate through objects
- `limit` (query, integer) — Limit the number of objects to return
- `cursor` (query, string) — Pointer to the current object in pagination dataset
- `orderBy` (query, string) — Order by field
- `ticker` (query, string) — Filter products by ticker (alphanumeric and case insensitive)

### `GET /v1/product/market-liquidity`
**Tags**: Product
**Summary**: Returns the product market liquidity by id

**Parameter:**
- `productId` (query, string) *(required)* — Id representing the registered product

### `GET /v1/product/market-price`
**Tags**: Product
**Summary**: Returns the product prices for an array of product ids

**Parameter:**
- `productIds` (query, array) *(required)* — Array of product ids

### `GET /v1/product/{id}`
**Tags**: Product
**Summary**: Returns product by id

**Parameter:**
- `id` (path, string) *(required)* — 

### `GET /v1/funding`
**Tags**: Funding
**Summary**: Returns a list funding rates for a product over a time period

**Parameter:**
- `order` (query, string) — Direction to paginate through objects
- `limit` (query, integer) — Limit the number of objects to return
- `cursor` (query, string) — Pointer to the current object in pagination dataset
- `productId` (query, string) *(required)* — Id representing the registered product
- `range` (query, string) *(required)* — The range of time of funding rates to retrieve
- `orderBy` (query, string) — Order by field

### `GET /v1/funding/projected`
**Tags**: Funding
**Summary**: Returns the projected funding rate for a product

Deprecated: Use GET /funding/projected-rate instead

**Parameter:**
- `productId` (query, string) *(required)* — Id representing the registered product

### `GET /v1/funding/projected-rate`
**Tags**: Funding
**Summary**: Returns a list of projected funding rates for the given products

**Parameter:**
- `productIds` (query, array) *(required)* — Array of product ids

### `GET /v1/rate-limit/config`
**Tags**: RateLimit
**Summary**: Returns rate limit configurations for all endpoints

### `GET /v1/rpc/config`
**Tags**: Rpc
**Summary**: Returns the EIP712 domain data necessary for message signing

### `GET /v1/subaccount/all`
**Tags**: Subaccount
**Summary**: Returns all subaccounts

**Parameter:**
- `order` (query, string) — Direction to paginate through objects
- `limit` (query, integer) — Limit the number of objects to return
- `cursor` (query, string) — Pointer to the current object in pagination dataset
- `orderBy` (query, string) — Order by field

### `GET /v1/subaccount`
**Tags**: Subaccount
**Summary**: Returns subaccounts for the given account

**Parameter:**
- `order` (query, string) — Direction to paginate through objects
- `limit` (query, integer) — Limit the number of objects to return
- `cursor` (query, string) — Pointer to the current object in pagination dataset
- `name` (query, string) — Bytes32 encoded subaccount name (0x prefix, zero padded)
- `sender` (query, string) *(required)* — Address of the sender
- `orderBy` (query, string) — Order by field

### `GET /v1/subaccount/balance`
**Tags**: Subaccount
**Summary**: Returns subaccount balances for given subaccount

**Parameter:**
- `order` (query, string) — Direction to paginate through objects
- `limit` (query, integer) — Limit the number of objects to return
- `cursor` (query, string) — Pointer to the current object in pagination dataset
- `subaccountId` (query, string) *(required)* — Id representing the registered subaccount
- `orderBy` (query, string) — Order by field

### `GET /v1/subaccount/{id}`
**Tags**: Subaccount
**Summary**: Returns subaccount by id

**Parameter:**
- `id` (path, string) *(required)* — 

### `POST /v1/linked-signer/link`
**Tags**: LinkedSigner
**Summary**: Links a signer address with the sender address for order delegation

**Request Body:**
```json
{
  "$ref": "#/components/schemas/LinkSignerDto"
}
```

### `DELETE /v1/linked-signer/revoke`
**Tags**: LinkedSigner
**Summary**: Revokes a signer address from a subaccount

**Request Body:**
```json
{
  "$ref": "#/components/schemas/RevokeLinkedSignerDto"
}
```

### `POST /v1/linked-signer/refresh`
**Tags**: LinkedSigner
**Summary**: Refreshes the expiry of a linked signer (signed by EOA, supports expired signers)

**Request Body:**
```json
{
  "$ref": "#/components/schemas/RefreshLinkedSignerDto"
}
```

### `POST /v1/linked-signer/extend`
**Tags**: LinkedSigner
**Summary**: Extends the expiry of a linked signer (signed by the signer itself)

**Request Body:**
```json
{
  "$ref": "#/components/schemas/ExtendLinkedSignerDto"
}
```

### `GET /v1/linked-signer/quota`
**Tags**: LinkedSigner
**Summary**: Returns the current signer config for a subaccount

**Parameter:**
- `subaccountId` (query, string) *(required)* — Id representing the registered subaccount

### `GET /v1/linked-signer/address/{address}`
**Tags**: LinkedSigner
**Summary**: Returns a signer by its address

**Parameter:**
- `address` (path, string) *(required)* — Address of linked signer

### `GET /v1/linked-signer/{id}`
**Tags**: LinkedSigner
**Summary**: Returns a signer by its id

**Parameter:**
- `id` (path, string) *(required)* — 

### `GET /v1/linked-signer`
**Tags**: LinkedSigner
**Summary**: List signers for a subaccount

**Parameter:**
- `order` (query, string) — Direction to paginate through objects
- `limit` (query, integer) — Limit the number of objects to return
- `cursor` (query, string) — Pointer to the current object in pagination dataset
- `subaccountId` (query, string) *(required)* — Id representing the registered subaccount
- `statuses` (query, array) — Filters signers by statuses
- `orderBy` (query, string) — Order by field

### `GET /v1/token/withdraw`
**Tags**: Token
**Summary**: Returns initiated or pending finalize withdraws for the given subaccount

**Parameter:**
- `order` (query, string) — Direction to paginate through objects
- `limit` (query, integer) — Limit the number of objects to return
- `cursor` (query, string) — Pointer to the current object in pagination dataset
- `subaccountId` (query, string) *(required)* — Id representing the registered subaccount
- `isActive` (query, boolean) — Filters active withdraws
- `orderBy` (query, string) — Order by field

### `GET /v1/token/transfer`
**Tags**: Token
**Summary**: Returns a list of transfers for the given subaccount

**Parameter:**
- `order` (query, string) — Direction to paginate through objects
- `limit` (query, integer) — Limit the number of objects to return
- `cursor` (query, string) — Pointer to the current object in pagination dataset
- `subaccountId` (query, string) *(required)* — Id representing the registered subaccount
- `statuses` (query, array) — Array of transfer statuses to filter by
- `types` (query, array) — Array of transfer types to filter by
- `orderBy` (query, string) — Order by field
- `createdAfter` (query, integer) — Filter by transfers created after timestamp exclusive (ms since Unix epoch)
- `createdBefore` (query, integer) — Filter by transfers created before timestamp inclusive (ms since Unix epoch)

### `POST /v1/token/{id}/withdraw`
**Tags**: Token
**Summary**: Initiates a withdraw for a specific token in subaccount

**Parameter:**
- `id` (path, string) *(required)* — 

**Request Body:**
```json
{
  "$ref": "#/components/schemas/InitiateWithdrawDto"
}
```

### `GET /v1/token/{id}`
**Tags**: Token
**Summary**: Returns a token by its id

**Parameter:**
- `id` (path, string) *(required)* — 

### `GET /v1/token`
**Tags**: Token
**Summary**: Returns a list of all tokens

**Parameter:**
- `order` (query, string) — Direction to paginate through objects
- `limit` (query, integer) — Limit the number of objects to return
- `cursor` (query, string) — Pointer to the current object in pagination dataset
- `depositEnabled` (query, boolean) — Filters tokens by if its enabled for deposit
- `withdrawEnabled` (query, boolean) — Filters tokens by if its enabled for withdraw
- `orderBy` (query, string) — Order by field

### `GET /v1/time`
**Tags**: Time
**Summary**: Returns current system time in milliseconds via GET

### `POST /v1/time`
**Tags**: Time
**Summary**: Returns current system time in milliseconds via POST

### `GET /v1/whitelist`
**Tags**: Whitelist
**Summary**: Checks if an address is whitelisted

**Parameter:**
- `address` (query, string) *(required)* — Address of account

### `GET /v1/points`
**Tags**: Points
**Summary**: Returns a list of points periods for a given address and season

**Parameter:**
- `address` (query, string) *(required)* — Address of account
- `season` (query, integer) *(required)* — Season number
- `epoch` (query, integer) *(required)* — Epoch number within the season

### `GET /v1/points/summary`
**Tags**: Points
**Summary**: Returns a list of points season summaries for a given address

**Parameter:**
- `address` (query, string) *(required)* — Address of account

### `GET /v1/points/total`
**Tags**: Points
**Summary**: Returns total exchange-wide points distributed

**Parameter:**
- `season` (query, integer) — Season number
- `epoch` (query, integer) — Epoch number within season

### `GET /v1/referral/code/{code}`
**Tags**: Referral
**Summary**: Returns referral code usage details

**Parameter:**
- `code` (path, string) *(required)* — Referral code (3-12 alphanumeric uppercase characters)

### `GET /v1/referral/summary`
**Tags**: Referral
**Summary**: Returns summary of your referral activity

**Parameter:**
- `subaccount` (query, string) — Bytes32 encoded subaccount name (0x prefix, zero padded, set when using linked signer)
- `X-Ethereal-Auth` (header, string) *(required)* — Must be: EIP712Auth
- `X-Ethereal-Sender` (header, string) *(required)* — Address that signed this message (hex)
- `X-Ethereal-Signature` (header, string) *(required)* — The signature from signTypedData(...) signed by the sender
- `X-Ethereal-Intent` (header, string) *(required)* — Intent of the message (action to be taken)
- `X-Ethereal-SignedAt` (header, string) *(required)* — Message signedAt current timestamp (seconds since Unix Epoch)

### `GET /v1/referral`
**Tags**: Referral
**Summary**: Returns paginated list of referrals for the sender

**Parameter:**
- `order` (query, string) — Direction to paginate through objects
- `limit` (query, integer) — Limit the number of objects to return
- `cursor` (query, string) — Pointer to the current object in pagination dataset
- `subaccount` (query, string) — Bytes32 encoded subaccount name (0x prefix, zero padded, set when using linked signer)
- `orderBy` (query, string) — Order by field
- `X-Ethereal-Auth` (header, string) *(required)* — Must be: EIP712Auth
- `X-Ethereal-Sender` (header, string) *(required)* — Address that signed this message (hex)
- `X-Ethereal-Signature` (header, string) *(required)* — The signature from signTypedData(...) signed by the sender
- `X-Ethereal-Intent` (header, string) *(required)* — Intent of the message (action to be taken)
- `X-Ethereal-SignedAt` (header, string) *(required)* — Message signedAt current timestamp (seconds since Unix Epoch)

### `POST /v1/referral/claim`
**Tags**: Referral
**Summary**: Claim a referral code

**Request Body:**
```json
{
  "$ref": "#/components/schemas/ClaimReferralCodeDto"
}
```

### `POST /v1/referral/activate`
**Tags**: Referral
**Summary**: Activates the sender to acquire a referral code

**Request Body:**
```json
{
  "$ref": "#/components/schemas/ActivateReferralDto"
}
```

### `GET /v1/maintenance`
**Tags**: Maintenance
**Summary**: MaintenanceController_isMaintenance
