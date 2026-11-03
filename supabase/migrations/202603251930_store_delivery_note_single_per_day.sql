-- Ensure 1 store / 1 day / 1 delivery note.
-- If a confirmed DN already exists for the same organization + customer + delivery_date,
-- this function appends new delivered items into that existing DN instead of creating a new DN.

create or replace function public.create_store_delivery_note(
  p_organization_id uuid,
  p_order_ids       uuid[],
  p_customer_id     uuid,
  p_vehicle_id      uuid,
  p_delivery_date   date,
  p_notes           text,
  p_created_by      uuid,
  p_items           jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
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
  v_stock_before         numeric;
  v_reserved_before      numeric;
  v_stock_after          numeric;
  v_reserved_after       numeric;
  v_total_amount         numeric := 0;
  v_items_processed      integer := 0;
  v_order_id             uuid;
  v_all_delivered        boolean;
  v_any_delivered        boolean;
  v_new_fulfillment      text;
  v_clean_notes          text;
begin
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

    v_qty_base   := v_qty_delivered * v_sale_unit_ratio;
    v_line_total := v_qty_delivered * v_unit_price;

    select stock_quantity, reserved_quantity
      into v_stock_before, v_reserved_before
    from public.products
    where id = v_product_id and organization_id = p_organization_id
    for update;

    if v_stock_before is null then
      raise exception 'ไม่พบสินค้า %', v_product_id;
    end if;

    if v_stock_before < v_qty_base then
      raise exception 'สต็อกไม่พอ: มีอยู่ % แต่ต้องการ %', v_stock_before, v_qty_base;
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
      unit_price, line_total
    ) values (
      p_organization_id, v_dn_id, v_order_item_id,
      v_product_id, v_product_sale_unit_id,
      v_sale_unit_label, v_sale_unit_ratio,
      v_qty_delivered, v_qty_base,
      v_unit_price, v_line_total
    );

    v_total_amount    := v_total_amount + v_line_total;
    v_items_processed := v_items_processed + 1;
  end loop;

  if v_items_processed = 0 then
    raise exception 'ต้องใส่จำนวนส่งอย่างน้อย 1 รายการ';
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
end;
$$;

