# accountsByL1Address

Returns all accounts associated with the given L1 address

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "",
    "version": ""
  },
  "paths": {
    "/api/v1/accountsByL1Address": {
      "get": {
        "summary": "accountsByL1Address",
        "operationId": "accountsByL1Address",
        "tags": [
          "account"
        ],
        "description": "Returns all accounts associated with the given L1 address",
        "parameters": [
          {
            "name": "l1_address",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "A successful response.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/SubAccounts"
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
      "Account": {
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
          "account_type": {
            "type": "integer",
            "format": "uint8",
            "example": "1"
          },
          "account_trading_mode": {
            "type": "integer",
            "format": "uint8",
            "example": "1",
            "description": "Classic=0 and Unified=1"
          },
          "index": {
            "type": "integer",
            "format": "int64",
            "example": "1"
          },
          "l1_address": {
            "type": "string",
            "example": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
          },
          "cancel_all_time": {
            "type": "integer",
            "format": "int64",
            "example": "1640995200"
          },
          "total_order_count": {
            "type": "integer",
            "format": "int64",
            "example": "100"
          },
          "total_isolated_order_count": {
            "type": "integer",
            "format": "int64",
            "example": "100"
          },
          "pending_order_count": {
            "type": "integer",
            "format": "int64",
            "example": "100"
          },
          "available_balance": {
            "type": "string",
            "example": "19995"
          },
          "status": {
            "type": "integer",
            "format": "uint8",
            "example": "1"
          },
          "collateral": {
            "type": "string",
            "example": "46342"
          },
          "transaction_time": {
            "type": "integer",
            "format": "int64"
          }
        },
        "title": "Account",
        "required": [
          "code",
          "account_type",
          "index",
          "l1_address",
          "cancel_all_time",
          "total_order_count",
          "total_isolated_order_count",
          "pending_order_count",
          "available_balance",
          "status",
          "collateral",
          "account_trading_mode",
          "transaction_time"
        ]
      },
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
      "SubAccounts": {
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
          "l1_address": {
            "type": "string",
            "example": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
          },
          "sub_accounts": {
            "type": "array",
            "example": "1",
            "items": {
              "$ref": "#/components/schemas/Account"
            }
          }
        },
        "title": "SubAccounts",
        "required": [
          "code",
          "l1_address",
          "sub_accounts"
        ]
      }
    }
  }
}
```