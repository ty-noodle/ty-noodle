import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateBaseQuantity,
  calculateLineTotal,
  getEffectiveOrderMinimum,
  getEffectiveOrderStep,
  isValidOrderQuantity,
  normalizeOrderQuantity,
} from "../../src/lib/orders/quantity-rules.ts";

test("free ordering accepts any positive quantity with up to three decimals", () => {
  assert.equal(getEffectiveOrderMinimum(1, null), 0.001);
  assert.equal(getEffectiveOrderStep(null), 0.1);
  assert.equal(isValidOrderQuantity(0.1, 1, null), true);
  assert.equal(isValidOrderQuantity(0.2, 1, null), true);
  assert.equal(isValidOrderQuantity(0.001, 1, null), true);
  assert.equal(isValidOrderQuantity(0.0001, 1, null), false);
  assert.equal(normalizeOrderQuantity(0.2, 1, null), 0.2);
});

test("fixed-step ordering keeps its configured minimum and increment", () => {
  assert.equal(isValidOrderQuantity(0.5, 1, 1), false);
  assert.equal(isValidOrderQuantity(1, 1, 1), true);
  assert.equal(isValidOrderQuantity(2, 1, 1), true);
});

test("fractional orders calculate stock and money at database precision", () => {
  assert.equal(calculateBaseQuantity(0.1, 20), 2);
  assert.equal(calculateBaseQuantity(0.2, 12.5), 2.5);
  assert.equal(calculateLineTotal(0.1, 99.99), 10);
  assert.equal(calculateLineTotal(0.2, 125), 25);
});
