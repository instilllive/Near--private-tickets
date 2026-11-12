# Private Tickets on NEAR

Event tickets as NEP-171 NFTs on NEAR testnet. A ticket is a tradable credential: whoever holds it on-chain is the owner. Events and the calendar stay in the app. The door asks the contract who the current owner is before it admits anyone.

This is the NEAR HACKATHON entry for track `nfts` (Track 10, NFTs That Do Something). Deadline: 2026-11-14 23:59 UTC.

## The problem

Paper and PDF tickets are easy to screenshot and hard to resell honestly. The host cannot tell who actually holds the pass. This project puts ownership, transfer and provenance on NEAR, and keeps event details and door logs in the app.

## What is on-chain vs in the app

- On-chain (NEP-171): mint, current owner, transfer, provenance history, event id/name on the token.
- In the app: event calendar, guest list context, door check-in log.

Tickets are only about ownership, trading and provenance. They do not store the event calendar.

## NEAR features used

- **NEP-171** ticket NFTs, with metadata (NEP-177) and enumeration (NEP-181).
- **Provenance**: each mint and transfer is appended on the contract, so a resold ticket has a public history.
- **Door check**: the `is_owner(token_id, account_id)` view is the admission rule. After a transfer, the previous owner is denied.

Hints for this track also mention dynamic NFTs and sub-accounts. This entry leans on NEP-171 and on-chain provenance. Sub-accounts are out of scope for this sprint.

## Existing product (Q-002, Q-003, Q-005)

Private Tickets already exists as a web app (events, guest links, door PINs) on another stack. That product is baseline. Only the NEAR integration in this repository is submitted for judging: the NEP-171 contract, the testnet mint/transfer/door flow, and the small app in `app/`. This is a new folder and a new git history, not a publish of the live site.

Libraries used: `near-sdk` and `near-contract-standards` (official NEP-171 example), `near-api-js`, Vite, React.

## Testnet contract (already deployed)

- Network: testnet only. No mainnet, no real funds.
- Contract account: [`ptix74d83134.testnet`](https://testnet.nearblocks.io/address/ptix74d83134.testnet)
- Deploy transaction: [`3XwFyJk9BJehzPYRErqLmKQtWVkvnZcWbqBfc9NEwcKb`](https://testnet.nearblocks.io/txns/3XwFyJk9BJehzPYRErqLmKQtWVkvnZcWbqBfc9NEwcKb)

## Try it (do X — see Y)

You need two NEAR testnet accounts with a small faucet balance (https://near-faucet.io or `near account create-account sponsor-by-faucet-service`). Do not use mainnet keys.

### A. Contract unit tests

```bash
cargo test --manifest-path contract/Cargo.toml --lib
```

See: three tests pass (mint assigns owner and provenance; transfer moves ownership and appends history; door rejects the previous owner).

### B. Look up the deployed contract

```bash
near contract call-function as-read-only ptix74d83134.testnet nft_metadata json-args '{}' network-config testnet now
```

See: name `Private Tickets`, symbol `PTIX`.

```bash
near contract call-function as-read-only ptix74d83134.testnet nft_total_supply json-args '{}' network-config testnet now
```

See: a number greater than `"0"` after the recorded testnet mint below.

### C. Mint, transfer, and door-check on testnet

1. Create three testnet accounts (host, guest, buyer) and save the keys locally. Never commit them.
2. Set `app/src/config.js` `CONTRACT_ID` to `ptix74d83134.testnet`, or deploy your own copy (section D) and point at that.
3. Put a `keys/accounts.json` with public account ids and `keys/host.json`, `keys/guest.json`, `keys/buyer.json` in legacy near-cli format. Keep the `keys/` folder mode 700.
4. Run:

```bash
npm install
node scripts/e2e-testnet.mjs
```

See:

- `MINT_TOKEN=ticket-N` and a mint explorer URL.
- `ticket_record` shows the guest as owner.
- Door check admits the guest and denies everyone else.
- After transfer, `ticket_record` shows the buyer as owner, provenance has two steps, the guest is denied, the buyer is admitted.
- The script writes `docs/e2e-results.json` with transaction hashes.

### D. Optional: deploy your own copy

```bash
rustup target add wasm32-unknown-unknown
cargo build --manifest-path contract/Cargo.toml --target wasm32-unknown-unknown --release
near contract deploy YOUR_ACCOUNT.testnet use-file contract/res/ticket_nft.wasm   with-init-call new_default_meta json-args '{"owner_id":"YOUR_ACCOUNT.testnet"}'   prepaid-gas '100 Tgas' attached-deposit '0 NEAR'   network-config testnet sign-with-legacy-keychain send
```

A prebuilt wasm is in `contract/res/ticket_nft.wasm`. Creating the account and deploying costs several testnet NEAR (wasm is about 0.5 MB of storage). Use the faucet only.

### E. App UI (local)

```bash
cd app && npm install && npm run dev
```

Open the printed local URL.

1. Paste a testnet account and its private key (stays in this browser tab, testnet only).
2. Event tab: save an event (stored in the browser), mint a ticket to a guest account — see a token id and a testnet explorer link.
3. Ticket tab: enter the token id — see the current owner and provenance. Transfer it — see the owner change on-chain.
4. Door tab: enter the token id and a presented account — see Admit only when that account is the current on-chain owner. After a transfer, the previous owner is denied. The door log stays in the browser.

## Contract methods

- `nft_mint(receiver_id, event_id, event_name, token_metadata?)` — payable, anyone may mint on this testnet demo (they pay storage). Returns a `ticket-N` token.
- `nft_transfer` / `nft_transfer_call` — standard NEP-171. Transfer also appends provenance.
- `nft_token`, `nft_tokens_for_owner`, `nft_metadata`, approvals — standard.
- `ticket_record(token_id)` — owner, event fields, provenance.
- `is_owner(token_id, account_id)` — door admission check.

## Layout

- `contract/` — Rust NEP-171 contract
- `app/` — small Vite + React UI
- `scripts/e2e-testnet.mjs` — testnet mint, transfer, verify
- `docs/` — recorded testnet results and submission drafts
- `keys/` — local testnet keys, not in git

## License

MIT. See `LICENSE`.
