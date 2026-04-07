create table if not exists public.product_sale_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  unit_label text not null,
  base_unit_quantity numeric(12, 3) not null default 1,
  is_active boolean not null default true,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint product_sale_units_base_unit_quantity_check check (base_unit_quantity > 0)
);

create unique index if not exists product_sale_units_product_label_unique
  on public.product_sale_units (product_id, lower(unit_label));

create index if not exists product_sale_units_org_product_active_idx
  on public.product_sale_units (organization_id, product_id, is_active, sort_order, created_at);

alter table public.customer_product_prices
  add column if not exists product_sale_unit_id uuid references public.product_sale_units(id) on delete cascade;

alter table public.order_items
  add column if not exists product_sale_unit_id uuid references public.product_sale_units(id) on delete set null;

alter table public.order_items
  add column if not exists sale_unit_label text;

alter table public.order_items
  add column if not exists sale_unit_ratio numeric(12, 3) not null default 1;

alter table public.order_items
  add column if not exists quantity_in_base_unit numeric(12, 3) not null default 0;

insert into public.product_sale_units (
  organization_id,
  product_id,
  unit_label,
  base_unit_quantity,
  is_active,
  is_default,
  sort_order
)
select
  p.organization_id,
  p.id,
  p.unit,
  1,
  true,
  true,
  0
from public.products p
where not exists (
  select 1
  from public.product_sale_units psu
  where psu.product_id = p.id
);

with default_sale_units as (
  select distinct on (psu.product_id)
    psu.id,
    psu.product_id,
    psu.unit_label,
    psu.base_unit_quantity
  from public.product_sale_units psu
  where psu.is_active = true
  order by psu.product_id, psu.is_default desc, psu.sort_order asc, psu.created_at asc
)
update public.customer_product_prices cpp
set product_sale_unit_id = dsu.id
from default_sale_units dsu
where cpp.product_id = dsu.product_id
  and cpp.product_sale_unit_id is null;

with default_sale_units as (
  select distinct on (psu.product_id)
    psu.id,
    psu.product_id,
    psu.unit_label,
    psu.base_unit_quantity
  from public.product_sale_units psu
  where psu.is_active = true
  order by psu.product_id, psu.is_default desc, psu.sort_order asc, psu.created_at asc
)
update public.order_items oi
set
  product_sale_unit_id = dsu.id,
  sale_unit_label = coalesce(oi.sale_unit_label, dsu.unit_label),
  sale_unit_ratio = coalesce(nullif(oi.sale_unit_ratio, 0), dsu.base_unit_quantity),
  quantity_in_base_unit = oi.quantity * coalesce(nullif(oi.sale_unit_ratio, 0), dsu.base_unit_quantity)
from default_sale_units dsu
where oi.product_id = dsu.product_id;

alter table public.customer_product_prices
  alter column product_sale_unit_id set not null;

alter table public.order_items
  alter column sale_unit_label set not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'customer_product_prices_unique'
      and conrelid = 'public.customer_product_prices'::regclass
  ) then
    alter table public.customer_product_prices
      drop constraint customer_product_prices_unique;
  end if;
end $$;

create unique index if not exists customer_product_prices_customer_sale_unit_unique
  on public.customer_product_prices (organization_id, customer_id, product_sale_unit_id);

create index if not exists customer_product_prices_sale_unit_lookup_idx
  on public.customer_product_prices (
    organization_id,
    customer_id,
    product_sale_unit_id
  );

create index if not exists order_items_order_sale_unit_idx
  on public.order_items (order_id, product_id, product_sale_unit_id);

drop index if exists customer_product_prices_product_idx;

create index if not exists customer_product_prices_product_idx
  on public.customer_product_prices (organization_id, product_id, product_sale_unit_id);

drop trigger if exists product_sale_units_set_updated_at on public.product_sale_units;
create trigger product_sale_units_set_updated_at
before update on public.product_sale_units
for each row
execute function public.set_updated_at();

alter table public.product_sale_units enable row level security;
alter table public.product_sale_units force row level security;
revoke all on public.product_sale_units from anon, authenticated;

create or replace function public.get_order_daily_store_summaries(
  p_organization_id uuid,
  p_order_date date,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  customer_id uuid,
  customer_code text,
  customer_name text,
  order_rounds integer,
  product_count integer,
  total_quantity numeric,
  total_amount numeric,
  latest_order_at timestamptz,
  shortage_product_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with scoped_orders as (
    select
      o.id,
      o.customer_id,
      o.created_at,
      o.total_amount
    from public.orders o
    join public.customers c
      on c.id = o.customer_id
    where o.organization_id = p_organization_id
      and o.order_date = p_order_date
      and c.organization_id = p_organization_id
      and (
        nullif(btrim(coalesce(p_search, '')), '') is null
        or c.name ilike '%' || btrim(p_search) || '%'
        or c.customer_code ilike '%' || btrim(p_search) || '%'
      )
  ),
  item_rollup as (
    select
      so.customer_id,
      oi.product_id,
      coalesce(sum(oi.quantity_in_base_unit), sum(oi.quantity)) as ordered_quantity_in_base_unit,
      count(distinct concat(oi.product_id::text, ':', coalesce(oi.sale_unit_label, '')))::integer as item_variant_count
    from scoped_orders so
    join public.order_items oi
      on oi.order_id = so.id
    group by so.customer_id, oi.product_id
  ),
  customer_rollup as (
    select
      so.customer_id,
      count(*)::integer as order_rounds,
      coalesce(sum(so.total_amount), 0) as total_amount,
      max(so.created_at) as latest_order_at
    from scoped_orders so
    group by so.customer_id
  )
  select
    c.id as customer_id,
    c.customer_code,
    c.name as customer_name,
    cr.order_rounds,
    coalesce(sum(ir.item_variant_count), 0)::integer as product_count,
    coalesce(sum(ir.ordered_quantity_in_base_unit), 0) as total_quantity,
    cr.total_amount,
    cr.latest_order_at,
    coalesce(
      count(*) filter (
        where ir.ordered_quantity_in_base_unit > coalesce(p.stock_quantity, 0)
      ),
      0
    )::integer as shortage_product_count
  from customer_rollup cr
  join public.customers c
    on c.id = cr.customer_id
  left join item_rollup ir
    on ir.customer_id = cr.customer_id
  left join public.products p
    on p.id = ir.product_id
  group by
    c.id,
    c.customer_code,
    c.name,
    cr.order_rounds,
    cr.total_amount,
    cr.latest_order_at
  order by cr.latest_order_at desc, c.name asc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

create or replace function public.get_order_daily_store_items(
  p_organization_id uuid,
  p_order_date date,
  p_customer_id uuid
)
returns table (
  product_id uuid,
  product_sku text,
  product_name text,
  product_unit text,
  ordered_quantity numeric,
  current_stock_quantity numeric,
  deliverable_quantity numeric,
  short_quantity numeric,
  unit_price numeric,
  line_total numeric,
  order_rounds integer
)
language sql
stable
security definer
set search_path = public
as $$
  with scoped_orders as (
    select
      o.id
    from public.orders o
    where o.organization_id = p_organization_id
      and o.order_date = p_order_date
      and o.customer_id = p_customer_id
  ),
  item_rollup as (
    select
      oi.product_id,
      coalesce(oi.product_sale_unit_id, '00000000-0000-0000-0000-000000000000'::uuid) as product_sale_unit_id,
      coalesce(oi.sale_unit_label, p.unit) as sale_unit_label,
      max(coalesce(nullif(oi.sale_unit_ratio, 0), 1)) as sale_unit_ratio,
      sum(oi.quantity) as ordered_quantity,
      sum(coalesce(oi.quantity_in_base_unit, oi.quantity)) as ordered_quantity_in_base_unit,
      max(oi.unit_price) as unit_price,
      sum(oi.line_total) as line_total,
      count(distinct oi.order_id)::integer as order_rounds
    from public.order_items oi
    join scoped_orders so
      on so.id = oi.order_id
    join public.products p
      on p.id = oi.product_id
    group by
      oi.product_id,
      coalesce(oi.product_sale_unit_id, '00000000-0000-0000-0000-000000000000'::uuid),
      coalesce(oi.sale_unit_label, p.unit)
  )
  select
    p.id as product_id,
    p.sku as product_sku,
    p.name as product_name,
    ir.sale_unit_label as product_unit,
    ir.ordered_quantity,
    floor(coalesce(p.stock_quantity, 0) / greatest(ir.sale_unit_ratio, 0.001)) as current_stock_quantity,
    least(
      ir.ordered_quantity,
      floor(coalesce(p.stock_quantity, 0) / greatest(ir.sale_unit_ratio, 0.001))
    ) as deliverable_quantity,
    greatest(
      ir.ordered_quantity - floor(coalesce(p.stock_quantity, 0) / greatest(ir.sale_unit_ratio, 0.001)),
      0
    ) as short_quantity,
    ir.unit_price,
    ir.line_total,
    ir.order_rounds
  from item_rollup ir
  join public.products p
    on p.id = ir.product_id
  order by p.name asc, ir.sale_unit_label asc;
$$;
