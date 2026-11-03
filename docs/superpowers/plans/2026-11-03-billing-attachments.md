# Billing delivery attachments

Approved scope: separate A4 landscape printing from the dot-matrix billing statement, on both the create tab and billing history. Match the selected compact mockup: shared customer heading, chronological left/right pairs, each pair as tall as its longer note, blank space below its shorter note. Never cut at ten products. Use real HTML text and local Thai fonts.

Approach: reuse delivery-note print data, add a read-only attachment route, and measure rendered rows to paginate without shrinking text. Historical requests resolve the saved billing record and its exact delivery numbers on the server. Fail visibly if a referenced note is unavailable; never silently print a partial attachment. No schema changes or new dependencies.

- [x] Add tests for variable-height pairing, page overflow, very long notes, selection validation, historical membership and organization isolation.
- [x] Implement the read-only loader and A4 layout, including repeated headings and continuation for notes taller than a whole page.
- [x] Add separate labeled print links in the create footer, history list and history details (desktop/mobile).
- [x] Inspect rendered print fixtures/PDF with 8 short notes, mixed 12/5 rows, multiple pages and long names. Final lint and production build passed after the direct-print adjustment.

Limits to check: historical billing snapshots store note totals but not product-line snapshots; attachment products come from existing delivery notes. Do not silently print changed monetary totals as though they matched the original bill.

Verification: 58 Node tests passed, including nine focused attachment tests. Final lint and production build passed. Browser checks covered 8 short notes on one A4 page, mixed 12/5 pairs on one page, a 90-item note with wrapping names across pages (126 total rows preserved), and two separate customer documents. Exported PDFs contain selectable text and zero raster images. Desktop history and mobile create/history controls were inspected; font-ready automatic printing and manual reprinting were exercised. A read-only smoke check against an existing saved bill loaded five delivery notes and 22 product lines successfully. No database writes or schema changes.

Review correction: the existing shared delivery print reader ignored the stored sale unit. Added a failing regression test, then changed its mapping to prefer sale_unit_label with products.unit as fallback. All callers retain the same interface.

User correction: attachment printing must stay on the billing screen and open the system print dialog directly. Replaced new-tab links with a shared hidden-frame print button, waiting for local fonts and measured pagination. Source/origin-checked messages remove the frame after printing; data/loading errors appear on the original screen without printing incomplete documents. Added a ninth focused regression test. Browser checks verified create and mobile-history printing without new tabs or navigation, exact selection/record identifiers, afterprint cleanup, and error cleanup without invoking print.
