# accountMetadata

Get account metadatas

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "",
    "version": ""
  },
  "paths": {
    "/api/v1/accountMetadata": {
      "get": {
        "summary": "accountMetadata",
        "operationId": "accountMetadata",
        "tags": [
          "account"
        ],
        "description": "Get account metadatas",
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
            "name": "by",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "enum": [
                "index",
                "l1_address"
              ]
            }
          },
          {
            "name": "value",
            "in": "query",
            "required": true,
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
                  "$ref": "#/components/schemas/AccountMetadatas"
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
      "AccountMetadata": {
        "type": "object",
        "properties": {
          "account_index": {
            "type": "integer",
            "format": "int64"
          },
          "name": {
            "type": "string"
          },
          "description": {
            "type": "string"
          },
          "can_invite": {
            "type": "boolean",
            "format": "boolean",
            "description": " Remove After FE uses L1 meta endpoint"
          },
          "referral_points_percentage": {
            "type": "string",
            "description": " Remove After FE uses L1 meta endpoint"
          },
          "created_at": {
            "type": "integer",
            "format": "int64"
          },
          "can_rfq": {
            "type": "boolean",
            "format": "boolean"
          }
        },
        "title": "AccountMetadata",
        "required": [
          "account_index",
          "name",
          "description",
          "can_invite",
          "referral_points_percentage",
          "created_at",
          "can_rfq"
        ]
      },
      "AccountMetadatas": {
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
          "account_metadatas": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/AccountMetadata"
            }
          }
        },
        "title": "AccountMetadatas",
        "required": [
          "code",
          "account_metadatas"
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