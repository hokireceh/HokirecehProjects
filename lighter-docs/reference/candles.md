# candles

Get candles data. Returns at most 500 candles per call. Zero values are omitted from the response.

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "",
    "version": ""
  },
  "paths": {
    "/api/v1/candles": {
      "get": {
        "summary": "candles",
        "operationId": "candles",
        "tags": [
          "candlestick"
        ],
        "description": "Get candles data. Returns at most 500 candles per call. Zero values are omitted from the response.",
        "parameters": [
          {
            "name": "market_id",
            "in": "query",
            "required": true,
            "schema": {
              "type": "integer",
              "format": "int16"
            }
          },
          {
            "name": "resolution",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "enum": [
                "1m",
                "5m",
                "15m",
                "30m",
                "1h",
                "4h",
                "12h",
                "1d",
                "1w"
              ]
            }
          },
          {
            "name": "start_timestamp",
            "in": "query",
            "required": true,
            "schema": {
              "type": "integer",
              "format": "int64",
              "minimum": 0,
              "maximum": 5000000000000
            }
          },
          {
            "name": "end_timestamp",
            "in": "query",
            "required": true,
            "schema": {
              "type": "integer",
              "format": "int64",
              "minimum": 0,
              "maximum": 5000000000000
            }
          },
          {
            "name": "count_back",
            "in": "query",
            "required": true,
            "schema": {
              "type": "integer",
              "format": "int64"
            }
          },
          {
            "name": "set_timestamp_to_end",
            "in": "query",
            "required": false,
            "schema": {
              "type": "boolean",
              "format": "boolean",
              "default": "false"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "A successful response.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Candles"
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
      "Candle": {
        "type": "object",
        "properties": {
          "t": {
            "type": "integer",
            "format": "int64",
            "example": 1767700500000,
            "description": "Timestamp"
          },
          "o": {
            "type": "number",
            "format": "double",
            "example": 3236.86,
            "description": "Open price"
          },
          "h": {
            "type": "number",
            "format": "double",
            "example": 3237.78,
            "description": "High price"
          },
          "l": {
            "type": "number",
            "format": "double",
            "example": 3235.36,
            "description": "Low price"
          },
          "c": {
            "type": "number",
            "format": "double",
            "example": 3235.39,
            "description": "Close price"
          },
          "v": {
            "type": "number",
            "format": "double",
            "example": 55.1632,
            "description": "Base token volume (volume0)"
          },
          "V": {
            "type": "number",
            "format": "double",
            "example": 178530.793575,
            "description": "Quote token volume (volume1)"
          },
          "i": {
            "type": "integer",
            "format": "int64",
            "example": 779870452,
            "description": "Last trade ID"
          },
          "C": {
            "type": "string"
          },
          "H": {
            "type": "string"
          },
          "L": {
            "type": "string"
          },
          "O": {
            "type": "string"
          }
        },
        "title": "Candle",
        "description": "Abbreviated candle format. Zero values are omitted."
      },
      "Candles": {
        "type": "object",
        "properties": {
          "code": {
            "type": "integer",
            "format": "int32",
            "example": 200
          },
          "r": {
            "type": "string",
            "example": "1m",
            "description": "Resolution"
          },
          "c": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Candle"
            },
            "description": "Array of candles (max 500 per call)"
          },
          "message": {
            "type": "string"
          }
        },
        "title": "Candles",
        "required": [
          "code",
          "r",
          "c",
          "message"
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