begin;

alter table public.products
  alter column stock_quantity type numeric(12,3) using stock_quantity::numeric,
  alter column stock_quantity set default 0;

alter table public.products
  add column if not exists reserved_quantity numeric(12,3) not null default 0;

alter table public.products
  drop constraint if exists products_stock_quantity_check;

alter table public.products
  add constraint products_stock_quantity_check check (stock_quantity >= 0),
  add constraint products_reserved_quantity_check check (reserved_quantity >= 0);

create table if not exists public.inventory_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  receipt_number text not null,
  supplier_name text not null default 'โรงงานหลัก',
  received_at timestamptz not null default timezone('utc', now()),
  notes text null,
  created_by uuid null references public.app_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint inventory_receipts_org_receipt_number_unique unique (organization_id, receipt_number)
);

create table if not exists public.inventory_receipt_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  receipt_id uuid not null references public.inventory_receipts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity_received numeric(12,3) not null,
  unit text not null,
  unit_cost numeric(12,2) not null,
  stock_before numeric(12,3) not null,
  stock_after numeric(12,3) not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint inventory_receipt_items_quantity_positive check (quantity_received > 0),
  constraint inventory_receipt_items_unit_cost_nonnegative check (unit_cost >= 0)
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  receipt_id uuid null references public.inventory_receipts(id) on delete set null,
  receipt_item_id uuid null references public.inventory_receipt_items(id) on delete set null,
  movement_type text not null,
  quantity_delta numeric(12,3) not null,
  stock_before numeric(12,3) not null,
  stock_after numeric(12,3) not null,
  reference_number text null,
  notes text null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null references public.app_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint inventory_movements_type_check check (movement_type in ('receipt', 'reserve', 'issue', 'release', 'adjustment'))
);

create index if not exists inventory_receipts_org_received_idx
  on public.inventory_receipts (organization_id, received_at desc, created_at desc);

create index if not exists inventory_receipt_items_receipt_idx
  on public.inventory_receipt_items (receipt_id, created_at desc);

create index if not exists inventory_receipt_items_product_idx
  on public.inventory_receipt_items (product_id, created_at desc);

create index if not exists inventory_movements_org_created_idx
  on public.inventory_movements (organization_id, created_at desc);

create index if not exists inventory_movements_product_created_idx
  on public.inventory_movements (product_id, created_at desc);

create or replace function public.create_inventory_receipt(
  p_organization_id uuid,
  p_created_by uuid,
  p_receipt_number text,
  p_supplier_name text,
  p_received_at timestamptz,
  p_notes text,
  p_items jsonb
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
    created_by
  ) values (
    p_organization_id,
    coalesce(v_reference_number, concat('RCV-', to_char(coalesce(p_received_at, timezone('utc', now())), 'YYYYMMDDHH24MISS'))),
    coalesce(nullif(trim(p_supplier_name), ''), 'โรงงานหลัก'),
    coalesce(p_received_at, timezone('utc', now())),
    nullif(trim(p_notes), ''),
    p_created_by
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

alter table public.inventory_receipts enable row level security;
alter table public.inventory_receipt_items enable row level security;
alter table public.inventory_movements enable row level security;

alter table public.inventory_receipts force row level security;
alter table public.inventory_receipt_items force row level security;
alter table public.inventory_movements force row level security;

revoke all on public.inventory_receipts from anon, authenticated;
revoke all on public.inventory_receipt_items from anon, authenticated;
revoke all on public.inventory_movements from anon, authenticated;

commit;
