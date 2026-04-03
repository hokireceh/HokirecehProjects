# Ethereal Archive API — Ringkasan Endpoint

> Label   : Archive API
> Versi   : 0.1.0
> Base URL: https://archive.ethereal.trade/
> Dibuat  : 2026-04-03T06:57:49.557Z

Ethereal HTTP API for archived data, providing historical balance, volume, and PnL data.

## Daftar Endpoint

### `GET /v1/subaccount/balance`
**Tags**: SubaccountArchive
**Summary**: Returns historic balances for a given subaccount

**Parameter:**
- `order` (query, string) — Direction to paginate through objects
- `limit` (query, integer) — Limit the number of objects to return
- `cursor` (query, string) — Pointer to the current object in pagination dataset
- `startTime` (query, number) *(required)* — Start time of the query range (clamped to resolution, ms since Unix epoch)
- `endTime` (query, number) — End time of the query range (clamped to resolution, ms since Unix epoch, defaults to now)
- `resolution` (query, string) *(required)* — Resolution of the data to be returned
- `orderBy` (query, string) — Order by field
- `subaccountId` (query, string) *(required)* — Id of the subaccount to query for

### `GET /v1/subaccount/funding`
**Tags**: SubaccountArchive
**Summary**: Returns funding charge history for a given subaccount

**Parameter:**
- `order` (query, string) — Direction to paginate through objects
- `limit` (query, integer) — Limit the number of objects to return
- `cursor` (query, string) — Pointer to the current object in pagination dataset
- `startTime` (query, number) *(required)* — Start time of the query range (clamped to resolution, ms since Unix epoch)
- `endTime` (query, number) — End time of the query range (clamped to resolution, ms since Unix epoch, defaults to now)
- `orderBy` (query, string) — Order by field
- `subaccountId` (query, string) *(required)* — Id of the subaccount to query for
- `positionIds` (query, array) — Array of position ids to filter for
- `productIds` (query, array) — Array of product ids to filter for

### `GET /v1/subaccount/unrealized-pnl`
**Tags**: SubaccountArchive
**Summary**: Returns historic unrealized PnL for a given subaccount

**Parameter:**
- `order` (query, string) — Direction to paginate through objects
- `limit` (query, integer) — Limit the number of objects to return
- `cursor` (query, string) — Pointer to the current object in pagination dataset
- `startTime` (query, number) *(required)* — Start time of the query range (clamped to resolution, ms since Unix epoch)
- `endTime` (query, number) — End time of the query range (clamped to resolution, ms since Unix epoch, defaults to now)
- `resolution` (query, string) *(required)* — Resolution of the data to be returned (hourly or coarser only)
- `orderBy` (query, string) — Order by field
- `subaccountId` (query, string) *(required)* — Id of the subaccount to query for
- `productIds` (query, array) — Array of product ids to filter for

### `GET /v1/subaccount/volume`
**Tags**: SubaccountArchive
**Summary**: Returns historic volume for a given subaccount

**Parameter:**
- `order` (query, string) — Direction to paginate through objects
- `limit` (query, integer) — Limit the number of objects to return
- `cursor` (query, string) — Pointer to the current object in pagination dataset
- `startTime` (query, number) *(required)* — Start time of the query range (clamped to resolution, ms since Unix epoch)
- `endTime` (query, number) — End time of the query range (clamped to resolution, ms since Unix epoch, defaults to now)
- `resolution` (query, string) *(required)* — Resolution of the data to be returned
- `orderBy` (query, string) — Order by field
- `subaccountId` (query, string) *(required)* — Id of the subaccount to query for

### `GET /v1/subaccount/total-volume`
**Tags**: SubaccountArchive
**Summary**: Returns total volume for a given subaccount

**Parameter:**
- `subaccountId` (query, string) *(required)* — Id of the subaccount to query for
