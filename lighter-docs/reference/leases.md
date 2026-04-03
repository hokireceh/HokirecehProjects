# leases

Returns paginated lease entries for an account, most recent first. Supports read-only auth via signature/account_index/timestamp query params.

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "",
    "version": ""
  },
  "paths": {
    "/api/v1/leases": {
      "get": {
        "summary": "leases",
        "operationId": "leases",
        "tags": [
          "account"
        ],
        "description": "Returns paginated lease entries for an account, most recent first. Supports read-only auth via signature/account_index/timestamp query params.",
        "parameters": [
          {
            "name": "authorization",
            "in": "header",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "API token authorization"
          },
          {
            "name": "account_index",
            "in": "query",
            "required": true,
            "schema": {
              "type": "integer",
              "format": "int64"
            },
            "description": "Account index to fetch leases for"
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Pagination cursor from a previous response"
          },
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "default": 20,
              "format": "uint64",
              "minimum": 1,
              "maximum": 100
            },
            "description": "Number of results to return (1–100, default 20)"
          },
          {
            "name": "auth",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Read-only auth (alternative to header authorization)"
          }
        ],
        "responses": {
          "200": {
            "description": "A successful response.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/RespGetLeases"
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
      "LeaseEntry": {
        "type": "object",
        "properties": {
          "id": {
            "type": "integer",
            "format": "int64",
            "description": "Lease ID"
          },
          "master_account_index": {
            "type": "integer",
            "format": "int64",
            "description": "Master account index"
          },
          "lease_amount": {
            "type": "integer",
            "format": "int64",
            "description": "Leased LIT amount in raw units (1 LIT = 1e8)"
          },
          "fee_amount": {
            "type": "integer",
            "format": "int64",
            "description": "Fee paid in raw units"
          },
          "start": {
            "type": "integer",
            "format": "int64",
            "description": "Lease start time (Unix milliseconds)"
          },
          "end": {
            "type": "integer",
            "format": "int64",
            "description": "Lease end time (Unix milliseconds)"
          },
          "status": {
            "type": "string",
            "enum": [
              "waiting_fee",
              "leased",
              "expired",
              "canceled"
            ],
            "description": "Lease status"
          },
          "error": {
            "type": "string",
            "description": "Error message if lease was canceled"
          }
        },
        "required": [
          "end",
          "error",
          "fee_amount",
          "id",
          "lease_amount",
          "master_account_index",
          "start",
          "status"
        ]
      },
      "RespGetLeases": {
        "type": "object",
        "properties": {
          "code": {
            "type": "integer"
          },
          "message": {
            "type": "string"
          },
          "leases": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/LeaseEntry"
            }
          },
          "next_cursor": {
            "type": "string",
            "description": "Cursor to pass as the cursor param to fetch the next page. Absent if no more pages."
          }
        }
      }
    }
  }
}
```