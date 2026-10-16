import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { compareCustomerOrder } from "../../src/lib/settings/customer-order.ts";

const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true };
const loadedModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync("src/app/(workspace)/orders/incoming/incoming-order-print-actions.tsx", "utf8"), { compilerOptions }).outputText, {
  module: loadedModule, exports: loadedModule.exports,
  require(id) {
    if (id === "next/dynamic") return () => () => null;
    if (id === "@/lib/settings/customer-order") return { compareCustomerOrder };
    if (id.startsWith("@/")) return {};
    return createRequire(import.meta.url)(id);
  },
});
const { buildIncomingOrderSummary, IncomingOrderPrintActions } = loadedModule.exports;
const originalBody = readFileSync("scripts/tests/fixtures/incoming-order-summary-before.txt", "utf8");
const original = vm.runInNewContext(ts.transpileModule(`(function(rows, filteredPrintOrders, products) {
  const orderSummaryItemsResult = { data: rows };
  const productImageById = new Map(products.map(product => [product.id, product.imageUrl ?? null]));
  const formatDisplayDate = value => { const [y,m,d] = value.split("-"); return !y || !m || !d ? value : d + "/" + m + "/" + (parseInt(y,10)+543); };
  ${originalBody}
  return { summaryProducts, summaryStores };
})`, { compilerOptions }).outputText, { compareCustomerOrder });

test("streamed print summaries preserve the previous grouping, totals, ordering and images", () => {
  const base = { customerId: "c1", customerCode: "TYS002", customerName: "Shop", vehicleId: "v1", vehicleName: "Van", orderDate: "2026-10-16" };
  const orders = [
    { ...base, id: "o1" }, { ...base, id: "o2" },
    { ...base, id: "o3", vehicleId: null, vehicleName: null, orderDate: "2026-10-15" },
    { ...base, id: "o4", customerId: "c2", customerCode: "TYS001" },
  ];
  const product = { name: "Noodle", sku: "SKU1" };
  const rows = [
    { order_id: "o1", product_id: "p1", quantity: "0.5", sale_unit_label: " ถุง ", products: product },
    { order_id: "o2", product_id: "p1", quantity: 2, sale_unit_label: "ถุง", products: product },
    { order_id: "o2", product_id: "p2", quantity: 1, sale_unit_label: "", products: { name: "Other", sku: "SKU2" } },
    { order_id: "o3", product_id: "p1", quantity: 3, sale_unit_label: "ถุง", products: product },
    { order_id: "o4", product_id: "deleted", quantity: 1, sale_unit_label: "ถุง", products: null },
  ];
  const products = [{ id: "p1", imageUrl: "/image.png" }];
  const actual = buildIncomingOrderSummary(rows, orders, products);
  assert.equal(JSON.stringify(actual), JSON.stringify(original(rows, orders, products)));
  assert.equal(actual.summaryProducts.find(p => p.vehicleId === "v1" && p.sku === "SKU1").quantity, 2.5);
  assert.equal(actual.summaryStores.length, 3);
  assert.equal(JSON.stringify(buildIncomingOrderSummary([], [], [])), '{"summaryProducts":[],"summaryStores":[]}');
});

test("print summary failures remain errors instead of producing incomplete print data", async () => {
  await assert.rejects(IncomingOrderPrintActions({ summaryItems: Promise.resolve({ data: [], error: { message: "query failed" } }) }), /query failed/);
});
