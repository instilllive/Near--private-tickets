# Submitted entry — Private Tickets, NEAR HACKATHON

This file is the record of the submitted NEAR HACKATHON entry. The project is on the public submissions list.

Deadline was Sat Nov 14, 2026, 6:59 PM America/New_York (2026-11-14 23:59 UTC).
Form: https://nearhackathon.com/#apply
Track: `nfts` (Track 10, NFTs That Do Something).
Rules file: https://nearhackathon.com/HACKATHON.md

Public repo: https://github.com/instilllive/Near--private-tickets
Hosted testnet app: https://near-private-tickets.netlify.app
Testnet contract: ptixcb96a65fb.testnet

Public listing (from https://nearhackathon.com/api/projects?q=Private%20Tickets):

- id: `3f7c1b2a-9d54-4e0b-8c6a-1b2e0f4a7d91`
- projectName: `Private Tickets`
- tracks: `["nfts"]`
- demoUrl: https://x.com/Dxter113/status/2120915508580987063

The public list does not publish personal form fields (name, email, team size, or payout account), so those are not repeated here.

## Demo post

The official demo post is https://x.com/Dxter113/status/2120915508580987063, published from [@Dxter113](https://x.com/Dxter113) on 12 Nov 2026. It attaches the 35-second ad at `demo/private-tickets-near-ad.mp4`, which shows capped resale, royalties, souvenir check-in, and the three-device layout. Live app: https://near-private-tickets.netlify.app. Testnet contract: ptixcb96a65fb.testnet.

An earlier, longer three-device recording at `demo/private-tickets-near.mp4` predates capped resale and souvenir check-in and is not the submitted demo.

## Project description

Private Tickets is for private curated events: a NEP-171 pass the door will honor only for the current on-chain owner, with a host-set resale cap and royalty enforced in the contract, and a check-in that turns the ticket into an un-resellable “was there” souvenir and unlocks returning-guest access later. Listings above the cap are rejected; a fair sale pays the seller (price minus royalty) and the host, and NEP-199 exposes the same split to marketplaces. A simple events list (names and dates) stays in the app. Testnet contract: ptixcb96a65fb.testnet. This is not an RSVP-deposit or membership-wallet project.

## How this differs from other entries

Checked the public submissions list at https://nearhackathon.com/api/projects on 11 Nov 2026 (641 entries, paginated). Names and tracks are public; idea text is not, so overlap was judged from project names, tracks, and the public demo posts linked from that list. “Lummy” does not appear in the 641 names.

Closest event / credential / NFT-adjacent entries, and how this one is not a copy:

- **ShowUp** (two listings) and **Pull Up** are real-world RSVP-deposit apps: you stake a little NEAR to say you will attend, and no-shows fund the people who actually arrive. Demo posts: [ShowUp](https://x.com/aloo51523593330/status/2119835854382203006), [ShowUp](https://x.com/chitrasart/status/2119863805534712149), [Pull Up](https://x.com/Trextxxy/status/2118765763851092192). Overlap: events and a door/check-in moment. Difference: they are about showing up after an RSVP, not about a tradable ticket, a host-enforced resale cap, royalties, or a souvenir pass that can no longer be sold.
- **Presafe** is about refunding ticket money when an event is cancelled (festival escrow / organizer failure). Demo: [Presafe](https://x.com/Ahmardchain/status/2118905952887816627). Overlap: the word “ticket” and an event going wrong. Difference: no cap, no secondary sale, no attendance badge.
- **Satchel** (track `nfts`) is a membership card that *is* a NEAR account; revenue sits in the card and moves when the card is sold. Demo: [Satchel](https://x.com/Bz3Ir93ejX81014/status/2120172257461026844). Overlap: an NFT that carries value across a sale. Difference: not event tickets, no door, no resale cap, no check-in souvenir.
- **Seats** is NFT membership for a Sputnik DAO, so a member keeps a vote even when they are away. Demo: [Seats](https://x.com/zephyr_ov/status/2119764761000743303). Overlap: an “admission” metaphor. Difference: governance seats, not event tickets or anti-scalping resale.
- Other NFT-track names that can sound nearby — **ArchivePass**, **Lot Passport**, **Merit**, **Handover** — are caretaker funds, inspection escrow, achievement identity, and wallet transfer. Their demo posts do not describe price-capped ticket resale or attendance souvenirs. Demos: [ArchivePass](https://x.com/MAarashAlijo/status/2119056656256598343), [Lot Passport](https://x.com/navzuhdy/status/2120244076327157910), [Merit](https://x.com/AlgoCherry/status/2120279955133354026), [Handover](https://x.com/ApexSys_Dev/status/2118392517699780924).

The combination in this entry is therefore: private curated events; a door that admits only the current owner; a host-set cap enforced in the contract (not just a UI hint); a host royalty also published through NEP-199; and a used ticket that becomes an un-resellable souvenir and a `has_attended` signal for returning-guest access. That package was not found in the public list under another name on 11 Nov 2026.
