import assert from "node:assert/strict";
import test from "node:test";

import {
  removeIncomingOrder,
  shouldShowIncomingOrder,
  upsertIncomingOrder,
  reconcileIncomingOrderPage,
} from "../../src/components/orders/incoming-order-live-update.ts";

const baseOrder = {
  channelLabel: "สร้าง",
  createdAt: "2026-08-13T08:00:00.000Z",
  customerCode: "TYS001",
  customerId: "customer-1",
  customerName: "ร้านทดสอบ",
  sortOrder: 1,
  id: "order-1",
  notes: null,
  orderDate: "2026-08-13",
  orderNumber: "DN2026081001",
  productCount: 2,
  fulfillmentStatus: "pending",
  status: "submitted",
  totalAmount: 100,
  vehicleId: null,
  vehicleName: null,
};

test("fresh server rows replace stale first-page state without dropping loaded later pages", () => {
  const later = { ...baseOrder, id: "order-2", totalAmount: 75 };
  const saved = { ...baseOrder, totalAmount: 250, notes: "updated", productCount: 3 };
  const result = reconcileIncomingOrderPage([baseOrder, later], [saved], true);
  assert.deepEqual(result, [saved, later]);
  assert.equal(baseOrder.totalAmount, 100);
});

test("partial refresh preserves displaced rows and deduplicates rows shifted from later pages", () => {
  const later = { ...baseOrder, id: "order-2" };
  assert.deepEqual(reconcileIncomingOrderPage([baseOrder, later], [later], true), [later, baseOrder]);
  const newest = { ...baseOrder, id: "newest" };
  assert.deepEqual(reconcileIncomingOrderPage([baseOrder, later], [newest], true), [newest, baseOrder, later]);
  assert.deepEqual(reconcileIncomingOrderPage([baseOrder], [], false), []);
});

test("a complete server page removes rows that no longer exist", () => {
  const removed = { ...baseOrder, id: "removed" };
  assert.deepEqual(reconcileIncomingOrderPage([baseOrder, removed], [baseOrder], false), [baseOrder]);
});

test("upsert adds a newly created order at the top without duplicating it", () => {
  const result = upsertIncomingOrder([], baseOrder);
  const updated = upsertIncomingOrder(result, { ...baseOrder, totalAmount: 250 });

  assert.equal(updated.length, 1);
  assert.equal(updated[0].totalAmount, 250);
});

test("remove deletes only the confirmed order from the visible list", () => {
  const otherOrder = { ...baseOrder, id: "order-2", orderNumber: "DN2026081002" };

  assert.deepEqual(removeIncomingOrder([baseOrder, otherOrder], baseOrder.id), [otherOrder]);
});

test("created order is only shown when it matches the active list filters", () => {
  assert.equal(
    shouldShowIncomingOrder(baseOrder, {
      orderDate: "2026-08-13",
      endDate: "2026-08-13",
      searchTerm: "",
      selectedCustomerIds: [],
    }),
    true,
  );
  assert.equal(
    shouldShowIncomingOrder(baseOrder, {
      orderDate: "2026-08-12",
      endDate: "2026-08-12",
      searchTerm: "",
      selectedCustomerIds: [],
    }),
    false,
  );
});
