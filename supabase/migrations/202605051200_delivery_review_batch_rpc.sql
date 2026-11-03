create index if not exists idx_orders_delivery_review
  on public.orders (organization_id, order_date, customer_id, created_at)
  where status in ('submitted', 'confirmed');

create index if not exists idx_order_items_delivery_review
  on public.order_items (organization_id, order_id);

create index if not exists idx_delivery_note_items_review
  on public.delivery_note_items (organization_id, order_item_id);

create or replace function public.get_delivery_review_data(
  p_organization_id uuid,
  p_stores jsonb,
  p_order_date date,
  p_include_order_items boolean default false
)
returns jsonb
language sql
stable
as $$
with store_input as (
  select
    row_number() over () as sort_order,
    (value->>'customerId')::uuid as customer_id,
    coalesce(value->>'customerName', '') as customer_name,
    coalesce(value->>'customerCode', '') as customer_code,
    coalesce(value->'orderIds', '[]'::jsonb) as order_ids,
    coalesce(value->'orderNumbers', '[]'::jsonb) as order_numbers,
    coalesce((value->>'orderRounds')::integer, 0) as order_rounds,
    coalesce((value->>'totalAmount')::numeric, 0) as total_amount
  from jsonb_array_elements(coalesce(p_stores, '[]'::jsonb)) as input(value)
  where nullif(value->>'customerId', '') is not null
),
requested_order_ids as (
  select distinct (jsonb_array_elements_text(order_ids))::uuid as order_id
  from store_input
  where jsonb_array_length(order_ids) > 0
),
review_orders as (
  select
    o.id,
    o.customer_id,
    o.order_date
  from public.orders o
  where o.organization_id = p_organization_id
    and o.status in ('submitted', 'confirmed')
    and (
      (
        exists (select 1 from requested_order_ids)
        and o.id in (select order_id from requested_order_ids)
      )
      or (
        not exists (select 1 from requested_order_ids)
        and o.customer_id in (select customer_id from store_input)
        and o.order_date = p_order_date
      )
    )
),
review_items as (
  select
    oi.id as order_item_id,
    oi.order_id,
    ro.customer_id,
    oi.product_id,
    oi.product_sale_unit_id,
    coalesce(oi.quantity, 0)::numeric as quantity,
    coalesce(oi.quantity_in_base_unit, 0)::numeric as quantity_in_base_unit,
    coalesce(oi.sale_unit_label, p.unit) as sale_unit_label,
    coalesce(nullif(oi.sale_unit_ratio, 0), 1)::numeric as sale_unit_ratio,
    coalesce(oi.unit_price, 0)::numeric as unit_price,
    p.name as product_name,
    p.sku as product_sku,
    p.unit as product_unit
  from public.order_items oi
  join review_orders ro on ro.id = oi.order_id
  join public.products p on p.id = oi.product_id
  where oi.organization_id = p_organization_id
),
delivered as (
  select
    dni.order_item_id,
    sum(coalesce(dni.quantity_in_base_unit, 0)::numeric) as delivered_base_qty
  from public.delivery_note_items dni
  where dni.organization_id = p_organization_id
    and dni.order_item_id in (select order_item_id from review_items)
  group by dni.order_item_id
),
item_calc as (
  select
    ri.*,
    coalesce(d.delivered_base_qty, 0) as delivered_base_qty,
    case
      when ri.quantity > 0 then ri.quantity
      when ri.sale_unit_ratio > 0 then ri.quantity_in_base_unit / ri.sale_unit_ratio
      else ri.quantity_in_base_unit
    end as ordered_qty,
    greatest(0, ri.quantity_in_base_unit - coalesce(d.delivered_base_qty, 0)) as remaining_base_qty
  from review_items ri
  left join delivered d on d.order_item_id = ri.order_item_id
),
grouped_items as (
  select
    customer_id,
    product_id,
    sale_unit_label,
    min(product_sale_unit_id::text)::uuid as product_sale_unit_id,
    max(product_name) as product_name,
    max(product_sku) as product_sku,
    max(product_unit) as product_unit,
    max(sale_unit_ratio) as sale_unit_ratio,
    max(unit_price) as unit_price,
    sum(ordered_qty) as total_ordered,
    sum(case when sale_unit_ratio > 0 then remaining_base_qty / sale_unit_ratio else remaining_base_qty end) as total_remaining,
    case
      when p_include_order_items then
        jsonb_agg(
          jsonb_build_object(
            'orderId', order_id,
            'orderItemId', order_item_id,
            'productId', product_id,
            'productSaleUnitId', product_sale_unit_id,
            'quantityDelivered', ordered_qty,
            'saleUnitLabel', sale_unit_label,
            'saleUnitRatio', sale_unit_ratio,
            'unitPrice', unit_price
          )
          order by order_id, order_item_id
        )
      else '[]'::jsonb
    end as order_items
  from item_calc
  where ordered_qty > 0
  group by customer_id, product_id, sale_unit_label
),
orders_by_store as (
  select
    customer_id,
    jsonb_agg(distinct id) as order_ids
  from review_orders
  group by customer_id
),
items_by_store as (
  select
    customer_id,
    jsonb_agg(
      jsonb_build_object(
        'groupKey', product_id::text || '::' || sale_unit_label,
        'productId', product_id,
        'productName', product_name,
        'productSku', product_sku,
        'productUnit', product_unit,
        'productSaleUnitId', product_sale_unit_id,
        'saleUnitLabel', sale_unit_label,
        'saleUnitRatio', sale_unit_ratio,
        'unitPrice', unit_price,
        'totalOrdered', total_ordered,
        'totalRemaining', total_remaining,
        'orderItems', order_items
      )
      order by product_name
    ) as grouped_items
  from grouped_items
  group by customer_id
)
select coalesce(
  jsonb_agg(
    jsonb_build_object(
      'customerId', si.customer_id,
      'customerName', si.customer_name,
      'customerCode', si.customer_code,
      'orderIds', coalesce(obs.order_ids, '[]'::jsonb),
      'orderNumbers', si.order_numbers,
      'orderRounds', si.order_rounds,
      'totalAmount', si.total_amount,
      'groupedItems', coalesce(ibs.grouped_items, '[]'::jsonb)
    )
    order by si.sort_order
  ) filter (where ibs.grouped_items is not null),
  '[]'::jsonb
)
from store_input si
left join orders_by_store obs on obs.customer_id = si.customer_id
left join items_by_store ibs on ibs.customer_id = si.customer_id;
$$;
