-- ─────────────────────────────────────────────────────────────────────────────
-- Order number sequence
-- Format: ORD + YYYYMMDD (order_date) + 5-digit global running number
-- Running number never resets — global per organization
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Atomic counter table (one row per org)
create table if not exists public.order_number_counters (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  last_number     bigint not null default 0
);

revoke all on public.order_number_counters from anon, authenticated;

-- 2. Function: atomically increment counter and return formatted order number
create or replace function public.next_order_number(
  p_organization_id uuid,
  p_order_date      date
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next bigint;
begin
  insert into public.order_number_counters (organization_id, last_number)
  values (p_organization_id, 1)
  on conflict (organization_id) do update
    set last_number = order_number_counters.last_number + 1
  returning last_number into v_next;

  return 'ORD' || to_char(p_order_date, 'YYYYMMDD') || lpad(v_next::text, 5, '0');
end;
$$;

-- 3. Backfill existing orders — reassign in created_at order per org
do $$
declare
  v_org_id uuid;
  v_seq    bigint;
  r        record;
begin
  for v_org_id in
    select distinct organization_id from public.orders
  loop
    v_seq := 0;

    for r in
      select id, order_date
      from public.orders
      where organization_id = v_org_id
      order by created_at asc, id asc
    loop
      v_seq := v_seq + 1;
      update public.orders
      set order_number = 'ORD' || to_char(r.order_date, 'YYYYMMDD') || lpad(v_seq::text, 5, '0')
      where id = r.id;
    end loop;

    -- Seed counter so next real order continues from here
    insert into public.order_number_counters (organization_id, last_number)
    values (v_org_id, v_seq)
    on conflict (organization_id) do update
      set last_number = excluded.last_number;
  end loop;
end;
$$;
