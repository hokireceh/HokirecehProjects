# l1Metadata

Get L1 metadata

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "",
    "version": ""
  },
  "paths": {
    "/api/v1/l1Metadata": {
      "get": {
        "summary": "l1Metadata",
        "operationId": "l1Metadata",
        "tags": [
          "account"
        ],
        "description": "Get L1 metadata",
        "parameters": [
          {
            "name": "authorization",
            "in": "header",
            "required": true,
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
          }
        ],
        "responses": {
          "200": {
            "description": "A successful response.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/L1Metadata"
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
      "L1Metadata": {
        "type": "object",
        "properties": {
          "l1_address": {
            "type": "string"
          },
          "can_invite": {
            "type": "boolean",
            "format": "boolean"
          },
          "referral_points_percentage": {
            "type": "string"
          }
        },
        "title": "L1Metadata",
        "required": [
          "l1_address",
          "can_invite",
          "referral_points_percentage"
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