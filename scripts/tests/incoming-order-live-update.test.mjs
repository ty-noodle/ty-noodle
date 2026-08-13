import assert from "node:assert/strict";
import test from "node:test";

import {
  removeIncomingOrder,
  shouldShowIncomingOrder,
  upsertIncomingOrder,
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
