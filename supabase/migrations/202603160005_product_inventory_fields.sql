alter table public.products
  add column if not exists stock_quantity integer not null default 0,
  add column if not exists unit text not null default 'piece';

alter table public.products
  drop constraint if exists products_stock_quantity_check;

alter table public.products
  add constraint products_stock_quantity_check check (stock_quantity >= 0);

alter table public.products
  drop constraint if exists products_unit_check;

alter table public.products
  add constraint products_unit_check check (unit in ('piece', 'kg', 'pack', 'bag', 'tray'));
