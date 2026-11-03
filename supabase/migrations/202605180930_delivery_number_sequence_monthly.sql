-- Delivery note number sequence: reset monthly per organization.
-- Format: DNYYYYMMXXXX (running XXXX resets each month)

create table if not exists public.delivery_note_counters_monthly (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  delivery_year int not null,
  delivery_month int not null check (delivery_month between 1 and 12),
  last_number bigint not null default 0,
  primary key (organization_id, delivery_year, delivery_month)
);

-- We do not initialize from existing data to avoid conflicts with the old DNYYYYMMDD### format.
-- This ensures that the new monthly sequence starts fresh at 1 for the current month.

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
  v_month int := extract(month from p_delivery_date)::int;
  v_next bigint;
begin
  insert into public.delivery_note_counters_monthly (
    organization_id,
    delivery_year,
    delivery_month,
    last_number
  )
  values (p_organization_id, v_year, v_month, 1)
  on conflict (organization_id, delivery_year, delivery_month) do update
    set last_number = public.delivery_note_counters_monthly.last_number + 1
  returning last_number into v_next;

  return 'DN' || to_char(p_delivery_date, 'YYYYMM') || lpad(v_next::text, 4, '0');
end;
$$;

alter table public.delivery_note_counters_monthly enable row level security;

drop policy if exists delivery_note_counters_monthly_deny_api_access on public.delivery_note_counters_monthly;
create policy delivery_note_counters_monthly_deny_api_access
on public.delivery_note_counters_monthly
as restrictive
for all
to anon, authenticated
using (false)
with check (false);
