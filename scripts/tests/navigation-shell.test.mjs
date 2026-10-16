import assert from "node:assert/strict";
import test from "node:test";
import { shouldPersistNavigation } from "../../src/lib/navigation.ts";

test("only existing admin navigation screens use the persistent shell", () => {
  for (const path of ["/dashboard", "/orders/incoming", "/billing", "/delivery", "/stock", "/stock/issues", "/settings/customers", "/reports/product-sales"]) {
    assert.equal(shouldPersistNavigation(path, "admin"), true, path);
    assert.equal(shouldPersistNavigation(path, "warehouse"), false, path);
    assert.equal(shouldPersistNavigation(path, "member"), false, path);
    assert.equal(shouldPersistNavigation(path, null), false, path);
  }
  for (const path of ["/", "/login", "/order", "/order/customer", "/menu", "/offline", "/billing/print", "/delivery/print", "/orders/packing-list", "/orders/delivery-notes/123", "/settings-other", "/dashboard/settings"]) {
    assert.equal(shouldPersistNavigation(path, "admin"), false, path);
  }
});
