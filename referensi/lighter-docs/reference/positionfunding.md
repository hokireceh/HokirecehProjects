# positionFunding

Get accounts position fundings

`auth` is required when fetching an account\_index linked to a main account or a sub-account, but can be left empty for public pools.

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "",
    "version": ""
  },
  "paths": {
    "/api/v1/positionFunding": {
      "get": {
        "summary": "positionFunding",
        "operationId": "positionFunding",
        "tags": [
          "account"
        ],
        "description": "Get accounts position fundings",
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
            "name": "account_index",
            "in": "query",
            "required": true,
            "schema": {
              "type": "integer",
              "format": "int64"
            }
          },
          {
            "name": "market_id",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "format": "int16",
              "default": "255"
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "limit",
            "in": "query",
            "required": true,
            "schema": {
              "type": "integer",
              "format": "int64",
              "minimum": 1,
              "maximum": 100
            }
          },
          {
            "name": "side",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "enum": [
                "long",
                "short",
                "all"
              ],
              "default": "all"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "A successful response.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PositionFundings"
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
      "PositionFunding": {
        "type": "object",
        "properties": {
          "timestamp": {
            "type": "integer",
            "format": "int64",
            "example": "1640995200"
          },
          "market_id": {
            "type": "integer",
            "format": "uint8",
            "example": "1"
          },
          "funding_id": {
            "type": "integer",
            "format": "int64",
            "example": "1"
          },
          "change": {
            "type": "string",
            "example": "1"
          },
          "discount": {
            "type": "string",
            "example": "1"
          },
          "rate": {
            "type": "string",
            "example": "1"
          },
          "position_size": {
            "type": "string",
            "example": "1"
          },
          "position_side": {
            "type": "string",
            "example": "long",
            "enum": [
              "long",
              "short"
            ]
          }
        },
        "title": "PositionFunding",
        "required": [
          "timestamp",
          "market_id",
          "funding_id",
          "change",
          "rate",
          "position_size",
          "position_side",
          "discount"
        ]
      },
      "PositionFundings": {
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
          "position_fundings": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/PositionFunding"
            }
          },
          "next_cursor": {
            "type": "string"
          }
        },
        "title": "PositionFundings",
        "required": [
          "code",
          "position_fundings"
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