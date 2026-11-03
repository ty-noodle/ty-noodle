import assert from "node:assert/strict";
import test from "node:test";
import { moveCustomerId, normalizeCustomerIds } from "./customer-order.mjs";

test("moves a customer to the requested position", () => {
  assert.deepEqual(moveCustomerId(["A", "B", "C"], "A", "C"), ["B", "C", "A"]);
});

test("returns the original order when drag IDs are missing or unchanged", () => {
  assert.deepEqual(moveCustomerId(["A", "B"], "missing", "B"), ["A", "B"]);
  assert.deepEqual(moveCustomerId(["A", "B"], "A", "A"), ["A", "B"]);
});

test("normalizes a complete unique order and removes blank IDs", () => {
  assert.deepEqual(normalizeCustomerIds([" A ", "B", "A", "", " B "]), ["A", "B"]);
});
