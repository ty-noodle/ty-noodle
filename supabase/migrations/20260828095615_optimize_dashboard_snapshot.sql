create or replace function public.get_dashboard_snapshot_v1(
  p_organization_id uuid,
  p_business_date date
)
returns table (
  today_order_count bigint,
  today_order_amount numeric,
  today_net_profit numeric,
  today_cost numeric,
  submitted_order_count bigint,
  pending_delivery_count bigint,
  pending_delivery_amount numeric,
  month_delivered_amount numeric,
  active_customer_count bigint,
  low_stock_count bigint
)
language sql
stable
set search_path = ''
as $function$
  with
  today_orders as (
    select count(*)::bigint as order_count
    from public.orders
    where organization_id = p_organization_id
      and order_date = p_business_date
      and status in ('submitted', 'confirmed')
  ),
  today_confirmed_notes as (
    select id, total_amount
    from public.delivery_notes
    where organization_id = p_organization_id
      and status = 'confirmed'
      and delivery_date = p_business_date
  ),
  today_delivery_revenue as (
    select coalesce(sum(total_amount), 0)::numeric as revenue
    from today_confirmed_notes
  ),
  today_delivery_cost as (
    select coalesce(sum(dni.quantity_delivered * dni.cost_price), 0)::numeric as cost
    from today_confirmed_notes dn
    join public.delivery_note_items dni on dni.delivery_note_id = dn.id
  ),
  pending_delivery as (
    select
      count(*)::bigint as pending_delivery_count,
      coalesce(sum(total_amount), 0)::numeric as pending_delivery_amount
    from public.delivery_notes
    where organization_id = p_organization_id
      and status = 'confirmed'
      and dispatch_status = 'pending'
  ),
  month_delivery as (
    select coalesce(sum(total_amount), 0)::numeric as delivered_amount
    from public.delivery_notes
    where organization_id = p_organization_id
      and status = 'confirmed'
      and dispatch_status = 'delivered'
      and delivery_date >= date_trunc('month', p_business_date)::date
      and delivery_date <= p_business_date
  ),
  active_customers as (
    select count(*)::bigint as customer_count
    from public.customers
    where organization_id = p_organization_id
      and is_active = true
  ),
  low_stock as (
    select count(*)::bigint as product_count
    from public.products
    where organization_id = p_organization_id
      and is_active = true
      and (stock_quantity - reserved_quantity) <= 5
  ),
  pending_line_orders as (
    select count(*)::bigint as order_count
    from public.line_pending_orders
    where organization_id = p_organization_id
      and order_date = p_business_date
      and status = 'pending_link'
  ),
  submitted_line_orders as (
    select count(*)::bigint as order_count
    from public.orders o
    left join public.customers c on c.id = o.customer_id
    where o.organization_id = p_organization_id
      and o.order_date = p_business_date
      and o.status in ('submitted', 'confirmed')
      and (
        coalesce(o.metadata ->> 'source', '') in ('line', 'line_pending')
        or nullif(btrim(coalesce(c.line_user_id, '')), '') is not null
      )
  )
  select
    today_orders.order_count as today_order_count,
    today_delivery_revenue.revenue as today_order_amount,
    (today_delivery_revenue.revenue - today_delivery_cost.cost)::numeric as today_net_profit,
    today_delivery_cost.cost as today_cost,
    (pending_line_orders.order_count + submitted_line_orders.order_count)::bigint
      as submitted_order_count,
    pending_delivery.pending_delivery_count,
    pending_delivery.pending_delivery_amount,
    month_delivery.delivered_amount as month_delivered_amount,
    active_customers.customer_count as active_customer_count,
    low_stock.product_count as low_stock_count
  from today_orders
  cross join today_delivery_revenue
  cross join today_delivery_cost
  cross join pending_delivery
  cross join month_delivery
  cross join active_customers
  cross join low_stock
  cross join pending_line_orders
  cross join submitted_line_orders;
$function$;

revoke all on function public.get_dashboard_snapshot_v1(uuid, date) from public;
revoke all on function public.get_dashboard_snapshot_v1(uuid, date) from anon;
revoke all on function public.get_dashboard_snapshot_v1(uuid, date) from authenticated;
grant execute on function public.get_dashboard_snapshot_v1(uuid, date) to service_role;

create index if not exists orders_dashboard_recent_idx
  on public.orders (organization_id, created_at desc)
  where status in ('submitted', 'confirmed');

create index if not exists delivery_notes_dashboard_pending_idx
  on public.delivery_notes (organization_id)
  include (total_amount)
  where status = 'confirmed' and dispatch_status = 'pending';
