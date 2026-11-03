do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'product_unit'
  ) then
    create type public.product_unit as enum ('kg', 'pack', 'bag', 'piece', 'tray');
  end if;

  if not exists (
    select 1 from pg_type where typname = 'order_status'
  ) then
    create type public.order_status as enum (
      'draft',
      'submitted',
      'verified',
      'in_production',
      'ready_for_delivery',
      'delivered',
      'cancelled'
    );
  end if;

  if not exists (
    select 1 from pg_type where typname = 'delivery_status'
  ) then
    create type public.delivery_status as enum (
      'planned',
      'out_for_delivery',
      'delivered',
      'cancelled'
    );
  end if;

  if not exists (
    select 1 from pg_type where typname = 'payment_status'
  ) then
    create type public.payment_status as enum ('unpaid', 'partial', 'paid', 'void');
  end if;
end $$;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_code text,
  name text not null,
  phone text,
  line_user_id text,
  address text,
  billing_day smallint,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint customers_billing_day_check check (
    billing_day is null or billing_day between 1 and 31
  )
);

create unique index if not exists customers_org_code_unique
  on public.customers (organization_id, customer_code)
  where customer_code is not null;

create index if not exists customers_org_active_idx
  on public.customers (organization_id, is_active, name);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sku text,
  name text not null,
  category text,
  unit public.product_unit not null default 'kg',
  min_order_qty numeric(12, 3) not null default 0,
  order_step_qty numeric(12, 3) not null default 1,
  cost_price numeric(12, 2) not null default 0,
  default_sale_price numeric(12, 2) not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint products_qty_rules_check check (
    min_order_qty >= 0 and order_step_qty > 0
  )
);

create unique index if not exists products_org_sku_unique
  on public.products (organization_id, sku)
  where sku is not null;

create index if not exists products_org_active_idx
  on public.products (organization_id, is_active, name);

create table if not exists public.customer_product_prices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  price numeric(12, 2) not null,
  min_qty numeric(12, 3),
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint customer_product_prices_date_check check (
    effective_to is null or effective_to >= effective_from
  ),
  constraint customer_product_prices_price_check check (
    price >= 0 and (min_qty is null or min_qty >= 0)
  )
);

create unique index if not exists customer_product_prices_active_unique
  on public.customer_product_prices (
    customer_id,
    product_id,
    effective_from,
    coalesce(min_qty, 0)
  );

create index if not exists customer_product_prices_lookup_idx
  on public.customer_product_prices (
    organization_id,
    customer_id,
    product_id,
    effective_from desc
  );

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
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists orders_org_number_unique
  on public.orders (organization_id, order_number);

create index if not exists orders_org_status_date_idx
  on public.orders (organization_id, status, order_date desc);

create index if not exists orders_customer_date_idx
  on public.orders (customer_id, order_date desc);

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
  on public.order_items (order_id);

create index if not exists order_items_product_idx
  on public.order_items (product_id);

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  delivery_number text not null,
  delivery_date date not null default current_date,
  status public.delivery_status not null default 'planned',
  driver_user_id uuid references public.app_users(id) on delete set null,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists deliveries_org_number_unique
  on public.deliveries (organization_id, delivery_number);

create index if not exists deliveries_org_status_date_idx
  on public.deliveries (organization_id, status, delivery_date desc);

create table if not exists public.delivery_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete set null,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(12, 3) not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint delivery_items_quantity_check check (quantity > 0)
);

create index if not exists delivery_items_delivery_idx
  on public.delivery_items (delivery_id);

create table if not exists public.receivables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  order_id uuid references public.orders(id) on delete set null,
  delivery_id uuid references public.deliveries(id) on delete set null,
  reference_number text not null,
  due_date date,
  amount_due numeric(12, 2) not null,
  amount_paid numeric(12, 2) not null default 0,
  status public.payment_status not null default 'unpaid',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint receivables_amount_check check (
    amount_due >= 0 and amount_paid >= 0 and amount_paid <= amount_due
  )
);

create unique index if not exists receivables_org_reference_unique
  on public.receivables (organization_id, reference_number);

create index if not exists receivables_org_status_due_idx
  on public.receivables (organization_id, status, due_date);

create table if not exists public.payment_collections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  receivable_id uuid not null references public.receivables(id) on delete cascade,
  collected_by_user_id uuid references public.app_users(id) on delete set null,
  collected_at timestamptz not null default timezone('utc', now()),
  amount numeric(12, 2) not null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint payment_collections_amount_check check (amount > 0)
);

create index if not exists payment_collections_receivable_idx
  on public.payment_collections (receivable_id, collected_at desc);

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

drop trigger if exists deliveries_set_updated_at on public.deliveries;
create trigger deliveries_set_updated_at
before update on public.deliveries
for each row
execute function public.set_updated_at();

drop trigger if exists delivery_items_set_updated_at on public.delivery_items;
create trigger delivery_items_set_updated_at
before update on public.delivery_items
for each row
execute function public.set_updated_at();

drop trigger if exists receivables_set_updated_at on public.receivables;
create trigger receivables_set_updated_at
before update on public.receivables
for each row
execute function public.set_updated_at();

drop trigger if exists payment_collections_set_updated_at on public.payment_collections;
create trigger payment_collections_set_updated_at
before update on public.payment_collections
for each row
execute function public.set_updated_at();

alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.customer_product_prices enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.deliveries enable row level security;
alter table public.delivery_items enable row level security;
alter table public.receivables enable row level security;
alter table public.payment_collections enable row level security;

alter table public.customers force row level security;
alter table public.products force row level security;
alter table public.customer_product_prices force row level security;
alter table public.orders force row level security;
alter table public.order_items force row level security;
alter table public.deliveries force row level security;
alter table public.delivery_items force row level security;
alter table public.receivables force row level security;
alter table public.payment_collections force row level security;

revoke all on public.customers from anon, authenticated;
revoke all on public.products from anon, authenticated;
revoke all on public.customer_product_prices from anon, authenticated;
revoke all on public.orders from anon, authenticated;
revoke all on public.order_items from anon, authenticated;
revoke all on public.deliveries from anon, authenticated;
revoke all on public.delivery_items from anon, authenticated;
revoke all on public.receivables from anon, authenticated;
revoke all on public.payment_collections from anon, authenticated;
