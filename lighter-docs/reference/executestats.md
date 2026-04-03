# executeStats

Get execute stats

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "",
    "version": ""
  },
  "paths": {
    "/api/v1/executeStats": {
      "get": {
        "summary": "executeStats",
        "operationId": "executeStats",
        "tags": [
          "order"
        ],
        "description": "Get execute stats",
        "parameters": [
          {
            "name": "period",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "enum": [
                "d",
                "w",
                "m",
                "q",
                "y",
                "all"
              ]
            }
          }
        ],
        "responses": {
          "200": {
            "description": "A successful response.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/RespGetExecuteStats"
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
      "ExecuteStat": {
        "type": "object",
        "properties": {
          "timestamp": {
            "type": "integer",
            "format": "int64"
          },
          "slippage": {
            "type": "string"
          }
        }
      },
      "RespGetExecuteStats": {
        "type": "object",
        "properties": {
          "code": {
            "type": "integer"
          },
          "message": {
            "type": "string"
          },
          "period": {
            "type": "string"
          },
          "result": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/ExecuteStat"
            }
          }
        }
      }
    }
  }
}
```