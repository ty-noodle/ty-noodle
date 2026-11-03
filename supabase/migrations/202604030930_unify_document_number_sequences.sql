-- Unify billing and delivery document number formats.
-- Goal:
-- 1) Running number never resets
-- 2) Billing:  VBYYYYMMDD###
-- 3) Delivery: DNYYYYMMDD###

-- -----------------------------------------------------------------------------
-- Billing counters: move from per-day reset to per-organization global counter
-- -----------------------------------------------------------------------------

create table if not exists public.billing_number_counters_global (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  last_number bigint not null default 0
);

insert into public.billing_number_counters_global (organization_id, last_number)
select
  br.organization_id,
  coalesce(max(substring(br.billing_number from '([0-9]+)$')::bigint), 0) as last_number
from public.billing_records br
where br.billing_number ~ '^VB[0-9]{8}[0-9]{3,}$'
group by br.organization_id
on conflict (organization_id) do update
set last_number = greatest(
  public.billing_number_counters_global.last_number,
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
  v_next bigint;
begin
  insert into public.billing_number_counters_global (organization_id, last_number)
  values (p_organization_id, 1)
  on conflict (organization_id) do update
    set last_number = public.billing_number_counters_global.last_number + 1
  returning last_number into v_next;

  return 'VB' || to_char(p_billing_date, 'YYYYMMDD') || lpad(v_next::text, 3, '0');
end;
$$;

alter table public.billing_number_counters_global enable row level security;

drop policy if exists billing_number_counters_global_deny_api_access on public.billing_number_counters_global;
create policy billing_number_counters_global_deny_api_access
on public.billing_number_counters_global
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

-- -----------------------------------------------------------------------------
-- Delivery note numbers: keep global sequence, change display format only
-- -----------------------------------------------------------------------------

insert into public.delivery_note_counters (organization_id, last_number)
select
  dn.organization_id,
  coalesce(max(substring(dn.delivery_number from '([0-9]+)$')::bigint), 0) as last_number
from public.delivery_notes dn
where dn.delivery_number ~ '^DN[0-9]{8}[0-9]{3,}$'
group by dn.organization_id
on conflict (organization_id) do update
set last_number = greatest(
  public.delivery_note_counters.last_number,
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
  v_next bigint;
begin
  insert into public.delivery_note_counters (organization_id, last_number)
  values (p_organization_id, 1)
  on conflict (organization_id) do update
    set last_number = public.delivery_note_counters.last_number + 1
  returning last_number into v_next;

  return 'DN' || to_char(p_delivery_date, 'YYYYMMDD') || lpad(v_next::text, 3, '0');
end;
$$;
