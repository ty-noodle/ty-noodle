-- Add display_order column to products table
alter table public.products
  add column if not exists display_order integer default 0;

-- Initialize display_order based on SKU to preserve existing order
with ordered_products as (
  select id, row_number() over (order by sku asc) as rn
  from public.products
)
update public.products
set display_order = ordered_products.rn
from ordered_products
where public.products.id = ordered_products.id;
