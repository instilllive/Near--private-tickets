# Private Tickets on NEAR

Event tickets as NEP-171 NFTs on NEAR testnet, for private curated events. A ticket is a tradable credential: the door admits only the current on-chain owner. The host sets a resale cap and a royalty in the contract, so a listing above the cap is rejected and a fair sale splits the price (seller keeps the rest, the host gets the royalty). After the host records a check-in, the same NFT becomes an un-resellable “was there” souvenir and unlocks a `has_attended` view the host can use for returning-guest access at a later event.

Events and the calendar stay in the app. The chain holds ownership, capped resale, royalties, provenance, and attendance.

This is the NEAR HACKATHON entry for track `nfts` (Track 10, NFTs That Do Something). Deadline: 2026-11-14 23:59 UTC.

## The problem

Paper and PDF tickets are easy to screenshot, and open resale is easy to scalp. The host cannot tell who actually holds the pass, cannot cap the resale price on-chain, and gets nothing when a ticket is flipped. Once someone has been through the door, a reused pass or a second sale of the same ticket should not be possible.

## What is on-chain vs in the app

- On-chain (NEP-171 + NEP-199): mint, current owner, transfer, host-set max resale price and royalty, in-contract list/buy with payout, provenance, check-in timestamp, souvenir metadata, `has_attended(account, event)`.
- In the app: event calendar, listing/buy UI, souvenir badge and “Returning guest” marker, door log.

## NEAR features used

- **NEP-171** ticket NFTs, with metadata (NEP-177) and enumeration (NEP-181).
- **NEP-199** `nft_payout` / `nft_transfer_payout`, so marketplaces can respect the same host royalty.
- **Capped resale**: `list_resale` rejects any price above the host cap; `buy_resale` takes a deposit equal to the price, transfers the NFT, pays the seller (price − royalty) and the host the royalty, and appends provenance.
- **Souvenir check-in**: the host records check-in on-chain; metadata updates to a “was there” badge; the ticket can no longer be resold, transferred, or used at the door. `has_attended` stays true for that guest and event.
- **Door check**: `can_enter(token_id, account_id)` admits only the current owner, and only before check-in. After a sale, the previous owner is denied.

Hints for this track also mention dynamic NFTs and sub-accounts. This entry uses NEP-171, NEP-199, and a metadata update at check-in. Sub-accounts are out of scope for this sprint.

## Existing product (Q-002, Q-003, Q-005)

Private Tickets already exists as a web app (events, guest links, door PINs) on another stack. That product is baseline. Only the NEAR integration in this repository is submitted for judging: the contract, the testnet mint/resale/check-in/door flow, and the small app in `app/`. This is a new folder and a new git history, not a publish of the live site.

Libraries used: `near-sdk` and `near-contract-standards` (official NEP-171 example), `near-api-js`, `@near-wallet-selector`, Vite, React.

## Testnet contract (already deployed)

- Network: testnet only. No mainnet, no real funds.
- Contract account: [`ptixcb96a65fb.testnet`](https://testnet.nearblocks.io/address/ptixcb96a65fb.testnet)
- Final code deploy: [`Y8DqQFZnpSiQL2cxrZScFmHRRNRDX1bsr46ycbNM26p`](https://testnet.nearblocks.io/txns/Y8DqQFZnpSiQL2cxrZScFmHRRNRDX1bsr46ycbNM26p)
- Recorded e2e (mint, over-cap reject, list, buy, payout, door, check-in): `docs/e2e-results.md`

An earlier testnet contract, `ptix74d83134.testnet`, is leftover from the first mint/transfer demo and is not used by the app anymore.

## Try it (do X — see Y)

You need two NEAR testnet accounts with a small faucet balance (https://near-faucet.io or `near account create-account sponsor-by-faucet-service`). Do not use mainnet keys.

### A. Contract unit tests

```bash
cargo test --manifest-path contract/Cargo.toml --lib
```

See: nine tests pass (mint and provenance; transfer; door rejects the previous owner; over-cap listing is rejected; NEP-199 payout split is 5% / 95%; resale moves ownership and the door follows the buyer; check-in marks a souvenir; a used ticket cannot be resold; a used ticket cannot be checked in again; `has_attended` is true).

### B. Look up the deployed contract

```bash
near contract call-function as-read-only ptixcb96a65fb.testnet nft_metadata json-args '{}' network-config testnet now
```

See: name `Private Tickets`, symbol `PTIX`.

```bash
near contract call-function as-read-only ptixcb96a65fb.testnet ticket_record json-args '{"token_id":"ticket-4"}' network-config testnet now
```

See: the e2e souvenir ticket — current owner is the buyer, a resale cap and 5% royalty, provenance including the sale, and `attended_at` set.

### C. Mint, capped resale, door, and check-in on testnet

1. Create three testnet accounts (host, guest, buyer) and save the keys locally. Never commit them.
2. Set `app/src/config.js` `CONTRACT_ID` to `ptixcb96a65fb.testnet`, or deploy your own copy (section D) and point at that.
3. Put a `keys/accounts.json` with public account ids and `keys/host.json`, `keys/guest.json`, `keys/buyer.json` in legacy near-cli format. Keep the `keys/` folder mode 700.
4. Run:

```bash
npm install
node scripts/e2e-testnet.mjs
```

See:

- `MINT_TOKEN=ticket-N` and a mint explorer URL.
- An over-cap listing is rejected.
- `LIST_TX` / `BUY_TX` explorer URLs; `ticket_record` shows the buyer as owner; the host received 5% and the seller 95%.
- Door `can_enter` admits the buyer and denies the guest.
- `CHECKIN_TX` sets souvenir metadata; `has_attended` is true; a later list is rejected.
- The script writes `docs/e2e-results.json` with transaction hashes.

### D. Optional: deploy your own copy

```bash
rustup target add wasm32-unknown-unknown
cargo build --manifest-path contract/Cargo.toml --target wasm32-unknown-unknown --release
near contract deploy YOUR_ACCOUNT.testnet use-file contract/res/ticket_nft.wasm   with-init-call new_default_meta json-args '{"owner_id":"YOUR_HOST.testnet"}'   prepaid-gas '100 Tgas' attached-deposit '0 NEAR'   network-config testnet sign-with-legacy-keychain send
```

A prebuilt wasm is in `contract/res/ticket_nft.wasm`. Creating the account and deploying costs several testnet NEAR (wasm is about 0.59 MB of storage). Use the faucet only.

### E. App UI

Live (its own Netlify site): https://near-private-tickets.netlify.app

```bash
cd app && npm install && npm run dev
```

Open the printed local URL. Lookup, provenance, cap/royalty, and door checks work without a wallet. Connect a NEAR testnet wallet (MyNearWallet or Meteor) to mint, list, buy, transfer, or record a check-in.

1. Event tab: save an event, set a max resale price in NEAR and a host royalty %, mint a ticket to a guest.
2. Ticket tab: look up the token — see owner, cap, royalty, provenance. The owner can list at or below the cap; a buyer can purchase; a “Was there” badge appears after check-in.
3. Door tab: enter the token id and a presented account — Admit only when `can_enter` is true. After a sale, the previous owner is denied. After check-in, even the owner is denied and the ticket is a souvenir. If `has_attended` is true, a “Returning guest” marker is shown. The door log stays in the browser.

## Contract methods

- `nft_mint(receiver_id, event_id, event_name, token_metadata?, max_resale_price?, royalty_bps?)` — payable, anyone may mint on this testnet demo (they pay storage). Sets or copies the event policy. Returns a `ticket-N` token.
- `set_event_policy(event_id, max_resale_price, royalty_bps)` — host or contract owner.
- `list_resale(token_id, price)` — owner only; rejected above the cap or after check-in.
- `cancel_resale(token_id)` / `buy_resale(token_id)` — buy requires a deposit equal to the price; pays seller and host; records provenance.
- `nft_payout` / `nft_transfer_payout` — NEP-199 royalty interface for marketplaces.
- `check_in(token_id)` — host records attendance; metadata becomes a souvenir badge.
- `nft_transfer` / `nft_transfer_call` — standard NEP-171, blocked after check-in.
- `ticket_record(token_id)` — owner, policy, listing, attended timestamp, provenance.
- `is_owner(token_id, account_id)` — current owner.
- `can_enter(token_id, account_id)` — door admission (owner and not yet checked in).
- `has_attended(account_id, event_id)` — returning-guest check.
- `nft_token`, `nft_tokens_for_owner`, `nft_metadata`, approvals — standard.

## Layout

- `contract/` — Rust NEP-171 / NEP-199 contract
- `app/` — small Vite + React UI
- `scripts/e2e-testnet.mjs` — testnet mint, resale, payout, door, check-in
- `docs/` — recorded testnet results and submission drafts
- `keys/` — local testnet keys, not in git

## Demo video

A 16:9 three-device demo (iPhone, iPad, and desktop, recorded from the real local app against NEAR testnet) is at `demo/private-tickets-near.mp4`. It shows a host minting a NEP-171 ticket to a guest, the owner on-chain, a transfer to a buyer, and the door admitting the new owner and denying the previous owner. That recording is now out of date: it does not show capped resale, royalties, or souvenir check-in, and it targeted the earlier contract account. Testnet transactions from that recording are listed in `demo/TESTNET-TXS.md`. Newer e2e transactions are in `docs/e2e-results.md`. Phone screenshots of the current resale and badge UI are at `demo/resale-phone.png` and `demo/badge-phone.png`.

## License

MIT. See `LICENSE`.
