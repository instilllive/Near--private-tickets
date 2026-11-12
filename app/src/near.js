import { connect, keyStores, KeyPair, utils, providers } from "near-api-js";
import { CONTRACT_ID, NETWORK, NODE_URL } from "./config.js";

function bytesToString(bytes) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString();
  return new TextDecoder().decode(Uint8Array.from(bytes));
}
function toBase64(str) {
  if (typeof Buffer !== "undefined") return Buffer.from(str).toString("base64");
  return btoa(str);
}
function fromBase64(b64) {
  if (typeof Buffer !== "undefined") return Buffer.from(b64, "base64").toString();
  return atob(b64);
}

const provider = new providers.JsonRpcProvider({ url: NODE_URL });

export { CONTRACT_ID, NETWORK, NODE_URL };

export function explorerTx(hash) {
  return `https://testnet.nearblocks.io/txns/${hash}`;
}

export function explorerAccount(id) {
  return `https://testnet.nearblocks.io/address/${id}`;
}

export async function view(method, args = {}) {
  const res = await provider.query({
    request_type: "call_function",
    finality: "optimistic",
    account_id: CONTRACT_ID,
    method_name: method,
    args_base64: toBase64(JSON.stringify(args)),
  });
  return JSON.parse(bytesToString(res.result));
}

export async function ticketRecord(tokenId) {
  return view("ticket_record", { token_id: tokenId });
}

export async function isOwner(tokenId, accountId) {
  return view("is_owner", { token_id: tokenId, account_id: accountId });
}

export async function tokensForOwner(accountId) {
  return view("nft_tokens_for_owner", {
    account_id: accountId,
    from_index: "0",
    limit: 50,
  });
}

export async function connectAccount(accountId, privateKey) {
  const keyStore = new keyStores.InMemoryKeyStore();
  await keyStore.setKey(NETWORK, accountId, KeyPair.fromString(privateKey));
  const near = await connect({
    networkId: NETWORK,
    keyStore,
    nodeUrl: NODE_URL,
  });
  return near.account(accountId);
}

export async function mintTicket(account, { receiverId, eventId, eventName }) {
  const result = await account.functionCall({
    contractId: CONTRACT_ID,
    methodName: "nft_mint",
    args: {
      receiver_id: receiverId,
      event_id: eventId,
      event_name: eventName,
    },
    gas: 30_000_000_000_000n,
    attachedDeposit: utils.format.parseNearAmount("0.05"),
  });
  return extract(result);
}

export async function transferTicket(account, { receiverId, tokenId }) {
  const result = await account.functionCall({
    contractId: CONTRACT_ID,
    methodName: "nft_transfer",
    args: {
      receiver_id: receiverId,
      token_id: tokenId,
      approval_id: null,
      memo: "private-tickets-transfer",
    },
    gas: 30_000_000_000_000n,
    attachedDeposit: 1n,
  });
  return extract(result);
}

function extract(result) {
  const hash = result.transaction?.hash || result.transaction_outcome?.id;
  let token = null;
  for (const outcome of result.receipts_outcome || []) {
    const logs = outcome.outcome?.logs || [];
    for (const log of logs) {
      try {
        const parsed = JSON.parse(log.replace(/^EVENT_JSON:/, ""));
        if (parsed.event === "nft_mint" && parsed.data?.[0]?.token_ids?.[0]) {
          token = parsed.data[0].token_ids[0];
        }
      } catch {
        /* ignore non-JSON logs */
      }
    }
    const status = outcome.outcome?.status?.SuccessValue;
    if (status) {
      try {
        const decoded = JSON.parse(fromBase64(status));
        if (decoded?.token_id) token = decoded.token_id;
      } catch {
        /* ignore */
      }
    }
  }
  return { hash, token, raw: result };
}
