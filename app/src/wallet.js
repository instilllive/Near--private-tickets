import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupModal } from "@near-wallet-selector/modal-ui";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import "@near-wallet-selector/modal-ui/styles.css";
import { CONTRACT_ID, NETWORK } from "./config.js";

let selectorPromise;
let modal;

export function initSelector() {
  if (!selectorPromise) {
    selectorPromise = setupWalletSelector({
      network: NETWORK,
      modules: [setupMyNearWallet(), setupMeteorWallet()],
    }).then((selector) => {
      modal = setupModal(selector, {
        contractId: CONTRACT_ID,
        description: "Connect a NEAR testnet wallet to mint or transfer tickets.",
      });
      return selector;
    });
  }
  return selectorPromise;
}

export function openWalletModal() {
  return initSelector().then(() => {
    modal.show();
  });
}

export async function walletSignOut() {
  const selector = await initSelector();
  if (!selector.isSignedIn()) return;
  const wallet = await selector.wallet();
  await wallet.signOut();
}

export async function getWallet() {
  const selector = await initSelector();
  if (!selector.isSignedIn()) {
    throw new Error("Connect a NEAR testnet wallet first.");
  }
  return selector.wallet();
}

export function signedAccountId(accounts) {
  const list = accounts || [];
  const active = list.find((a) => a.active) || list[0];
  return active?.accountId || "";
}

export function onAccountsChanged(cb) {
  let sub = { unsubscribe() {} };
  initSelector().then((selector) => {
    cb(selector.store.getState().accounts || []);
    sub = selector.store.observable.subscribe((state) => {
      cb(state.accounts || []);
    });
  });
  return () => sub.unsubscribe();
}
