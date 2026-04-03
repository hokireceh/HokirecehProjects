# tokens_create

Create an API token for read-only access

The `api_token` field in the response contains the auth token and is only shown once upon creation.

**Token Format:** `ro:{account_index}:{single|all}:{expiry_unix}:{random_hex}`

**Access Rules:**

* Token created by account → access that account
* Master account token with `sub_account_access=true` → access all sub-accounts
* Master account token with `sub_account_access=false` → only master account
* Sub-account token → only that sub-account

**Usage (HTTP Header):** `Authorization: ro:6:all:1767139200:a1b2c3...`

**Usage (WebSocket):** Include `auth` field in subscribe message: `{"type": "subscribe", "channel": "account:6:tx", "auth": "ro:6:all:1767139200:a1b2c3..."}`

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "",
    "version": ""
  },
  "paths": {
    "/api/v1/tokens/create": {
      "post": {
        "summary": "tokens_create",
        "operationId": "tokens_create",
        "tags": [
          "account"
        ],
        "description": "Create an API token for read-only access",
        "parameters": [
          {
            "name": "authorization",
            "in": "header",
            "required": false,
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
                "$ref": "#/components/schemas/ReqPostApiToken"
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
                  "$ref": "#/components/schemas/RespPostApiToken"
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
      "ReqPostApiToken": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string"
          },
          "account_index": {
            "type": "integer",
            "format": "int64"
          },
          "expiry": {
            "type": "integer",
            "format": "int64"
          },
          "sub_account_access": {
            "type": "boolean",
            "format": "boolean"
          },
          "scopes": {
            "type": "string",
            "example": "read.*",
            "default": "read.*"
          }
        },
        "title": "ReqPostApiToken",
        "required": [
          "name",
          "account_index",
          "expiry",
          "sub_account_access"
        ]
      },
      "RespPostApiToken": {
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
          "token_id": {
            "type": "integer",
            "format": "int64"
          },
          "api_token": {
            "type": "string"
          },
          "name": {
            "type": "string"
          },
          "account_index": {
            "type": "integer",
            "format": "int64"
          },
          "expiry": {
            "type": "integer",
            "format": "int64"
          },
          "sub_account_access": {
            "type": "boolean",
            "format": "boolean"
          },
          "revoked": {
            "type": "boolean",
            "format": "boolean"
          },
          "scopes": {
            "type": "string"
          }
        },
        "title": "RespPostApiToken",
        "required": [
          "code",
          "token_id",
          "api_token",
          "name",
          "account_index",
          "expiry",
          "sub_account_access",
          "revoked",
          "scopes"
        ]
      }
    }
  }
}
```