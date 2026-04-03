# Priority Transactions

Priority Transactions offer a way to interact with the Lighter protocol directly via Ethereum directly. You can think of them as censorship-resistant operations - and use them to e.g. cancel all orders or withdraw your collateral. They can be executed via Lighter's proxy smart contract on Ethereum, which holds the platform's collateral: `0x3B4D794a66304F130a4Db8F2551B0070dfCf5ca7`.

**Read functions**:

* `desertMode`: boolean, set to False unless desert mode gets activated.
* `getPendingBalance`: the pending balance for a certain layer 1 account, you can find a complete list of asset IDs via the assetDetails [endpoint](https://apidocs.lighter.xyz/reference/assetdetails).
* `getPendingBalanceLegacy`: the pending balance for a certain layer 1 account before the spot upgrade. In this case, it can only be a USDC value.
* `lastAccountIndex`: the highest account index assigned. Only accounts that deposit get assigned an account index, so that would represent the total number of wallets on the exchange.
* `tokenToAssetIndex`: match an ERC20 contract address to its corresponding asset\_index on the Lighter protocol

Most have been left out, but you can check out all functions on Ethereum block explorers, e.g. [Etherscan](https://etherscan.io/address/0x3B4D794a66304F130a4Db8F2551B0070dfCf5ca7#readProxyContract).

**Write functions**:

* `activateDesertMode`
* `burnShares`: allows you to burn shares of a Public Pool.
* `cancelAllorders`: cancels all open orders on Lighter for the specified account index.
* `cancelOustandingDepositsForDesertMode`
* `changePubKey`: assign a newly created api key to an account index. Each key is tied to a single account index (if you use sub-accounts, you'll need to create new ones).
* `deposit`: deposit assets to the platform. See [Deposits, Transfers and Withdrawals](https://apidocs.lighter.xyz/docs/deposits-transfers-and-withdrawals) for more details.
* `depositBatch`: deposit to multiple addresses.
* `transferERC20`: transfer non-ETH spot assets between addresses.
* `transferETH`: transfer mainnet ETH between addresses.
* `withdraw`: withdraw assets from the platform. See [Deposits, Transfers and Withdrawals](https://apidocs.lighter.xyz/docs/deposits-transfers-and-withdrawals) for more details.
* `withdrawPendingBalance`: claim an existing secure withdrawal. Whenever the gas isn't too steep in price, withdrawals will be claimed by the platform on the users' behalf.
* `withdrawPendingBalanceLegacy`: claim an existing secure withdrawal that was requested before the addition of spot assets to the protocol.

Unlisted functions are reserved for the governor (a multi-sig controlled by the protocol) to manage markets and the protocol's settings. If you specify an account\_index, you should sign with the wallet that controls said index.