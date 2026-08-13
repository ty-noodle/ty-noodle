# Customer Receipt Storage Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically delete only customer receipt image files older than 30 days from the `customer-receipts/**/line-receipts/` Storage paths.

**Architecture:** A protected Next.js route uses the server-side Supabase admin client to enumerate each organization’s `line-receipts` folder, selects only direct child files whose `created_at` is older than 30 days, and removes them through the Storage API. Vercel Cron invokes the route once daily; no database rows or other Storage buckets are modified.

**Tech Stack:** Next.js App Router route handler, Supabase Storage server client, Vercel Cron.

## Global Constraints

- Only the `customer-receipts` bucket is eligible.
- Only paths matching `<organizationId>/line-receipts/<filename>` are eligible.
- Files younger than or equal to 30 days are retained.
- The route requires `Authorization: Bearer <CRON_SECRET>`.
- Deletion uses Supabase Storage `remove`, never SQL deletion from `storage.objects`.

---

### Task 1: Add the protected cleanup route

**Files:**
- Create: `src/app/api/cron/cleanup-customer-receipts/route.ts`

**Interfaces:**
- Consumes: `CRON_SECRET`, the `organizations` table, and the `customer-receipts` Storage bucket.
- Produces: `GET /api/cron/cleanup-customer-receipts` returning a JSON cleanup summary.

- [ ] **Step 1: Implement authorization and exact path filtering**

The handler must reject requests unless the bearer token matches `CRON_SECRET`, list organizations, list only each exact `<orgId>/line-receipts` folder, skip nested entries and files without a valid `created_at`, and remove expired paths in batches of at most 1,000.

- [ ] **Step 2: Return operational results without exposing secrets**

Return counts for organizations scanned, files scanned, files selected, files deleted, and failures. Log only paths and error messages, never tokens.

- [ ] **Step 3: Verify with lint and TypeScript**

Run `npm run lint` and `npx tsc --noEmit`.

### Task 2: Schedule the cleanup in Vercel

**Files:**
- Create: `vercel.json`
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Consumes: Vercel Cron and the production `CRON_SECRET` environment variable.
- Produces: A daily invocation at `03:00 UTC`.

- [ ] **Step 1: Add the daily cron schedule**

Configure `/api/cron/cleanup-customer-receipts` with cron expression `0 3 * * *`.

- [ ] **Step 2: Document the required production secret**

Document that `CRON_SECRET` must be configured in Vercel Production Environment Variables. Do not add a real secret to the repository.

- [ ] **Step 3: Run the production checks**

Run `npm run lint` and `npm run build`.

### Task 3: Final scope verification

**Files:**
- Verify: `src/app/api/cron/cleanup-customer-receipts/route.ts`
- Verify: `vercel.json`

- [ ] **Step 1: Confirm only the intended bucket and prefix are referenced**

Search the new files for Storage bucket and path constants; confirm there is no delete operation against another bucket or database table.

- [ ] **Step 2: Confirm the working tree diff**

Run `git diff --check` and review the diff without reverting unrelated existing user changes.
