-- Auto-generate customer codes (TYS-prefixed) for LINE self-registration flow.
-- Uses a counter table so codes are unique per-org and gap-free.

create table if not exists public.customer_code_counters (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  last_number     bigint not null default 0
);

-- Seed counter from existing customer codes so next value won't collide.
insert into public.customer_code_counters (organization_id, last_number)
select
  c.organization_id,
  coalesce(max(
    case when c.customer_code ~ '^TYS[0-9]+$'
      then substring(c.customer_code from 4)::bigint
      else 0
    end
  ), 0) as last_number
from public.customers c
group by c.organization_id
on conflict (organization_id) do update
  set last_number = greatest(
    public.customer_code_counters.last_number,
    excluded.last_number
  );

create or replace function public.next_customer_code(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next bigint;
begin
  insert into public.customer_code_counters (organization_id, last_number)
  values (p_organization_id, 1)
  on conflict (organization_id) do update
    set last_number = public.customer_code_counters.last_number + 1
  returning last_number into v_next;

  return 'TYS' || lpad(v_next::text, 3, '0');
end;
$$;

alter table public.customer_code_counters enable row level security;

drop policy if exists customer_code_counters_deny_api_access on public.customer_code_counters;
create policy customer_code_counters_deny_api_access
on public.customer_code_counters
as restrictive
for all
to anon, authenticated
using (false)
with check (false);
