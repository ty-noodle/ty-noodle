-- Add image_url to get_order_daily_store_items RPC

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
