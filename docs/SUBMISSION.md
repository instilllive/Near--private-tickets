# Submission drafts — Private Tickets, NEAR HACKATHON

Nothing in this file has been published or submitted. Repo publish, the X post, and the form all wait for Mark.

Deadline: Sat Nov 14, 2026, 6:59 PM America/New_York (2026-11-14 23:59 UTC).
Form: https://nearhackathon.com/#apply
Track: `nfts` (Track 10, NFTs That Do Something).
Rules file: https://nearhackathon.com/HACKATHON.md

## Draft X demo post

The post must say the project was built at NEAR HACKATHON, tag @NEARProtocol and #NEARHackathon, and attach a demo video (screenshots are not enough when judges cannot open a hosted demo). Optional tags: @NearLegion @NearBuilders.

Suggested text:

People screenshot tickets. Hosts cannot tell who actually holds the pass.

At NEAR HACKATHON we put Private Tickets on NEAR testnet: each ticket is a NEP-171 NFT. The guest can transfer it, provenance stays on-chain, and the door admits only the current owner.

Events and the calendar stay in the app. The chain is just ownership, trading and provenance.

Repo: (paste the public repo URL once it is published)
Testnet contract: ptix74d83134.testnet

Built at NEAR HACKATHON. @NEARProtocol #NEARHackathon @NearLegion @NearBuilders

What would you still want a ticket NFT to do at the door?

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
- projectUrl: (public repo URL after Mark publishes it)
- demoUrl: (URL of the X post after Mark publishes it)
- idea:

```
Paper and PDF tickets are easy to screenshot and hard to resell honestly. Private Tickets already exists as an event app; this entry adds NEP-171 NFT tickets on NEAR testnet so ownership, transfers and provenance live on-chain. A host mints a ticket to a guest, the guest can transfer it, and the door admits only the current on-chain owner. Events and the calendar stay in the app. Testnet contract: ptix74d83134.testnet.
```

- consent: true, only after Mark agrees to the notice above.

Payload shape (placeholders, not to be sent):

```sh
curl -sS -X POST https://nearhackathon.com/api/applications \
  -H 'Content-Type: application/json' \
  -d '{"requestId":"3f7c1b2a-9d54-4e0b-8c6a-1b2e0f4a7d91","projectName":"Private Tickets","leadName":"","email":"","size":"1","tracks":["nfts"],"nearAddress":"","projectUrl":"","demoUrl":"","idea":"Paper and PDF tickets are easy to screenshot and hard to resell honestly. Private Tickets already exists as an event app; this entry adds NEP-171 NFT tickets on NEAR testnet so ownership, transfers and provenance live on-chain. A host mints a ticket to a guest, the guest can transfer it, and the door admits only the current on-chain owner. Events and the calendar stay in the app. Testnet contract: ptix74d83134.testnet.","consent":true}'
```

Fill the empty fields with Mark's answers before showing him the final JSON. Send only after he says yes. Never add a `website` field.

If a saved submission has a mistake, do not submit again. Request changes at https://nearhackathon.com/request-changes.

## What Mark still has to do

1. Review the local repo at `/workspace/near-tickets` and say it is okay to publish.
2. Create a public GitHub (or other) repository and push this project. The repo must be public by Sat Nov 14, 6:59 PM ET. This repo was not published.
3. Record a short demo video: mint a ticket, show the owner, transfer it, show the door admitting the new owner and denying the old one.
4. Publish the draft X post above (edit the repo link in), with the video attached, from his own account.
5. Create a mainnet NEAR account for the prize payout (if he wants to be eligible to win). Do not invent one for him.
6. Give his name, contact email, team size, payout account, public repo URL, and X post URL, and agree to the consent sentence. Then confirm the exact form payload before anyone submits it.

No public site deploy is required (local demo is allowed). A hosted demo is a plus if he wants one later, not on the live Private Tickets Netlify site.
