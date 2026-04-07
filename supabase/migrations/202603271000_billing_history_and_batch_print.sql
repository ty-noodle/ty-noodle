-- 1. Create table for billing history
create table if not exists public.billing_records (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id     uuid not null references public.customers(id) on delete cascade,
  billing_number  text not null,
  from_date       date not null,
  to_date         date not null,
  billing_date    date not null,
  total_amount    numeric(14, 2) not null,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id),

  -- unique billing number per organization
  unique (organization_id, billing_number)
);

-- index for history lookup
create index if not exists billing_records_org_cust_idx on public.billing_records(organization_id, customer_id, billing_date desc);

-- 2. Atomic counter table for daily billing numbers
create table if not exists public.billing_number_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  billing_date    date not null,
  last_number     int not null default 0,
  primary key (organization_id, billing_date)
);

-- 3. Function to get next billing number (daily reset)
create or replace function public.next_billing_number(
  p_organization_id uuid,
  p_billing_date    date
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next bigint;
begin
  insert into public.billing_number_counters (organization_id, billing_date, last_number)
  values (p_organization_id, p_billing_date, 1)
  on conflict (organization_id, billing_date) do update
    set last_number = billing_number_counters.last_number + 1
  returning last_number into v_next;

  return 'VB' || to_char(p_billing_date, 'YYYYMMDD') || 
         (case when v_next < 1000 then lpad(v_next::text, 3, '0') else v_next::text end);
end;
$$;

-- 4. Restrictive RLS policies (deny direct API access)
alter table public.billing_records enable row level security;
alter table public.billing_number_counters enable row level security;

drop policy if exists billing_records_deny_api_access on public.billing_records;
create policy billing_records_deny_api_access
on public.billing_records
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists billing_number_counters_deny_api_access on public.billing_number_counters;
create policy billing_number_counters_deny_api_access
on public.billing_number_counters
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

