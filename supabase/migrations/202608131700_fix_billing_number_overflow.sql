-- Preserve billing sequence digits after the yearly counter exceeds 999.
-- PostgreSQL lpad(text, 3, '0') truncates values longer than three characters.

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

  return 'VB'
    || to_char(p_billing_date, 'YYYYMMDD')
    || lpad(v_next::text, greatest(3, length(v_next::text)), '0');
end;
$$;

-- On 2026-08-13 the affected organization crossed 999. The rows generated
-- for 1000 and 1010 were persisted as suffixes 100 and 101 respectively.
-- Scope the repair to organizations that demonstrably reached this incident
-- and persisted the immediately preceding 999 document on the same date.
with affected_organizations as (
  select counters.organization_id
  from public.billing_number_counters_yearly counters
  where counters.billing_year = 2026
    and counters.last_number >= 1010
    and exists (
      select 1
      from public.billing_records records
      where records.organization_id = counters.organization_id
        and records.billing_date = date '2026-08-13'
        and records.billing_number = 'VB20260813999'
    )
)
update public.billing_records records
set billing_number = case records.billing_number
  when 'VB20260813100' then 'VB202608131000'
  when 'VB20260813101' then 'VB202608131010'
  else records.billing_number
end
where records.organization_id in (select organization_id from affected_organizations)
  and records.billing_date = date '2026-08-13'
  and records.billing_number in ('VB20260813100', 'VB20260813101');
