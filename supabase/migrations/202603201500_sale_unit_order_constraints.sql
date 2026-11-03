alter table public.product_sale_units
  add column if not exists min_order_qty numeric(12, 3) not null default 1,
  add column if not exists step_order_qty numeric(12, 3);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'product_sale_units_min_order_qty_check'
      and conrelid = 'public.product_sale_units'::regclass
  ) then
    alter table public.product_sale_units
      add constraint product_sale_units_min_order_qty_check
      check (min_order_qty >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'product_sale_units_step_order_qty_check'
      and conrelid = 'public.product_sale_units'::regclass
  ) then
    alter table public.product_sale_units
      add constraint product_sale_units_step_order_qty_check
      check (step_order_qty is null or step_order_qty > 0);
  end if;
end $$;
