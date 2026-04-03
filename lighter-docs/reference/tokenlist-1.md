# tokenlist

Get token list and their metadata

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "",
    "version": ""
  },
  "paths": {
    "/api/v1/tokenlist": {
      "get": {
        "summary": "tokenlist",
        "operationId": "tokenlist",
        "tags": [
          "tokenlist"
        ],
        "description": "Get token list and their metadata",
        "responses": {
          "200": {
            "description": "A successful response.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/TokenList"
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
      "Token": {
        "type": "object",
        "title": "Token",
        "required": [
          "symbol",
          "name",
          "logo",
          "logo_extension",
          "description_key",
          "gecko_id",
          "paprika_id",
          "market",
          "asset_type",
          "categories"
        ],
        "properties": {
          "symbol": {
            "type": "string",
            "example": "ETH"
          },
          "name": {
            "type": "string",
            "example": "Ethereum"
          },
          "logo": {
            "type": "string",
            "example": "eth"
          },
          "logo_extension": {
            "type": "string",
            "example": "svg",
            "enum": [
              "svg",
              "png"
            ]
          },
          "description_key": {
            "type": "string",
            "example": "token_description_eth"
          },
          "gecko_id": {
            "type": "string",
            "example": "ethereum"
          },
          "paprika_id": {
            "type": "string",
            "example": "eth-ethereum"
          },
          "market": {
            "type": "string",
            "enum": [
              "SPOT",
              "PERPS"
            ]
          },
          "asset_type": {
            "type": "string",
            "enum": [
              "CRYPTO",
              "RWA"
            ]
          },
          "categories": {
            "type": "array",
            "items": {
              "type": "string"
            }
          }
        }
      },
      "TokenList": {
        "type": "object",
        "title": "TokenList",
        "required": [
          "code",
          "tokens"
        ],
        "properties": {
          "code": {
            "type": "integer",
            "format": "int32",
            "example": 200
          },
          "message": {
            "type": "string"
          },
          "tokens": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Token"
            }
          }
        }
      }
    }
  }
}
```