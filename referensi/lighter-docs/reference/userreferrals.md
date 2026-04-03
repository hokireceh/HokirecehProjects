# userReferrals

Get user referrals

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "",
    "version": ""
  },
  "paths": {
    "/api/v1/referral/userReferrals": {
      "get": {
        "summary": "userReferrals",
        "operationId": "userReferrals",
        "tags": [
          "account"
        ],
        "description": "Get user referrals",
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
            "name": "l1_address",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer"
            }
          },
          {
            "name": "auth",
            "in": "query",
            "required": false,
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
                  "$ref": "#/components/schemas/UserReferrals"
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
      "Referral": {
        "type": "object",
        "properties": {
          "l1_address": {
            "type": "string"
          },
          "referral_code": {
            "type": "string"
          },
          "used_at": {
            "type": "integer",
            "format": "int64"
          },
          "trade_stats": {
            "$ref": "#/components/schemas/TradeStats"
          },
          "tier": {
            "type": "string"
          }
        },
        "required": [
          "trade_stats",
          "l1_address",
          "referral_code",
          "tier",
          "used_at"
        ]
      },
      "UserReferrals": {
        "type": "object",
        "properties": {
          "code": {
            "type": "integer"
          },
          "message": {
            "type": "string"
          },
          "cursor": {
            "type": "string"
          },
          "referrals": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Referral"
            }
          },
          "used_code": {
            "type": "string"
          }
        },
        "required": [
          "code",
          "cursor",
          "referrals",
          "used_code"
        ]
      },
      "TradeStats": {
        "type": "object",
        "properties": {
          "count": {
            "type": "integer",
            "format": "int64"
          },
          "volume": {
            "type": "string"
          },
          "web_count": {
            "type": "integer",
            "format": "int64"
          },
          "web_volume": {
            "type": "string"
          },
          "mobile_app_count": {
            "type": "integer",
            "format": "int64"
          },
          "mobile_app_volume": {
            "type": "string"
          },
          "mobile_browser_count": {
            "type": "integer",
            "format": "int64"
          },
          "mobile_browser_volume": {
            "type": "string"
          }
        },
        "title": "TradeStats",
        "required": [
          "count",
          "volume",
          "web_count",
          "web_volume",
          "mobile_app_count",
          "mobile_app_volume",
          "mobile_browser_count",
          "mobile_browser_volume"
        ]
      }
    }
  }
}
```