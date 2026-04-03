# changeAccountTier

Change account tier. You can only perform this action once every 24 hours, and with no orders or positions open.

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "",
    "version": ""
  },
  "paths": {
    "/api/v1/changeAccountTier": {
      "post": {
        "summary": "changeAccountTier",
        "operationId": "changeAccountTier",
        "tags": [
          "account"
        ],
        "description": "Change account tier. You can only perform this action once every 24 hours, and with no orders or positions open.",
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
                "$ref": "#/components/schemas/ReqChangeAccountTier"
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
                  "$ref": "#/components/schemas/RespChangeAccountTier"
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
      "ReqChangeAccountTier": {
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
          "new_tier": {
            "type": "string"
          }
        },
        "title": "ReqChangeAccountTier",
        "required": [
          "account_index",
          "new_tier"
        ]
      },
      "RespChangeAccountTier": {
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
        "title": "RespChangeAccountTier",
        "required": [
          "code"
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
      }
    }
  }
}
```