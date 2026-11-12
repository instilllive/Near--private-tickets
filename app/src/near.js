import { utils, providers } from "near-api-js";
import { CONTRACT_ID, NETWORK, NODE_URL } from "./config.js";
import { getWallet } from "./wallet.js";

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

export function formatNear(yocto, digits = 4) {
  if (yocto == null || yocto === "") return "—";
  return utils.format.formatNearAmount(String(yocto), digits);
}

export function parseNear(amount) {
  return utils.format.parseNearAmount(String(amount));
}

export async function mintTicket({ receiverId, eventId, eventName, maxResalePrice, royaltyBps }) {
  const wallet = await getWallet();
  const args = {
    receiver_id: receiverId,
    event_id: eventId,
    event_name: eventName,
  };
  if (maxResalePrice) args.max_resale_price = maxResalePrice;
  if (royaltyBps != null && royaltyBps !== "") args.royalty_bps = Number(royaltyBps);
  const result = await wallet.signAndSendTransaction({
    receiverId: CONTRACT_ID,
    actions: [
      {
        type: "FunctionCall",
        params: {
          methodName: "nft_mint",
          args,
          gas: "30000000000000",
          deposit: utils.format.parseNearAmount("0.05"),
        },
      },
    ],
  });
  return extract(result);
}

export async function canEnter(tokenId, accountId) {
  return view("can_enter", { token_id: tokenId, account_id: accountId });
}

export async function hasAttended(accountId, eventId) {
  return view("has_attended", { account_id: accountId, event_id: eventId });
}

export async function listResale({ tokenId, priceYocto }) {
  const wallet = await getWallet();
  const result = await wallet.signAndSendTransaction({
    receiverId: CONTRACT_ID,
    actions: [
      {
        type: "FunctionCall",
        params: {
          methodName: "list_resale",
          args: { token_id: tokenId, price: priceYocto },
          gas: "30000000000000",
          deposit: "0",
        },
      },
    ],
  });
  return extract(result);
}

export async function cancelResale({ tokenId }) {
  const wallet = await getWallet();
  const result = await wallet.signAndSendTransaction({
    receiverId: CONTRACT_ID,
    actions: [
      {
        type: "FunctionCall",
        params: {
          methodName: "cancel_resale",
          args: { token_id: tokenId },
          gas: "30000000000000",
          deposit: "0",
        },
      },
    ],
  });
  return extract(result);
}

export async function buyResale({ tokenId, priceYocto }) {
  const wallet = await getWallet();
  const result = await wallet.signAndSendTransaction({
    receiverId: CONTRACT_ID,
    actions: [
      {
        type: "FunctionCall",
        params: {
          methodName: "buy_resale",
          args: { token_id: tokenId },
          gas: "80000000000000",
          deposit: String(priceYocto),
        },
      },
    ],
  });
  return extract(result);
}

export async function checkIn({ tokenId }) {
  const wallet = await getWallet();
  const result = await wallet.signAndSendTransaction({
    receiverId: CONTRACT_ID,
    actions: [
      {
        type: "FunctionCall",
        params: {
          methodName: "check_in",
          args: { token_id: tokenId },
          gas: "30000000000000",
          deposit: "0",
        },
      },
    ],
  });
  return extract(result);
}

export async function transferTicket({ receiverId, tokenId }) {
  const wallet = await getWallet();
  const result = await wallet.signAndSendTransaction({
    receiverId: CONTRACT_ID,
    actions: [
      {
        type: "FunctionCall",
        params: {
          methodName: "nft_transfer",
          args: {
            receiver_id: receiverId,
            token_id: tokenId,
            approval_id: null,
            memo: "private-tickets-transfer",
          },
          gas: "30000000000000",
          deposit: "1",
        },
      },
    ],
  });
  return extract(result);
}

function extract(result) {
  const hash =
    result?.transaction?.hash ||
    result?.transaction_outcome?.id ||
    result?.transactionHash ||
    null;
  let token = null;
  const outcomes = result?.receipts_outcome || [];
  for (const outcome of outcomes) {
    for (const log of outcome.outcome?.logs || []) {
      const body = String(log).startsWith("EVENT_JSON:") ? String(log).slice(11) : log;
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
        const decoded = JSON.parse(fromBase64(status));
        if (decoded?.token_id) token = decoded.token_id;
      } catch {
        /* ignore */
      }
    }
  }
  return { hash, token, raw: result };
}
