# fastwithdraw

Fast withdraw

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "",
    "version": ""
  },
  "paths": {
    "/api/v1/fastwithdraw": {
      "post": {
        "summary": "fastwithdraw",
        "operationId": "fastwithdraw",
        "tags": [
          "bridge"
        ],
        "description": "Fast withdraw",
        "parameters": [
          {
            "name": "authorization",
            "in": "header",
            "required": false,
            "description": " make required after integ is done",
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/x-www-form-urlencoded": {
              "schema": {
                "$ref": "#/components/schemas/ReqFastwithdraw"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "A successful response.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ResultCode"
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
      "ReqFastwithdraw": {
        "type": "object",
        "properties": {
          "tx_info": {
            "type": "string"
          },
          "to_address": {
            "type": "string"
          },
          "auth": {
            "type": "string",
            "description": " made optional to support header auth clients"
          }
        },
        "title": "ReqFastwithdraw",
        "required": [
          "tx_info",
          "to_address"
        ]
      }
    }
  }
}
```