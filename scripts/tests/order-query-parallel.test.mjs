import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadOrders(admin) {
  const output = ts.transpileModule(readFileSync("src/lib/orders/detail.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loadedModule = { exports: {} };
  vm.runInNewContext(output, {
    module: loadedModule, exports: loadedModule.exports,
    require(id) {
      if (id === "server-only") return {};
      if (id === "next/cache") return { cacheLife() {}, cacheTag() {} };
      if (id === "@/lib/supabase/admin") return { getSupabaseAdmin: () => admin };
      if (id === "@/lib/utils/search") return { normalizeSearch: (s) => s.trim().toLowerCase() };
      return createRequire(import.meta.url)(id);
    },
  });
  return loadedModule.exports.getIncomingOrders;
}

test("order items start while customers are pending; results and inputs stay intact", async () => {
  let releaseCustomers;
  const customers = new Promise((resolve) => { releaseCustomers = resolve; });
  const started = [];
  const rows = {
    orders: [{ id: "o1", customer_id: "c1", order_date: "2026-10-16", created_at: "10:00", order_number: "ORD1", status: "submitted", total_amount: "125.50", metadata: null, notes: "note", fulfillment_status: "pending" }],
    customers: [{ id: "c1", customer_code: "TYS001", name: "Shop", address: "", default_vehicle_id: "v1", sort_order: 2 }],
    vehicles: [{ id: "v1", name: "Van" }],
    order_items: [{ order_id: "o1", product_id: "p1" }, { order_id: "o1", product_id: "p1" }],
  };
  const admin = {
    from(table) {
      const chain = new Proxy({}, {
        get(_, method) {
          if (method === "then") return (resolve, reject) => {
            started.push(table);
            return (table === "customers" ? customers : Promise.resolve({ data: rows[table], error: null })).then(resolve, reject);
          };
          return () => chain;
        },
      });
      return chain;
    },
  };
  const pending = loadOrders(admin)("org1", { orderDate: "2026-10-16" });
  await new Promise((resolve) => setImmediate(resolve));
  const itemsStartedBeforeCustomersFinished = started.includes("order_items");
  releaseCustomers({ data: rows.customers, error: null });
  const result = await pending;
  assert.equal(itemsStartedBeforeCustomersFinished, true);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "o1");
  assert.equal(result[0].customerCode, "TYS001");
  assert.equal(result[0].vehicleName, "Van");
  assert.equal(result[0].productCount, 1);
  assert.equal(result[0].totalAmount, 125.5);
  assert.equal(result[0].notes, "note");
});
