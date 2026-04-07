do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'order_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.order_status as enum (
      'draft',
      'submitted',
      'confirmed',
      'cancelled'
    );
  end if;
end
$$;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  order_number text not null,
  order_date date not null default current_date,
  requested_delivery_date date,
  status public.order_status not null default 'submitted',
  subtotal_amount numeric(12, 2) not null default 0,
  total_amount numeric(12, 2) not null default 0,
  notes text,
  placed_by_user_id uuid references public.app_users(id) on delete set null,
  verified_by_user_id uuid references public.app_users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint orders_org_number_unique unique (organization_id, order_number),
  constraint orders_amounts_check check (
    subtotal_amount >= 0 and total_amount >= 0
  )
);

create index if not exists orders_org_status_date_idx
  on public.orders (organization_id, status, order_date desc);

create index if not exists orders_customer_date_idx
  on public.orders (customer_id, order_date desc, created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(12, 3) not null,
  unit_price numeric(12, 2) not null,
  cost_price numeric(12, 2) not null default 0,
  line_total numeric(12, 2) not null,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint order_items_amounts_check check (
    quantity > 0 and unit_price >= 0 and cost_price >= 0 and line_total >= 0
  )
);

create index if not exists order_items_order_idx
  on public.order_items (order_id, created_at);

create index if not exists order_items_product_idx
  on public.order_items (product_id);

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
before update on public.orders
for each row
execute function public.set_updated_at();

drop trigger if exists order_items_set_updated_at on public.order_items;
create trigger order_items_set_updated_at
before update on public.order_items
for each row
execute function public.set_updated_at();

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

alter table public.orders force row level security;
alter table public.order_items force row level security;

revoke all on public.orders from anon, authenticated;
revoke all on public.order_items from anon, authenticated;

drop policy if exists orders_deny_api_access on public.orders;
create policy orders_deny_api_access
on public.orders
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists order_items_deny_api_access on public.order_items;
create policy order_items_deny_api_access
on public.order_items
as restrictive
for all
to anon, authenticated
using (false)
with check (false);
