create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint product_categories_org_name_unique unique (organization_id, name)
);

create table if not exists public.product_category_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_category_id uuid not null references public.product_categories(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint product_category_items_unique unique (product_category_id, product_id)
);

create index if not exists product_categories_org_sort_idx
  on public.product_categories (organization_id, sort_order, name);

create index if not exists product_category_items_category_idx
  on public.product_category_items (product_category_id, product_id);

create index if not exists product_category_items_product_idx
  on public.product_category_items (product_id, product_category_id);

drop trigger if exists product_categories_set_updated_at on public.product_categories;
create trigger product_categories_set_updated_at
before update on public.product_categories
for each row
execute function public.set_updated_at();

alter table public.product_categories enable row level security;
alter table public.product_category_items enable row level security;

alter table public.product_categories force row level security;
alter table public.product_category_items force row level security;

revoke all on public.product_categories from anon, authenticated;
revoke all on public.product_category_items from anon, authenticated;

with source_categories as (
  select
    p.organization_id,
    trim(both from p.metadata ->> 'category') as category_name
  from public.products p
  where trim(both from coalesce(p.metadata ->> 'category', '')) <> ''
  group by p.organization_id, trim(both from p.metadata ->> 'category')
)
insert into public.product_categories (
  organization_id,
  name,
  sort_order
)
select
  source_categories.organization_id,
  source_categories.category_name,
  row_number() over (
    partition by source_categories.organization_id
    order by source_categories.category_name
  ) - 1
from source_categories
on conflict (organization_id, name) do nothing;

insert into public.product_category_items (
  organization_id,
  product_category_id,
  product_id
)
select
  p.organization_id,
  c.id,
  p.id
from public.products p
join public.product_categories c
  on c.organization_id = p.organization_id
 and c.name = trim(both from p.metadata ->> 'category')
where trim(both from coalesce(p.metadata ->> 'category', '')) <> ''
on conflict (product_category_id, product_id) do nothing;
