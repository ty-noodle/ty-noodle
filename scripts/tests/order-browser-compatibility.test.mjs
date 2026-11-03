import assert from "node:assert/strict";
import test from "node:test";

import { sortCustomersByOrder } from "../../src/lib/settings/customer-order.ts";
import { upsertIncomingOrder } from "../../src/components/orders/incoming-order-live-update.ts";

test("order sorting works without toSorted and preserves its input arrays", () => {
  const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, "toSorted");
  delete Array.prototype.toSorted;

  try {
    const customers = Object.freeze([
      { id: "later", sortOrder: 2, code: "C2" },
      { id: "first", sortOrder: 1, code: "C1" },
    ]);
    assert.deepEqual(sortCustomersByOrder(customers).map(({ id }) => id), ["first", "later"]);
    assert.deepEqual(sortCustomersByOrder([]), []);

    const existing = { id: "existing", orderDate: "2026-10-16", createdAt: "08:00" };
    const older = { id: "older", orderDate: "2026-10-15", createdAt: "12:00" };
    const orders = Object.freeze([older, existing]);
    const saved = { ...existing, createdAt: "09:00" };
    const added = { id: "new", orderDate: "2026-10-16", createdAt: "10:00" };
    assert.deepEqual(upsertIncomingOrder(orders, saved), [saved, older]);
    assert.deepEqual(upsertIncomingOrder(orders, added), [added, existing, older]);
    assert.deepEqual(orders, [older, existing]);
  } finally {
    if (descriptor) Object.defineProperty(Array.prototype, "toSorted", descriptor);
  }
});
