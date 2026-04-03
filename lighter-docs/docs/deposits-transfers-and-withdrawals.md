# Deposits, Transfers and Withdrawals

## Deposit via Ethereum Mainnet

To deposit via Ethereum mainnet, you can use the `deposit` method (0x8a857083) directly. You'll need to specify  the following parameters:

* `deposit`: the amount of Ether you're depositing. That is optional and only needed when interacting with the contract directly, Lighter's Ethereum gateway page does not require this. You can leave this at zero if you're depositing other kind of assets.
* `_to`: the L1 address you want to credit the deposit to
* `_assetIndex`: the asset you want to deposit. You can grab the correct asset id from the assetDetails endpoint (add hyperlink when added to docs)
* `_routeType`: whether you want to deposit the asset to your perps (0), or spot account (1). Only USDC can be deposited to your perps account
* `_amount`: the amount you're depositing. *it should be in line with the ERC20's decimals. E.g. 6 decimals for USDC, 18 decimals for Ether etc. 1 USDC, or equivalent, minimum.*

If you're depositing assets different from ETH (e.g. USDC), make sure to approve spending for Lighter's smart contract (0x3B4D794a66304F130a4Db8F2551B0070dfCf5ca7) for that ERC20. There is a minimum of 1 USDC, and equivalent for other ERC20s, per deposit.

## Deposit USDC via other EVM-compatible chains

At the moment, the following chains are supported via Circle's CCTP: Arbitrum, Base, Avalanche C-Chain. Minimum deposit is 5 USDC. You can either generate an intent address via the front-end, or via [API](https://apidocs.lighter.xyz/reference/createintentaddress):

```shell
`curl -X POST https://mainnet.zklighter.elliot.ai/api/v1/createIntentAddress \`

`-H "Content-Type: application/x-www-form-urlencoded" \`

`-d "chain_id=42161&from_addr=0xyourL1address&amount=0&is_external_deposit=true"`
```

## Withdrawals: Secure and Fast

You can process both [secure](https://github.com/elliottech/lighter-python/blob/main/examples/withdraw_normal.py), [fast withdrawals](https://github.com/elliottech/lighter-python/blob/main/examples/withdraw_fast.py#L59), and [transfers](https://github.com/elliottech/lighter-python/blob/main/examples/transfer.py) via both SDKs, you can find linked examples with the Python SDK. If you're processing a Fast Withdrawal (USDC only, 4 USDC minimum), or a Transfer to another L1, you'll need to provide an Ethereum private key as well. If you prefer, you can process secure withdrawals from the contract directly, using the `withdraw` (0xd20191bd) method. Both Transfers and Secure Withdrawals have a 1 USDC, or equivalent, minimum.

<br />