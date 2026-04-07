alter table public.product_sale_units
  add column if not exists cost_mode text not null default 'derived',
  add column if not exists fixed_cost_price numeric(12, 2);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_sale_units_cost_mode_check'
      and conrelid = 'public.product_sale_units'::regclass
  ) then
    alter table public.product_sale_units
      add constraint product_sale_units_cost_mode_check
      check (cost_mode in ('derived', 'fixed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_sale_units_fixed_cost_price_check'
      and conrelid = 'public.product_sale_units'::regclass
  ) then
    alter table public.product_sale_units
      add constraint product_sale_units_fixed_cost_price_check
      check (fixed_cost_price is null or fixed_cost_price >= 0);
  end if;
end $$;

update public.product_sale_units
set
  cost_mode = coalesce(nullif(cost_mode, ''), 'derived'),
  fixed_cost_price = case
    when coalesce(nullif(cost_mode, ''), 'derived') = 'fixed' then fixed_cost_price
    else null
  end;
