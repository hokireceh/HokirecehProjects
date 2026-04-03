# tokens

Get read only auth tokens for an account

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "",
    "version": ""
  },
  "paths": {
    "/api/v1/tokens": {
      "get": {
        "summary": "tokens",
        "operationId": "tokens",
        "tags": [
          "account"
        ],
        "description": "Get read only auth tokens for an account",
        "parameters": [
          {
            "name": "authorization",
            "in": "header",
            "required": false,
            "description": " make required after integ is done",
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
                  "$ref": "#/components/schemas/RespGetApiTokens"
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
      "RespGetApiTokens": {
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
          "api_tokens": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/ApiToken"
            }
          }
        },
        "title": "RespGetApiTokens",
        "required": [
          "code",
          "api_tokens"
        ]
      },
      "ApiToken": {
        "type": "object",
        "properties": {
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
        "title": "ApiToken",
        "required": [
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