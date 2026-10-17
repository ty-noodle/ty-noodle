// Run with an installed Playwright module path as the optional first argument.
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2] ?? "playwright");
const { webpack } = require("next/dist/compiled/webpack/webpack");
const root = fileURLToPath(new URL("../../", import.meta.url));
const fixtures = fileURLToPath(new URL("./fixtures/order-refresh/", import.meta.url));
const output = await mkdtemp(join(tmpdir(), "ty-order-refresh-"));
const loader = join(output, "loader.cjs");
await writeFile(loader, `module.exports=s=>require(${JSON.stringify(require.resolve("typescript"))}).transpileModule(s,{compilerOptions:{target:7,module:99,jsx:4,esModuleInterop:true}}).outputText;`);
const stub = join(fixtures, "stubs.jsx");
const aliases = Object.fromEntries([
  "next/navigation", "@/app/(workspace)/orders/incoming/actions",
  "@/app/(workspace)/orders/incoming/load-more-actions",
  ...["incoming-order-modal", "desktop-order-detail", "incoming-order-date-button", "incoming-order-vehicle-select", "order-delivery-action-button"].map((name) => `@/components/orders/${name}`),
].map((name) => [`${name}$`, stub]));
await new Promise((resolve, reject) => webpack({
  mode: "development", devtool: false, context: root, entry: join(fixtures, "entry.jsx"),
  output: { path: output, filename: "bundle.js" },
  resolve: { extensions: [".tsx", ".ts", ".jsx", ".js"], alias: { ...aliases, "@": join(root, "src") } },
  module: { rules: [{ test: /\.[jt]sx?$/, exclude: /node_modules/, use: loader }] },
}, (error, stats) => {
  if (error || stats.hasErrors()) reject(error ?? new Error(stats.toString({ all: false, errors: true })));
  else resolve();
}));

const bundle = await readFile(join(output, "bundle.js"));
const server = http.createServer((request, response) => {
  response.setHeader("Content-Type", request.url === "/bundle.js" ? "text/javascript" : "text/html; charset=utf-8");
  response.end(request.url === "/bundle.js" ? bundle : '<html><head><meta charset="utf-8"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole("button", { name: "แสดงรายละเอียดออเดอร์" }).waitFor();
  await page.evaluate(() => window.qaIntersect());
  await page.waitForFunction(() => document.querySelector("tbody").textContent.includes("Second"));
  await page.getByRole("button", { name: "แสดงรายละเอียดออเดอร์" }).first().click();
  await page.locator("#qa-detail").waitFor();

  // Authoritative refresh must work even when the one-time save event was missed.
  await page.evaluate(() => window.qaRefresh(250));
  await page.waitForFunction(() => document.querySelector("tbody").textContent.includes("250.00"));
  assert.match(await page.locator("tbody").innerText(), /Second/);
  await page.evaluate(() => window.qaSave(250));
  await page.waitForFunction(() => JSON.parse(document.querySelector("#qa-detail")?.textContent ?? "null")?.totalAmount === 250);
  await page.getByRole("button", { name: "ซ่อนรายละเอียดออเดอร์" }).first().click();
  await page.getByRole("button", { name: "แสดงรายละเอียดออเดอร์" }).first().click();
  assert.equal(JSON.parse(await page.locator("#qa-detail").textContent()).items[0].quantity, 2.5);

  // An old expanded-detail prop must not restore old items after a newer save.
  await page.evaluate(() => window.qaSetInitialDetail());
  await page.waitForFunction(() => document.querySelector("#qa-detail") !== null);
  await page.evaluate(() => window.qaSave(300));
  await page.waitForFunction(() => JSON.parse(document.querySelector("#qa-detail")?.textContent ?? "null")?.totalAmount === 300);
  await page.getByRole("button", { name: "ซ่อนรายละเอียดออเดอร์" }).first().click();
  await page.getByRole("button", { name: "แสดงรายละเอียดออเดอร์" }).first().click();
  assert.equal(JSON.parse(await page.locator("#qa-detail").textContent()).totalAmount, 300);

  await page.evaluate(() => window.qaSetInitialDetail());
  await page.waitForFunction(() => document.querySelector("tbody").textContent.includes("300.00"));

  // A response started before a save must not overwrite the refreshed detail.
  await page.evaluate(() => { window.qaDeferNextFetch = true; window.qaSave(350); });
  await page.waitForFunction(() => typeof window.qaResolveOldFetch === "function");
  await page.evaluate(() => window.qaSave(400));
  await page.waitForFunction(() => JSON.parse(document.querySelector("#qa-detail")?.textContent ?? "null")?.totalAmount === 400);
  await page.evaluate(() => window.qaResolveOldFetch({ detail: { ...window.qaDetail, totalAmount: 350 } }));
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(JSON.parse(await page.locator("#qa-detail").textContent()).totalAmount, 400);

  await page.evaluate(() => {
    window.qaResolveOldFetch = null;
    window.qaDeferNextFetch = true;
    window.qaSave(425);
  });
  await page.waitForFunction(() => typeof window.qaResolveOldFetch === "function");
  await page.evaluate(() => window.qaSetInitialDetail());
  await page.waitForFunction(() => JSON.parse(document.querySelector("#qa-detail")?.textContent ?? "null")?.totalAmount === 425);
  assert.equal(await page.getByRole("button", { name: "ซ่อนรายละเอียดออเดอร์" }).first().isEnabled(), true);
  await page.evaluate(() => window.qaResolveOldFetch({ detail: { ...window.qaDetail, totalAmount: 400 } }));
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(JSON.parse(await page.locator("#qa-detail").textContent()).totalAmount, 425);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.qaSave(450));
  await page.waitForFunction(() => document.querySelector("article").textContent.includes("450.00"));
  assert.deepEqual(errors, []);
  await page.screenshot({ path: join(output, "order-refresh.png"), fullPage: true });
  console.log("PASS: refreshed rows, pagination, edited/reopened details, late responses, mobile totals; no runtime errors.");
} finally {
  if (browser) await browser.close();
  server.close();
}
