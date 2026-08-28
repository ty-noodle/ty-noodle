# Dashboard Performance Redesign

## Status

Approved in chat on 2026-08-28. This document defines the design boundary before implementation planning. It does not authorize an unreviewed production database change.

## Problem

Production navigation to `/dashboard` has exhibited React Server Component response times near 48 seconds, while nearby routes such as `/stock` complete in roughly 50–200 milliseconds. The database is small enough that total volume is not the primary constraint, but the Dashboard data path fans out into roughly 19–23 Supabase Data API requests. A single delayed request holds the enclosing `Promise.all` and therefore the whole Dashboard response.

One Dashboard query fetches every confirmed delivery note whose dispatch status is pending. It currently reaches PostgREST's 1,000-row response limit. The Dashboard only needs a count and total amount, so transferring rows is both inefficient and capable of producing an incorrect truncated result.

The existing Supabase client has no request deadline. Several Dashboard query shapes also lack indexes aligned with their complete organization/status/date/order predicates. Navigation links disable Next.js prefetching, amplifying the perceived delay.

## Goals

- Preserve every user-visible Dashboard value and interaction.
- Remove dependence on PostgREST's 1,000-row response limit for aggregate values.
- Reduce the Dashboard's initial Supabase request fan-out from roughly 19–23 requests to no more than five request groups.
- Target a warmed production RSC response P95 of 500 milliseconds or less under representative traffic.
- Target a median warmed database/API data-loading duration of 250 milliseconds or less.
- Bound transient upstream delays so one widget cannot hold the complete route for tens of seconds.
- Provide measurement that distinguishes navigation, Vercel execution, Supabase API, and PostgreSQL time.
- Keep deployment reversible without deleting production data.

The observed 47–48 second outlier should improve by approximately 100x if the 500 ms P95 target is met. A universal 100x guarantee is not a goal because cold starts and external network conditions are not fully controlled by the application.

## Non-Goals

- Changing Dashboard layout, wording, filters, calculations, or business rules.
- Replacing Supabase, Vercel, Next.js, or the existing authentication model.
- Introducing eventually consistent materialized summaries.
- Loading unlimited detail rows into the browser.
- Optimizing unrelated report, billing, order-entry, or print routes in this change.

## Result-Equivalence Contract

The redesigned path must return the same values as the existing implementation for the same organization, Bangkok business date, and database snapshot.

The contract covers:

- All KPI fields: today's order count and amount, profit, cost, submitted count, pending-delivery count and amount, month delivered amount, active customers, and low-stock count.
- Recent orders, including ordering, customer names, totals, and statuses.
- Daily performance rows and range dates.
- Weekly trend, top customers, and top products, including the current empty results where the existing code intentionally bypasses those queries.
- Stock products and suppliers.
- LINE order entries, pricing warning state, profile data, ordering, and identifiers.
- Store-status summary, including all, ordered, and unordered stores and their current sort order.
- Expanded-order behavior and product options when an order is expanded.

Numeric comparisons will use exact equality for integer counts and normalized decimal equality for currency values. Array comparisons will include ordering. Date calculations will continue to use the Bangkok business date.

## Selected Architecture

### 1. Database aggregate RPC

Add a versioned PostgreSQL function for the initial Dashboard aggregate snapshot. It will accept an organization ID and business date and return a typed `TABLE` result with one row containing the KPI values that currently require multiple row-returning Data API calls. Scalar columns will use PostgreSQL numeric and integer types rather than an unvalidated JSON payload.

The function will aggregate inside PostgreSQL using `count(*)`, `sum(...)`, and scoped joins. Pending-delivery count and amount will be computed in the database, so correctness and performance do not depend on the PostgREST row cap.

The function must be scoped by organization ID in every contributing query. It will be callable only by the server-side service role. Public and authenticated execution will be revoked explicitly. It will use a fixed `search_path` and schema-qualified references. The function will not use `SECURITY DEFINER` unless a concrete permission requirement proves it necessary; the default design is security-invoker execution from the service-role server client.

### 2. Bounded detail queries

Data that is genuinely displayed as rows remains separate from the aggregate RPC, but each query must have an explicit semantic bound:

- Recent orders: five rows.
- Store status: active stores plus orders for the selected business date.
- LINE orders: selected business date only.
- Daily performance: selected seven-day range only.
- Stock catalog: active/current products and suppliers required by the current UI.
- Expanded order: only the selected order and its supporting options.

The initial unexpanded Dashboard will execute exactly five independent request groups concurrently: aggregate RPC, recent/daily report detail, store-status detail, stock detail, and LINE-order detail. Related queries inside a group may be combined in a typed RPC where doing so preserves the existing result contract. Expanded-order data will not run unless an expanded order is requested and is excluded from the five-group initial-load limit.

### 3. Query indexes

Add only indexes justified by the actual Dashboard predicates and verified with `EXPLAIN (ANALYZE, BUFFERS)` against production-like statistics. Candidate shapes include:

- Recent orders by organization, eligible status, and descending creation time.
- Orders by organization, business date, and status/customer.
- Delivery notes by organization, confirmation status, dispatch status, and delivery date.
- Child lookup by delivery-note or order ID where an existing index is absent or not selected.

Existing composite indexes will be inspected first. Redundant indexes will not be added merely because the generic advisor suggests a single-column index.

Production index creation will use ordinary idempotent `CREATE INDEX IF NOT EXISTS` statements during the agreed low-traffic deployment window. The largest affected tables are currently small enough for this approach, and it remains compatible with transactional migration runners. Before production execution, the plan must recheck relation sizes and stop if an affected table has grown enough that a blocking build is no longer acceptable.

### 4. Request deadlines and isolation

Server-side Supabase requests will receive a bounded abort deadline. The required aggregate RPC deadline is five seconds, each optional group deadline is three seconds, and the total Dashboard data deadline is six seconds. A delayed optional detail group must not prevent the route shell and core KPI data from rendering indefinitely. These values may be lowered after benchmark evidence but may not be raised without a design amendment.

The core aggregate result remains required. Optional groups will use independent error boundaries/fallbacks that preserve the existing empty-state shapes and log a structured timing/error event. No timeout fallback may silently substitute zero for a valid KPI; required KPI failure must be explicit and observable.

### 5. Next.js navigation behavior

Restore automatic Link prefetching for primary application navigation and correct route loading filenames so Next.js can prefetch partial route payloads and show loading feedback immediately. This changes perceived responsiveness but not data semantics.

The Dashboard's server data boundary will remain streamable. Cached data may be introduced only where invalidation is already reliable and the maximum staleness is explicitly accepted. The initial design does not rely on long-lived caching to meet correctness or performance goals.

### 6. Observability

Add structured server timings for these boundaries:

- Session validation.
- Dashboard aggregate RPC.
- Store-status detail.
- Stock detail.
- Daily-performance detail.
- LINE-order detail.
- Expanded-order detail.
- Total Dashboard server data duration.

Client navigation measurement will record route start, first loading feedback, RSC completion, and route settled time without including personal or business data. Telemetry writes must be asynchronous/best-effort and must never delay navigation.

## Data Flow

1. User selects Dashboard through a prefetched Next.js Link.
2. Next.js validates the signed application session and derives organization ID and Bangkok business date.
3. The server starts the aggregate RPC and bounded detail groups concurrently.
4. PostgreSQL computes aggregate values without returning source rows.
5. The route streams its loading boundary immediately and renders complete data as groups resolve.
6. Structured timings are emitted out of band.
7. An expanded-order request adds only the selected order's detail queries.

## Failure Handling

- Required aggregate failure: render the existing Dashboard-safe error state, record the failing boundary and duration, and avoid presenting truncated or invented KPI values.
- Optional detail timeout: render the existing empty-state representation for that section and record a structured timeout.
- Database function unavailable during staggered deployment: temporarily use the legacy calculation path behind a server-side compatibility branch.
- Invalid or mismatched RPC payload: reject it and use the compatibility path; do not partially merge incompatible values.
- Navigation prefetch failure: normal click navigation remains functional and displays the route loading state.

## Migration and Rollout

### Phase 1: Measurement and equivalence harness

- Add a benchmark/equivalence harness that can execute legacy and candidate paths against the same read-only snapshot.
- Capture baseline median, P75, P95, maximum, request count, and response bytes.
- Confirm current production index definitions and query plans.

### Phase 2: Database capability

- Create the versioned aggregate RPC and required indexes through a reviewed migration.
- Revoke unintended function execution privileges.
- Execute read-only equivalence tests while the application still uses the legacy path.

### Phase 3: Shadow comparison

- For controlled diagnostic executions, invoke both paths and compare results without exposing candidate values to users.
- Log only field names and mismatch categories, never customer/order payloads.
- Require zero unexplained mismatches across representative dates: no orders, normal day, high-volume day, month boundary, and records beyond 1,000 pending deliveries.

### Phase 4: Application cutover

- Switch the Dashboard to the aggregate RPC with the legacy path retained as a temporary compatibility fallback.
- Restore primary navigation prefetch and correct loading boundaries.
- Monitor latency, errors, fallbacks, and mismatches.

### Phase 5: Cleanup

- Remove the legacy fallback only after at least seven consecutive days and at least 1,000 production Dashboard invocations with no unexplained result mismatch, whichever takes longer, and acceptable P95 latency.
- Retain the benchmark and equivalence tests.

## Rollback

Application rollback switches the server path back to the legacy implementation. The additive RPC and indexes may remain safely unused during incident response. Dropping them is a separate reviewed migration and is not required for immediate rollback.

No existing table, column, row, policy, or function will be deleted or overwritten as part of the initial rollout.

## Testing Strategy

### Regression tests

- Verify aggregate mapping and numeric normalization.
- Verify pending-delivery totals with more than 1,000 source rows.
- Verify Bangkok date and month-boundary calculations.
- Verify stable ordering and exact shapes for every detail array.
- Verify expanded and unexpanded Dashboard behavior.
- Verify timeout behavior does not convert required KPI failures into zeros.

### Database tests

- Compare legacy SQL/application results with RPC results on the same transaction snapshot.
- Run `EXPLAIN (ANALYZE, BUFFERS)` for representative predicates before and after indexes.
- Verify function privileges and fixed search path.
- Verify cross-organization isolation.

### Application verification

- Run targeted tests, lint, TypeScript/build validation, and the repository's production build.
- Exercise Dashboard navigation in a production build with an authenticated session.
- Confirm loading feedback appears immediately and no duplicate full-page request is introduced.

### Performance verification

- Run at least ten warmed measurements per representative Dashboard state.
- Report median, P75, P95, maximum, request count, payload bytes, and fallback count.
- Compare production-like cold and warm behavior separately.
- Do not claim the performance target from a single fast request.

## Acceptance Criteria

- All result-equivalence tests pass with zero unexplained mismatches.
- Aggregate results remain correct with more than 1,000 matching source rows.
- Initial unexpanded Dashboard uses no more than five Supabase request groups.
- Warmed RSC response P95 is 500 ms or less in the agreed production-like benchmark.
- No individual optional request can hold the entire Dashboard for tens of seconds.
- Primary navigation shows immediate loading feedback.
- Lint and production build complete successfully.
- Production rollout has a tested application rollback path.

## Fixed Implementation Constraints

- The aggregate RPC returns one typed table row, not a JSON object.
- Initial unexpanded loading is limited to five concurrent request groups.
- Required aggregate, optional group, and total deadlines are five, three, and six seconds respectively.
- Initial index creation uses idempotent non-concurrent statements only after a fresh size check and during a low-traffic window.
- The compatibility fallback remains for at least seven days and 1,000 production Dashboard invocations with zero unexplained mismatches.
