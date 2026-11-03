-- Order flow performance indexes.
-- These indexes do not change data or business logic; they only improve lookup speed for order pages.

create index if not exists orders_org_date_status_customer_idx
on public.orders (organization_id, order_date, status, customer_id);

create index if not exists orders_org_customer_date_status_idx
on public.orders (organization_id, customer_id, order_date, status);

create index if not exists delivery_notes_order_lookup_idx
on public.delivery_notes (order_id);

create index if not exists delivery_notes_org_date_status_customer_idx
on public.delivery_notes (organization_id, delivery_date, status, customer_id);

create index if not exists delivery_notes_org_customer_date_status_idx
on public.delivery_notes (organization_id, customer_id, delivery_date, status);

create index if not exists delivery_note_items_note_product_unit_idx
on public.delivery_note_items (delivery_note_id, product_id, product_sale_unit_id);

create index if not exists delivery_note_items_order_item_product_idx
on public.delivery_note_items (order_item_id, product_id);

create index if not exists customer_product_prices_customer_product_unit_idx
on public.customer_product_prices (organization_id, customer_id, product_id, product_sale_unit_id);

create index if not exists products_order_picker_idx
on public.products (organization_id, is_active, display_order, created_at);

create index if not exists product_sale_units_picker_idx
on public.product_sale_units (organization_id, product_id, is_active, sort_order, created_at);
