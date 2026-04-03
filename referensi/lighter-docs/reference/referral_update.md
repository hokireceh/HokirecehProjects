# referral_update

Update referral code (allowed once per account)

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "",
    "version": ""
  },
  "paths": {
    "/api/v1/referral/update": {
      "post": {
        "summary": "referral_update",
        "operationId": "referral_update",
        "tags": [
          "referral"
        ],
        "description": "Update referral code (allowed once per account)",
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
                "$ref": "#/components/schemas/ReqUpdateReferralCode"
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
                  "$ref": "#/components/schemas/RespUpdateReferralCode"
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
      "ReqUpdateReferralCode": {
        "type": "object",
        "properties": {
          "auth": {
            "type": "string",
            "description": " made optional to support header auth clients"
          },
          "account_index": {
            "type": "integer",
            "format": "int64"
          },
          "new_referral_code": {
            "type": "string"
          }
        },
        "title": "ReqUpdateReferralCode",
        "required": [
          "account_index",
          "new_referral_code"
        ]
      },
      "RespUpdateReferralCode": {
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
          "success": {
            "type": "boolean",
            "format": "boolean",
            "example": "true"
          }
        },
        "title": "RespUpdateReferralCode",
        "required": [
          "code",
          "success"
        ]
      }
    }
  }
}
```