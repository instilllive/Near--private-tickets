import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KEYS = path.join(ROOT, "keys");
const REC = path.join(path.dirname(fileURLToPath(import.meta.url)), "rec");
const URL = process.env.DEMO_URL || "http://127.0.0.1:5174/";

const DEVS = {
  phone: { width: 390, height: 844 },
  ipad: { width: 820, height: 1180 },
  desktop: { width: 1440, height: 900 },
};

function loadDemoAccounts() {
  const ids = JSON.parse(fs.readFileSync(path.join(KEYS, "accounts.json"), "utf8"));
  const load = (role) => {
    const raw = JSON.parse(fs.readFileSync(path.join(KEYS, `${role}.json`), "utf8"));
    const accountId = ids[role] || raw.account_id;
    const privateKey = raw.private_key || raw.secret_key;
    if (!accountId || !privateKey) throw new Error(`Missing fields for ${role}`);
    return { accountId, privateKey };
  };
  const host = load("host");
  const guest = load("guest");
  const buyer = load("buyer");
  return {
    demo: { host, guest, buyer },
    ids: { host: host.accountId, guest: guest.accountId, buyer: buyer.accountId },
  };
}

async function scrollTo(page, testId) {
  const loc = page.getByTestId(testId);
  if (await loc.count()) {
    await loc.first().scrollIntoViewIfNeeded();
  }
}

async function switchRole(page, role, ids) {
  const account = ids[role];
  await page.evaluate((r) => {
    if (!window.__PTIX_DEMO_ROLES__) throw new Error("recording wallet missing");
    window.__PTIX_DEMO_ROLES__.switchTo(r);
  }, role);
  await page.waitForFunction(
    (id) => {
      const el = document.querySelector('[data-testid="session-account"]');
      return !!(el && el.textContent && el.textContent.includes(id));
    },
    account,
    { timeout: 15000 }
  );
}

async function fillToken(page, testId, token) {
  if (!token) return;
  const box = page.getByTestId(testId);
  const current = await box.inputValue();
  if (current !== token) await box.fill(token);
}

async function run(browser, name, vp, ids, demo) {
  const dir = path.join(REC, name);
  fs.mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    recordVideo: { dir, size: { width: vp.width, height: vp.height } },
    hasTouch: name !== "desktop",
    isMobile: false,
    deviceScaleFactor: 1,
  });
  await context.addInitScript((payload) => {
    sessionStorage.setItem("ptix-near:demo-accounts:v1", JSON.stringify(payload));
    try { localStorage.removeItem("ptix-near:events:v1"); } catch { /* ignore */ }
    try { localStorage.removeItem("ptix-near:door:v1"); } catch { /* ignore */ }
  }, demo);

  const page = await context.newPage();
  const t0 = Date.now();
  const marks = {};
  const mark = (k) => {
    marks[k] = (Date.now() - t0) / 1000;
    console.log(name, k, marks[k].toFixed(2));
  };
  const wait = (ms) => page.waitForTimeout(ms);
  const txs = {};

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.getByTestId("session-bar").waitFor({ timeout: 20000 });
  await page.waitForFunction(
    (id) => {
      const el = document.querySelector('[data-testid="session-account"]');
      return !!(el && el.textContent && el.textContent.includes(id));
    },
    ids.host,
    { timeout: 20000 }
  );
  mark("ready");
  await wait(700);

  await page.getByTestId("tab-event").click();
  const nameInput = page.getByTestId("event-name");
  await nameInput.fill("");
  await nameInput.pressSequentially("NEAR Demo Night", { delay: 40 });
  await wait(250);
  await page.getByTestId("save-event").click();
  mark("event_saved");
  await wait(600);

  const guestInput = page.getByTestId("guest-account");
  await guestInput.click();
  await guestInput.fill("");
  await guestInput.pressSequentially(ids.guest, { delay: 20 });
  await wait(200);
  mark("mint_fields");
  const capInput = page.getByTestId("resale-cap");
  await capInput.fill("");
  await capInput.pressSequentially("1", { delay: 80 });
  await wait(200);
  const royaltyInput = page.getByTestId("royalty-bps");
  await royaltyInput.fill("");
  await royaltyInput.pressSequentially("5", { delay: 80 });
  await scrollTo(page, "mint-btn");
  await wait(400);
  mark("mint_click");
  await page.getByTestId("mint-btn").click();
  const mintResult = page.getByTestId("mint-result");
  await mintResult.waitFor({ timeout: 120000 });
  await scrollTo(page, "mint-result");
  const mintText = await mintResult.innerText();
  const mintLink = await mintResult.locator("a").getAttribute("href").catch(() => null);
  txs.mintText = mintText;
  txs.mintExplorer = mintLink;
  const tokenMatch = mintText.match(/ticket-\d+/);
  txs.token = tokenMatch ? tokenMatch[0] : null;
  console.log(name, "token", txs.token, "mint", txs.mintExplorer);
  await wait(1600);

  await page.getByTestId("tab-ticket").click();
  await wait(400);
  await fillToken(page, "token-id", txs.token);
  await page.getByTestId("show-owner").click();
  await page.getByTestId("current-owner").waitFor({ timeout: 30000 });
  const owner1 = (await page.getByTestId("current-owner").innerText()).trim();
  txs.ownerAfterMint = owner1;
  if (!owner1.includes(ids.guest)) {
    throw new Error(`${name}: expected guest owner after mint, got ${owner1}`);
  }
  await scrollTo(page, "ticket-record");
  mark("mint_done");
  await wait(2000);

  await switchRole(page, "guest", ids);
  await wait(400);
  const priceBox = page.getByTestId("list-price");
  await priceBox.click();
  await priceBox.fill("");
  await priceBox.pressSequentially("2", { delay: 80 });
  await scrollTo(page, "list-resale");
  await wait(350);
  mark("overcap_click");
  await page.getByTestId("list-resale").click();
  await page.getByTestId("list-error").waitFor({ timeout: 120000 });
  const overText = (await page.getByTestId("list-error").innerText()).trim();
  txs.overCap = overText;
  if (!/exceeds the host resale cap/i.test(overText)) {
    throw new Error(`${name}: expected over-cap rejection, got ${overText}`);
  }
  await scrollTo(page, "list-error");
  mark("overcap_shown");
  await wait(2200);

  await priceBox.fill("");
  await priceBox.pressSequentially("1", { delay: 80 });
  await wait(300);
  mark("list_click");
  await page.getByTestId("list-resale").click();
  await page.getByTestId("transfer-result").waitFor({ timeout: 120000 });
  await page.waitForFunction(
    () => {
      const rec = document.querySelector('[data-testid="ticket-record"]');
      return !!(rec && /listed at/i.test(rec.textContent || ""));
    },
    { timeout: 30000 }
  );
  txs.listExplorer = await page
    .getByTestId("transfer-result")
    .locator("a")
    .getAttribute("href")
    .catch(() => null);
  await scrollTo(page, "transfer-result");
  mark("list_done");
  await wait(1500);

  await switchRole(page, "buyer", ids);
  await wait(500);
  await scrollTo(page, "buy-resale");
  mark("buy_click");
  await page.getByTestId("buy-resale").click();
  await page.getByTestId("transfer-result").waitFor({ timeout: 120000 });
  await page.waitForFunction(
    (buyer) => {
      const el = document.querySelector('[data-testid="current-owner"]');
      const tx = document.querySelector('[data-testid="transfer-result"]');
      return !!(
        el && el.textContent && el.textContent.includes(buyer) &&
        tx && /Seller received/i.test(tx.textContent || "")
      );
    },
    ids.buyer,
    { timeout: 45000 }
  );
  txs.buyExplorer = await page
    .getByTestId("transfer-result")
    .locator("a")
    .getAttribute("href")
    .catch(() => null);
  txs.buyText = (await page.getByTestId("transfer-result").innerText()).trim();
  txs.ownerAfterBuy = (await page.getByTestId("current-owner").innerText()).trim();
  if (!txs.ownerAfterBuy.includes(ids.buyer)) {
    throw new Error(`${name}: expected buyer owner after resale, got ${txs.ownerAfterBuy}`);
  }
  await scrollTo(page, "transfer-result");
  mark("buy_done");
  await wait(2500);

  await page.getByTestId("tab-door").click();
  await wait(400);
  await fillToken(page, "door-token", txs.token);
  const doorAccount = page.getByTestId("door-account");
  await doorAccount.fill("");
  await doorAccount.pressSequentially(ids.buyer, { delay: 15 });
  await wait(300);
  mark("admit_click");
  await page.getByTestId("verify-btn").click();
  await page.getByTestId("verdict").waitFor({ timeout: 30000 });
  const admitText = (await page.getByTestId("verdict").innerText()).trim();
  txs.admit = admitText;
  if (!/^Admit/i.test(admitText)) {
    throw new Error(`${name}: expected Admit, got ${admitText}`);
  }
  await scrollTo(page, "verdict");
  mark("admit_shown");
  await wait(1800);

  await doorAccount.fill("");
  await doorAccount.pressSequentially(ids.guest, { delay: 15 });
  await wait(300);
  mark("deny_click");
  await page.getByTestId("verify-btn").click();
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="verdict"]');
      return el && /^Deny/i.test(el.textContent || "");
    },
    { timeout: 30000 }
  );
  const denyText = (await page.getByTestId("verdict").innerText()).trim();
  txs.deny = denyText;
  if (!/^Deny/i.test(denyText)) {
    throw new Error(`${name}: expected Deny, got ${denyText}`);
  }
  await scrollTo(page, "verdict");
  mark("deny_shown");
  await wait(1800);

  await switchRole(page, "host", ids);
  await wait(400);
  await doorAccount.fill("");
  await doorAccount.pressSequentially(ids.buyer, { delay: 15 });
  await wait(250);
  await page.getByTestId("verify-btn").click();
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="verdict"]');
      return el && /^Admit/i.test(el.textContent || "");
    },
    { timeout: 30000 }
  );
  await page.getByTestId("check-in-btn").waitFor({ timeout: 15000 });
  await scrollTo(page, "check-in-btn");
  await wait(300);
  mark("checkin_click");
  await page.getByTestId("check-in-btn").click();
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="verdict"]');
      const ret = document.querySelector('[data-testid="door-returning"]');
      return !!(el && /souvenir/i.test(el.textContent || "") && ret);
    },
    { timeout: 120000 }
  );
  txs.checkInExplorer = await page.locator(".ok a").last().getAttribute("href").catch(() => null);
  await scrollTo(page, "verdict");
  mark("checkin_done");
  await wait(1800);

  await page.getByTestId("tab-ticket").click();
  await wait(400);
  await fillToken(page, "token-id", txs.token);
  await page.getByTestId("show-owner").click();
  await page.getByTestId("souvenir-badge").waitFor({ timeout: 30000 });
  await page.getByTestId("returning-guest").waitFor({ timeout: 15000 });
  const souvenir = (await page.getByTestId("souvenir-badge").innerText()).trim();
  txs.souvenir = souvenir;
  if (!/Was there/i.test(souvenir)) {
    throw new Error(`${name}: expected Was there badge, got ${souvenir}`);
  }
  await scrollTo(page, "souvenir-badge");
  mark("souvenir_shown");
  await wait(2500);

  await page.evaluate(() => {
    const foot = document.querySelector(".site-footer");
    if (foot) foot.scrollIntoView({ block: "end" });
  });
  await wait(2200);
  mark("end");

  await page.screenshot({ path: path.join(dir, "end.png"), fullPage: false });
  const video = page.video();
  await context.close();
  const dest = path.join(dir, `${name}.webm`);
  await video.saveAs(dest);
  const leftovers = fs.readdirSync(dir).filter((f) => f.endsWith(".webm") && f !== `${name}.webm`);
  for (const f of leftovers) fs.unlinkSync(path.join(dir, f));
  fs.writeFileSync(path.join(dir, "marks.json"), JSON.stringify(marks, null, 2));
  fs.writeFileSync(path.join(dir, "txs.json"), JSON.stringify(txs, null, 2));
  console.log(name, "saved", dest);
}

const only = process.env.ONLY;
const { demo, ids } = loadDemoAccounts();
console.log("Accounts", ids.host, ids.guest, ids.buyer);
const browser = await chromium.launch({ headless: true });
try {
  for (const [name, vp] of Object.entries(DEVS)) {
    if (only && only !== name) continue;
    await run(browser, name, vp, ids, demo);
  }
} finally {
  await browser.close();
}
console.log("RECORD_OK");
