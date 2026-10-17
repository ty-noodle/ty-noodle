-- Serialize the entire rebuild, not only its final append RPC.
CREATE OR REPLACE FUNCTION public.create_store_delivery_note(p_organization_id uuid, p_order_ids uuid[], p_customer_id uuid, p_vehicle_id uuid, p_delivery_date date, p_notes text, p_created_by uuid, p_items jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target_date          date := coalesce(p_delivery_date, current_date);
  v_primary_order_id     uuid;
  v_dn_id                uuid;
  v_dn_number            text;
  v_item                 jsonb;
  v_order_item_id        uuid;
  v_product_id           uuid;
  v_product_sale_unit_id uuid;
  v_sale_unit_label      text;
  v_sale_unit_ratio      numeric;
  v_qty_delivered        numeric;
  v_qty_base             numeric;
  v_unit_price           numeric;
  v_line_total           numeric;
  v_cost_price           numeric;
  v_stock_before         numeric;
  v_reserved_before      numeric;
  v_stock_after          numeric;
  v_reserved_after       numeric;
  v_total_amount         numeric := 0;
  v_items_processed      integer := 0;
  v_items_skipped        integer := 0;
  v_order_id             uuid;
  v_all_delivered        boolean;
  v_any_delivered        boolean;
  v_new_fulfillment      text;
  v_clean_notes          text;
BEGIN
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'ต้องมีสินค้าอย่างน้อย 1 รายการ';
  end if;

  if p_order_ids is null or array_length(p_order_ids, 1) = 0 then
    raise exception 'ต้องระบุออเดอร์อย่างน้อย 1 รายการ';
  end if;

  v_clean_notes := nullif(trim(p_notes), '');
  v_primary_order_id := p_order_ids[1];

  -- Lock by org/customer/date to prevent duplicate DNs in concurrent requests.
  perform pg_advisory_xact_lock(
    hashtext(p_organization_id::text || ':' || p_customer_id::text || ':' || v_target_date::text)
  );

  -- Confirm all submitted orders in the batch.
  update public.orders
  set status = 'confirmed'
  where id = any(p_order_ids)
    and organization_id = p_organization_id
    and status = 'submitted';

  -- Reuse existing confirmed DN for this store/day if present.
  select dn.id, dn.delivery_number
    into v_dn_id, v_dn_number
  from public.delivery_notes dn
  where dn.organization_id = p_organization_id
    and dn.customer_id = p_customer_id
    and dn.delivery_date = v_target_date
    and dn.status = 'confirmed'
  order by dn.created_at asc
  limit 1
  for update;

  if v_dn_id is null then
    v_dn_number := public.next_delivery_note_number(p_organization_id, v_target_date);

    insert into public.delivery_notes (
      organization_id, order_id, customer_id, vehicle_id,
      delivery_number, delivery_date, status, notes, created_by
    ) values (
      p_organization_id, v_primary_order_id, p_customer_id, p_vehicle_id,
      v_dn_number, v_target_date, 'confirmed', v_clean_notes, p_created_by
    ) returning id into v_dn_id;
  else
    update public.delivery_notes
    set
      vehicle_id = coalesce(public.delivery_notes.vehicle_id, p_vehicle_id),
      notes = case
        when v_clean_notes is null then public.delivery_notes.notes
        when public.delivery_notes.notes is null or trim(public.delivery_notes.notes) = '' then v_clean_notes
        else public.delivery_notes.notes || ' / ' || v_clean_notes
      end
    where id = v_dn_id;
  end if;

  -- Process each delivered line item.
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty_delivered := (v_item->>'quantityDelivered')::numeric;

    if v_qty_delivered is null or v_qty_delivered <= 0 then
      continue;
    end if;

    v_order_item_id        := (v_item->>'orderItemId')::uuid;
    v_product_id           := (v_item->>'productId')::uuid;
    v_product_sale_unit_id := (v_item->>'productSaleUnitId')::uuid;
    v_sale_unit_label      := v_item->>'saleUnitLabel';
    v_sale_unit_ratio      := coalesce((v_item->>'saleUnitRatio')::numeric, 1);
    v_unit_price           := coalesce((v_item->>'unitPrice')::numeric, 0);

    -- A retry of a fully delivered order item must not issue stock twice.
    IF v_order_item_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.order_items oi
      WHERE oi.id = v_order_item_id AND oi.organization_id = p_organization_id
        AND oi.product_id = v_product_id AND oi.order_id = ANY(p_order_ids)
        AND v_qty_delivered = oi.quantity
        AND EXISTS (
          SELECT 1 FROM public.delivery_note_items dni
          WHERE dni.delivery_note_id = v_dn_id AND dni.order_item_id = oi.id
            AND dni.quantity_delivered = v_qty_delivered AND dni.unit_price = v_unit_price
        )
        AND (SELECT coalesce(sum(dni.quantity_in_base_unit),0)
             FROM public.delivery_note_items dni JOIN public.delivery_notes dn ON dn.id=dni.delivery_note_id
             WHERE dni.order_item_id=oi.id AND dn.status='confirmed') >= oi.quantity_in_base_unit
    ) THEN
      v_items_skipped := v_items_skipped + 1;
      CONTINUE;
    END IF;

    v_qty_base   := v_qty_delivered * v_sale_unit_ratio;
    v_line_total := v_qty_delivered * v_unit_price;

    -- Fetch or compute cost price
    v_cost_price := 0;
    if v_order_item_id is not null then
      select cost_price into v_cost_price
      from public.order_items
      where id = v_order_item_id;
    end if;

    if v_cost_price is null or v_cost_price = 0 then
      v_cost_price := coalesce(
        (
          select
            case
              when psu.cost_mode = 'fixed' and psu.fixed_cost_price is not null
                then psu.fixed_cost_price
              else coalesce(p.cost_price, 0)::numeric * coalesce(psu.base_unit_quantity, 0)::numeric
            end
          from public.product_sale_units psu
          left join public.products p on p.id = psu.product_id
          where psu.id = v_product_sale_unit_id
        ),
        coalesce(
          (
            select cost_price
            from public.products
            where id = v_product_id
          ),
          0
        )
      );
    end if;

    select stock_quantity, reserved_quantity
      into v_stock_before, v_reserved_before
    from public.products
    where id = v_product_id and organization_id = p_organization_id
    for update;

    if v_stock_before is null then
      raise exception 'ไม่พบสินค้า %', v_product_id;
    end if;

    v_stock_after    := v_stock_before - v_qty_base;
    v_reserved_after := greatest(0, v_reserved_before - v_qty_base);

    update public.products
    set stock_quantity    = v_stock_after,
        reserved_quantity = v_reserved_after
    where id = v_product_id;

    insert into public.inventory_movements (
      organization_id, product_id, movement_type,
      quantity_delta, stock_before, stock_after,
      reference_number, notes, created_by, metadata
    ) values (
      p_organization_id, v_product_id, 'issue',
      -v_qty_base, v_stock_before, v_stock_after,
      v_dn_number, v_clean_notes, p_created_by,
      jsonb_build_object('delivery_note_id', v_dn_id, 'order_id', v_primary_order_id)
    );

    insert into public.delivery_note_items (
      organization_id, delivery_note_id, order_item_id,
      product_id, product_sale_unit_id,
      sale_unit_label, sale_unit_ratio,
      quantity_delivered, quantity_in_base_unit,
      unit_price, line_total, cost_price
    ) values (
      p_organization_id, v_dn_id, v_order_item_id,
      v_product_id, v_product_sale_unit_id,
      v_sale_unit_label, v_sale_unit_ratio,
      v_qty_delivered, v_qty_base,
      v_unit_price, v_line_total, coalesce(v_cost_price, 0)
    );

    v_total_amount    := v_total_amount + v_line_total;
    v_items_processed := v_items_processed + 1;
  end loop;

  if v_items_processed = 0 then
    IF v_items_skipped > 0 THEN RETURN v_dn_number; END IF;
    RAISE EXCEPTION 'At least one delivered item is required';
  end if;

  update public.delivery_notes
  set total_amount = coalesce(total_amount, 0) + v_total_amount
  where id = v_dn_id;

  -- Recompute fulfillment_status for each submitted order id.
  foreach v_order_id in array p_order_ids loop
    select
      bool_and(coalesce(d.delivered_qty, 0) >= oi.quantity_in_base_unit),
      bool_or(coalesce(d.delivered_qty, 0) > 0)
    into v_all_delivered, v_any_delivered
    from public.order_items oi
    left join (
      select
        dni.order_item_id,
        sum(dni.quantity_in_base_unit) as delivered_qty
      from public.delivery_note_items dni
      join public.delivery_notes dn on dn.id = dni.delivery_note_id
      where dn.status = 'confirmed'
        and dni.order_item_id in (
          select id from public.order_items where order_id = v_order_id
        )
      group by dni.order_item_id
    ) d on d.order_item_id = oi.id
    where oi.order_id = v_order_id;

    v_new_fulfillment := case
      when v_all_delivered then 'complete'
      when v_any_delivered then 'partial'
      else                      'pending'
    end;

    update public.orders
    set fulfillment_status = v_new_fulfillment
    where id = v_order_id;
  end loop;

  return v_dn_number;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_order_delivery_note_atomic(
  p_organization_id uuid, p_order_id uuid, p_user_id uuid,
  p_loss_by_item jsonb DEFAULT '{}'::jsonb
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_note public.delivery_notes%ROWTYPE;
  v_ids uuid[];
  v_items jsonb;
  v_notes text;
  v_vehicle uuid;
  v_actor uuid;
  v_restore record;
  v_before numeric;
  v_number text;
BEGIN
  SELECT * INTO STRICT v_order FROM public.orders
  WHERE id = p_order_id AND organization_id = p_organization_id;
  PERFORM pg_advisory_xact_lock(hashtext(p_organization_id::text || ':' || v_order.customer_id::text || ':' || v_order.order_date::text));

  SELECT array_agg(id ORDER BY created_at, id) INTO v_ids FROM public.orders
  WHERE organization_id = p_organization_id AND customer_id = v_order.customer_id
    AND order_date = v_order.order_date AND status <> 'cancelled';
  IF coalesce(array_length(v_ids, 1), 0) = 0 THEN RAISE EXCEPTION 'No eligible orders'; END IF;
  SELECT default_vehicle_id INTO v_vehicle FROM public.customers WHERE id = v_order.customer_id;
  v_actor := p_user_id;
  IF v_actor IS NULL THEN
    SELECT id INTO v_actor FROM public.app_users WHERE organization_id = p_organization_id AND is_active
    ORDER BY created_at LIMIT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.app_users WHERE id = v_actor AND organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'No actor in this organization';
  END IF;

  SELECT dn.* INTO v_note FROM public.delivery_notes dn
  JOIN public.delivery_note_items dni ON dni.delivery_note_id = dn.id
  JOIN public.order_items oi ON oi.id = dni.order_item_id
  WHERE oi.order_id = ANY(v_ids) AND dn.organization_id = p_organization_id
  LIMIT 1;
  IF v_note.id IS NULL THEN
    SELECT * INTO v_note FROM public.delivery_notes
    WHERE organization_id = p_organization_id AND customer_id = v_order.customer_id
      AND delivery_date = v_order.order_date AND status = 'confirmed'
    ORDER BY created_at LIMIT 1;
  END IF;
  IF v_note.id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(p_organization_id::text || ':' || v_order.customer_id::text || ':' || v_note.delivery_date::text));
    SELECT * INTO v_note FROM public.delivery_notes WHERE id = v_note.id FOR UPDATE;
    FOR v_restore IN
      SELECT product_id, sum(greatest(0, quantity_in_base_unit - least(
        coalesce((p_loss_by_item->>order_item_id::text)::numeric, 0), quantity_in_base_unit
      ))) AS quantity
      FROM public.delivery_note_items WHERE delivery_note_id = v_note.id
      GROUP BY product_id ORDER BY product_id
    LOOP
      IF v_restore.quantity <= 0 THEN CONTINUE; END IF;
      SELECT stock_quantity INTO STRICT v_before FROM public.products
      WHERE id = v_restore.product_id AND organization_id = p_organization_id FOR UPDATE;
      UPDATE public.products SET stock_quantity = stock_quantity + v_restore.quantity WHERE id = v_restore.product_id;
      INSERT INTO public.inventory_movements(
        organization_id, product_id, movement_type, quantity_delta, stock_before, stock_after,
        created_by, notes, metadata
      ) VALUES (
        p_organization_id, v_restore.product_id, 'adjustment', v_restore.quantity,
        v_before, v_before + v_restore.quantity, v_actor,
        'คืนสต็อกจากการซิงก์ใบส่งของใหม่สำหรับออเดอร์ ' || p_order_id,
        jsonb_build_object('source', 'order_management_rebuild')
      );
    END LOOP;
    DELETE FROM public.delivery_note_items WHERE delivery_note_id = v_note.id;
    UPDATE public.delivery_notes SET total_amount = 0 WHERE id = v_note.id;
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'orderItemId', id, 'productId', product_id, 'productSaleUnitId', product_sale_unit_id,
    'quantityDelivered', quantity, 'saleUnitLabel', sale_unit_label,
    'saleUnitRatio', sale_unit_ratio, 'unitPrice', unit_price
  ) ORDER BY created_at, id) INTO v_items FROM public.order_items WHERE order_id = ANY(v_ids);
  FOR v_restore IN SELECT notes FROM public.orders WHERE id = ANY(v_ids) ORDER BY created_at, id LOOP
    IF nullif(trim(v_restore.notes), '') IS NOT NULL THEN
      IF v_notes IS NULL THEN v_notes := trim(v_restore.notes);
      ELSIF position(trim(v_restore.notes) IN v_notes) = 0 THEN v_notes := v_notes || ' / ' || trim(v_restore.notes);
      END IF;
    END IF;
  END LOOP;
  v_number := public.create_store_delivery_note(
    p_organization_id, v_ids, v_order.customer_id, v_vehicle,
    coalesce(v_note.delivery_date, v_order.order_date), v_notes, v_actor, v_items
  );
  RETURN v_number;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_order_delivery_note_atomic(uuid,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_order_delivery_note_atomic(uuid,uuid,uuid,jsonb) TO service_role;
