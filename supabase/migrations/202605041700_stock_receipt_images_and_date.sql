begin;

-- Add receipt_url to inventory_receipts
alter table public.inventory_receipts
  add column if not exists receipt_url text null;

-- Update create_inventory_receipt function to handle p_receipt_url
create or replace function public.create_inventory_receipt(
  p_organization_id uuid,
  p_created_by uuid,
  p_receipt_number text,
  p_supplier_name text,
  p_received_at timestamptz,
  p_notes text,
  p_items jsonb,
  p_receipt_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric(12,3);
  v_unit text;
  v_unit_cost numeric(12,2);
  v_stock_before numeric(12,3);
  v_stock_after numeric(12,3);
  v_reference_number text;
  v_receipt_item_id uuid;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Receipt must include at least one item';
  end if;

  v_reference_number := nullif(trim(p_receipt_number), '');

  insert into public.inventory_receipts (
    organization_id,
    receipt_number,
    supplier_name,
    received_at,
    notes,
    created_by,
    receipt_url
  ) values (
    p_organization_id,
    coalesce(v_reference_number, concat('RCV-', to_char(coalesce(p_received_at, timezone('utc', now())), 'YYYYMMDDHH24MISS'))),
    coalesce(nullif(trim(p_supplier_name), ''), 'โรงงานหลัก'),
    coalesce(p_received_at, timezone('utc', now())),
    nullif(trim(p_notes), ''),
    p_created_by,
    p_receipt_url
  ) returning id into v_receipt_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'productId')::uuid;
    v_quantity := (v_item ->> 'quantityReceived')::numeric;
    v_unit := nullif(trim(v_item ->> 'unit'), '');
    v_unit_cost := (v_item ->> 'unitCost')::numeric;

    if v_product_id is null or v_quantity is null or v_unit is null or v_unit_cost is null then
      raise exception 'Each receipt item requires productId, quantityReceived, unit, and unitCost';
    end if;

    if v_quantity <= 0 then
      raise exception 'Receipt quantity must be greater than zero';
    end if;

    if v_unit_cost < 0 then
      raise exception 'Unit cost must be zero or greater';
    end if;

    select stock_quantity
      into v_stock_before
    from public.products
    where id = v_product_id
      and organization_id = p_organization_id
    for update;

    if v_stock_before is null then
      raise exception 'Product % was not found in this organization', v_product_id;
    end if;

    v_stock_after := v_stock_before + v_quantity;

    update public.products
    set stock_quantity = v_stock_after,
        cost_price = v_unit_cost,
        unit = v_unit
    where id = v_product_id;

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
      v_receipt_id,
      v_product_id,
      v_quantity,
      v_unit,
      v_unit_cost,
      v_stock_before,
      v_stock_after
    ) returning id into v_receipt_item_id;

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
      v_receipt_id,
      v_receipt_item_id,
      'receipt',
      v_quantity,
      v_stock_before,
      v_stock_after,
      v_reference_number,
      nullif(trim(p_notes), ''),
      p_created_by,
      jsonb_build_object('source', 'inventory_receipt')
    );
  end loop;

  return v_receipt_id;
end;
$$;

commit;
