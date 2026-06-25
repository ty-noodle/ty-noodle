# Customer Code Auto/Manual Entry Design

## Goal

Allow administrators to choose between an automatically generated customer code and a manually entered code when creating a store. Administrators must also be able to change the code while editing a store.

## Code Rules

- Customer codes use the existing `TYS` prefix followed by one or more digits.
- Matching is case-insensitive at input time; saved codes are normalized to uppercase.
- Leading and trailing whitespace is removed before validation.
- Examples of valid codes: `TYS001`, `TYS125`, `TYS1000`.
- Examples of invalid codes: `001`, `TY001`, `TYS`, `TYS12A`.
- A code must be unique within the current organization, including codes belonging to inactive customers.

## Create Store Flow

The customer form displays two code modes:

1. **Automatic** (default): shows the existing next-code preview and submits the automatic mode. The server calculates the next available `TYS` sequence at save time so a stale page cannot cause a duplicate.
2. **Manual**: enables the code input. The administrator enters a code that follows the required format.

Switching back to automatic restores the automatic preview. The submitted mode determines whether the server generates a code or validates the entered code.

## Edit Store Flow

The existing customer code is shown in an editable input. Editing does not require an auto/manual selector because an existing store already has an assigned code. The server validates and normalizes the submitted value before updating it.

Leaving the code unchanged is valid. Changing it to another customer's code is rejected.

## Server Validation and Persistence

The server action is the source of truth.

- Create in automatic mode: generate the next `TYS` code from all customer codes in the organization.
- Create in manual mode: normalize and validate the submitted code.
- Edit: normalize and validate the submitted code.
- Reject empty or malformed codes with a field-level error.
- Check for another customer using the same code before insert or update.
- Keep the existing database unique index as the final concurrency safeguard and translate PostgreSQL error `23505` into the same field-level duplicate-code message.
- On edit, include `customer_code` in the update payload.

No database migration is required because `(organization_id, customer_code)` already has a unique index.

## Automatic Numbering

Automatic numbering continues to inspect only codes matching `TYS` followed by digits. It uses the highest numeric suffix plus one and pads values below 1000 to at least three digits.

Examples:

- Highest code `TYS009` produces `TYS010`.
- A manually entered `TYS125` makes the next automatic code `TYS126`.
- Nonconforming legacy values do not affect the sequence.

## Error Handling

The form keeps the modal open and displays errors beside the customer-code field.

- Invalid format: explain that the code must be `TYS` followed by numbers.
- Duplicate code: explain that the code is already in use.
- Automatic generation failure: preserve the existing general retry message.

## Verification

Add focused tests for code normalization, format validation, automatic sequence calculation, and duplicate handling where the current test setup permits. Because this repository has no first-party test command, the minimum full verification remains:

- `npm run lint`
- `npm run build`

The create and edit flows should also be manually checked for automatic creation, valid manual creation, malformed input, duplicate input, unchanged edit, and duplicate edit.

## Out of Scope

- Changing the LINE self-registration flow.
- Renaming the `TYS` prefix.
- Reusing deleted or inactive customer codes.
- Changing supplier or product code behavior.
