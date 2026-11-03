-- Add soft delete column to products table
alter table public.products
  add column if not exists deleted_at timestamptz;

-- Index to quickly filter out deleted products
create index if not exists products_deleted_at_idx
  on public.products (deleted_at)
  where deleted_at is null;

-- Update the get_order_daily_store_items RPC to ignore deleted products if needed
-- Actually, if they are already in an order, they should still appear in that order's view.
-- The RPCs already join from order_items, so if the product exists, it will show up.

