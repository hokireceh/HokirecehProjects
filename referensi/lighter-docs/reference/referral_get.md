# referral_get

Get referral code

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "",
    "version": ""
  },
  "paths": {
    "/api/v1/referral/get": {
      "get": {
        "summary": "referral_get",
        "operationId": "referral_get",
        "tags": [
          "referral"
        ],
        "description": "Get referral code",
        "parameters": [
          {
            "name": "authorization",
            "in": "query",
            "required": false,
            "description": " make required after integ is done",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "auth",
            "in": "query",
            "required": false,
            "description": " made optional to support header auth clients",
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
          }
        ],
        "responses": {
          "200": {
            "description": "A successful response.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ReferralCode"
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
      "ReferralCode": {
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
          "referral_code": {
            "type": "string",
            "example": "5V24K3MJ"
          },
          "remaining_usage": {
            "type": "integer",
            "format": "int32",
            "example": "3"
          }
        },
        "title": "ReferralCode",
        "required": [
          "code",
          "referral_code",
          "remaining_usage"
        ]
      }
    }
  }
}
```