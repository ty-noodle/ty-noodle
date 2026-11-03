begin;

-- 1. Remove non-negative constraint from products stock_quantity
alter table public.products
  drop constraint if exists products_stock_quantity_check;

-- 2. Remove non-negative constraint from reserved_quantity (just in case, though we won't use it much)
alter table public.products
  drop constraint if exists products_reserved_quantity_check;

commit;
