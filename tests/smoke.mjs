import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEX_NODE_MODULES ? `${process.env.CODEX_NODE_MODULES}/playwright` : "playwright");
const root = fileURLToPath(new URL("..", import.meta.url));
const mime = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const file = join(root, pathname === "/" ? "index.html" : pathname.slice(1));
    if (!file.startsWith(root)) throw new Error("Invalid path");
    response.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream" });
    response.end(await readFile(file));
  } catch { response.writeHead(404).end("Not found"); }
});
await new Promise((resolve) => server.listen(8765, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: "it-IT",
});
const page = await context.newPage();
const errors = [];
page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
page.on("pageerror", (error) => errors.push(`page: ${error.message}`));

await page.goto("http://127.0.0.1:8765/", { waitUntil: "networkidle" });
await page.locator("#start-empty").click();
await page.locator("#onboarding-modal").waitFor({ state: "hidden" });
assert.equal(await page.locator("#app").getAttribute("aria-busy"), "false");

await page.locator(".floating-add").click();
await page.locator("#transaction-amount").fill("12,34");
await page.locator("#transaction-category").selectOption("expense-2");
await page.locator("#transaction-description").fill("Test supermercato");
await page.locator("#transaction-form button[type='submit']").click();
await page.locator("#transaction-modal").waitFor({ state: "hidden" });
await page.locator("#recent-transactions").getByText("Test supermercato").waitFor();
assert.match(await page.locator("#month-expense").textContent(), /12,34/);

await page.locator('[data-nav="transactions"]').last().click();
await page.locator("#transactions-list").getByText("Test supermercato").waitFor();
await page.locator("#transactions-list .row-action[title='Modifica']").click();
await page.locator("#transaction-amount").fill("15,00");
await page.locator("#transaction-form button[type='submit']").click();
await page.locator("#transaction-modal").waitFor({ state: "hidden" });
assert.match(await page.locator("#transactions-list .transaction-amount").first().textContent(), /15,00/);

await page.locator("#filter-search").fill("inesistente");
await page.waitForTimeout(250);
assert.match(await page.locator("#transactions-result-count").textContent(), /^0 /);
await page.locator("#toggle-filters").click();
await page.locator("#reset-filters").click();

await page.locator('[data-nav="budget"]').last().click();
await page.locator("#total-budget-input").fill("100,00");
await page.locator("#total-budget-form button[type='submit']").click();
await page.getByText("Budget mensile salvato.").waitFor();
assert.match(await page.locator("#budget-overview-content").textContent(), /100,00/);

await page.locator('[data-nav="networth"]').last().click();
await page.locator("#open-snapshot").click();
await page.locator("#snapshot-form button[type='submit']").click();
await page.locator("#snapshot-modal").waitFor({ state: "hidden" });
assert.equal(await page.locator("#snapshot-list .snapshot-row").count(), 1);

await page.locator("#theme-toggle").click();
assert.ok(["light", "dark"].includes(await page.locator("html").getAttribute("data-theme")));

const downloadPromise = page.waitForEvent("download");
await page.locator('[data-nav="settings"]').last().click();
await page.locator("#export-json").click();
const download = await downloadPromise;
assert.match(download.suggestedFilename(), /^bremen-budget-backup-\d{4}-\d{2}-\d{2}\.json$/);
const backupPath = await download.path();
const downloadedBackup = JSON.parse(await readFile(backupPath, "utf8"));
assert.equal(downloadedBackup.schemaVersion, 1);
assert.equal(downloadedBackup.transactions.length, 1);
await page.locator("#import-json-file").setInputFiles(backupPath);
await page.locator("#import-modal").waitFor({ state: "visible" });
assert.match(await page.locator("#import-summary").textContent(), /1 movimenti/);
await page.locator("#confirm-import").click();
await page.locator("#import-modal").waitFor({ state: "hidden" });

const csvDownloadPromise = page.waitForEvent("download");
await page.locator("#export-csv").click();
const csvDownload = await csvDownloadPromise;
const csv = await readFile(await csvDownload.path(), "utf8");
assert.ok(csv.startsWith("\uFEFF\"Data\";\"Tipo\""));
assert.match(csv, /\"15,00\"/);

await page.reload({ waitUntil: "networkidle" });
await page.locator('[data-nav="transactions"]').last().click();
await page.locator("#transactions-list").getByText("Test supermercato").waitFor();
const serviceWorkerControlled = await page.evaluate(() => Boolean(navigator.serviceWorker?.controller));
assert.equal(serviceWorkerControlled, true);
await page.locator('[data-nav="dashboard"]').last().click();
const audit = await page.evaluate(() => {
  const ids = [...document.querySelectorAll("[id]")].map((node) => node.id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const visible = (node) => node.getClientRects().length > 0;
  const unlabeledControls = [...document.querySelectorAll("input:not([type='hidden']), select, textarea")].filter(visible).filter((node) => !node.closest("label") && !document.querySelector(`label[for='${node.id}']`) && !node.getAttribute("aria-label") && !node.getAttribute("aria-labelledby")).map((node) => node.id || node.outerHTML.slice(0, 40));
  const unnamedButtons = [...document.querySelectorAll("button")].filter(visible).filter((node) => !node.textContent.trim() && !node.getAttribute("aria-label") && !node.title).length;
  return { duplicateIds, unlabeledControls, unnamedButtons, overflow: document.documentElement.scrollWidth - innerWidth };
});
assert.deepEqual(audit.duplicateIds, []);
assert.deepEqual(audit.unlabeledControls, []);
assert.equal(audit.unnamedButtons, 0);
assert.ok(audit.overflow <= 1, `Horizontal overflow: ${audit.overflow}px`);
if (process.env.SCREENSHOT_PATH) await page.screenshot({ path: process.env.SCREENSHOT_PATH, fullPage: true });
await context.setOffline(true);
await page.reload({ waitUntil: "domcontentloaded" });
await page.locator(".brand").waitFor();
assert.equal(await page.locator("#app").getAttribute("aria-busy"), "false");
await context.setOffline(false);
assert.deepEqual(errors, []);

await context.close();
await browser.close();
await new Promise((resolve) => server.close(resolve));
console.log("Mobile smoke test: OK");
