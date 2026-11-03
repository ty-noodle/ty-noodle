-- Migration: Standardize stock receipt numbers to RCVYYMMDDXX format

-- 1. Create a function to generate the daily running number
create or replace function public.generate_receipt_number(
  p_organization_id uuid,
  p_date date default current_date
)
returns text
language plpgsql
security definer
as $$
declare
  v_prefix text;
  v_count int;
  v_new_number text;
begin
  -- Format: RCV + YYMMDD
  v_prefix := 'RCV' || to_char(p_date, 'YYMMDD');
  
  -- Count existing receipts for this org and date
  select count(*) into v_count
  from public.inventory_receipts
  where organization_id = p_organization_id
    and date(received_at at time zone 'Asia/Bangkok') = p_date;
    
  -- Result: RCVYYMMDD + XX (2 digits running)
  v_new_number := v_prefix || lpad((v_count + 1)::text, 2, '0');
  
  return v_new_number;
end;
$$;

-- 2. Update the create_inventory_receipt function to use the new generator
create or replace function public.create_inventory_receipt(
  p_organization_id uuid,
  p_created_by uuid,
  p_receipt_number text,
  p_supplier_name text,
  p_received_at timestamptz,
  p_notes text,
  p_items jsonb,
  p_receipt_url text default null,
  p_supplier_id uuid default null
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
  v_actual_received_at timestamptz;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Receipt must include at least one item';
  end if;

  v_actual_received_at := coalesce(p_received_at, timezone('utc', now()));

  -- Generate standardized RCVYYMMDDXX if not provided
  v_reference_number := nullif(trim(p_receipt_number), '');
  if v_reference_number is null then
    v_reference_number := public.generate_receipt_number(p_organization_id, (v_actual_received_at at time zone 'Asia/Bangkok')::date);
  end if;

  insert into public.inventory_receipts (
    organization_id,
    receipt_number,
    supplier_name,
    supplier_id,
    received_at,
    notes,
    created_by,
    receipt_url
  ) values (
    p_organization_id,
    v_reference_number,
    coalesce(nullif(trim(p_supplier_name), ''), 'ผู้ขาย'),
    p_supplier_id,
    v_actual_received_at,
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

    select stock_quantity into v_stock_before
    from public.products
    where id = v_product_id and organization_id = p_organization_id
    for update;

    v_stock_after := coalesce(v_stock_before, 0) + v_quantity;

    update public.products
    set stock_quantity = v_stock_after,
        cost_price = v_unit_cost,
        unit = v_unit
    where id = v_product_id;

    insert into public.inventory_receipt_items (
      organization_id, receipt_id, product_id, quantity_received, unit, unit_cost, stock_before, stock_after
    ) values (
      p_organization_id, v_receipt_id, v_product_id, v_quantity, v_unit, v_unit_cost, v_stock_before, v_stock_after
    ) returning id into v_receipt_item_id;

    insert into public.inventory_movements (
      organization_id, product_id, receipt_id, receipt_item_id, movement_type, quantity_delta, stock_before, stock_after, reference_number, notes, created_by, metadata
    ) values (
      p_organization_id, v_product_id, v_receipt_id, v_receipt_item_id, 'receipt', v_quantity, v_stock_before, v_stock_after, v_reference_number, nullif(trim(p_notes), ''), p_created_by, jsonb_build_object('source', 'inventory_receipt')
    );
  end loop;

  return v_receipt_id;
end;
$$;

-- 3. Data Migration: Fix existing receipt numbers
do $$
declare
  r record;
  v_new_no text;
  v_seq int;
  v_last_date date := null;
  v_last_org uuid := null;
begin
  for r in (
    select id, organization_id, received_at 
    from public.inventory_receipts 
    order by organization_id, received_at, created_at
  ) loop
    if v_last_org is null or v_last_org <> r.organization_id or v_last_date is null or v_last_date <> (r.received_at at time zone 'Asia/Bangkok')::date then
      v_seq := 1;
      v_last_org := r.organization_id;
      v_last_date := (r.received_at at time zone 'Asia/Bangkok')::date;
    else
      v_seq := v_seq + 1;
    end if;
    
    v_new_no := 'RCV' || to_char(v_last_date, 'YYMMDD') || lpad(v_seq::text, 2, '0');
    
    update public.inventory_receipts set receipt_number = v_new_no where id = r.id;
    update public.inventory_movements set reference_number = v_new_no where receipt_id = r.id;
  end loop;
end;
$$;
