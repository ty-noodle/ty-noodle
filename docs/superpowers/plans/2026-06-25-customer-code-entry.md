# Customer Code Auto/Manual Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let administrators create stores with either an automatic or manually entered `TYS` code and edit existing store codes without allowing duplicates.

**Architecture:** Extract customer-code normalization, validation, and sequence generation into a small dependency-free module that can be tested with Node's built-in test runner. The customer server actions will use that module and remain the source of truth for mode selection, uniqueness checks, and persistence. The existing customer form will add an auto/manual selector only during creation and make the code editable during updates.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/PostgreSQL, Node.js built-in test runner, ESLint.

---

## File Structure

- Create `src/lib/settings/customer-code.ts`: pure customer-code normalization, format validation, and next-sequence calculation.
- Create `src/lib/settings/customer-code.test.ts`: focused tests for the pure code rules.
- Modify `src/lib/settings/admin.ts`: reuse the shared next-code function for the customer settings preview.
- Modify `src/app/settings/customers/actions.ts`: validate mode/code, check duplicates, persist edited codes, and map unique-index errors.
- Modify `src/components/settings/customer-form.tsx`: render auto/manual controls for create mode and an editable code field for edit mode.

### Task 1: Extract and Test Customer-Code Rules

**Files:**
- Create: `src/lib/settings/customer-code.test.ts`
- Create: `src/lib/settings/customer-code.ts`
- Modify: `src/lib/settings/admin.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/settings/customer-code.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  getNextCustomerCode,
  normalizeCustomerCode,
  validateCustomerCode,
} from "./customer-code.ts";

test("normalizes customer codes to trimmed uppercase text", () => {
  assert.equal(normalizeCustomerCode("  tys125  "), "TYS125");
});

test("accepts only TYS followed by digits", () => {
  assert.equal(validateCustomerCode("TYS001"), null);
  assert.equal(validateCustomerCode("TYS1000"), null);
  assert.equal(validateCustomerCode("001"), "รหัสร้านต้องขึ้นต้นด้วย TYS และตามด้วยตัวเลขเท่านั้น");
  assert.equal(validateCustomerCode("TYS"), "รหัสร้านต้องขึ้นต้นด้วย TYS และตามด้วยตัวเลขเท่านั้น");
  assert.equal(validateCustomerCode("TYS12A"), "รหัสร้านต้องขึ้นต้นด้วย TYS และตามด้วยตัวเลขเท่านั้น");
});

test("requires a customer code", () => {
  assert.equal(validateCustomerCode(""), "กรอกรหัสร้านก่อนบันทึก");
});

test("calculates the next code from valid TYS codes only", () => {
  assert.equal(getNextCustomerCode(["TYS009", "legacy", "TYS125"]), "TYS126");
});

test("pads automatic codes to at least three digits", () => {
  assert.equal(getNextCustomerCode([]), "TYS001");
  assert.equal(getNextCustomerCode(["TYS999"]), "TYS1000");
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test src/lib/settings/customer-code.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `customer-code.ts`.

- [ ] **Step 3: Implement the pure customer-code module**

Create `src/lib/settings/customer-code.ts`:

```ts
export const CUSTOMER_CODE_FORMAT_ERROR =
  "รหัสร้านต้องขึ้นต้นด้วย TYS และตามด้วยตัวเลขเท่านั้น";
export const CUSTOMER_CODE_REQUIRED_ERROR = "กรอกรหัสร้านก่อนบันทึก";

export function normalizeCustomerCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

export function validateCustomerCode(value: unknown) {
  const code = normalizeCustomerCode(value);

  if (!code) {
    return CUSTOMER_CODE_REQUIRED_ERROR;
  }

  return /^TYS\d+$/.test(code) ? null : CUSTOMER_CODE_FORMAT_ERROR;
}

export function getNextCustomerCode(codes: string[]) {
  const maxSequence = codes.reduce((max, code) => {
    const match = /^TYS(\d+)$/i.exec(code.trim());

    if (!match) {
      return max;
    }

    const sequence = Number.parseInt(match[1], 10);
    return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
  }, 0);

  return `TYS${String(maxSequence + 1).padStart(3, "0")}`;
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Run:

```powershell
node --test src/lib/settings/customer-code.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Reuse the helper in settings data**

In `src/lib/settings/admin.ts`, import:

```ts
import { getNextCustomerCode } from "@/lib/settings/customer-code";
```

Delete the local `getNextCustomerCode` implementation and keep the existing call that populates `nextCustomerCode`.

- [ ] **Step 6: Run focused verification**

Run:

```powershell
node --test src/lib/settings/customer-code.test.ts
npx tsc --noEmit
```

Expected: tests pass and TypeScript exits with code 0.

- [ ] **Step 7: Commit**

```powershell
git add src/lib/settings/customer-code.ts src/lib/settings/customer-code.test.ts src/lib/settings/admin.ts
git commit -m "Add customer code validation helpers"
```

### Task 2: Add Server-Side Mode, Validation, and Duplicate Protection

**Files:**
- Modify: `src/app/settings/customers/actions.ts`
- Test: `src/lib/settings/customer-code.test.ts`

- [ ] **Step 1: Add a failing normalization case**

Extend `src/lib/settings/customer-code.test.ts`:

```ts
test("normalizes lowercase manual input before validation", () => {
  const code = normalizeCustomerCode(" tys007 ");
  assert.equal(validateCustomerCode(code), null);
  assert.equal(code, "TYS007");
});
```

- [ ] **Step 2: Run the test and verify it passes for the shared contract**

Run:

```powershell
node --test src/lib/settings/customer-code.test.ts
```

Expected: 6 tests pass. This locks the normalization contract before wiring it into the server action.

- [ ] **Step 3: Parse customer code data in form validation**

In `src/app/settings/customers/actions.ts`, import:

```ts
import {
  getNextCustomerCode,
  normalizeCustomerCode,
  validateCustomerCode,
} from "@/lib/settings/customer-code";
```

Add:

```ts
type CustomerCodeMode = "auto" | "manual";

function getCustomerCodeMode(value: FormDataEntryValue | null): CustomerCodeMode {
  return value === "manual" ? "manual" : "auto";
}
```

Remove the local `getNextCustomerCode` implementation. Update `validateCustomerForm`:

```ts
function validateCustomerForm(formData: FormData, options: { isEditMode: boolean }) {
  const customerCodeMode = options.isEditMode
    ? "manual"
    : getCustomerCodeMode(formData.get("customerCodeMode"));
  const customerCode = normalizeCustomerCode(formData.get("customerCode"));
  const defaultVehicleId = getTrimmedText(formData.get("defaultVehicleId"));
  const name = getTrimmedText(formData.get("name"));
  const address = getAddressPayload(formData.get("addressPayload"));
  const fieldErrors: Partial<Record<CreateCustomerField, string>> = {};

  if (customerCodeMode === "manual") {
    const codeError = validateCustomerCode(customerCode);
    if (codeError) {
      fieldErrors.customerCode = codeError;
    }
  }

  // Keep the existing name and address validation.

  return {
    address,
    customerCode,
    customerCodeMode,
    defaultVehicleId: defaultVehicleId || null,
    fieldErrors,
    name,
    success: Object.keys(fieldErrors).length === 0,
  };
}
```

Call it with `{ isEditMode: false }` from create and `{ isEditMode: true }` from update.

- [ ] **Step 4: Add organization-scoped duplicate lookup**

Add:

```ts
async function customerCodeExists(
  organizationId: string,
  customerCode: string,
  excludedCustomerId?: string,
) {
  const admin = getSupabaseAdmin();
  let query = admin
    .from("customers")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("customer_code", customerCode);

  if (excludedCustomerId) {
    query = query.neq("id", excludedCustomerId);
  }

  const { data, error } = await query.limit(1).maybeSingle();

  if (error) {
    return { error: true, exists: false };
  }

  return { error: false, exists: Boolean(data) };
}
```

Do not filter by `is_active`; inactive codes remain reserved.

- [ ] **Step 5: Resolve create codes by selected mode**

After validation succeeds in `createCustomerAction`:

```ts
const customerCode =
  validation.customerCodeMode === "auto"
    ? await generateCustomerCode(session.organizationId)
    : validation.customerCode;
```

Keep the existing automatic-generation error when the result is empty. For manual mode, call `customerCodeExists`; return:

```ts
{
  fieldErrors: { customerCode: "รหัสร้านนี้ถูกใช้งานแล้ว" },
  message: "บันทึกไม่สำเร็จ เพราะมีรหัสร้านนี้อยู่แล้ว",
  status: "error",
}
```

Continue mapping PostgreSQL `23505` to the same response for race-condition protection.

- [ ] **Step 6: Persist and protect edited codes**

Select `customer_code` with the customer lookup. Read `validation.customerCode` as `customerCode`. If it differs from the current code, call:

```ts
const duplicateCheck = await customerCodeExists(
  session.organizationId,
  customerCode,
  customerId,
);
```

Return the duplicate response if `exists` is true. Add:

```ts
customer_code: customerCode,
```

to the update payload. Handle update error `23505` with the same field-level duplicate response used during create.

- [ ] **Step 7: Run focused verification**

Run:

```powershell
node --test src/lib/settings/customer-code.test.ts
npx eslint "src/app/settings/customers/actions.ts"
npx tsc --noEmit
```

Expected: all tests pass; ESLint and TypeScript exit with code 0.

- [ ] **Step 8: Commit**

```powershell
git add src/app/settings/customers/actions.ts src/lib/settings/customer-code.test.ts
git commit -m "Validate editable customer codes"
```

### Task 3: Add Auto/Manual Controls to the Customer Form

**Files:**
- Modify: `src/components/settings/customer-form.tsx`

- [ ] **Step 1: Add form mode state**

Inside `CustomerForm`, add:

```ts
const [customerCodeMode, setCustomerCodeMode] = useState<"auto" | "manual">("auto");
const customerCodeIsAutomatic = !isEditMode && customerCodeMode === "auto";
```

- [ ] **Step 2: Add the create-only mode selector**

Before the customer-code input, render:

```tsx
{!isEditMode ? (
  <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
    <button
      type="button"
      onClick={() => setCustomerCodeMode("auto")}
      className={customerCodeMode === "auto"
        ? "rounded-lg bg-white px-3 py-2 text-sm font-semibold text-[#003366] shadow-sm"
        : "rounded-lg px-3 py-2 text-sm font-medium text-slate-500"}
    >
      อัตโนมัติ
    </button>
    <button
      type="button"
      onClick={() => setCustomerCodeMode("manual")}
      className={customerCodeMode === "manual"
        ? "rounded-lg bg-white px-3 py-2 text-sm font-semibold text-[#003366] shadow-sm"
        : "rounded-lg px-3 py-2 text-sm font-medium text-slate-500"}
    >
      กรอกเอง
    </button>
    <input type="hidden" name="customerCodeMode" value={customerCodeMode} />
  </div>
) : null}
```

- [ ] **Step 3: Make the field conditional and show field errors**

Update the input:

```tsx
<input
  id="customer-code"
  name="customerCode"
  required={!customerCodeIsAutomatic}
  readOnly={customerCodeIsAutomatic}
  defaultValue={initialCustomer?.code ?? defaultCode}
  className={getInputClass(showFieldErrors && Boolean(fieldErrors?.customerCode))}
  placeholder="TYS001"
  autoCapitalize="characters"
  pattern="TYS[0-9]+"
/>
```

Render the field error:

```tsx
{showFieldErrors && fieldErrors?.customerCode ? (
  <p className="text-sm font-medium text-red-600">{fieldErrors.customerCode}</p>
) : null}
```

Use mode-specific help text:

```tsx
<p className="text-sm text-slate-500">
  {customerCodeIsAutomatic
    ? "ระบบจะกำหนดรหัสร้านตามลำดับถัดไปเมื่อบันทึก"
    : "ใช้รูปแบบ TYS ตามด้วยตัวเลข เช่น TYS125"}
</p>
```

- [ ] **Step 4: Verify lint and types**

Run:

```powershell
npx eslint "src/components/settings/customer-form.tsx"
npx tsc --noEmit
```

Expected: both commands exit with code 0.

- [ ] **Step 5: Commit**

```powershell
git add src/components/settings/customer-form.tsx
git commit -m "Add manual customer code entry"
```

### Task 4: Full Verification

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run customer-code tests**

```powershell
node --test src/lib/settings/customer-code.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Run repository lint**

```powershell
npm run lint
```

Expected: exit code 0 with no new errors.

- [ ] **Step 3: Run production build**

```powershell
npm run build
```

Expected: Next.js production build succeeds.

- [ ] **Step 4: Manually verify the flows**

Run `npm run dev` and verify:

1. Create defaults to automatic and saves the next available `TYS` code.
2. Create in manual mode accepts `tys125` and stores/displays `TYS125`.
3. Manual create rejects `125`, `TYS`, and `TYS12A`.
4. Manual create rejects an active or inactive customer's existing code.
5. Edit allows changing a code and keeps an unchanged code valid.
6. Edit rejects another customer's code.
7. A manual high code changes the next automatic preview after refresh.

- [ ] **Step 5: Inspect the final diff**

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors; only intended files are modified.
