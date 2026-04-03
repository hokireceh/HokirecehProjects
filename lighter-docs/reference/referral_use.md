# referral_use

Use referral code

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "",
    "version": ""
  },
  "paths": {
    "/api/v1/referral/use": {
      "post": {
        "summary": "referral_use",
        "operationId": "referral_use",
        "tags": [
          "referral"
        ],
        "description": "Use referral code",
        "parameters": [
          {
            "name": "authorization",
            "in": "header",
            "required": false,
            "description": " make required after integ is done",
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/x-www-form-urlencoded": {
              "schema": {
                "$ref": "#/components/schemas/ReqUseReferralCode"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "A successful response.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ResultCode"
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
      "ReqUseReferralCode": {
        "type": "object",
        "properties": {
          "auth": {
            "type": "string",
            "description": " made optional to support header auth clients"
          },
          "l1_address": {
            "type": "string"
          },
          "referral_code": {
            "type": "string"
          },
          "discord": {
            "type": "string"
          },
          "telegram": {
            "type": "string"
          },
          "x": {
            "type": "string"
          },
          "signature": {
            "type": "string"
          }
        },
        "title": "ReqUseReferralCode",
        "required": [
          "l1_address",
          "referral_code",
          "x"
        ]
      }
    }
  }
}
```