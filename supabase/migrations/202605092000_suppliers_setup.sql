-- Migration: Add suppliers table and sequence for TYV-prefixed codes.

-- 1. Create suppliers table (mirrors customers structure)
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_code text,
  name text not null,
  address text,
  province text,
  district text,
  subdistrict text,
  postal_code text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- 2. Indices and constraints
create unique index if not exists suppliers_org_code_unique
  on public.suppliers (organization_id, supplier_code)
  where supplier_code is not null;

create index if not exists suppliers_org_active_idx
  on public.suppliers (organization_id, is_active, name);

-- 3. Set up updated_at trigger
drop trigger if exists suppliers_set_updated_at on public.suppliers;
create trigger suppliers_set_updated_at
before update on public.suppliers
for each row
execute function public.set_updated_at();

-- 4. Supplier code sequence (TYV-prefixed)
create table if not exists public.supplier_code_counters (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  last_number     bigint not null default 0
);

create or replace function public.next_supplier_code(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next bigint;
begin
  insert into public.supplier_code_counters (organization_id, last_number)
  values (p_organization_id, 1)
  on conflict (organization_id) do update
    set last_number = public.supplier_code_counters.last_number + 1
  returning last_number into v_next;

  return 'TYV' || lpad(v_next::text, 3, '0');
end;
$$;

-- 5. RLS
alter table public.suppliers enable row level security;
alter table public.suppliers force row level security;
alter table public.supplier_code_counters enable row level security;

-- Admin access only for now (mirrors org-wide pattern)
revoke all on public.suppliers from anon, authenticated;
revoke all on public.supplier_code_counters from anon, authenticated;

-- Policies (matching project style)
drop policy if exists supplier_code_counters_deny_api_access on public.supplier_code_counters;
create policy supplier_code_counters_deny_api_access
on public.supplier_code_counters
as restrictive
for all
to anon, authenticated
using (false)
with check (false);
