-- Migration: Create update_inventory_receipt RPC
-- Description: Updates a stock receipt and rebalances product stock safely.

create or replace function public.update_inventory_receipt(
  p_organization_id uuid,
  p_receipt_id uuid,
  p_received_at timestamptz,
  p_supplier_id uuid,
  p_supplier_name text,
  p_notes text,
  p_items jsonb,
  p_updated_by uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reference_number text;
  v_item jsonb;
  v_old_item record;
  v_product_id uuid;
  v_quantity numeric(12,3);
  v_unit text;
  v_unit_cost numeric(12,2);
  v_stock_before numeric(12,3);
  v_stock_after numeric(12,3);
  v_receipt_item_id uuid;
begin
  if p_receipt_id is null then
    raise exception 'Receipt id is required';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Receipt must include at least one item';
  end if;

  select receipt_number
    into v_reference_number
  from public.inventory_receipts
  where id = p_receipt_id
    and organization_id = p_organization_id
  for update;

  if v_reference_number is null then
    raise exception 'Receipt not found';
  end if;

  -- Reverse previous stock impact from this receipt before writing the new item set.
  for v_old_item in
    select product_id, quantity_received
    from public.inventory_receipt_items
    where receipt_id = p_receipt_id
      and organization_id = p_organization_id
    order by created_at, id
  loop
    select stock_quantity
      into v_stock_before
    from public.products
    where id = v_old_item.product_id
      and organization_id = p_organization_id
    for update;

    if not found then
      raise exception 'Product % not found while reverting receipt', v_old_item.product_id;
    end if;

    v_stock_after := coalesce(v_stock_before, 0) - coalesce(v_old_item.quantity_received, 0);

    update public.products
    set stock_quantity = v_stock_after,
        updated_at = now()
    where id = v_old_item.product_id
      and organization_id = p_organization_id;
  end loop;

  delete from public.inventory_movements
  where organization_id = p_organization_id
    and receipt_id = p_receipt_id
    and movement_type = 'receipt';

  delete from public.inventory_receipt_items
  where organization_id = p_organization_id
    and receipt_id = p_receipt_id;

  update public.inventory_receipts
  set received_at = coalesce(p_received_at, received_at),
      supplier_id = p_supplier_id,
      supplier_name = coalesce(nullif(trim(p_supplier_name), ''), 'ผู้ขาย'),
      notes = nullif(trim(p_notes), '')
  where id = p_receipt_id
    and organization_id = p_organization_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'productId')::uuid;
    v_quantity := (v_item ->> 'quantityReceived')::numeric;
    v_unit := nullif(trim(v_item ->> 'unit'), '');
    v_unit_cost := (v_item ->> 'unitCost')::numeric;

    if v_product_id is null or v_quantity is null or v_unit is null or v_unit_cost is null then
      raise exception 'Each receipt item requires productId, quantityReceived, unit, and unitCost';
    end if;

    select stock_quantity
      into v_stock_before
    from public.products
    where id = v_product_id
      and organization_id = p_organization_id
    for update;

    if not found then
      raise exception 'Product % not found', v_product_id;
    end if;

    v_stock_after := coalesce(v_stock_before, 0) + v_quantity;

    update public.products
    set stock_quantity = v_stock_after,
        cost_price = v_unit_cost,
        unit = v_unit,
        updated_at = now()
    where id = v_product_id
      and organization_id = p_organization_id;

    insert into public.inventory_receipt_items (
      organization_id,
      receipt_id,
      product_id,
      quantity_received,
      unit,
      unit_cost,
      stock_before,
      stock_after
    ) values (
      p_organization_id,
      p_receipt_id,
      v_product_id,
      v_quantity,
      v_unit,
      v_unit_cost,
      v_stock_before,
      v_stock_after
    )
    returning id into v_receipt_item_id;

    insert into public.inventory_movements (
      organization_id,
      product_id,
      receipt_id,
      receipt_item_id,
      movement_type,
      quantity_delta,
      stock_before,
      stock_after,
      reference_number,
      notes,
      created_by,
      metadata
    ) values (
      p_organization_id,
      v_product_id,
      p_receipt_id,
      v_receipt_item_id,
      'receipt',
      v_quantity,
      v_stock_before,
      v_stock_after,
      v_reference_number,
      nullif(trim(p_notes), ''),
      p_updated_by,
      jsonb_build_object('source', 'inventory_receipt', 'updated', true)
    );
  end loop;
end;
$$;
