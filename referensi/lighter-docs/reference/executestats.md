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
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/SlippageResult"
            }
          }
        }
      },
      "SlippageResult": {
        "type": "object",
        "properties": {
          "exchange": {
            "type": "string",
            "example": "lighter"
          },
          "market": {
            "type": "string",
            "example": "ETH"
          },
          "size_usd": {
            "type": "integer",
            "format": "int64",
            "example": "1000"
          },
          "avg_slippage": {
            "type": "number",
            "format": "double",
            "example": "0.5"
          },
          "data_count": {
            "type": "integer",
            "format": "int64",
            "example": "100"
          }
        },
        "title": "SlippageResult",
        "required": [
          "exchange",
          "market",
          "size_usd",
          "avg_slippage",
          "data_count"
        ]
      },
      "RespGetExecuteStats": {
        "type": "object",
        "properties": {
          "period": {
            "type": "string"
          },
          "result": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/ExecuteStat"
            }
          }
        },
        "required": [
          "period",
          "result"
        ]
      }
    }
  }
}
```