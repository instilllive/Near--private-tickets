# Submission drafts — Private Tickets, NEAR HACKATHON

Nothing in this file has been published or submitted except the public repo and the hosted testnet app. The X post and the form still wait for Mark.

Deadline: Sat Nov 14, 2026, 6:59 PM America/New_York (2026-11-14 23:59 UTC).
Form: https://nearhackathon.com/#apply
Track: `nfts` (Track 10, NFTs That Do Something).
Rules file: https://nearhackathon.com/HACKATHON.md

Public repo: https://github.com/instilllive/Near--private-tickets
Hosted testnet app: https://near-private-tickets.netlify.app
Testnet contract: ptixcb96a65fb.testnet

## Draft X demo post

The post must say the project was built at NEAR HACKATHON, tag @NEARProtocol and #NEARHackathon, and attach a demo video (screenshots are not enough when judges cannot open a hosted demo). Optional tags: @NearLegion @NearBuilders.

The existing three-device video at `demo/private-tickets-near.mp4` is out of date (it does not show capped resale or souvenir check-in). Mark should record a new one, or say if he wants that done later.

Suggested text:

People screenshot tickets, and scalpers flip them. Hosts cannot tell who holds the pass.

At NEAR HACKATHON we put Private Tickets on NEAR testnet for private curated events. Each pass is a NEP-171 NFT. The host sets a resale cap and a royalty in the contract: a listing above the cap is rejected, and a fair sale pays the seller and the host. The door admits only the current owner. After check-in, the ticket becomes an un-resellable “was there” souvenir and unlocks returning-guest access for the next event.

Repo: https://github.com/instilllive/Near--private-tickets
App: https://near-private-tickets.netlify.app
Testnet contract: ptixcb96a65fb.testnet

Built at NEAR HACKATHON. @NEARProtocol #NEARHackathon @NearLegion @NearBuilders

## Form answers (leave blanks for Mark)

Ask Mark for every personal field. Do not guess. Do not submit until he confirms the exact payload. Consent text to read verbatim: "I agree that the organizers may use these details to review our submission and contact us about this hackathon."

Generate `requestId` once, with `uuidgen | tr A-Z a-z`, and reuse it on retries. Do not commit a filled payload (it has personal data). A request id reserved for this project (not yet used):

`3f7c1b2a-9d54-4e0b-8c6a-1b2e0f4a7d91`

Draft values:

- projectName: `Private Tickets`
- leadName: (Mark's name)
- email: (Mark's email)
- size: (ask Mark; likely `1` or `2 - 4`)
- tracks: `["nfts"]`
- nearAddress: (Mark's mainnet payout account — he must create this himself; do not invent one)
- projectUrl: `https://github.com/instilllive/Near--private-tickets`
- demoUrl: (URL of the X post after Mark publishes it)
- idea:

```
Private Tickets is for private curated events: a NEP-171 pass the door will honor only for the current on-chain owner, with a host-set resale cap and royalty enforced in the contract, and a check-in that turns the ticket into an un-resellable “was there” souvenir and unlocks returning-guest access later. Listings above the cap are rejected; a fair sale pays the seller (price minus royalty) and the host, and NEP-199 exposes the same split to marketplaces. Events and the calendar stay in the app. Testnet contract: ptixcb96a65fb.testnet. This is not an RSVP-deposit or membership-wallet project.
```

- consent: true, only after Mark agrees to the notice above.

Payload shape (placeholders, not to be sent):

```sh
curl -sS -X POST https://nearhackathon.com/api/applications \
  -H 'Content-Type: application/json' \
  -d '{"requestId":"3f7c1b2a-9d54-4e0b-8c6a-1b2e0f4a7d91","projectName":"Private Tickets","leadName":"","email":"","size":"1","tracks":["nfts"],"nearAddress":"","projectUrl":"https://github.com/instilllive/Near--private-tickets","demoUrl":"","idea":"Private Tickets is for private curated events: a NEP-171 pass the door will honor only for the current on-chain owner, with a host-set resale cap and royalty enforced in the contract, and a check-in that turns the ticket into an un-resellable “was there” souvenir and unlocks returning-guest access later. Listings above the cap are rejected; a fair sale pays the seller (price minus royalty) and the host, and NEP-199 exposes the same split to marketplaces. Events and the calendar stay in the app. Testnet contract: ptixcb96a65fb.testnet. This is not an RSVP-deposit or membership-wallet project.","consent":true}'
```

Fill the empty fields with Mark's answers before showing him the final JSON. Send only after he says yes. Never add a `website` field.

If a saved submission has a mistake, do not submit again. Request changes at https://nearhackathon.com/request-changes.

## How this differs from other entries

Checked the public submissions list at https://nearhackathon.com/api/projects on 11 Nov 2026 (641 entries, paginated). Names and tracks are public; idea text is not, so overlap was judged from project names, tracks, and the public demo posts linked from that list. “Lummy” does not appear in the 641 names.

Closest event / credential / NFT-adjacent entries, and how this one is not a copy:

- **ShowUp** (two listings) and **Pull Up** are real-world RSVP-deposit apps: you stake a little NEAR to say you will attend, and no-shows fund the people who actually arrive. Demo posts: [ShowUp](https://x.com/aloo51523593330/status/2119835854382203006), [ShowUp](https://x.com/chitrasart/status/2119863805534712149), [Pull Up](https://x.com/Trextxxy/status/2118765763851092192). Overlap: events and a door/check-in moment. Difference: they are about showing up after an RSVP, not about a tradable ticket, a host-enforced resale cap, royalties, or a souvenir pass that can no longer be sold.
- **Presafe** is about refunding ticket money when an event is cancelled (festival escrow / organizer failure). Demo: [Presafe](https://x.com/Ahmardchain/status/2118905952887816627). Overlap: the word “ticket” and an event going wrong. Difference: no cap, no secondary sale, no attendance badge.
- **Satchel** (track `nfts`) is a membership card that *is* a NEAR account; revenue sits in the card and moves when the card is sold. Demo: [Satchel](https://x.com/Bz3Ir93ejX81014/status/2120172257461026844). Overlap: an NFT that carries value across a sale. Difference: not event tickets, no door, no resale cap, no check-in souvenir.
- **Seats** is NFT membership for a Sputnik DAO, so a member keeps a vote even when they are away. Demo: [Seats](https://x.com/zephyr_ov/status/2119764761000743303). Overlap: an “admission” metaphor. Difference: governance seats, not event tickets or anti-scalping resale.
- Other NFT-track names that can sound nearby — **ArchivePass**, **Lot Passport**, **Merit**, **Handover** — are caretaker funds, inspection escrow, achievement identity, and wallet transfer. Their demo posts do not describe price-capped ticket resale or attendance souvenirs. Demos: [ArchivePass](https://x.com/MAarashAlijo/status/2119056656256598343), [Lot Passport](https://x.com/navzuhdy/status/2120244076327157910), [Merit](https://x.com/AlgoCherry/status/2120279955133354026), [Handover](https://x.com/ApexSys_Dev/status/2118392517699780924).

The combination we are submitting is therefore: private curated events; a door that admits only the current owner; a host-set cap enforced in the contract (not just a UI hint); a host royalty also published through NEP-199; and a used ticket that becomes an un-resellable souvenir and a `has_attended` signal for returning-guest access. That package was not found in the public list under another name.

## What Mark still has to do

1. Review the public repo and the live testnet app.
2. Record a short updated demo video: mint with a cap and royalty, list, reject or explain the cap, buy, show the payout, door admits the buyer / denies the previous owner, check-in turns the ticket into a souvenir, returning-guest marker. The current video is out of date.
3. Publish the draft X post above (edit if needed), with the new video attached, from his own account.
4. Create a mainnet NEAR account for the prize payout (if he wants to be eligible to win). Do not invent one for him.
5. Give his name, contact email, team size, payout account, and X post URL, and agree to the consent sentence. Then confirm the exact form payload before anyone submits it.
