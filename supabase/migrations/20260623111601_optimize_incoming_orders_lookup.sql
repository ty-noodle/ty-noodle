-- Improve incoming order page lookup speed.
-- These indexes match the order list and delivery-note metadata queries used by /orders/incoming.

create index if not exists orders_org_order_date_created_idx
on public.orders (organization_id, order_date desc, created_at desc);

create index if not exists orders_org_customer_order_date_created_idx
on public.orders (organization_id, customer_id, order_date desc, created_at desc);

create index if not exists delivery_notes_org_status_date_created_idx
on public.delivery_notes (organization_id, status, delivery_date, created_at);

create index if not exists delivery_notes_org_order_status_idx
on public.delivery_notes (organization_id, order_id, status)
where order_id is not null;
