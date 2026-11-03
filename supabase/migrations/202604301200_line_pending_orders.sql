create table if not exists public.line_order_customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  line_user_id text not null,
  line_display_name text,
  line_picture_url text,
  customer_id uuid references public.customers(id) on delete set null,
  onboarding_choice text not null default 'existing'
    check (onboarding_choice in ('existing', 'new')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, line_user_id)
);

create index if not exists line_order_customers_org_customer_idx
  on public.line_order_customers (organization_id, customer_id);

create table if not exists public.line_pending_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  line_order_customer_id uuid not null references public.line_order_customers(id) on delete cascade,
  line_user_id text not null,
  line_display_name text,
  line_picture_url text,
  status text not null default 'pending_link'
    check (status in ('pending_link', 'converted', 'cancelled')),
  converted_customer_id uuid references public.customers(id) on delete set null,
  converted_order_id uuid references public.orders(id) on delete set null,
  order_date date not null default ((now() at time zone 'Asia/Bangkok')::date),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists line_pending_orders_org_status_date_idx
  on public.line_pending_orders (organization_id, status, order_date desc, created_at desc);

create index if not exists line_pending_orders_org_line_idx
  on public.line_pending_orders (organization_id, line_user_id, status);

create table if not exists public.line_pending_order_items (
  id uuid primary key default gen_random_uuid(),
  pending_order_id uuid not null references public.line_pending_orders(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_sale_unit_id uuid not null references public.product_sale_units(id) on delete restrict,
  sale_unit_label text not null,
  sale_unit_ratio numeric(12, 3) not null default 1,
  quantity numeric(12, 3) not null check (quantity > 0),
  quantity_in_base_unit numeric(12, 3) not null check (quantity_in_base_unit > 0),
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists line_pending_order_items_pending_idx
  on public.line_pending_order_items (pending_order_id, sort_order);

alter table public.line_order_customers enable row level security;
alter table public.line_pending_orders enable row level security;
alter table public.line_pending_order_items enable row level security;

alter table public.line_order_customers force row level security;
alter table public.line_pending_orders force row level security;
alter table public.line_pending_order_items force row level security;

revoke all on public.line_order_customers from anon, authenticated;
revoke all on public.line_pending_orders from anon, authenticated;
revoke all on public.line_pending_order_items from anon, authenticated;

drop trigger if exists line_order_customers_set_updated_at on public.line_order_customers;
create trigger line_order_customers_set_updated_at
before update on public.line_order_customers
for each row execute function public.set_updated_at();

drop trigger if exists line_pending_orders_set_updated_at on public.line_pending_orders;
create trigger line_pending_orders_set_updated_at
before update on public.line_pending_orders
for each row execute function public.set_updated_at();
