# Investigation: DN2026100574

Read-only investigation on 2026-11-04. Customer TYS037, delivery date 2026-10-09, product TYN027.

- The source order has one item: 40 kg at 30 baht, total 1,200 baht.
- Exactly one delivery-note header exists for this customer/date. Its stored total is 2,400 baht.
- That delivery note has two distinct item rows referencing the SAME order_item_id, each 40 kg / 1,200 baht.
- The first row was created at 2026-10-09 14:14:17.566394 Bangkok time; the second at 14:14:18.025097, 0.458703 seconds later.
- Two inventory issue movements exist at the same corresponding timestamps, each -40 base units. This note therefore recorded an 80-unit stock issue instead of 40. It is a persisted duplicate write, not just duplicated rendering.
- The regular print route groups SKU/unit and sums both rows, producing 80 kg / 2,400 baht. The attachment reader renders both saved rows independently, producing two 40-kg lines / 2,400 baht.
- Billing record VB202611041957 (2026-10-01 through 2026-10-31) saves this delivery note as 1,200 baht in its snapshot. Its stored grand total is 13,218 baht. Billing calculations deduplicate source order_item_id references; therefore the billing snapshot and delivery print disagree.
- An October-only scan of 7,306 confirmed delivery-item rows for the same organization found one repeated (delivery_note_id, order_item_id) group: this note. This does not establish that other months are unaffected, or that every repeated group in general is invalid (partial deliveries can be legitimate).

Code explains the failure mechanism: the older create_store_delivery_note implementation reuses a store/date header and appends item rows and stock issues, adding to total_amount. Serializing header creation alone does not make a repeated delivery request idempotent. A second invocation with the same full item can therefore add it again. The local 20261017190000 migration adds a retry guard and serializes complete rebuilds, but its presence locally does not prove the production database has applied it. The offending records predate that migration.

The database records prove repeated processing of the same source item. They cannot identify whether the trigger was a double click, concurrent callers, or a retry without request logs. No production records, stock quantities, or billing records were modified during this investigation. Any repair must reconcile the duplicate item, delivery-note total, and inventory issue together; hiding a duplicate in print alone leaves inconsistent financial/stock data.

## Authorized repair, 2026-11-04

The user authorized repair and verification of prevention. The production migration registry contains 20261017190000. Inspection of the deployed function definitions confirmed that create_store_delivery_note contains the full-item retry guard and transaction advisory lock, and sync_order_delivery_note_atomic locks the entire rebuild. No function deployment was needed.

Executed scripts/repair-DN2026100574.sql first inside a transaction with scripts/tests/delivery-retry.integration.sql, then ROLLBACK. After simulated repair, two identical create_store_delivery_note calls preserve item rows, the product row, movement records, and note data. On a separate transaction the existing function touches the note updated_at timestamp, so the final test excludes only that timestamp; stock, amounts and all other note fields must be unchanged. This exercises the actual deployed database function, not a mock.

Committed only the scoped repair in one transaction: preserved the original delivery item, deleted the proven second item, set the note total to 1,200, and returned 40 base units to the product. Added one adjustment movement with repair_key duplicate-DN2026100574-20261104, including the full removed row and previous note total in metadata. Original issue movement records remain for audit. The repair compares the billing-record hash before/after and aborts if billing records change. Guards abort on unexpected source quantities, totals, duplicate shape or stock-issue count; rerunning an already completed repair is a checked no-op.

Committed result: one item row, quantity 40 kg, header and line total 1,200 baht. The billing snapshot stays at 1,200 and its bill total stays 13,218. Historical root cause remains repeated processing before the retry guard existed; logs are insufficient to attribute that processing to a specific user action.
