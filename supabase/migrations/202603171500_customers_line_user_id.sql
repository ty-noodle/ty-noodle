-- Add LINE user ID mapping column to customers
-- This allows linking a LINE user to a specific customer record on first login.

alter table public.customers
  add column if not exists line_user_id text;

create unique index if not exists customers_line_user_id_unique
  on public.customers (line_user_id)
  where line_user_id is not null;
