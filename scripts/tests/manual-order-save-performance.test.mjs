import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actionPath = new URL("../../src/app/orders/incoming/actions.ts", import.meta.url);

test("manual order save does not reload the full incoming-order query after persistence", async () => {
  const source = await readFile(actionPath, "utf8");
  const start = source.indexOf("export async function createManualOrderAction");
  const end = source.indexOf("export async function linkPendingLineOrderAction", start);
  const actionSource = source.slice(start, end);

  assert.doesNotMatch(actionSource, /await getIncomingOrders\(/);
  assert.match(actionSource, /Promise\.all\(/);
  assert.match(actionSource, /const incomingOrder:[\s\S]*?= savedOrder && customer/);
});
