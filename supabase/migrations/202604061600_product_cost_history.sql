create table public.product_cost_history (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id      uuid not null references public.products(id) on delete cascade,
  sale_unit_id    uuid references public.product_sale_units(id) on delete set null,
  unit_label      text not null,
  cost_before     numeric(12,2),
  cost_after      numeric(12,2) not null,
  changed_by_name text,
  changed_at      timestamptz not null default now()
);

create index on public.product_cost_history (product_id, changed_at desc);

alter table public.product_cost_history enable row level security;

create policy "org members can read cost history"
  on public.product_cost_history for select
  using (
    organization_id in (
      select organization_id from public.app_users where id = auth.uid()
    )
  );
