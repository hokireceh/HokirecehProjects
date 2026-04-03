# referral_create

Create referral code

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "",
    "version": ""
  },
  "paths": {
    "/api/v1/referral/create": {
      "post": {
        "summary": "referral_create",
        "operationId": "referral_create",
        "tags": [
          "referral"
        ],
        "description": "Create referral code",
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
                "$ref": "#/components/schemas/ReqCreateReferralCode"
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
      },
      "ReqCreateReferralCode": {
        "type": "object",
        "properties": {
          "auth": {
            "type": "string",
            "description": " made optional to support header auth clients"
          },
          "account_index": {
            "type": "integer",
            "format": "int64"
          }
        },
        "title": "ReqCreateReferralCode",
        "required": [
          "account_index"
        ]
      }
    }
  }
}
```