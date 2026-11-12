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
  await page.getByTestId("session-bar").waitFor({ timeout: 15000 });
  mark("ready");
  await wait(800);

  // Event
  await page.getByTestId("tab-event").click();
  const nameInput = page.getByTestId("event-name");
  await nameInput.fill("");
  await nameInput.pressSequentially("NEAR Demo Night", { delay: 40 });
  await wait(300);
  await page.getByTestId("save-event").click();
  mark("event_saved");
  await wait(700);
  const guestInput = page.getByTestId("guest-account");
  await guestInput.click();
  await guestInput.fill("");
  await guestInput.pressSequentially(ids.guest, { delay: 25 });
  await wait(400);
  mark("mint_click");
  await page.getByTestId("mint-btn").click();
  const mintResult = page.getByTestId("mint-result");
  await mintResult.waitFor({ timeout: 120000 });
  mark("mint_done");
  const mintText = await mintResult.innerText();
  const mintLink = await mintResult.locator("a").getAttribute("href").catch(() => null);
  txs.mintText = mintText;
  txs.mintExplorer = mintLink;
  const tokenMatch = mintText.match(/ticket-\d+/);
  txs.token = tokenMatch ? tokenMatch[0] : null;
  console.log(name, "token", txs.token, "mint", txs.mintExplorer);
  await wait(2500);

  // Ticket / owner
  await page.getByTestId("tab-ticket").click();
  await wait(500);
  if (txs.token) {
    const tokenBox = page.getByTestId("token-id");
    const current = await tokenBox.inputValue();
    if (current !== txs.token) await tokenBox.fill(txs.token);
  }
  mark("owner_click");
  await page.getByTestId("show-owner").click();
  await page.getByTestId("current-owner").waitFor({ timeout: 30000 });
  const owner1 = (await page.getByTestId("current-owner").innerText()).trim();
  txs.ownerAfterMint = owner1;
  if (!owner1.includes(ids.guest)) {
    throw new Error(`${name}: expected guest owner, got ${owner1}`);
  }
  mark("owner_shown");
  await wait(2500);

  // Switch to guest and transfer
  await page.getByTestId("role-guest").click();
  await page.getByTestId("session-account").waitFor();
  await wait(600);
  const recv = page.getByTestId("receiver");
  await recv.click();
  await recv.fill("");
  await recv.pressSequentially(ids.buyer, { delay: 25 });
  await wait(400);
  mark("transfer_click");
  await page.getByTestId("transfer-btn").click();
  await page.getByTestId("transfer-result").waitFor({ timeout: 120000 });
  await page.getByTestId("show-owner").click();
  await page.waitForFunction(
    (buyer) => {
      const el = document.querySelector('[data-testid="current-owner"]');
      return !!(el && el.textContent && el.textContent.includes(buyer));
    },
    ids.buyer,
    { timeout: 30000 }
  );
  mark("transfer_done");
  txs.transferExplorer = await page
    .getByTestId("transfer-result")
    .locator("a")
    .getAttribute("href")
    .catch(() => null);
  const owner2 = (await page.getByTestId("current-owner").innerText()).trim();
  txs.ownerAfterTransfer = owner2;
  if (!owner2.includes(ids.buyer)) {
    throw new Error(`${name}: expected buyer owner, got ${owner2}`);
  }
  console.log(name, "transfer", txs.transferExplorer, "owner", owner2);
  await wait(2500);

  // Door: admit buyer
  await page.getByTestId("tab-door").click();
  await wait(400);
  await page.getByTestId("role-buyer").click();
  await wait(500);
  if (txs.token) {
    const dt = page.getByTestId("door-token");
    if ((await dt.inputValue()) !== txs.token) await dt.fill(txs.token);
  }
  mark("admit_click");
  await page.getByTestId("verify-btn").click();
  await page.getByTestId("verdict").waitFor({ timeout: 30000 });
  const admitText = (await page.getByTestId("verdict").innerText()).trim();
  txs.admit = admitText;
  if (!/^Admit/i.test(admitText)) {
    throw new Error(`${name}: expected Admit, got ${admitText}`);
  }
  mark("admit_shown");
  await wait(2800);

  // Door: deny previous owner
  await page.getByTestId("door-account").fill(ids.guest);
  await wait(400);
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
  mark("deny_shown");
  await wait(4000);
  mark("end");

  await page.screenshot({ path: path.join(dir, "end.png") });
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
