# systemConfig

Get system config

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "",
    "version": ""
  },
  "paths": {
    "/api/v1/systemConfig": {
      "get": {
        "summary": "systemConfig",
        "operationId": "systemConfig",
        "tags": [
          "info"
        ],
        "description": "Get system config",
        "responses": {
          "200": {
            "description": "A successful response.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/SystemConfig"
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
      "SystemConfig": {
        "type": "object",
        "properties": {
          "code": {
            "type": "integer"
          },
          "message": {
            "type": "string"
          },
          "liquidity_pool_index": {
            "type": "integer",
            "format": "int64"
          },
          "staking_pool_index": {
            "type": "integer",
            "format": "int64"
          },
          "funding_fee_rebate_account_index": {
            "type": "integer",
            "format": "int64"
          },
          "liquidity_pool_cooldown_period": {
            "type": "integer",
            "format": "int64"
          },
          "staking_pool_lockup_period": {
            "type": "integer",
            "format": "int64"
          },
          "max_integrator_perps_maker_fee": {
            "type": "integer",
            "format": "int32"
          },
          "max_integrator_perps_taker_fee": {
            "type": "integer",
            "format": "int32"
          },
          "max_integrator_spot_maker_fee": {
            "type": "integer",
            "format": "int32"
          },
          "max_integrator_spot_taker_fee": {
            "type": "integer",
            "format": "int32"
          }
        },
        "required": [
          "max_integrator_perps_maker_fee",
          "max_integrator_perps_taker_fee",
          "max_integrator_spot_maker_fee",
          "max_integrator_spot_taker_fee",
          "code",
          "funding_fee_rebate_account_index",
          "liquidity_pool_cooldown_period",
          "liquidity_pool_index",
          "staking_pool_index",
          "staking_pool_lockup_period"
        ]
      }
    }
  }
}
```