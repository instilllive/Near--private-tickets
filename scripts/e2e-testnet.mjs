#!/usr/bin/env node
// End-to-end testnet: mint, capped resale, payout, door, souvenir check-in.
// Never prints private keys.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connect, keyStores, KeyPair, utils, providers } from "near-api-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const KEYS = path.join(ROOT, "keys");
const NETWORK = "testnet";
const NODE_URL = "https://rpc.testnet.near.org";
const EXPLORER = "https://testnet.nearblocks.io/txns/";
const SALE_NEAR = "1";
const SALE_YOCTO = utils.format.parseNearAmount(SALE_NEAR);
const CAP_YOCTO = SALE_YOCTO;
const ROYALTY_BPS = 500;

function loadAccounts() {
  const p = path.join(KEYS, "accounts.json");
  if (!fs.existsSync(p)) {
    throw new Error("keys/accounts.json missing. Create testnet accounts first.");
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function loadAccount(role, ids) {
  const accountId = ids[role];
  const file = path.join(KEYS, `${role}.json`);
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!raw.private_key && !raw.secret_key) {
    throw new Error(`No key in ${role} key file`);
  }
  const key = raw.private_key || raw.secret_key;
  return { accountId: raw.account_id || accountId, keyPair: KeyPair.fromString(key) };
}

async function view(contractId, method, args) {
  const provider = new providers.JsonRpcProvider({ url: NODE_URL });
  const res = await provider.query({
    request_type: "call_function",
    finality: "optimistic",
    account_id: contractId,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
  });
  return JSON.parse(Buffer.from(res.result).toString());
}

function extract(result) {
  const hash = result.transaction?.hash || result.transaction_outcome?.id;
  let token = null;
  for (const outcome of result.receipts_outcome || []) {
    for (const log of outcome.outcome?.logs || []) {
      const body = log.startsWith("EVENT_JSON:") ? log.slice(11) : log;
      try {
        const parsed = JSON.parse(body);
        const id = parsed.data?.[0]?.token_ids?.[0];
        if (id) token = id;
      } catch {
        /* ignore */
      }
    }
    const status = outcome.outcome?.status?.SuccessValue;
    if (status) {
      try {
        const decoded = JSON.parse(Buffer.from(status, "base64").toString());
        if (decoded?.token_id) token = decoded.token_id;
      } catch {
        /* ignore */
      }
    }
  }
  return { hash, token };
}

function yocto(balance) {
  return BigInt(balance.available || balance.total || "0");
}

function failMsg(err) {
  return err?.message || String(err);
}

async function main() {
  const ids = loadAccounts();
  const contractId = ids.contract;
  const host = loadAccount("host", ids);
  const guest = loadAccount("guest", ids);
  const buyer = loadAccount("buyer", ids);

  const keyStore = new keyStores.InMemoryKeyStore();
  await keyStore.setKey(NETWORK, host.accountId, host.keyPair);
  await keyStore.setKey(NETWORK, guest.accountId, guest.keyPair);
  await keyStore.setKey(NETWORK, buyer.accountId, buyer.keyPair);

  const near = await connect({ networkId: NETWORK, keyStore, nodeUrl: NODE_URL });
  const hostAcct = await near.account(host.accountId);
  const guestAcct = await near.account(guest.accountId);
  const buyerAcct = await near.account(buyer.accountId);

  const eventId = `e2e-${Date.now()}`;
  const eventName = "Fair Resale Night";

  console.log(`Contract: ${contractId}`);
  console.log(`Host: ${host.accountId}`);
  console.log(`Guest: ${guest.accountId}`);
  console.log(`Buyer: ${buyer.accountId}`);
  console.log("Minting ticket to guest with 1N cap and 5% royalty…");

  const mintRes = extract(
    await hostAcct.functionCall({
      contractId,
      methodName: "nft_mint",
      args: {
        receiver_id: guest.accountId,
        event_id: eventId,
        event_name: eventName,
        max_resale_price: CAP_YOCTO,
        royalty_bps: ROYALTY_BPS,
      },
      gas: 30_000_000_000_000n,
      attachedDeposit: utils.format.parseNearAmount("0.05"),
    })
  );
  if (!mintRes.hash || !mintRes.token) {
    throw new Error(`Mint failed or token id missing. hash=${mintRes.hash} token=${mintRes.token}`);
  }
  console.log(`MINT_TOKEN=${mintRes.token}`);
  console.log(`MINT_TX=${mintRes.hash}`);
  console.log(`MINT_EXPLORER=${EXPLORER}${mintRes.hash}`);

  const afterMint = await view(contractId, "ticket_record", { token_id: mintRes.token });
  if (!afterMint || afterMint.token.owner_id !== guest.accountId) {
    throw new Error(`After mint, owner was ${afterMint?.token?.owner_id}, expected ${guest.accountId}`);
  }
  if (afterMint.royalty_bps !== ROYALTY_BPS) {
    throw new Error(`royalty_bps was ${afterMint.royalty_bps}, expected ${ROYALTY_BPS}`);
  }
  if (afterMint.max_resale_price !== CAP_YOCTO) {
    throw new Error("max_resale_price did not match the cap");
  }

  console.log("Attempting over-cap listing (should fail)…");
  const overCap = utils.format.parseNearAmount("2");
  let overCapRejected = false;
  try {
    await guestAcct.functionCall({
      contractId,
      methodName: "list_resale",
      args: { token_id: mintRes.token, price: overCap },
      gas: 20_000_000_000_000n,
      attachedDeposit: 0n,
    });
  } catch (err) {
    const msg = failMsg(err);
    if (/exceeds the host resale cap/i.test(msg)) {
      overCapRejected = true;
    } else {
      throw new Error(`Over-cap listing failed for the wrong reason: ${msg}`);
    }
  }
  if (!overCapRejected) throw new Error("Over-cap listing should have been rejected.");
  console.log("OVER_CAP_REJECTED=true");

  console.log("Listing ticket at 1N…");
  const listRes = extract(
    await guestAcct.functionCall({
      contractId,
      methodName: "list_resale",
      args: { token_id: mintRes.token, price: SALE_YOCTO },
      gas: 20_000_000_000_000n,
      attachedDeposit: 0n,
    })
  );
  if (!listRes.hash) throw new Error("List hash missing");
  console.log(`LIST_TX=${listRes.hash}`);
  console.log(`LIST_EXPLORER=${EXPLORER}${listRes.hash}`);

  const listed = await view(contractId, "ticket_record", { token_id: mintRes.token });
  if (!listed.listing || listed.listing.price !== SALE_YOCTO) {
    throw new Error("Listing was not recorded at the sale price.");
  }

  const hostBefore = yocto(await hostAcct.getAccountBalance());
  const guestBefore = yocto(await guestAcct.getAccountBalance());
  const buyerBefore = yocto(await buyerAcct.getAccountBalance());

  console.log("Buyer purchasing listed ticket…");
  const buyRes = extract(
    await buyerAcct.functionCall({
      contractId,
      methodName: "buy_resale",
      args: { token_id: mintRes.token },
      gas: 80_000_000_000_000n,
      attachedDeposit: SALE_YOCTO,
    })
  );
  if (!buyRes.hash) throw new Error("Buy hash missing");
  console.log(`BUY_TX=${buyRes.hash}`);
  console.log(`BUY_EXPLORER=${EXPLORER}${buyRes.hash}`);

  const afterBuy = await view(contractId, "ticket_record", { token_id: mintRes.token });
  if (afterBuy.token.owner_id !== buyer.accountId) {
    throw new Error(`After buy, owner was ${afterBuy.token.owner_id}, expected ${buyer.accountId}`);
  }
  if (afterBuy.listing) throw new Error("Listing should be cleared after purchase.");
  if (afterBuy.history.length < 2) throw new Error("Provenance did not record the resale.");

  const hostAfter = yocto(await hostAcct.getAccountBalance());
  const guestAfter = yocto(await guestAcct.getAccountBalance());
  const sale = BigInt(SALE_YOCTO);
  const royalty = sale * 500n / 10000n;
  const sellerCut = sale - royalty;
  const hostDelta = hostAfter - hostBefore;
  const guestDelta = guestAfter - guestBefore;
  if (hostDelta < royalty) {
    throw new Error(`Host royalty short: got ${hostDelta} expected at least ${royalty}`);
  }
  if (guestDelta < sellerCut) {
    throw new Error(`Seller payout short: got ${guestDelta} expected at least ${sellerCut}`);
  }
  console.log(`PAYOUT_HOST_YOCTO=${royalty}`);
  console.log(`PAYOUT_SELLER_YOCTO=${sellerCut}`);
  console.log("PAYOUT_OK");

  const guestEnter = await view(contractId, "can_enter", {
    token_id: mintRes.token,
    account_id: guest.accountId,
  });
  const buyerEnter = await view(contractId, "can_enter", {
    token_id: mintRes.token,
    account_id: buyer.accountId,
  });
  if (guestEnter) throw new Error("Door check failed: previous owner was still admitted.");
  if (!buyerEnter) throw new Error("Door check failed: buyer should be admitted after purchase.");
  console.log("Door check after buy: DENY guest (previous owner).");
  console.log("Door check after buy: ADMIT buyer (current owner).");

  console.log("Host recording on-chain check-in…");
  const checkRes = extract(
    await hostAcct.functionCall({
      contractId,
      methodName: "check_in",
      args: { token_id: mintRes.token },
      gas: 30_000_000_000_000n,
      attachedDeposit: 0n,
    })
  );
  if (!checkRes.hash) throw new Error("Check-in hash missing");
  console.log(`CHECKIN_TX=${checkRes.hash}`);
  console.log(`CHECKIN_EXPLORER=${EXPLORER}${checkRes.hash}`);

  const afterCheck = await view(contractId, "ticket_record", { token_id: mintRes.token });
  if (!afterCheck.attended_at) throw new Error("Check-in did not set attended_at.");
  const badgeTitle = afterCheck.token?.metadata?.title || "";
  if (!/was there/i.test(badgeTitle)) {
    throw new Error(`Souvenir metadata title was ${badgeTitle}`);
  }
  const attended = await view(contractId, "has_attended", {
    account_id: buyer.accountId,
    event_id: eventId,
  });
  if (!attended) throw new Error("has_attended should be true for the buyer after check-in.");
  const buyerEnterAfter = await view(contractId, "can_enter", {
    token_id: mintRes.token,
    account_id: buyer.accountId,
  });
  if (buyerEnterAfter) throw new Error("Door should deny an already-checked-in souvenir ticket.");
  console.log("CHECKIN_OK souvenir badge set, has_attended=true, door denies reuse.");

  let resaleBlocked = false;
  try {
    await buyerAcct.functionCall({
      contractId,
      methodName: "list_resale",
      args: { token_id: mintRes.token, price: SALE_YOCTO },
      gas: 20_000_000_000_000n,
      attachedDeposit: 0n,
    });
  } catch (err) {
    if (/souvenir|already used/i.test(failMsg(err))) resaleBlocked = true;
    else throw new Error(`Attended resale failed for the wrong reason: ${failMsg(err)}`);
  }
  if (!resaleBlocked) throw new Error("Attended ticket should not be listable.");
  console.log("ATTENDED_RESALE_BLOCKED=true");
  console.log("E2E_OK");

  const out = {
    network: NETWORK,
    contract: contractId,
    contractExplorer: `https://testnet.nearblocks.io/address/${contractId}`,
    deployTx: "EYnjbRKpayu54tmvxqv56w7YupXfQj9N5dC9T4CxW3NH",
    deployExplorer: `${EXPLORER}EYnjbRKpayu54tmvxqv56w7YupXfQj9N5dC9T4CxW3NH`,
    token: mintRes.token,
    eventId,
    eventName,
    capYocto: CAP_YOCTO,
    royaltyBps: ROYALTY_BPS,
    saleYocto: SALE_YOCTO,
    host: host.accountId,
    guest: guest.accountId,
    buyer: buyer.accountId,
    mintTx: mintRes.hash,
    mintExplorer: `${EXPLORER}${mintRes.hash}`,
    listTx: listRes.hash,
    listExplorer: `${EXPLORER}${listRes.hash}`,
    buyTx: buyRes.hash,
    buyExplorer: `${EXPLORER}${buyRes.hash}`,
    checkInTx: checkRes.hash,
    checkInExplorer: `${EXPLORER}${checkRes.hash}`,
    hostRoyaltyYocto: royalty.toString(),
    sellerPayoutYocto: sellerCut.toString(),
    overCapRejected: true,
    payoutOk: true,
    attendedAt: afterCheck.attended_at,
    hasAttended: true,
    finalOwner: buyer.accountId,
    provenanceSteps: afterCheck.history.length,
    ok: true,
  };
  const resultPath = path.join(ROOT, "docs", "e2e-results.json");
  fs.writeFileSync(resultPath, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${resultPath}`);
}

main().catch((err) => {
  console.error("E2E_FAILED", err.message || err);
  process.exit(1);
});
