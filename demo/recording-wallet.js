// Recording-only wallet. Used by demo/vite.recording.config.js so Playwright
// can sign testnet transactions without a browser wallet popup.
// Keys are injected into sessionStorage by the recorder and are never bundled.
import { connect, keyStores, KeyPair } from "near-api-js";
import { CONTRACT_ID, NETWORK, NODE_URL } from "../app/src/config.js";

const STORAGE = "ptix-near:demo-accounts:v1";

function loadDemo() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE) || "null");
  } catch {
    return null;
  }
}

function panicMessage(err) {
  const msg = err?.message || String(err);
  if (/exceeds the host resale cap/i.test(msg)) {
    return "Listing rejected: the price exceeds the host resale cap.";
  }
  if (/souvenir|already used/i.test(msg)) {
    return "This ticket is a souvenir now and cannot be resold.";
  }
  const m =
    msg.match(/panic_msg(?:":\s*"|:\s*")([^"]+)/i) ||
    msg.match(/GuestPanic\s*\{\s*panic_msg:\s*"([^"]+)"/i);
  return m ? m[1] : msg;
}

const listeners = new Set();
let currentRole = "host";
let nearPromise = null;
const demo = loadDemo();

function ids() {
  return {
    host: demo?.host?.accountId || "",
    guest: demo?.guest?.accountId || "",
    buyer: demo?.buyer?.accountId || "",
  };
}

function currentId() {
  return demo?.[currentRole]?.accountId || "";
}

function accountsState() {
  const id = currentId();
  return id ? [{ accountId: id, active: true }] : [];
}

function emit() {
  const list = accountsState();
  for (const cb of listeners) cb(list);
}

async function ensureNear() {
  if (!demo) throw new Error("Recording accounts were not injected.");
  if (!nearPromise) {
    nearPromise = (async () => {
      const keyStore = new keyStores.InMemoryKeyStore();
      for (const role of ["host", "guest", "buyer"]) {
        const row = demo[role];
        if (!row?.accountId || !row?.privateKey) continue;
        await keyStore.setKey(NETWORK, row.accountId, KeyPair.fromString(row.privateKey));
      }
      return connect({ networkId: NETWORK, keyStore, nodeUrl: NODE_URL });
    })();
  }
  return nearPromise;
}

function switchTo(role) {
  if (!demo?.[role]) throw new Error(`Unknown demo role: ${role}`);
  currentRole = role;
  emit();
}

if (typeof window !== "undefined" && demo) {
  window.__PTIX_DEMO_ROLES__ = { ids: ids(), switchTo };
}

export function initSelector() {
  return Promise.resolve({
    isSignedIn: () => !!currentId(),
    store: {
      getState: () => ({ accounts: accountsState() }),
      observable: { subscribe() { return { unsubscribe() {} }; } },
    },
    async wallet() {
      return getWallet();
    },
  });
}

export function openWalletModal() {
  if (!demo) return Promise.reject(new Error("Connect a NEAR testnet wallet first."));
  if (!currentId()) switchTo("host");
  emit();
  return Promise.resolve();
}

export async function walletSignOut() {
  currentRole = "";
  emit();
}

export async function getWallet() {
  if (!currentId()) throw new Error("Connect a NEAR testnet wallet first.");
  const near = await ensureNear();
  const account = await near.account(currentId());
  return {
    signAndSendTransaction: async ({ receiverId, actions }) => {
      const action = actions?.[0];
      if (!action || action.type !== "FunctionCall") {
        throw new Error("Recording wallet only signs function calls.");
      }
      const { methodName, args, gas, deposit } = action.params;
      try {
        return await account.functionCall({
          contractId: receiverId || CONTRACT_ID,
          methodName,
          args,
          gas: BigInt(gas),
          attachedDeposit: BigInt(deposit || "0"),
        });
      } catch (err) {
        throw new Error(panicMessage(err));
      }
    },
  };
}

export function signedAccountId(accounts) {
  const list = accounts || [];
  const active = list.find((a) => a.active) || list[0];
  return active?.accountId || "";
}

export function onAccountsChanged(cb) {
  listeners.add(cb);
  cb(accountsState());
  return () => listeners.delete(cb);
}
