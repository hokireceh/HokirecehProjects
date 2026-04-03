# markets

List all markets

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "description": "Explorer Api for ZkLighter",
    "title": "Lighter Explorer API",
    "contact": {},
    "version": "1.0"
  },
  "paths": {
    "/markets": {
      "get": {
        "tags": [
          "Markets"
        ],
        "summary": "List all markets",
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "$ref": "#/components/schemas/response.Market"
                  }
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
      "url": "https://explorer.elliot.ai/api",
      "description": "Production server"
    }
  ],
  "components": {
    "schemas": {
      "response.Market": {
        "type": "object",
        "properties": {
          "market_index": {
            "type": "integer"
          },
          "symbol": {
            "type": "string"
          }
        },
        "required": [
          "market_index",
          "symbol"
        ]
      }
    }
  }
}
```