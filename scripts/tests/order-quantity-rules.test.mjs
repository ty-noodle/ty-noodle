import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateBaseQuantity,
  calculateLineTotal,
  getDefaultOrderQuantity,
  getEffectiveOrderMinimum,
  getEffectiveOrderStep,
  isValidOrderQuantity,
  normalizeOrderQuantity,
} from "../../src/lib/orders/quantity-rules.ts";

test("free ordering accepts only half a unit or positive whole numbers", () => {
  assert.equal(getDefaultOrderQuantity(1, null), 1);
  assert.equal(getEffectiveOrderMinimum(1, null), 0.5);
  assert.equal(getEffectiveOrderStep(null), 1);
  assert.equal(isValidOrderQuantity(0.5, 1, null), true);
  assert.equal(isValidOrderQuantity(1, 1, null), true);
  assert.equal(isValidOrderQuantity(5, 1, null), true);
  assert.equal(isValidOrderQuantity(0.1, 1, null), false);
  assert.equal(isValidOrderQuantity(0.2, 1, null), false);
  assert.equal(isValidOrderQuantity(0.6, 1, null), false);
  assert.equal(isValidOrderQuantity(1.5, 1, null), false);
  assert.equal(normalizeOrderQuantity(0.2, 1, null), 0.5);
  assert.equal(normalizeOrderQuantity(1.5, 1, null), 1);
});

test("fixed-step ordering keeps its configured minimum and increment", () => {
  assert.equal(isValidOrderQuantity(0.5, 1, 1), false);
  assert.equal(isValidOrderQuantity(1, 1, 1), true);
  assert.equal(isValidOrderQuantity(2, 1, 1), true);
});

test("fractional orders calculate stock and money at database precision", () => {
  assert.equal(calculateBaseQuantity(0.5, 20), 10);
  assert.equal(calculateBaseQuantity(0.5, 12.5), 6.25);
  assert.equal(calculateLineTotal(0.5, 99.99), 50);
  assert.equal(calculateLineTotal(0.5, 125), 62.5);
});
