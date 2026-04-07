create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_code text not null,
  name text not null,
  address text not null,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint customers_org_code_unique unique (organization_id, customer_code)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sku text not null,
  name text not null,
  cost_price numeric(12, 2) not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint products_org_sku_unique unique (organization_id, sku),
  constraint products_cost_price_check check (cost_price >= 0)
);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null,
  public_url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.customer_product_prices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  sale_price numeric(12, 2) not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint customer_product_prices_unique unique (organization_id, customer_id, product_id),
  constraint customer_product_prices_sale_price_check check (sale_price >= 0)
);

create index if not exists customers_org_name_idx
  on public.customers (organization_id, name);

create index if not exists products_org_name_idx
  on public.products (organization_id, name);

create index if not exists product_images_product_sort_idx
  on public.product_images (product_id, sort_order, created_at);

create index if not exists customer_product_prices_product_idx
  on public.customer_product_prices (organization_id, product_id);

create index if not exists customer_product_prices_customer_idx
  on public.customer_product_prices (organization_id, customer_id);

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
before update on public.customers
for each row
execute function public.set_updated_at();

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row
execute function public.set_updated_at();

drop trigger if exists customer_product_prices_set_updated_at on public.customer_product_prices;
create trigger customer_product_prices_set_updated_at
before update on public.customer_product_prices
for each row
execute function public.set_updated_at();

alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.customer_product_prices enable row level security;

alter table public.customers force row level security;
alter table public.products force row level security;
alter table public.product_images force row level security;
alter table public.customer_product_prices force row level security;

revoke all on public.customers from anon, authenticated;
revoke all on public.products from anon, authenticated;
revoke all on public.product_images from anon, authenticated;
revoke all on public.customer_product_prices from anon, authenticated;
