-- Run inside a transaction after setting test.delivery_order_id; always ROLLBACK.
DO $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_number text;
  v_note uuid;
  v_count bigint;
  v_total numeric;
  v_stock jsonb;
  v_payload jsonb;
BEGIN
  SELECT * INTO STRICT v_order FROM public.orders
  WHERE id = current_setting('test.delivery_order_id')::uuid;
  v_number := public.sync_order_delivery_note_atomic(v_order.organization_id, v_order.id, NULL);
  SELECT id INTO STRICT v_note FROM public.delivery_notes
  WHERE organization_id = v_order.organization_id AND delivery_number = v_number;
  IF EXISTS (
    SELECT 1 FROM public.delivery_note_items dni JOIN public.order_items oi ON oi.id=dni.order_item_id
    WHERE dni.delivery_note_id=v_note GROUP BY oi.id,oi.quantity
    HAVING count(*)<>1 OR sum(dni.quantity_delivered)<>oi.quantity
  ) THEN RAISE EXCEPTION 'Rebuild quantity differs from source order'; END IF;
  SELECT count(*),sum(line_total) INTO v_count,v_total FROM public.delivery_note_items WHERE delivery_note_id=v_note;
  IF (SELECT total_amount FROM public.delivery_notes WHERE id=v_note)<>v_total THEN
    RAISE EXCEPTION 'Header total differs from line totals';
  END IF;
  SELECT jsonb_object_agg(id, stock_quantity) INTO v_stock FROM public.products
  WHERE id IN (SELECT product_id FROM public.delivery_note_items WHERE delivery_note_id=v_note);
  PERFORM public.sync_order_delivery_note_atomic(v_order.organization_id,v_order.id,NULL);
  IF (SELECT count(*) FROM public.delivery_note_items WHERE delivery_note_id=v_note)<>v_count OR
     (SELECT jsonb_object_agg(id,stock_quantity) FROM public.products WHERE id IN
       (SELECT product_id FROM public.delivery_note_items WHERE delivery_note_id=v_note))<>v_stock THEN
    RAISE EXCEPTION 'Repeated sync changed quantity or stock';
  END IF;
  SELECT jsonb_agg(jsonb_build_object(
    'orderItemId',oi.id,'productId',oi.product_id,'productSaleUnitId',oi.product_sale_unit_id,
    'quantityDelivered',oi.quantity,'saleUnitLabel',oi.sale_unit_label,
    'saleUnitRatio',oi.sale_unit_ratio,'unitPrice',oi.unit_price
  )) INTO v_payload FROM public.order_items oi JOIN public.orders o ON o.id=oi.order_id
  WHERE o.organization_id=v_order.organization_id AND o.customer_id=v_order.customer_id
    AND o.order_date=v_order.order_date AND o.status<>'cancelled';
  PERFORM public.create_store_delivery_note(v_order.organization_id,ARRAY[v_order.id],
    v_order.customer_id,NULL,v_order.order_date,NULL,NULL,v_payload);
  IF (SELECT count(*) FROM public.delivery_note_items WHERE delivery_note_id=v_note)<>v_count OR
     (SELECT jsonb_object_agg(id,stock_quantity) FROM public.products WHERE id IN
       (SELECT product_id FROM public.delivery_note_items WHERE delivery_note_id=v_note))<>v_stock THEN
    RAISE EXCEPTION 'Duplicate full delivery changed lines or stock';
  END IF;
END $$;

CREATE FUNCTION public.test_delivery_sync_failure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Injected insert failure'; END;
$$;
CREATE TRIGGER test_delivery_sync_failure BEFORE INSERT ON public.delivery_note_items
FOR EACH ROW EXECUTE FUNCTION public.test_delivery_sync_failure();

DO $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
BEGIN
  SELECT * INTO STRICT v_order FROM public.orders WHERE id=current_setting('test.delivery_order_id')::uuid;
  SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) INTO v_before FROM public.products p
  WHERE id IN (SELECT product_id FROM public.order_items WHERE order_id=v_order.id);
  BEGIN
    PERFORM public.sync_order_delivery_note_atomic(v_order.organization_id,v_order.id,NULL);
    RAISE EXCEPTION 'Expected insert failure';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Injected insert failure' THEN RAISE; END IF;
  END;
  SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) INTO v_after FROM public.products p
  WHERE id IN (SELECT product_id FROM public.order_items WHERE order_id=v_order.id);
  IF v_before<>v_after THEN RAISE EXCEPTION 'Failed rebuild changed stock'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.delivery_note_items WHERE order_item_id IN
    (SELECT id FROM public.order_items WHERE order_id=v_order.id)) THEN
    RAISE EXCEPTION 'Failed rebuild deleted existing delivery items';
  END IF;
END $$;
