# Testnet e2e results (resale + souvenir badges)

Network: testnet only. Contract: [`ptixcb96a65fb.testnet`](https://testnet.nearblocks.io/address/ptixcb96a65fb.testnet).

Final contract code deploy: [`Y8DqQFZnpSiQL2cxrZScFmHRRNRDX1bsr46ycbNM26p`](https://testnet.nearblocks.io/txns/Y8DqQFZnpSiQL2cxrZScFmHRRNRDX1bsr46ycbNM26p) (init deploy: [`EYnjbRKpayu54tmvxqv56w7YupXfQj9N5dC9T4CxW3NH`](https://testnet.nearblocks.io/txns/EYnjbRKpayu54tmvxqv56w7YupXfQj9N5dC9T4CxW3NH)).

Event: Fair Resale Night (`e2e-1794451546100`). Token: `ticket-4`. Cap: 1 N. Royalty: 5%.

| Step | Result | Transaction |
| --- | --- | --- |
| Mint to guest | `ticket-4` owned by `ptixg74d83134.testnet` | [9wwmj9dW4N3bZ1fxZixHJUJQPCAMuD1SSeocD42VUHW4](https://testnet.nearblocks.io/txns/9wwmj9dW4N3bZ1fxZixHJUJQPCAMuD1SSeocD42VUHW4) |
| Over-cap list (2 N) | Rejected | (call failed as designed) |
| List at 1 N | Listed by `ptixg74d83134.testnet` | [4NjVrpD8PuyUZyVd9NpKRZkckXvYbU7QHgwHnpaeFj5Y](https://testnet.nearblocks.io/txns/4NjVrpD8PuyUZyVd9NpKRZkckXvYbU7QHgwHnpaeFj5Y) |
| Buy | Owner `ptixb74d83134.testnet`; host royalty 50000000000000000000000 yocto (0.05 N); seller 950000000000000000000000 yocto (0.95 N) | [5ZQ2Qcqbz3cVXedXTe8vm3RUJMg83YCfqf7wz2YXb9R2](https://testnet.nearblocks.io/txns/5ZQ2Qcqbz3cVXedXTe8vm3RUJMg83YCfqf7wz2YXb9R2) |
| Door | Admit buyer, deny previous owner (guest) | view `can_enter` |
| Check-in | Souvenir badge, `has_attended(ptixb74d83134.testnet, event)` true, reuse denied, later list rejected | [AudA22JsqC1EacU2u2LwUsmAxhaCKT8iVkkrTm6299dm](https://testnet.nearblocks.io/txns/AudA22JsqC1EacU2u2LwUsmAxhaCKT8iVkkrTm6299dm) |

All steps passed (`ok: true`).
