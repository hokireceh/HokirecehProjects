# trades

Get trades for lighter accounts, including sub-accounts and public pools. `auth` is required for master accounts and sub accounts.

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "",
    "version": ""
  },
  "paths": {
    "/api/v1/trades": {
      "get": {
        "summary": "trades",
        "operationId": "trades",
        "tags": [
          "order"
        ],
        "description": "Get trades for lighter accounts, including sub-accounts and public pools. `auth` is required for master accounts and sub accounts.",
        "parameters": [
          {
            "name": "authorization",
            "in": "header",
            "required": false,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "market_id",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "format": "int16",
              "default": "255"
            }
          },
          {
            "name": "account_index",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "format": "int64",
              "default": "-1"
            }
          },
          {
            "name": "order_index",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "format": "int64"
            }
          },
          {
            "name": "sort_by",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "enum": [
                "block_height",
                "timestamp",
                "trade_id"
              ]
            }
          },
          {
            "name": "sort_dir",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "enum": [
                "desc"
              ],
              "default": "desc"
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "from",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "format": "int64",
              "default": "-1"
            }
          },
          {
            "name": "ask_filter",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "format": "int8",
              "default": "-1"
            }
          },
          {
            "name": "role",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "enum": [
                "all",
                "maker",
                "taker"
              ],
              "default": "all"
            }
          },
          {
            "name": "type",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "enum": [
                "all",
                "trade",
                "liquidation",
                "deleverage",
                "market-settlement"
              ],
              "default": "all"
            }
          },
          {
            "name": "limit",
            "in": "query",
            "required": true,
            "schema": {
              "type": "integer",
              "format": "int64",
              "minimum": 1,
              "maximum": 100
            }
          },
          {
            "name": "aggregate",
            "in": "query",
            "required": false,
            "schema": {
              "type": "boolean",
              "format": "boolean",
              "default": "false"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "A successful response.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Trades"
                }
              }
            }
          },
          "400": {
            "description": "Bad request",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ResultCode"
                }
              }
            }
          }
        }
      }
    }
  },
  "servers": [
    {
      "url": "https://mainnet.zklighter.elliot.ai"
    }
  ],
  "components": {
    "schemas": {
      "ResultCode": {
        "type": "object",
        "properties": {
          "code": {
            "type": "integer",
            "format": "int32",
            "example": "200"
          },
          "message": {
            "type": "string"
          }
        },
        "title": "ResultCode",
        "required": [
          "code"
        ]
      },
      "Trade": {
        "type": "object",
        "properties": {
          "trade_id": {
            "type": "integer",
            "format": "int64",
            "example": "145"
          },
          "tx_hash": {
            "type": "string",
            "example": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
          },
          "type": {
            "type": "string",
            "example": "trade",
            "enum": [
              "trade",
              "liquidation",
              "deleverage",
              "market-settlement"
            ]
          },
          "market_id": {
            "type": "integer",
            "format": "uint8",
            "example": "1"
          },
          "size": {
            "type": "string",
            "example": "0.1"
          },
          "price": {
            "type": "string",
            "example": "3024.66"
          },
          "usd_amount": {
            "type": "string",
            "example": "3024.66"
          },
          "ask_id": {
            "type": "integer",
            "format": "int64",
            "example": "145"
          },
          "bid_id": {
            "type": "integer",
            "format": "int64",
            "example": "245"
          },
          "ask_account_id": {
            "type": "integer",
            "format": "int64",
            "example": "1"
          },
          "bid_account_id": {
            "type": "integer",
            "format": "int64",
            "example": "3"
          },
          "is_maker_ask": {
            "type": "boolean",
            "format": "boolean",
            "example": "true"
          },
          "block_height": {
            "type": "integer",
            "format": "int64",
            "example": "45434"
          },
          "timestamp": {
            "type": "integer",
            "format": "int64",
            "example": "1640995200"
          },
          "taker_fee": {
            "type": "integer",
            "format": "int32",
            "example": "0"
          },
          "taker_position_size_before": {
            "type": "string",
            "example": "0"
          },
          "taker_entry_quote_before": {
            "type": "string",
            "example": "0"
          },
          "taker_initial_margin_fraction_before": {
            "type": "integer",
            "format": "uin16",
            "example": "0"
          },
          "taker_position_sign_changed": {
            "type": "boolean",
            "format": "boolean",
            "example": "true"
          },
          "maker_fee": {
            "type": "integer",
            "format": "int32",
            "example": "0"
          },
          "maker_position_size_before": {
            "type": "string",
            "example": "0"
          },
          "maker_entry_quote_before": {
            "type": "string",
            "example": "0"
          },
          "maker_initial_margin_fraction_before": {
            "type": "integer",
            "format": "uin16",
            "example": "0"
          },
          "maker_position_sign_changed": {
            "type": "boolean",
            "format": "boolean",
            "example": "true"
          },
          "transaction_time": {
            "type": "integer",
            "format": "int64",
            "example": "1771943742851429"
          },
          "bid_account_pnl": {
            "type": "string",
            "description": "Realized PnL for the queried account index, triggered by reducing a short position",
            "example": "-0.022890"
          },
          "ask_account_pnl": {
            "type": "string",
            "description": "Realized PnL for the queried account index, triggered by reducing a long position, or a spot position",
            "example": "1.989696"
          },
          "ask_client_id": {
            "type": "integer",
            "format": "int64",
            "example": "145"
          },
          "bid_client_id": {
            "type": "integer",
            "format": "int64",
            "example": "245"
          },
          "ask_client_id_str": {
            "type": "string",
            "example": "145"
          },
          "bid_client_id_str": {
            "type": "string",
            "example": "245"
          },
          "ask_id_str": {
            "type": "string",
            "example": "145"
          },
          "bid_id_str": {
            "type": "string",
            "example": "245"
          },
          "trade_id_str": {
            "type": "string",
            "example": "145"
          },
          "integrator_maker_fee": {
            "type": "integer",
            "format": "int32",
            "example": "50"
          },
          "integrator_maker_fee_collector_index": {
            "type": "integer",
            "format": "int64",
            "example": "156"
          },
          "integrator_taker_fee": {
            "type": "integer",
            "format": "int32",
            "example": "50"
          },
          "integrator_taker_fee_collector_index": {
            "type": "integer",
            "format": "int64",
            "example": "156"
          }
        },
        "title": "Trade",
        "required": [
          "trade_id",
          "tx_hash",
          "type",
          "market_id",
          "size",
          "price",
          "usd_amount",
          "ask_id",
          "bid_id",
          "ask_account_id",
          "bid_account_id",
          "is_maker_ask",
          "block_height",
          "timestamp",
          "taker_position_size_before",
          "taker_entry_quote_before",
          "taker_initial_margin_fraction_before",
          "maker_position_size_before",
          "maker_entry_quote_before",
          "maker_initial_margin_fraction_before",
          "transaction_time",
          "ask_account_pnl",
          "ask_client_id",
          "bid_account_pnl",
          "bid_client_id",
          "maker_position_sign_changed",
          "taker_position_sign_changed",
          "ask_client_id_str",
          "bid_client_id_str",
          "trade_id_str",
          "integrator_maker_fee",
          "integrator_maker_fee_collector_index",
          "integrator_taker_fee",
          "integrator_taker_fee_collector_index"
        ]
      },
      "Trades": {
        "type": "object",
        "properties": {
          "code": {
            "type": "integer",
            "format": "int32",
            "example": "200"
          },
          "message": {
            "type": "string"
          },
          "next_cursor": {
            "type": "string"
          },
          "trades": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Trade"
            }
          }
        },
        "title": "Trades",
        "required": [
          "code",
          "trades"
        ]
      }
    }
  }
}
```