# Local testnet keys

This folder is for local NEAR **testnet** key files only. It is gitignored, except this README.

Keep the folder mode 700 and the json files mode 600. Never commit keys, never use mainnet keys, never paste keys into the README or an issue.

Expected files (legacy near-cli format):

- `accounts.json` — public account ids for `contract`, `host`, `guest`, `buyer`
- `host.json`, `guest.json`, `buyer.json` — the matching key files

See the root README for how to create faucet accounts.
