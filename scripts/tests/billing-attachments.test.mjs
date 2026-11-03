import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

function load(path, imports = {}) {
  const loadedModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    module: loadedModule, exports: loadedModule.exports,
    require: id => id in imports ? imports[id] : createRequire(import.meta.url)(id),
  });
  return loadedModule.exports;
}

const { paginateAttachmentNotes } = load("src/lib/billing/attachment-pagination.ts");
const measured = count => ({ baseHeight: 20, itemHeights: Array(count).fill(10) });
const plain = value => JSON.parse(JSON.stringify(value));

test("eight short notes fit in four left/right pairs", () => {
  const pages = paginateAttachmentNotes(Array.from({ length: 8 }, () => measured(3)), 220);
  assert.equal(pages.length, 1);
  assert.deepEqual(plain(pages[0].map(pair => pair.map(part => part?.noteIndex))), [[0, 1], [2, 3], [4, 5], [6, 7]]);
});

test("attachment printing is an in-page button rather than a new-tab link", () => {
  const { BillingAttachmentPrintButton } = load("src/app/(workspace)/billing/billing-attachment-print-button.tsx");
  const html = renderToStaticMarkup(React.createElement(BillingAttachmentPrintButton, { href: "/billing/attachments?record=b1&autoprint=1" }));
  assert.match(html, /<button/);
  assert.doesNotMatch(html, /target="_blank"|เปิดแท็บใหม่/);
});

test("12 items stay together and a 5-item neighbor does not advance the next pair early", () => {
  const pages = paginateAttachmentNotes([measured(12), measured(5), measured(4), measured(4)], 180);
  assert.equal(pages.length, 2);
  assert.deepEqual(plain(pages[0][0].map(part => [part.start, part.end])), [[0, 12], [0, 5]]);
  assert.equal(pages[1][0][0].noteIndex, 2);
});

test("oversized notes continue only at measured item boundaries without losing or duplicating rows", () => {
  const notes = [measured(45), measured(5), measured(3)];
  notes[0].itemHeights[10] = 35;
  const pages = paginateAttachmentNotes(notes, 150);
  for (const [index, note] of notes.entries()) {
    const parts = pages.flat(2).filter(part => part?.noteIndex === index);
    assert.deepEqual(plain(parts.flatMap(part => Array.from({ length: part.end - part.start }, (_, i) => part.start + i))), Array.from({ length: note.itemHeights.length }, (_, i) => i));
    assert.equal(parts.at(-1).isLastPart, true);
    for (const part of parts) {
      assert.ok(note.baseHeight + note.itemHeights.slice(part.start, part.end).reduce((a, b) => a + b, 0) <= 150);
    }
  }
  assert.equal(pages[1][0][1], null);
});

function loaderFixture({ missing = false, changed = false } = {}) {
  const calls = [];
  const note = number => ({
    deliveryNumber: number, deliveryDate: "2026-10-01", totalAmount: 20,
    customer: { code: "TYS001", name: "ร้านตัวอย่าง", address: "กรุงเทพฯ" },
    items: [{ lineTotal: changed ? 30 : 20 }],
  });
  const record = { customer_id: "c1", billing_number: "BL001", from_date: "2026-10-01", to_date: "2026-10-07", snapshot_rows: [{ deliveryNumber: "DN1", totalAmount: 20 }] };
  const db = { from(table) {
    const query = { then(resolve) {
      resolve({ data: table === "billing_records" ? record : missing ? [] : [{ id: "id1", customer_id: "c1", delivery_number: "DN1" }], error: null });
    } };
    for (const method of ["select", "eq", "in", "gte", "lte", "order", "range", "maybeSingle"]) {
      query[method] = (...args) => { calls.push([table, method, ...args]); return query; };
    }
    return query;
  } };
  const { getBillingAttachments } = load("src/lib/billing/attachments.ts", {
    "server-only": {}, "@/lib/supabase/admin": { getSupabaseAdmin: () => db },
    "@/lib/delivery/print": { getDeliveryNotePrintData: async () => note("DN1") },
  });
  return { getBillingAttachments, calls };
}

test("history uses persisted snapshot membership and scopes both reads to the organization", async () => {
  const { getBillingAttachments, calls } = loaderFixture();
  const result = await getBillingAttachments("org1", { record: "bill-id", customers: "other", deliveries: "DN-new" });
  assert.equal(result[0].billingNumber, "BL001");
  assert.deepEqual(plain(calls.find(call => call[0] === "delivery_notes" && call[1] === "in" && call[2] === "delivery_number")[3]), ["DN1"]);
  for (const table of ["billing_records", "delivery_notes"]) {
    assert.ok(calls.some(call => call[0] === table && call[1] === "eq" && call[2] === "organization_id" && call[3] === "org1"));
  }
});

test("missing or changed historical delivery notes cannot silently produce a partial or incorrect attachment", async () => {
  await assert.rejects(loaderFixture({ missing: true }).getBillingAttachments("org1", { record: "bill-id" }), /ไม่ครบ|ไม่พบ/);
  await assert.rejects(loaderFixture({ changed: true }).getBillingAttachments("org1", { record: "bill-id" }), /ยอด.*เปลี่ยน|ยอด.*ไม่ตรง/);
});

test("new selection requires explicit delivery numbers and a real ordered date range", async () => {
  const { getBillingAttachments } = loaderFixture();
  for (const params of [
    { customers: "c1", from: "2026-10-01", to: "2026-10-07" },
    { customers: "c1", deliveries: "DN1", from: "2026-02-30", to: "2026-10-07" },
    { customers: "c1", deliveries: "DN1", from: "2026-10-07", to: "2026-10-01" },
  ]) await assert.rejects(getBillingAttachments("org1", params), /เลือก|วันที่/);
  const result = await getBillingAttachments("org1", { customers: "c1", deliveries: "DN1", from: "2026-10-01", to: "2026-10-07" });
  assert.equal(result[0].notes.length, 1);
  assert.equal(result[0].grandTotal, 20);
});

test("empty and odd notes are retained, while an unprintably tall product fails visibly", () => {
  const pages = paginateAttachmentNotes([measured(0), measured(3), measured(2)], 150);
  assert.equal(pages[0][0][0].end, 0);
  assert.equal(pages[0][1][1], null);
  assert.throws(() => paginateAttachmentNotes([{ baseHeight: 20, itemHeights: [200] }], 150), /พื้นที่/);
  assert.deepEqual(plain(paginateAttachmentNotes([], 150)), []);
});

test("print data keeps the sold unit beside its quantity and sale price", async () => {
  let soldUnit = "ถุง";
  const db = { from(table) {
    const query = { then(resolve) {
      resolve({ error: null, data: table === "delivery_note_items" ? [{
        id: "item1", quantity_delivered: 2, sale_unit_label: soldUnit, unit_price: 100, line_total: 200,
        products: { sku: "TYN001", name: "เส้นเล็ก", unit: "kg", display_order: 1 },
      }] : {
        id: "note1", delivery_number: "DN1", delivery_date: "2026-10-01", total_amount: 200,
        customers: { name: "ร้านตัวอย่าง", customer_code: "TYS001", address: "", default_vehicle_id: null, vehicles: null },
        organizations: { name: "T&Y Noodle", metadata: {} }, orders: null,
      } });
    } };
    for (const method of ["select", "eq", "maybeSingle"]) query[method] = () => query;
    return query;
  } };
  const { getDeliveryNotePrintData } = load("src/lib/delivery/print.ts", {
    "server-only": {}, "@/lib/supabase/admin": { getSupabaseAdmin: () => db },
  });
  const note = await getDeliveryNotePrintData("org1", "note1");
  assert.equal(note.items[0].saleUnitLabel, "ถุง");
  assert.equal(note.items[0].quantityDelivered, 2);
  assert.equal(note.items[0].unitPrice, 100);
  soldUnit = "";
  assert.equal((await getDeliveryNotePrintData("org1", "note1")).items[0].saleUnitLabel, "kg");
});
