# Dashboard Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve every Dashboard result while replacing unbounded row transfers and request fan-out with a typed aggregate RPC, bounded detail groups, deadlines, indexes, and measurable navigation performance.

**Architecture:** PostgreSQL computes scalar Dashboard KPIs in one typed RPC so PostgREST's 1,000-row cap cannot truncate aggregates. Next.js loads that snapshot alongside four bounded detail groups, validates the RPC payload, and temporarily retains the legacy path for compatibility and shadow comparison. Primary links use Next.js prefetching and valid route loading boundaries.

**Tech Stack:** Next.js 16.1.5 App Router and Cache Components, React 19.2.4, TypeScript 5, Supabase JS 2.57.4, PostgreSQL 17, Node test runner, ESLint, Vercel.

**Spec:** `docs/superpowers/specs/2026-08-28-dashboard-performance-design.md`

## Global Constraints

- Preserve every user-visible Dashboard value, ordering rule, interaction, and Bangkok-date calculation.
- Integer counts compare exactly; currency compares after numeric normalization; arrays compare in order.
- Initial unexpanded Dashboard uses no more than five Supabase request groups.
- Aggregate RPC deadline is 5,000 ms, optional group deadline is 3,000 ms, and total deadline is 6,000 ms.
- Warmed production-like RSC P95 target is 500 ms or less; report median, P75, P95, maximum, request count, bytes, and fallbacks.
- The initial database rollout is additive: do not delete or overwrite existing tables, rows, policies, columns, or functions.
- Do not apply the migration to production until SQL review, local checks, read-only equivalence, and explicit production approval are complete.
- Retain the compatibility fallback for at least seven days and 1,000 production Dashboard invocations with zero unexplained mismatches.

---

## File Structure

- `src/lib/dashboard/snapshot-core.mjs`: runtime validation, numeric normalization, deadlines, and mismatch comparison without Next.js dependencies.
- `src/lib/dashboard/snapshot-core.d.ts`: TypeScript contract for the shared MJS runtime module.
- `src/lib/dashboard/snapshot-core.test.mjs`: Node tests for payload validation, timeout behavior, and equivalence comparison.
- `src/lib/dashboard/snapshot.ts`: server-only Supabase RPC adapter and structured timing.
- `src/lib/dashboard/overview.ts`: consume the aggregate snapshot and retain only bounded detail loading.
- `src/app/dashboard/page.tsx`: isolate required and optional groups while preserving current props and fallback shape.
- `scripts/tests/dashboard-performance.test.mjs`: repository-level regression assertions for row-cap removal, navigation settings, and query shape.
- `scripts/benchmark-dashboard.mjs`: authenticated read-only legacy/RPC equivalence and latency benchmark.
- Migration file printed by `supabase migration new optimize_dashboard_snapshot`: typed RPC, privileges, and measured indexes. The executor must use the exact CLI-returned path and must not invent a timestamped filename.
- `src/components/app-sidebar.tsx`: restore default prefetching on primary application navigation.
- `src/app/orders/loading.tsx` and `src/app/settings/loading.tsx`: valid Next.js loading boundaries replacing ignored underscore-prefixed files.

### Task 1: Lock the result contract and deadline behavior

**Files:**
- Create: `src/lib/dashboard/snapshot-core.mjs`
- Create: `src/lib/dashboard/snapshot-core.d.ts`
- Create: `src/lib/dashboard/snapshot-core.test.mjs`

**Interfaces:**
- Produces: `normalizeDashboardSnapshot(row)`, `withDeadline(label, timeoutMs, operation)`, and `compareDashboardResults(legacy, candidate)`.
- `normalizeDashboardSnapshot` returns `DashboardAggregateSnapshot` with camelCase numeric fields.
- `withDeadline` rejects with `DashboardTimeoutError` whose `group` property is the supplied label.
- `compareDashboardResults` returns `{ equal: boolean; mismatches: string[] }` and records field paths only.

- [ ] **Step 1: Write the failing payload-normalization test**

```js
test("normalizes the typed RPC row without changing values", () => {
  assert.deepEqual(normalizeDashboardSnapshot({
    today_order_count: 70,
    today_order_amount: "12500.50",
    today_net_profit: "4300.25",
    today_cost: "8200.25",
    submitted_order_count: 70,
    pending_delivery_count: 1234,
    pending_delivery_amount: "456789.25",
    month_delivered_amount: "98000.00",
    active_customer_count: 112,
    low_stock_count: 8,
  }), {
    todayOrderCount: 70,
    todayOrderAmount: 12500.5,
    todayNetProfit: 4300.25,
    todayCost: 8200.25,
    submittedOrderCount: 70,
    pendingDeliveryCount: 1234,
    pendingDeliveryAmount: 456789.25,
    monthDeliveredAmount: 98000,
    activeCustomerCount: 112,
    lowStockCount: 8,
  });
});
```

- [ ] **Step 2: Write failing deadline and mismatch tests**

```js
test("rejects a delayed group with its group name", async () => {
  await assert.rejects(
    withDeadline("stock", 5, () => new Promise((resolve) => setTimeout(resolve, 50))),
    (error) => error instanceof DashboardTimeoutError && error.group === "stock",
  );
});

test("reports paths but not values for unequal results", () => {
  assert.deepEqual(
    compareDashboardResults(
      { kpi: { pendingDeliveryCount: 1001 }, recentOrders: [] },
      { kpi: { pendingDeliveryCount: 1000 }, recentOrders: [] },
    ),
    { equal: false, mismatches: ["kpi.pendingDeliveryCount"] },
  );
});
```

- [ ] **Step 3: Run the test and verify RED**

Run: `node --test src/lib/dashboard/snapshot-core.test.mjs`

Expected: FAIL because `snapshot-core.mjs` does not yet export the required functions.

- [ ] **Step 4: Implement the minimal core module and declaration**

```js
export class DashboardTimeoutError extends Error {
  constructor(group, timeoutMs) {
    super(`Dashboard group ${group} exceeded ${timeoutMs}ms`);
    this.name = "DashboardTimeoutError";
    this.group = group;
    this.timeoutMs = timeoutMs;
  }
}

export function normalizeDashboardSnapshot(row) {
  if (!row || typeof row !== "object") throw new TypeError("Invalid dashboard snapshot");
  const number = (key) => {
    const value = Number(row[key]);
    if (!Number.isFinite(value)) throw new TypeError(`Invalid dashboard snapshot field: ${key}`);
    return value;
  };
  return {
    todayOrderCount: number("today_order_count"),
    todayOrderAmount: number("today_order_amount"),
    todayNetProfit: number("today_net_profit"),
    todayCost: number("today_cost"),
    submittedOrderCount: number("submitted_order_count"),
    pendingDeliveryCount: number("pending_delivery_count"),
    pendingDeliveryAmount: number("pending_delivery_amount"),
    monthDeliveredAmount: number("month_delivered_amount"),
    activeCustomerCount: number("active_customer_count"),
    lowStockCount: number("low_stock_count"),
  };
}
```

Implement `withDeadline` using `AbortController` plus a timer cleared in `finally`, and implement a deterministic recursive comparison that emits paths only. Declare the exact exports and `DashboardAggregateSnapshot` in `snapshot-core.d.ts`.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `node --test src/lib/dashboard/snapshot-core.test.mjs`

Expected: PASS with zero failures.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/lib/dashboard/snapshot-core.mjs src/lib/dashboard/snapshot-core.d.ts src/lib/dashboard/snapshot-core.test.mjs
git commit -m "Add dashboard snapshot contract"
```

### Task 2: Add the typed aggregate RPC and measured indexes

**Files:**
- Create via CLI: the exact migration path printed by `supabase migration new optimize_dashboard_snapshot`
- Create: `scripts/tests/dashboard-performance.test.mjs`

**Interfaces:**
- Produces PostgreSQL RPC `public.get_dashboard_snapshot_v1(p_organization_id uuid, p_business_date date)`.
- RPC returns exactly one typed row matching `normalizeDashboardSnapshot`.
- Function execution is granted only to `service_role`.

- [ ] **Step 1: Add a failing repository regression test**

The test must read the CLI-generated migration and assert all of these exact properties:

```js
test("dashboard migration aggregates pending deliveries without a row limit", () => {
  assert.match(sql, /get_dashboard_snapshot_v1/);
  assert.match(sql, /count\(\*\).*pending_delivery_count/is);
  assert.match(sql, /sum\(.*total_amount.*\).*pending_delivery_amount/is);
  assert.doesNotMatch(sql, /limit\s+1000/i);
  assert.match(sql, /revoke\s+all.*from\s+public/is);
  assert.match(sql, /grant\s+execute.*to\s+service_role/is);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test scripts/tests/dashboard-performance.test.mjs`

Expected: FAIL because no dashboard snapshot migration exists.

- [ ] **Step 3: Generate the migration file using the Supabase CLI**

Run: `supabase migration new optimize_dashboard_snapshot`

Expected: the CLI prints the exact generated migration path. Use that path for every remaining Task 2 command and update the test's migration discovery to require exactly one `*_optimize_dashboard_snapshot.sql` file.

- [ ] **Step 4: Implement the typed SQL function**

The function signature must be:

```sql
create or replace function public.get_dashboard_snapshot_v1(
  p_organization_id uuid,
  p_business_date date
)
returns table (
  today_order_count bigint,
  today_order_amount numeric,
  today_net_profit numeric,
  today_cost numeric,
  submitted_order_count bigint,
  pending_delivery_count bigint,
  pending_delivery_amount numeric,
  month_delivered_amount numeric,
  active_customer_count bigint,
  low_stock_count bigint
)
language sql
stable
set search_path = ''
as $function$
  -- Use schema-qualified CTEs. Aggregate pending deliveries with count/sum,
  -- aggregate today's confirmed delivery-note item cost, and preserve the
  -- existing submitted LINE-order business rule from overview.ts.
$function$;

revoke all on function public.get_dashboard_snapshot_v1(uuid, date) from public;
revoke all on function public.get_dashboard_snapshot_v1(uuid, date) from anon;
revoke all on function public.get_dashboard_snapshot_v1(uuid, date) from authenticated;
grant execute on function public.get_dashboard_snapshot_v1(uuid, date) to service_role;
```

Copy the exact current formulas from `src/lib/dashboard/overview.ts`; do not reinterpret `todayOrderAmount`, `submittedOrderCount`, or low-stock rules. Use `coalesce` so empty sets produce the same zeros as the legacy implementation.

- [ ] **Step 5: Inspect existing production indexes and plans before adding indexes**

Run read-only SQL for `pg_indexes` on `orders`, `order_items`, `delivery_notes`, and `delivery_note_items`, then run `EXPLAIN (ANALYZE, BUFFERS)` for the recent-order and pending-delivery predicates. Record the before plans in the implementation notes.

Add only these index shapes when an equivalent left-prefix index is absent and the before plan demonstrates benefit:

```sql
create index if not exists orders_dashboard_recent_idx
  on public.orders (organization_id, created_at desc)
  where status in ('submitted', 'confirmed');

create index if not exists delivery_notes_dashboard_pending_idx
  on public.delivery_notes (organization_id)
  include (total_amount)
  where status = 'confirmed' and dispatch_status = 'pending';
```

Use the existing date and child foreign-key indexes when they already cover the other predicates.

- [ ] **Step 6: Run regression test and SQL lint checks**

Run: `node --test scripts/tests/dashboard-performance.test.mjs`

Expected: PASS and no `LIMIT 1000` in the aggregate path.

- [ ] **Step 7: Commit Task 2 without applying production migration**

```bash
git add supabase/migrations scripts/tests/dashboard-performance.test.mjs
git commit -m "Add dashboard aggregate snapshot RPC"
```

### Task 3: Add the server RPC adapter with structured timing

**Files:**
- Create: `src/lib/dashboard/snapshot.ts`
- Modify: `src/types/database.ts` only through the repository's type-generation command after the migration is applied to the intended database; do not hand-edit it.
- Test: `src/lib/dashboard/snapshot-core.test.mjs`

**Interfaces:**
- Consumes: `normalizeDashboardSnapshot` and `withDeadline` from Task 1.
- Produces: `getDashboardAggregateSnapshot(organizationId: string, businessDate: string): Promise<DashboardAggregateSnapshot>`.
- Produces: `measureDashboardGroup<T>(group: string, operation: () => Promise<T>): Promise<T>`.

- [ ] **Step 1: Extend the core test with timing-event assertions**

Add a pure `createDashboardTimingEvent(group, durationMs, outcome)` test that proves the event contains only group, rounded duration, and outcome—no payload values.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test src/lib/dashboard/snapshot-core.test.mjs`

Expected: FAIL because the timing-event helper is missing.

- [ ] **Step 3: Implement the pure timing helper and server adapter**

The adapter must call:

```ts
const { data, error } = await admin.rpc("get_dashboard_snapshot_v1", {
  p_organization_id: organizationId,
  p_business_date: businessDate,
}).abortSignal(signal);
```

Require exactly one returned row, validate it through `normalizeDashboardSnapshot`, and use a 5,000 ms deadline. Emit one JSON log such as:

```ts
console.info("dashboard_timing", createDashboardTimingEvent("aggregate", durationMs, "ok"));
```

Do not log organization IDs, row values, customer information, or order information.

- [ ] **Step 4: Run test, lint the files, and verify GREEN**

Run: `node --test src/lib/dashboard/snapshot-core.test.mjs`

Run: `npx eslint src/lib/dashboard/snapshot.ts`

Expected: both commands exit 0.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/lib/dashboard/snapshot.ts src/lib/dashboard/snapshot-core.mjs src/lib/dashboard/snapshot-core.d.ts src/lib/dashboard/snapshot-core.test.mjs
git commit -m "Add timed dashboard snapshot adapter"
```

### Task 4: Replace unbounded Dashboard KPI row loading

**Files:**
- Modify: `src/lib/dashboard/overview.ts`
- Modify: `src/app/dashboard/page.tsx`
- Test: `scripts/tests/dashboard-performance.test.mjs`

**Interfaces:**
- Consumes: `getDashboardAggregateSnapshot` from Task 3.
- Produces: the existing `DashboardOverview` and `DashboardClient` props unchanged.
- Retains: `getDashboardOverviewLegacy` as the temporary compatibility and equivalence path.

- [ ] **Step 1: Add failing static regression assertions**

```js
test("dashboard overview no longer fetches all pending delivery rows", () => {
  assert.doesNotMatch(overviewSource, /pendingDeliveryRes[\s\S]*\.from\("delivery_notes"\)/);
  assert.match(overviewSource, /getDashboardAggregateSnapshot/);
});

test("dashboard keeps the existing public result shape", () => {
  for (const field of requiredOverviewFields) assert.match(overviewSource, new RegExp(`\\b${field}\\b`));
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test scripts/tests/dashboard-performance.test.mjs`

Expected: FAIL because `overview.ts` still performs unbounded KPI row queries.

- [ ] **Step 3: Extract the legacy function without changing it**

Rename the current implementation to `getDashboardOverviewLegacy`. Keep its formulas intact for shadow comparison. Add a new `getDashboardOverview` that uses the aggregate snapshot for KPI scalars and bounded detail loaders for arrays.

Group initial data into these five measured groups:

1. Aggregate RPC.
2. Recent orders plus seven-day daily performance.
3. Store status.
4. Stock products/suppliers.
5. LINE orders.

Optional groups use 3,000 ms deadlines and return their current empty array/summary fallback. Aggregate failure uses the legacy compatibility path; it must not invent zero KPI values.

- [ ] **Step 4: Add controlled shadow comparison**

When `DASHBOARD_SHADOW_COMPARE=true`, execute the legacy path for diagnostic requests, compare field paths through `compareDashboardResults`, and log only `{ equal, mismatches }`. Default production behavior keeps shadow comparison disabled until the database RPC is deployed.

- [ ] **Step 5: Run focused tests and lint**

Run: `node --test scripts/tests/dashboard-performance.test.mjs src/lib/dashboard/snapshot-core.test.mjs`

Run: `npx eslint src/lib/dashboard/overview.ts src/app/dashboard/page.tsx`

Expected: all exit 0.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/lib/dashboard/overview.ts src/app/dashboard/page.tsx scripts/tests/dashboard-performance.test.mjs
git commit -m "Use aggregate data for dashboard KPIs"
```

### Task 5: Restore immediate navigation feedback

**Files:**
- Modify: `src/components/app-sidebar.tsx`
- Rename: `src/app/orders/_loading.tsx` to `src/app/orders/loading.tsx`
- Rename: `src/app/settings/_loading.tsx` to `src/app/settings/loading.tsx`
- Test: `scripts/tests/dashboard-performance.test.mjs`

**Interfaces:**
- Primary application `Link` components use Next.js default automatic prefetching.
- Orders and Settings expose valid route loading boundaries with the existing `PageLoader` UI.

- [ ] **Step 1: Add failing navigation assertions**

```js
test("primary navigation does not disable App Router prefetch", () => {
  assert.doesNotMatch(sidebarSource, /prefetch=\{false\}/);
});

test("orders and settings use recognized loading filenames", () => {
  assert.equal(existsSync("src/app/orders/loading.tsx"), true);
  assert.equal(existsSync("src/app/settings/loading.tsx"), true);
  assert.equal(existsSync("src/app/orders/_loading.tsx"), false);
  assert.equal(existsSync("src/app/settings/_loading.tsx"), false);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test scripts/tests/dashboard-performance.test.mjs`

Expected: FAIL on disabled prefetch and missing recognized loading files.

- [ ] **Step 3: Make the minimal navigation changes**

Remove `prefetch={false}` only from primary internal navigation links in `app-sidebar.tsx`. Rename the two loading files without changing their component output.

- [ ] **Step 4: Run test and lint; verify GREEN**

Run: `node --test scripts/tests/dashboard-performance.test.mjs`

Run: `npx eslint src/components/app-sidebar.tsx src/app/orders/loading.tsx src/app/settings/loading.tsx`

Expected: both exit 0.

- [ ] **Step 5: Commit Task 5**

```bash
git add src/components/app-sidebar.tsx src/app/orders src/app/settings scripts/tests/dashboard-performance.test.mjs
git commit -m "Restore prefetched application navigation"
```

### Task 6: Build the equivalence and performance harness

**Files:**
- Create: `scripts/benchmark-dashboard.mjs`
- Modify: `package.json`
- Test: `scripts/tests/dashboard-performance.test.mjs`

**Interfaces:**
- Produces command `npm run benchmark:dashboard`.
- Reads `.env.local` without printing secrets.
- Outputs JSON summary with `median_ms`, `p75_ms`, `p95_ms`, `max_ms`, `request_groups`, `response_bytes`, `fallbacks`, and `mismatches`.

- [ ] **Step 1: Add a failing benchmark-output test**

Export a pure `summarizeDurations(samples)` from the benchmark module and assert:

```js
assert.deepEqual(summarizeDurations([100, 200, 300, 400]), {
  medianMs: 250,
  p75Ms: 325,
  p95Ms: 385,
  maxMs: 400,
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test scripts/tests/dashboard-performance.test.mjs`

Expected: FAIL because the benchmark module is absent.

- [ ] **Step 3: Implement the read-only benchmark**

The script must:

- Load the target organization without printing its ID.
- Execute legacy and RPC paths against the same business date.
- Warm each path twice, then collect at least ten measured samples.
- Compare complete results with `compareDashboardResults`.
- Test a date with no orders, the current date, a month-boundary date, and a high-volume date selected by aggregate count.
- Verify pending delivery aggregate independently with direct SQL/RPC count and sum, not a PostgREST row list.
- Exit nonzero on any unexplained mismatch.

Add to `package.json`:

```json
"benchmark:dashboard": "node scripts/benchmark-dashboard.mjs"
```

- [ ] **Step 4: Run unit tests and the read-only benchmark**

Run: `node --test scripts/tests/dashboard-performance.test.mjs src/lib/dashboard/snapshot-core.test.mjs`

Run after the RPC exists in the target verification database: `npm run benchmark:dashboard`

Expected: zero mismatches; save the JSON result in the task handoff, not in a secrets-bearing file.

- [ ] **Step 5: Commit Task 6**

```bash
git add scripts/benchmark-dashboard.mjs scripts/tests/dashboard-performance.test.mjs package.json
git commit -m "Add dashboard equivalence benchmark"
```

### Task 7: Apply database capability in a controlled verification environment

**Files:**
- Modify only if generated after database application: `src/types/database.ts` via `npm run gen:types`
- Verify: CLI-generated `supabase/migrations/*_optimize_dashboard_snapshot.sql`

**Interfaces:**
- Verification database exposes `get_dashboard_snapshot_v1` and generated TypeScript types.
- Production remains unchanged until a separate explicit approval immediately before execution.

- [ ] **Step 1: Inspect CLI commands rather than assuming syntax**

Run: `supabase migration --help`

Run: `supabase db --help`

Expected: identify the repository-supported command for applying the migration to the verification target.

- [ ] **Step 2: Run database advisors and review function security**

Use the connected Supabase advisor or CLI to retrieve performance and security findings. Verify fixed `search_path`, service-role-only execution, and absence of redundant indexes.

- [ ] **Step 3: Apply migration to the verification target only**

Use the exact command discovered in Step 1. Do not target production in this step.

- [ ] **Step 4: Regenerate database types**

Run: `npm run gen:types`

Expected: `src/types/database.ts` contains `get_dashboard_snapshot_v1`; do not hand-edit this file.

- [ ] **Step 5: Run benchmark and equivalence suite**

Run: `npm run benchmark:dashboard`

Expected: zero mismatches, aggregate correctness beyond 1,000 pending rows, no more than five initial request groups, and captured latency distribution.

- [ ] **Step 6: Re-run query plans after indexes**

Run the same `EXPLAIN (ANALYZE, BUFFERS)` statements captured in Task 2 and record scan type, rows, planning time, and execution time before/after.

- [ ] **Step 7: Commit generated type changes**

```bash
git add src/types/database.ts
git commit -m "Regenerate types for dashboard snapshot RPC"
```

### Task 8: Full application verification and production approval gate

**Files:**
- Verify all changed files.
- No production mutation is allowed before Step 5 approval.

**Interfaces:**
- Produces a verification report with correctness, latency, database plan, build, and rollback evidence.

- [ ] **Step 1: Run all focused Node tests**

Run: `node --test scripts/tests/*.test.mjs src/lib/dashboard/*.test.mjs`

Expected: zero failures.

- [ ] **Step 2: Run repository lint**

Run: `npm run lint`

Expected: exit 0 with no ESLint errors.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: exit 0; `/dashboard`, `/orders`, and `/settings` build successfully with recognized loading boundaries.

- [ ] **Step 4: Exercise an authenticated production-build navigation locally**

Start `npm run start`, navigate Stock → Dashboard at least ten times, and capture RSC timing. Confirm immediate loading feedback, unchanged values, and no request above the six-second total deadline.

- [ ] **Step 5: Present evidence and request explicit production migration approval**

Report:

- Result mismatch count.
- Median/P75/P95/max before and after.
- Initial request-group count and response bytes.
- Before/after query plans.
- Lint/build/test results.
- Exact migration filename and rollback procedure.

Stop here until the user explicitly approves applying this reviewed migration to production.

- [ ] **Step 6: After approval, apply database migration before application deployment**

Apply the reviewed additive RPC/index migration first. Verify one direct RPC call, then deploy the application. If the RPC check fails, do not deploy the application.

- [ ] **Step 7: Monitor and retain fallback**

Monitor Dashboard error rate, fallback count, mismatch paths, P75/P95, and maximum duration. Keep the legacy fallback for at least seven days and 1,000 invocations. Roll back the application immediately if mismatches occur; the additive RPC and indexes can remain unused.

- [ ] **Step 8: Commit final verification notes if repository policy requires them**

Do not commit secrets, raw customer/order payloads, or production cookies. Commit only aggregate benchmark numbers and reviewed migration identifiers.
