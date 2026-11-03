# Navigation performance implementation plan

**Goal:** Keep navigation visible and shorten the data path without changing business rules, permissions, URLs, filters, calculations, or cache freshness.

**Architecture:** Preserve the existing sidebar above page boundaries for admin screens only. Keep existing page wrappers as an idempotent fallback. Stream print summaries separately, and run independent order queries concurrently. Reuse Next.js Router Cache and existing server caches; do not introduce a second data cache.

**Constraints:** Preserve existing uncommitted order-save changes. Customer, warehouse, login, print, and preview screens retain their existing layouts. No schema changes or deployment.

- [x] Test route eligibility including public, warehouse, print and preview routes; implement persistent navigation.
- [x] Preserve provider resets on navigation so modal drafts, search registration and loaded picker data retain their previous lifetime.
- [x] Move existing incoming-order print summary work behind a Suspense boundary; keep all grouping, totals, delivery mapping and filtering unchanged.
- [x] Test query results and error handling; run order items and customers concurrently, then dependent vehicle lookup.
- [ ] Production SQL timing/index verification: Supabase MCP refused the read-only statistics request (permission denied). No database/schema changes made.
- [x] Run Node tests, lint, build and browser navigation checks. Review final diff for permission, print, stale-data and calculation regressions.

Ruling: Execute in this session under the user's explicit instruction to proceed; no additional approval checkpoint. Keep existing cache lifetimes and invalidation because extending them could change visible data freshness.


Ruling: Use the standard `(workspace)` route group rather than session lookup in the global root. This preserves static public pages and keeps the persistent shell scoped to back-office routes. Route URLs and page-level permission checks are unchanged; imports and file-based tests follow the new source locations.

Verification: 40 Node tests passed; full ESLint passed; production build passed after regenerating stale Next.js route types. A fresh reviewer found no business-rule regressions. Playwright/Edge checked the real production-mode login and unauthenticated redirect. An isolated browser harness using the actual sidebar and modal provider with a mocked router/action checked persistent sidebar DOM, one sidebar, modal reset/reload and out-of-order responses. This is not an authenticated production end-to-end test or a performance benchmark.

The pre-existing manual-save source assertion was updated from `savedOrder` to `updatedOrder`, matching the existing uncommitted action implementation; no save logic was changed for this task.
