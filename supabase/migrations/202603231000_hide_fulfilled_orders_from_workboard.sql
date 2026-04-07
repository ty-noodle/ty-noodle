-- ─────────────────────────────────────────────────────────────────────────────
-- Exclude fully-fulfilled orders from the order workboard RPCs.
-- Orders with fulfillment_status = 'complete' no longer need action,
-- so they should not appear in the workboard.
-- ─────────────────────────────────────────────────────────────────────────────

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
      and o.fulfillment_status <> 'complete'
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
      sum(oi.quantity) as ordered_quantity
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
    coalesce(count(ir.product_id), 0)::integer as product_count,
    coalesce(sum(ir.ordered_quantity), 0) as total_quantity,
    cr.total_amount,
    cr.latest_order_at,
    coalesce(
      count(*) filter (where ir.ordered_quantity > coalesce(p.stock_quantity, 0)),
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

-- Must DROP first because the return type previously changed (image_url was added
-- in migration 202603211000) and CREATE OR REPLACE cannot change OUT parameter types.
drop function if exists public.get_order_daily_store_items(uuid, date, uuid);

create function public.get_order_daily_store_items(
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
  order_rounds integer,
  image_url text
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
      and o.fulfillment_status <> 'complete'
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
    ir.order_rounds,
    (
      select pi.public_url
      from public.product_images pi
      where pi.product_id = p.id
      order by pi.sort_order asc, pi.created_at asc
      limit 1
    ) as image_url
  from item_rollup ir
  join public.products p
    on p.id = ir.product_id
  order by p.name asc, ir.sale_unit_label asc;
$$;
