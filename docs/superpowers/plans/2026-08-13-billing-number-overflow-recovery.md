# Billing Number Overflow Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent billing numbers above 999 from truncating, stop printing when history persistence fails, and safely recover the affected 2026-08-13 records.

**Architecture:** A forward-only Supabase migration replaces the formatter with a minimum-width expression and repairs the two persisted truncated numbers. The server action validates both RPC and insert responses and returns a failure before the client prints. Production recovery is performed only after read-only identification of the affected customers and post-migration verification.

**Tech Stack:** PostgreSQL/Supabase migrations, Next.js 16 server actions, TypeScript, Node.js built-in test runner.

## Global Constraints

- Preserve unrelated working-tree changes.
- Never reuse the duplicated printed number for missing records.
- Do not print unless every requested billing history row is persisted or already exists.
- Use a forward-only migration; do not edit an already-applied migration.

---

### Task 1: Add regression coverage

**Files:**
- Create: `scripts/tests/billing-number-overflow.test.mjs`

**Interfaces:**
- Consumes: billing migration SQL and `recordBillingHistoryAction` source.
- Produces: regression checks for minimum-width formatting and insert-error propagation.

- [ ] Write tests asserting the new migration preserves `1000` and the action checks RPC and insert errors.
- [ ] Run `node --test scripts/tests/billing-number-overflow.test.mjs` and confirm it fails against current production code.

### Task 2: Implement the application and database fix

**Files:**
- Create: `supabase/migrations/202608131700_fix_billing_number_overflow.sql`
- Modify: `src/lib/billing/actions.ts`

**Interfaces:**
- Consumes: `next_billing_number(organization_id, billing_date)` and `billing_records` constraints.
- Produces: non-truncating numbers and `{ success: false, error }` on any persistence failure.

- [ ] Replace `lpad(value, 3, '0')` with minimum-width formatting using `greatest(3, length(value))`.
- [ ] Repair persisted 2026-08-13 suffixes `100` and `101` to `1000` and `1010` when unambiguous.
- [ ] Check RPC and insert errors and return failure without reporting unsaved records.
- [ ] Run the regression test and confirm it passes.

### Task 3: Verify and recover production

**Files:**
- No committed diagnostic files.

**Interfaces:**
- Consumes: affected production records and current delivery-note candidates.
- Produces: corrected database function and a verified list of records needing reissue.

- [ ] Run lint and production build.
- [ ] Apply the migration using the configured Supabase workflow.
- [ ] Verify persisted corrected numbers and counter state read-only.
- [ ] Identify the nine missing customers without guessing, then create replacement histories only if the source set is provable.
- [ ] Report which physical documents must be voided and reprinted.
