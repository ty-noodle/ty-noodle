-- Document number sequences reset yearly, while preserving document date in the number.
-- Format:
--   Billing  = VBYYYYMMDD###
--   Delivery = DNYYYYMMDD###
-- The trailing running number is per organization + per year and may exceed 999.

-- -----------------------------------------------------------------------------
-- Billing yearly counters
-- -----------------------------------------------------------------------------

create table if not exists public.billing_number_counters_yearly (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  billing_year int not null,
  last_number bigint not null default 0,
  primary key (organization_id, billing_year)
);

insert into public.billing_number_counters_yearly (organization_id, billing_year, last_number)
select
  br.organization_id,
  extract(year from br.billing_date)::int as billing_year,
  coalesce(max(substring(br.billing_number from '([0-9]+)$')::bigint), 0) as last_number
from public.billing_records br
where br.billing_number is not null
group by br.organization_id, extract(year from br.billing_date)::int
on conflict (organization_id, billing_year) do update
set last_number = greatest(
  public.billing_number_counters_yearly.last_number,
  excluded.last_number
);

create or replace function public.next_billing_number(
  p_organization_id uuid,
  p_billing_date date
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int := extract(year from p_billing_date)::int;
  v_next bigint;
begin
  insert into public.billing_number_counters_yearly (organization_id, billing_year, last_number)
  values (p_organization_id, v_year, 1)
  on conflict (organization_id, billing_year) do update
    set last_number = public.billing_number_counters_yearly.last_number + 1
  returning last_number into v_next;

  return 'VB' || to_char(p_billing_date, 'YYYYMMDD') || lpad(v_next::text, 3, '0');
end;
$$;

alter table public.billing_number_counters_yearly enable row level security;

drop policy if exists billing_number_counters_yearly_deny_api_access on public.billing_number_counters_yearly;
create policy billing_number_counters_yearly_deny_api_access
on public.billing_number_counters_yearly
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

-- -----------------------------------------------------------------------------
-- Delivery yearly counters
-- -----------------------------------------------------------------------------

create table if not exists public.delivery_note_counters_yearly (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  delivery_year int not null,
  last_number bigint not null default 0,
  primary key (organization_id, delivery_year)
);

insert into public.delivery_note_counters_yearly (organization_id, delivery_year, last_number)
select
  dn.organization_id,
  extract(year from dn.delivery_date)::int as delivery_year,
  coalesce(max(substring(dn.delivery_number from '([0-9]+)$')::bigint), 0) as last_number
from public.delivery_notes dn
where dn.delivery_number is not null
group by dn.organization_id, extract(year from dn.delivery_date)::int
on conflict (organization_id, delivery_year) do update
set last_number = greatest(
  public.delivery_note_counters_yearly.last_number,
  excluded.last_number
);

create or replace function public.next_delivery_note_number(
  p_organization_id uuid,
  p_delivery_date date
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int := extract(year from p_delivery_date)::int;
  v_next bigint;
begin
  insert into public.delivery_note_counters_yearly (organization_id, delivery_year, last_number)
  values (p_organization_id, v_year, 1)
  on conflict (organization_id, delivery_year) do update
    set last_number = public.delivery_note_counters_yearly.last_number + 1
  returning last_number into v_next;

  return 'DN' || to_char(p_delivery_date, 'YYYYMMDD') || lpad(v_next::text, 3, '0');
end;
$$;

alter table public.delivery_note_counters_yearly enable row level security;

drop policy if exists delivery_note_counters_yearly_deny_api_access on public.delivery_note_counters_yearly;
create policy delivery_note_counters_yearly_deny_api_access
on public.delivery_note_counters_yearly
as restrictive
for all
to anon, authenticated
using (false)
with check (false);
