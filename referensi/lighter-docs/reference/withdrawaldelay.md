# withdrawalDelay

Withdrawal delay in seconds

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "",
    "version": ""
  },
  "paths": {
    "/api/v1/withdrawalDelay": {
      "get": {
        "summary": "withdrawalDelay",
        "operationId": "withdrawalDelay",
        "tags": [
          "info"
        ],
        "description": "Withdrawal delay in seconds",
        "responses": {
          "200": {
            "description": "A successful response.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/RespWithdrawalDelay"
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
      "RespWithdrawalDelay": {
        "type": "object",
        "properties": {
          "seconds": {
            "type": "integer",
            "format": "int64",
            "example": "86400"
          }
        },
        "title": "RespWithdrawalDelay",
        "required": [
          "seconds"
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