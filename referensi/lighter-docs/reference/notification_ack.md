# notification_ack

Ack notification

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "",
    "version": ""
  },
  "paths": {
    "/api/v1/notification/ack": {
      "post": {
        "summary": "notification_ack",
        "operationId": "notification_ack",
        "tags": [
          "notification"
        ],
        "description": "Ack notification",
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
                "$ref": "#/components/schemas/ReqAckNotif"
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
      "ReqAckNotif": {
        "type": "object",
        "properties": {
          "notif_id": {
            "type": "string",
            "example": "'liq:17:5898'"
          },
          "auth": {
            "type": "string",
            "description": " made optional to support header auth clients"
          },
          "account_index": {
            "type": "integer",
            "format": "int64"
          }
        },
        "title": "ReqAckNotif",
        "required": [
          "notif_id",
          "account_index"
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