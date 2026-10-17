import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadSync(billingResult = { success: true }) {
  const loaded = { exports: {} };
  const calls = [];
  vm.runInNewContext(ts.transpileModule(readFileSync("src/lib/orders/sync-delivery-note.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, {
    module: loaded, exports: loaded.exports,
    require(id) {
      if (id === "server-only") return {};
      if (id.endsWith("/billing/actions")) return { syncBillingSnapshotsForDeliveryNumbers: async (input) => { calls.push(input); return billingResult; } };
      return { revalidateDashboardPages() {}, revalidateReportPages() {} };
    },
  });
  return { sync: loaded.exports.syncDeliveryNoteForOrder, calls };
}

function adminWith(result, order = { customer_id: "customer" }) {
  const calls = [];
  const chain = { select() { return chain; }, eq() { return chain; }, async single() { return { data: order, error: null }; } };
  return { calls, from() { return chain; }, async rpc(name, args) { calls.push({ name, args }); return result; } };
}

test("sync delegates one atomic rebuild with loss choices and preserves billing synchronization", async () => {
  const admin = adminWith({ data: "DN1", error: null });
  const { sync, calls } = loadSync();
  const result = await sync(admin, { orderId: "order", organizationId: "org", userId: null, lossInBaseUnitByItemId: new Map([["item", 5]]) });
  assert.equal(result.deliveryNumber, "DN1");
  assert.equal(admin.calls.length, 1);
  assert.equal(admin.calls[0].name, "sync_order_delivery_note_atomic");
  assert.equal(JSON.stringify(admin.calls[0].args), JSON.stringify({ p_organization_id: "org", p_order_id: "order", p_user_id: null, p_loss_by_item: { item: 5 } }));
  assert.equal(calls[0].customerId, "customer");
  assert.equal(calls[0].deliveryNumbers[0], "DN1");
});

test("failed atomic rebuild stops billing and returns its error", async () => {
  const admin = adminWith({ data: null, error: { message: "rollback" } });
  const { sync, calls } = loadSync();
  const result = await sync(admin, { orderId: "order", organizationId: "org", userId: "user" });
  assert.match(result.error, /rollback/);
  assert.equal(calls.length, 0);
});

test("missing order never invokes the rebuild", async () => {
  const admin = adminWith({ data: null, error: null }, null);
  const { sync } = loadSync();
  assert.ok((await sync(admin, { orderId: "order", organizationId: "org", userId: "user" })).error);
  assert.equal(admin.calls.length, 0);
});
