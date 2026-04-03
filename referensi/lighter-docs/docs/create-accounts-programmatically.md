# Create accounts programmatically

To create a Lighter account, you can simply deposit some assets to Lighter using the procedure [here](https://apidocs.lighter.xyz/docs/deposits-transfers-and-withdrawals). The crediting on mainnet takes a few minutes, after which a master account index gets generated, allowing you to interact with the exchange without ever needing to touch the front-end. If you're using other EVM-compatible chains routed via CCTP, deposits will take around 15-20 minutes to get credited.

Once the account is created, you can verify the assigned `account_index` [querying](https://etherscan.io/address/0x3B4D794a66304F130a4Db8F2551B0070dfCf5ca7#readProxyContract) `addressToAccountIndex` (0xabf6a038) on Lighter's Ethereum contract, or using the [account](https://apidocs.lighter.xyz/reference/account-1) or [accountsByL1Address](https://apidocs.lighter.xyz/reference/accountsbyl1address) endpoints.

You can refer to [this documentation](https://apidocs.lighter.xyz/docs/api-keys) to then generate API keys in a programmatic way.