# assets

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
    "/accounts/{param}/assets": {
      "get": {
        "tags": [
          "Account"
        ],
        "summary": "Get Account Assets",
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
                  "$ref": "#/components/schemas/response.AccountAssetResponse"
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
      "response.AccountAssetResponse": {
        "type": "object",
        "properties": {
          "assets": {
            "type": "object",
            "additionalProperties": {
              "$ref": "#/components/schemas/response.EnrichedAccountAsset"
            }
          }
        },
        "required": [
          "assets"
        ]
      },
      "response.EnrichedAccountAsset": {
        "type": "object",
        "properties": {
          "asset_id": {
            "type": "integer"
          },
          "balance": {
            "type": "string"
          },
          "locked_balance": {
            "type": "string"
          },
          "symbol": {
            "type": "string"
          }
        },
        "required": [
          "asset_id",
          "balance",
          "locked_balance",
          "symbol"
        ]
      }
    }
  }
}
```