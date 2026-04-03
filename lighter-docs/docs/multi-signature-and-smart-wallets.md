# Multi-signature and smart wallets

In the case of multi-signature and smart wallets, you can still access the front-end by signing with your api key with a priority transaction (i.e. using ethereum's priority transactions). To do this, make sure to tick the box shown in the authentication modal.

<Image border={false} src="https://files.readme.io/7435a2372a7f5778f8d77ec3a9fdafa40e7738beec9e415c850aae293f54dd2d-image.png" />

While most features are available these type of wallts, there are some key differences if you're interacting with them through API. Specifically, functions that require your Ethereum private key as an argument won't be available (e.g. changing public key, and signing a transfer). While you can change public key via priority transactions, you cannot perform a transfer that way - making a secure withdrawal the only way to withdraw funds off the platform.

<br />