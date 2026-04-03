# deposit_networks

Get networks that support deposits via intent address

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "",
    "version": ""
  },
  "paths": {
    "/api/v1/deposit/networks": {
      "get": {
        "summary": "deposit_networks",
        "operationId": "deposit_networks",
        "tags": [
          "bridge"
        ],
        "description": "Get networks that support deposits via intent address",
        "responses": {
          "200": {
            "description": "A successful response.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/BridgeSupportedNetworks"
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
      "BridgeSupportedNetwork": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "example": "Arbitrum"
          },
          "chain_id": {
            "type": "string",
            "example": "4164"
          },
          "explorer": {
            "type": "string",
            "example": "https://arbiscan.io/"
          }
        },
        "title": "BridgeSupportedNetwork",
        "required": [
          "name",
          "chain_id",
          "explorer"
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
      },
      "BridgeSupportedNetworks": {
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
          "networks": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/BridgeSupportedNetwork"
            }
          }
        },
        "title": "BridgeSupportedNetworks",
        "required": [
          "code",
          "networks"
        ]
      }
    }
  }
}
```