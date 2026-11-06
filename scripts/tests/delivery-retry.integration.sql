-- Execute after the scoped repair, in the SAME transaction, then ROLLBACK.
-- Uses real deployed RPC code and asserts retries have no item/money/stock side effects.
DO $$
DECLARE
  v_note public.delivery_notes%ROWTYPE;
  v_item public.order_items%ROWTYPE;
  v_actor uuid;
  v_payload jsonb;
  v_before text;
  v_after text;
  v_number text;
BEGIN
  SELECT * INTO STRICT v_note FROM public.delivery_notes
  WHERE organization_id='120b642e-a0ec-4f9b-a828-7345318dfe84' AND delivery_number='DN2026100574';
  SELECT * INTO STRICT v_item FROM public.order_items WHERE order_id=v_note.order_id;
  SELECT id INTO STRICT v_actor FROM public.app_users
  WHERE organization_id=v_note.organization_id AND is_active ORDER BY created_at LIMIT 1;
  v_payload := jsonb_build_array(jsonb_build_object(
    'orderItemId',v_item.id,'productId',v_item.product_id,'productSaleUnitId',v_item.product_sale_unit_id,
    'quantityDelivered',v_item.quantity,'saleUnitLabel',v_item.sale_unit_label,
    'saleUnitRatio',v_item.sale_unit_ratio,'unitPrice',v_item.unit_price));
  SELECT jsonb_build_object(
    'items',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.delivery_note_items i WHERE delivery_note_id=v_note.id),
    'product',(SELECT to_jsonb(p) FROM public.products p WHERE id=v_item.product_id),
    'movements',(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.inventory_movements m WHERE organization_id=v_note.organization_id AND reference_number=v_note.delivery_number),
    'note',(SELECT to_jsonb(n) - 'updated_at' FROM public.delivery_notes n WHERE id=v_note.id))::text INTO v_before;
  FOR attempt IN 1..2 LOOP
    v_number := public.create_store_delivery_note(v_note.organization_id, ARRAY[v_note.order_id],
      v_note.customer_id,v_note.vehicle_id,v_note.delivery_date,NULL,v_actor,v_payload);
    IF v_number <> v_note.delivery_number THEN RAISE EXCEPTION 'Retry created a different note'; END IF;
  END LOOP;
  SELECT jsonb_build_object(
    'items',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.delivery_note_items i WHERE delivery_note_id=v_note.id),
    'product',(SELECT to_jsonb(p) FROM public.products p WHERE id=v_item.product_id),
    'movements',(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.inventory_movements m WHERE organization_id=v_note.organization_id AND reference_number=v_note.delivery_number),
    'note',(SELECT to_jsonb(n) - 'updated_at' FROM public.delivery_notes n WHERE id=v_note.id))::text INTO v_after;
  IF v_before IS DISTINCT FROM v_after THEN RAISE EXCEPTION 'Retry changed stock, item rows, or delivery note'; END IF;
END;
$$;
