-- Run inside a transaction. The caller must COMMIT only after every assertion passes.
-- Scoped repair: keep the original item, reverse only the proven duplicate issue.
DO $$
DECLARE
  v_org uuid := '120b642e-a0ec-4f9b-a828-7345318dfe84';
  v_note public.delivery_notes%ROWTYPE;
  v_order public.order_items%ROWTYPE;
  v_duplicate public.delivery_note_items%ROWTYPE;
  v_stock numeric;
  v_actor uuid;
  v_count integer;
  v_billing_hash text;
BEGIN
  SELECT * INTO STRICT v_note FROM public.delivery_notes
  WHERE organization_id = v_org AND delivery_number = 'DN2026100574';
  PERFORM pg_advisory_xact_lock(hashtext(v_org::text || ':' || v_note.customer_id::text || ':' || v_note.delivery_date::text));
  SELECT * INTO STRICT v_note FROM public.delivery_notes WHERE id = v_note.id FOR UPDATE;
  IF v_note.delivery_date <> DATE '2026-10-09' OR v_note.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Unexpected delivery note state; repair aborted';
  END IF;

  IF EXISTS (SELECT 1 FROM public.inventory_movements WHERE organization_id=v_org
    AND metadata->>'repair_key'='duplicate-DN2026100574-20261104') THEN
    IF (SELECT count(*) FROM public.delivery_note_items WHERE delivery_note_id=v_note.id) <> 1
       OR v_note.total_amount <> 1200 THEN
      RAISE EXCEPTION 'Repair marker exists but note state differs; inspect manually';
    END IF;
    RETURN;
  END IF;

  SELECT * INTO STRICT v_order FROM public.order_items
  WHERE organization_id=v_org AND id='99f8e628-8d3c-4226-bb42-37c822cd9507' FOR UPDATE;
  IF v_order.order_id <> v_note.order_id OR v_order.quantity <> 40
     OR v_order.quantity_in_base_unit <> 40 OR v_order.unit_price <> 30 OR v_order.line_total <> 1200 THEN
    RAISE EXCEPTION 'Source order changed; repair aborted';
  END IF;
  IF (SELECT count(*) FROM public.order_items WHERE order_id=v_note.order_id) <> 1 THEN
    RAISE EXCEPTION 'Source order has unexpected items; repair aborted';
  END IF;
  PERFORM 1 FROM public.delivery_note_items WHERE delivery_note_id=v_note.id FOR UPDATE;
  SELECT count(*) INTO v_count FROM public.delivery_note_items WHERE delivery_note_id=v_note.id;
  IF v_count <> 2 OR v_note.total_amount <> 2400 OR
     EXISTS (SELECT 1 FROM public.delivery_note_items WHERE delivery_note_id=v_note.id
       AND (order_item_id IS DISTINCT FROM v_order.id OR product_id <> v_order.product_id
         OR quantity_delivered <> 40 OR quantity_in_base_unit <> 40 OR unit_price <> 30 OR line_total <> 1200)) THEN
    RAISE EXCEPTION 'Duplicate shape changed; repair aborted';
  END IF;
  SELECT * INTO STRICT v_duplicate FROM public.delivery_note_items
  WHERE delivery_note_id=v_note.id AND id='b197ab1e-d556-4bbe-ae6f-bac9bc22643f';
  IF (SELECT count(*) FROM public.inventory_movements WHERE organization_id=v_org
      AND reference_number=v_note.delivery_number AND product_id=v_order.product_id
      AND movement_type='issue' AND quantity_delta=-40) <> 2 THEN
    RAISE EXCEPTION 'Expected two stock issues not found; repair aborted';
  END IF;
  SELECT created_by INTO v_actor FROM public.inventory_movements
  WHERE organization_id=v_org AND reference_number=v_note.delivery_number
    AND movement_type='issue' AND product_id=v_order.product_id
    AND created_at=v_duplicate.created_at LIMIT 1;
  SELECT md5(coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.id)::text,'')) INTO v_billing_hash
  FROM public.billing_records b WHERE b.organization_id=v_org AND b.customer_id=v_note.customer_id;
  SELECT stock_quantity INTO STRICT v_stock FROM public.products
  WHERE organization_id=v_org AND id=v_order.product_id FOR UPDATE;

  INSERT INTO public.inventory_movements(organization_id, product_id, movement_type,
    quantity_delta, stock_before, stock_after, reference_number, notes, metadata, created_by)
  VALUES (v_org, v_order.product_id, 'adjustment', 40, v_stock, v_stock+40, v_note.delivery_number,
    'คืนสต็อก 40 กก. จากการบันทึกรายการใบส่งของซ้ำ โดยเก็บรายการต้นฉบับไว้',
    jsonb_build_object('repair_key','duplicate-DN2026100574-20261104',
      'delivery_note_id',v_note.id,'order_item_id',v_order.id,
      'removed_duplicate_item',to_jsonb(v_duplicate),'previous_note_total',v_note.total_amount), v_actor);
  UPDATE public.products SET stock_quantity=stock_quantity+40
  WHERE organization_id=v_org AND id=v_order.product_id;
  DELETE FROM public.delivery_note_items WHERE id=v_duplicate.id AND delivery_note_id=v_note.id;
  UPDATE public.delivery_notes SET total_amount=1200 WHERE id=v_note.id AND organization_id=v_org;

  IF (SELECT count(*) FROM public.delivery_note_items WHERE delivery_note_id=v_note.id) <> 1
     OR (SELECT sum(quantity_delivered) FROM public.delivery_note_items WHERE delivery_note_id=v_note.id) <> 40
     OR (SELECT sum(line_total) FROM public.delivery_note_items WHERE delivery_note_id=v_note.id) <> 1200
     OR (SELECT stock_quantity FROM public.products WHERE id=v_order.product_id) <> v_stock+40 THEN
    RAISE EXCEPTION 'Post-repair assertion failed';
  END IF;
  IF v_billing_hash IS DISTINCT FROM (SELECT md5(coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.id)::text,''))
    FROM public.billing_records b WHERE b.organization_id=v_org AND b.customer_id=v_note.customer_id) THEN
    RAISE EXCEPTION 'Billing records changed unexpectedly';
  END IF;
END;
$$;
