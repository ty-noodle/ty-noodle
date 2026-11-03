# Customer Drag-and-Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow administrators to reorder active stores smoothly on desktop and mobile, persist the complete order, and keep search and large lists safe.

**Architecture:** The customer list keeps one ordered client state and one dnd-kit context. Desktop renders sortable table rows; mobile renders sortable cards with a mobile-only drag overlay and custom edge scrolling. Search disables reordering, while the full unfiltered order is the only payload sent to the server.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase, `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/modifiers`, Tailwind CSS.

## Global Constraints

- Only active customers are reorderable.
- Dragging is disabled while a search term is present or fewer than two stores are visible.
- Mouse activation requires 8px movement; touch activation requires a 250ms hold with 5px tolerance; keyboard sorting remains supported.
- Failed persistence must restore the previous client order and show an error.
- The server must verify organization ownership and that the submitted IDs exactly match all active customers in the organization.
- The first 25 customers render immediately; additional customers render in batches of 25 near the viewport end.

### Task 1: Persist Customer Order

**Files:**
- Create: `supabase/migrations/202607111000_add_customer_sort_order.sql`
- Modify: `src/lib/settings/admin.ts`
- Modify: `src/app/settings/customers/actions.ts`

- [ ] Add the nullable-safe integer column, initialize it from customer code, and add an organization/order index.
- [ ] Select and map `sort_order`, ordering by `sort_order` then `customer_code`.
- [ ] Add `updateCustomerOrderAction(customerIds)` with admin authorization, duplicate/blank validation, exact active-customer count validation, per-row updates, and cache revalidation.

### Task 2: Reorder Logic Test

**Files:**
- Create: `src/lib/settings/customer-order.mjs`
- Create: `src/lib/settings/customer-order.test.mjs`

- [ ] Test moving an item, ignoring missing IDs, and normalizing a complete unique ID list.
- [ ] Use this helper from the client so the key reorder behavior has a fast executable regression test.

### Task 3: Smooth Customer List UI

**Files:**
- Modify: `src/components/settings/customer-list-panel.tsx`
- Modify: `src/app/settings/customers/settings-customers-client.tsx`

- [ ] Add shared sensors, optimistic state, rollback, save status, mobile auto-scroll, progressive rendering, and a drag overlay.
- [ ] Keep action controls outside the drag handle so editing, deletion, and vehicle selection remain clickable.
- [ ] Render only one responsive sortable DOM tree at a time to avoid duplicate dnd-kit IDs.

### Task 4: Verification

- [ ] Run the focused customer order test.
- [ ] Run ESLint on changed TypeScript files.
- [ ] Run `npm run lint` and `npm run build`.
- [ ] Run `git diff --check` and inspect the final diff for unrelated changes.
