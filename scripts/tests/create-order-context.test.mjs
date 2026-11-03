import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/components/orders/create-order-context.tsx", "utf8");

test("create-order loading never starts a transition inside a state updater", () => {
  assert.doesNotMatch(source, /setData\s*\(\s*\([^)]*\)\s*=>[\s\S]*?startTransition/);
  assert.match(source, /loadInFlightRef\.current/);
  assert.match(source, /startTransition\s*\(\s*async/);
});
