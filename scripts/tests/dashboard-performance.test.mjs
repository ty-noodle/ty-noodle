import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const migrationsDirectory = "supabase/migrations";
const overviewSource = readFileSync("src/lib/dashboard/overview.ts", "utf8");

function findDashboardMigration() {
  const matches = readdirSync(migrationsDirectory).filter((file) =>
    file.endsWith("_optimize_dashboard_snapshot.sql"),
  );
  assert.equal(matches.length, 1, "expected exactly one dashboard snapshot migration");
  return `${migrationsDirectory}/${matches[0]}`;
}

test("dashboard migration aggregates pending deliveries without a row limit", () => {
  const migrationPath = findDashboardMigration();
  assert.equal(existsSync(migrationPath), true);
  const sql = readFileSync(migrationPath, "utf8");

  assert.match(sql, /get_dashboard_snapshot_v1/);
  assert.match(sql, /count\(\*\).*pending_delivery_count/is);
  assert.match(sql, /sum\([\s\S]*total_amount[\s\S]*pending_delivery_amount/is);
  assert.doesNotMatch(sql, /limit\s+1000/i);
  assert.match(sql, /revoke\s+all[\s\S]*from\s+public/is);
  assert.match(sql, /grant\s+execute[\s\S]*to\s+service_role/is);
});

test("dashboard migration fixes the function search path", () => {
  const sql = readFileSync(findDashboardMigration(), "utf8");
  assert.match(sql, /set\s+search_path\s*=\s*''/i);
});

test("dashboard uses the aggregate snapshot with a legacy compatibility path", () => {
  assert.match(overviewSource, /getDashboardAggregateSnapshot/);
  assert.match(overviewSource, /getDashboardOverviewLegacy/);
});

test("the optimized overview skips unbounded pending-delivery row loading", () => {
  assert.match(
    overviewSource,
    /aggregateSnapshot\s*\?[\s\S]*Promise\.resolve\(\{ data: \[\][\s\S]*pending delivery/is,
  );
});
