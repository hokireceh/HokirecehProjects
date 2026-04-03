# positions

Get positions by address or account_index

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "description": "Explorer Api for ZkLighter",
    "title": "Lighter Explorer API",
    "contact": {},
    "version": "1.0"
  },
  "paths": {
    "/accounts/{param}/positions": {
      "get": {
        "tags": [
          "Account"
        ],
        "summary": "Get Account by Address",
        "parameters": [
          {
            "description": "L1 Address or AccountIndex",
            "name": "param",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/response.AccountPositionResponse"
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
      "url": "https://explorer.elliot.ai/api",
      "description": "Production server"
    }
  ],
  "components": {
    "schemas": {
      "response.AccountPositionResponse": {
        "type": "object",
        "properties": {
          "positions": {
            "type": "object",
            "additionalProperties": {
              "$ref": "#/components/schemas/response.EnrichedAccountPosition"
            }
          }
        },
        "required": [
          "positions"
        ]
      },
      "response.EnrichedAccountPosition": {
        "type": "object",
        "properties": {
          "entry_price": {
            "type": "string"
          },
          "market_index": {
            "type": "integer"
          },
          "pnl": {
            "type": "string"
          },
          "side": {
            "$ref": "#/components/schemas/response.PositionSide"
          },
          "size": {
            "type": "string"
          }
        },
        "required": [
          "entry_price",
          "market_index",
          "pnl",
          "side",
          "size"
        ]
      },
      "response.PositionSide": {
        "type": "string",
        "enum": [
          "short",
          "long"
        ],
        "x-enum-varnames": [
          "SHORT",
          "LONG"
        ]
      }
    }
  }
}
```