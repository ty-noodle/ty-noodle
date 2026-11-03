import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../../supabase/migrations/202608131700_fix_billing_number_overflow.sql",
  import.meta.url,
);
const actionPath = new URL("../../src/lib/billing/actions.ts", import.meta.url);

test("billing migration formats the sequence with a minimum width of three", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /lpad\(v_next::text,\s*greatest\(3,\s*length\(v_next::text\)\),\s*'0'\)/i);
  assert.doesNotMatch(sql, /lpad\(v_next::text,\s*3,\s*'0'\)/i);
});

test("billing history action rejects RPC and insert failures before printing", async () => {
  const source = await readFile(actionPath, "utf8");

  assert.match(source, /data:\s*billingNumber,\s*error:\s*billingNumberError/);
  assert.match(source, /if\s*\(billingNumberError\s*\|\|\s*!billingNumber\)/);
  assert.match(source, /error:\s*insertError/);
  assert.match(source, /if\s*\(insertError\)/);
  assert.match(source, /success:\s*false/);
});
