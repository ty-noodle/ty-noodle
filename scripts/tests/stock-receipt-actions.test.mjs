import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../../src/app/(workspace)/settings/stock/actions.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });

function loadActions(generateError = null) {
  const calls = [];
  const uploads = [];
  const admin = {
    async rpc(name, args) {
      calls.push({ name, args });
      return name === "generate_receipt_number"
        ? { data: generateError ? null : "RCV26110502", error: generateError }
        : { data: null, error: null };
    },
  };
  const bucket = {
    async upload(path, _buffer, options) { uploads.push({ path, options }); return { error: null }; },
    getPublicUrl: (path) => ({ data: { publicUrl: `https://example.test/${path}` } }),
  };
  const modules = {
    "next/cache": { revalidatePath() {}, revalidateTag() {}, updateTag() {} },
    "@/lib/auth/authorization": { requireAppRole: async () => ({ organizationId: "org", userId: "user" }) },
    "@/lib/supabase/admin": { getSupabaseAdmin: () => admin },
    "@/lib/supabase/action": { createActionClient: async () => ({ storage: { from: () => bucket } }) },
    "@/lib/stock/admin": {},
  };
  const loadedModule = { exports: {} };
  new Function("require", "module", "exports", outputText)((name) => {
    assert.ok(name in modules, `Unexpected dependency: ${name}`);
    return modules[name];
  }, loadedModule, loadedModule.exports);
  return { actions: loadedModule.exports, calls, uploads };
}

function receiptForm() {
  const form = new FormData();
  form.set("itemsJson", JSON.stringify([{ productId: "product", quantityReceived: 1, unit: "ถุง", unitCost: 10 }]));
  form.set("receivedAt", "2026-11-04T18:00:00Z"); // Nov 5 in Bangkok.
  return form;
}

test("receipt numbering uses the selected Bangkok date and image uploads cannot overwrite an existing bill", async () => {
  const { actions, calls, uploads } = loadActions();
  const form = receiptForm();
  form.set("receiptImage", new File(["image"], "receipt.jpg", { type: "image/jpeg" }));
  const result = await actions.receiveStockAction({}, form);
  assert.equal(result.status, "success");
  assert.equal(calls[0].args.p_date, "2026-11-05");
  assert.equal(calls[1].args.p_receipt_number, "RCV26110502");
  assert.equal(calls[1].args.p_received_at, "2026-11-04T18:00:00.000Z");
  assert.match(uploads[0].path, /^org\/[0-9a-f-]{36}\.jpg$/);
  assert.equal(uploads[0].options.upsert, false);
});

test("normal and emergency receipts stop when number allocation fails", async () => {
  const { actions, calls, uploads } = loadActions({ message: "Database unavailable" });
  const normal = await actions.receiveStockAction({}, receiptForm());
  const emergency = await actions.bulkReceiveStockAction([{ productId: "product", quantityReceived: 1, unit: "ถุง", unitRatio: 1 }]);
  assert.equal(normal.status, "error");
  assert.equal(emergency.success, false);
  assert.equal(calls.filter(({ name }) => name === "create_inventory_receipt").length, 0);
  assert.equal(uploads.length, 0);
});

test("an invalid receipt date is rejected before allocating a number", async () => {
  const { actions, calls } = loadActions();
  const form = receiptForm();
  form.set("receivedAt", "invalid");
  assert.equal((await actions.receiveStockAction({}, form)).status, "error");
  assert.equal(calls.length, 0);
});
