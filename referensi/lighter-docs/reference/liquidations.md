# liquidations

Get liquidation infos

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "",
    "version": ""
  },
  "paths": {
    "/api/v1/liquidations": {
      "get": {
        "summary": "liquidations",
        "operationId": "liquidations",
        "tags": [
          "account"
        ],
        "description": "Get liquidation infos",
        "parameters": [
          {
            "name": "authorization",
            "in": "header",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "account_index",
            "in": "query",
            "required": true,
            "schema": {
              "type": "integer",
              "format": "int64"
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
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
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
          }
        ],
        "responses": {
          "200": {
            "description": "A successful response.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/LiquidationInfos"
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
      "AccountPosition": {
        "type": "object",
        "properties": {
          "market_id": {
            "type": "integer",
            "format": "uint8",
            "example": "1"
          },
          "symbol": {
            "type": "string",
            "example": "ETH"
          },
          "initial_margin_fraction": {
            "type": "string",
            "example": "20.00"
          },
          "open_order_count": {
            "type": "integer",
            "format": "int64",
            "example": "3"
          },
          "pending_order_count": {
            "type": "integer",
            "format": "int64",
            "example": "3"
          },
          "position_tied_order_count": {
            "type": "integer",
            "format": "int64",
            "example": "3"
          },
          "sign": {
            "type": "integer",
            "format": "int32",
            "example": "1"
          },
          "position": {
            "type": "string",
            "example": "3.6956"
          },
          "avg_entry_price": {
            "type": "string",
            "example": "3024.66"
          },
          "position_value": {
            "type": "string",
            "example": "3019.92"
          },
          "unrealized_pnl": {
            "type": "string",
            "example": "17.521309"
          },
          "realized_pnl": {
            "type": "string",
            "example": "2.000000"
          },
          "liquidation_price": {
            "type": "string",
            "example": "3024.66"
          },
          "total_funding_paid_out": {
            "type": "string",
            "example": "34.2"
          },
          "margin_mode": {
            "type": "integer",
            "format": "int32",
            "example": "1"
          },
          "allocated_margin": {
            "type": "string",
            "example": "46342"
          },
          "total_discount": {
            "type": "string"
          }
        },
        "title": "AccountPosition",
        "required": [
          "market_id",
          "symbol",
          "initial_margin_fraction",
          "open_order_count",
          "pending_order_count",
          "position_tied_order_count",
          "sign",
          "position",
          "avg_entry_price",
          "position_value",
          "unrealized_pnl",
          "realized_pnl",
          "liquidation_price",
          "margin_mode",
          "allocated_margin",
          "total_discount"
        ]
      },
      "LiqTrade": {
        "type": "object",
        "properties": {
          "price": {
            "type": "string"
          },
          "size": {
            "type": "string"
          },
          "taker_fee": {
            "type": "string"
          },
          "maker_fee": {
            "type": "string"
          },
          "transaction_time": {
            "type": "integer",
            "format": "int64"
          }
        },
        "title": "LiqTrade",
        "required": [
          "price",
          "size",
          "taker_fee",
          "maker_fee",
          "transaction_time"
        ]
      },
      "Liquidation": {
        "type": "object",
        "properties": {
          "id": {
            "type": "integer",
            "format": "int64"
          },
          "market_id": {
            "type": "integer",
            "format": "uint8"
          },
          "type": {
            "type": "string",
            "enum": [
              "partial",
              "deleverage"
            ]
          },
          "trade": {
            "$ref": "#/components/schemas/LiqTrade"
          },
          "info": {
            "$ref": "#/components/schemas/LiquidationInfo"
          },
          "executed_at": {
            "type": "integer",
            "format": "int64"
          }
        },
        "title": "Liquidation",
        "required": [
          "id",
          "market_id",
          "type",
          "trade",
          "info",
          "executed_at"
        ]
      },
      "LiquidationInfo": {
        "type": "object",
        "properties": {
          "positions": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/AccountPosition"
            }
          },
          "risk_info_before": {
            "$ref": "#/components/schemas/RiskInfo"
          },
          "risk_info_after": {
            "$ref": "#/components/schemas/RiskInfo"
          },
          "mark_prices": {
            "type": "object",
            "additionalProperties": {
              "type": "number",
              "format": "double"
            }
          }
        },
        "title": "LiquidationInfo",
        "required": [
          "positions",
          "risk_info_before",
          "risk_info_after",
          "mark_prices"
        ]
      },
      "LiquidationInfos": {
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
          "liquidations": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Liquidation"
            }
          },
          "next_cursor": {
            "type": "string"
          }
        },
        "title": "LiquidationInfos",
        "required": [
          "code",
          "liquidations"
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
      "RiskInfo": {
        "type": "object",
        "properties": {
          "cross_risk_parameters": {
            "$ref": "#/components/schemas/RiskParameters"
          },
          "isolated_risk_parameters": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/RiskParameters"
            }
          }
        },
        "title": "RiskInfo",
        "required": [
          "cross_risk_parameters",
          "isolated_risk_parameters"
        ]
      },
      "RiskParameters": {
        "type": "object",
        "properties": {
          "market_id": {
            "type": "integer",
            "format": "uint8"
          },
          "collateral": {
            "type": "string"
          },
          "total_account_value": {
            "type": "string"
          },
          "initial_margin_req": {
            "type": "string"
          },
          "maintenance_margin_req": {
            "type": "string"
          },
          "close_out_margin_req": {
            "type": "string"
          }
        },
        "title": "RiskParameters",
        "required": [
          "market_id",
          "collateral",
          "total_account_value",
          "initial_margin_req",
          "maintenance_margin_req",
          "close_out_margin_req"
        ]
      }
    }
  }
}
```