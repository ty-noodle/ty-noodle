drop trigger if exists payment_collections_set_updated_at on public.payment_collections;
drop trigger if exists receivables_set_updated_at on public.receivables;
drop trigger if exists delivery_items_set_updated_at on public.delivery_items;
drop trigger if exists deliveries_set_updated_at on public.deliveries;
drop trigger if exists order_items_set_updated_at on public.order_items;
drop trigger if exists orders_set_updated_at on public.orders;
drop trigger if exists customer_product_prices_set_updated_at on public.customer_product_prices;
drop trigger if exists products_set_updated_at on public.products;
drop trigger if exists customers_set_updated_at on public.customers;

drop table if exists public.payment_collections cascade;
drop table if exists public.receivables cascade;
drop table if exists public.delivery_items cascade;
drop table if exists public.deliveries cascade;
drop table if exists public.order_items cascade;
drop table if exists public.orders cascade;
drop table if exists public.customer_product_prices cascade;
drop table if exists public.products cascade;
drop table if exists public.customers cascade;

drop type if exists public.payment_status;
drop type if exists public.delivery_status;
drop type if exists public.order_status;
drop type if exists public.product_unit;
