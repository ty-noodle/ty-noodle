begin;

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid null references public.app_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint vehicles_name_not_blank check (char_length(trim(name)) > 0),
  constraint vehicles_org_name_unique unique (organization_id, name)
);

create index if not exists vehicles_org_sort_idx
  on public.vehicles (organization_id, sort_order asc, created_at asc);

alter table public.customers
  add column if not exists default_vehicle_id uuid null references public.vehicles(id) on delete set null;

create index if not exists customers_default_vehicle_idx
  on public.customers (organization_id, default_vehicle_id);

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_vehicles_updated_at on public.vehicles;
create trigger set_vehicles_updated_at
before update on public.vehicles
for each row execute function public.set_updated_at_timestamp();

alter table public.vehicles enable row level security;
alter table public.vehicles force row level security;
revoke all on public.vehicles from anon, authenticated;

commit;
