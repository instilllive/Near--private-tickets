#!/usr/bin/env node
// End-to-end testnet: mint, transfer, verify owner. Never prints private keys.
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

  const eventId = `e2e-${Date.now()}`;
  const eventName = "NEAR E2E Night";

  console.log(`Contract: ${contractId}`);
  console.log(`Host: ${host.accountId}`);
  console.log(`Guest: ${guest.accountId}`);
  console.log(`Buyer: ${buyer.accountId}`);
  console.log("Minting ticket to guest…");

  const mintRes = extract(
    await hostAcct.functionCall({
      contractId,
      methodName: "nft_mint",
      args: {
        receiver_id: guest.accountId,
        event_id: eventId,
        event_name: eventName,
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
  const guestOwns = await view(contractId, "is_owner", {
    token_id: mintRes.token,
    account_id: guest.accountId,
  });
  if (!guestOwns) throw new Error("Door check failed: guest should own the ticket after mint.");
  console.log("Door check after mint: ADMIT guest (owner).");

  console.log("Transferring ticket to buyer…");
  const xferRes = extract(
    await guestAcct.functionCall({
      contractId,
      methodName: "nft_transfer",
      args: {
        receiver_id: buyer.accountId,
        token_id: mintRes.token,
        approval_id: null,
        memo: "e2e-transfer",
      },
      gas: 30_000_000_000_000n,
      attachedDeposit: 1n,
    })
  );
  if (!xferRes.hash) throw new Error("Transfer hash missing");
  console.log(`TRANSFER_TX=${xferRes.hash}`);
  console.log(`TRANSFER_EXPLORER=${EXPLORER}${xferRes.hash}`);

  const afterXfer = await view(contractId, "ticket_record", { token_id: mintRes.token });
  if (afterXfer.token.owner_id !== buyer.accountId) {
    throw new Error(`After transfer, owner was ${afterXfer.token.owner_id}, expected ${buyer.accountId}`);
  }
  const guestStill = await view(contractId, "is_owner", {
    token_id: mintRes.token,
    account_id: guest.accountId,
  });
  const buyerOwns = await view(contractId, "is_owner", {
    token_id: mintRes.token,
    account_id: buyer.accountId,
  });
  if (guestStill) throw new Error("Door check failed: previous owner was still admitted.");
  if (!buyerOwns) throw new Error("Door check failed: buyer should own the ticket after transfer.");
  if (afterXfer.history.length < 2) throw new Error("Provenance did not record the transfer.");
  console.log("Door check after transfer: DENY guest (previous owner).");
  console.log("Door check after transfer: ADMIT buyer (current owner).");
  console.log(`PROVENANCE_STEPS=${afterXfer.history.length}`);
  console.log("E2E_OK");

  const out = {
    network: NETWORK,
    contract: contractId,
    contractExplorer: `https://testnet.nearblocks.io/address/${contractId}`,
    token: mintRes.token,
    eventId,
    eventName,
    host: host.accountId,
    guest: guest.accountId,
    buyer: buyer.accountId,
    mintTx: mintRes.hash,
    mintExplorer: `${EXPLORER}${mintRes.hash}`,
    transferTx: xferRes.hash,
    transferExplorer: `${EXPLORER}${xferRes.hash}`,
    finalOwner: buyer.accountId,
    provenanceSteps: afterXfer.history.length,
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
