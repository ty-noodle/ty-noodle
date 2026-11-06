-- Reserve numbers separately: callers upload images before inserting receipts.
create table public.inventory_receipt_number_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  receipt_date date not null,
  last_number numeric not null check (last_number >= 1 and last_number = trunc(last_number)),
  primary key (organization_id, receipt_date)
);

alter table public.inventory_receipt_number_counters enable row level security;
alter table public.inventory_receipt_number_counters force row level security;
revoke all on public.inventory_receipt_number_counters from public, anon, authenticated;
grant all on public.inventory_receipt_number_counters to service_role;

create or replace function public.generate_receipt_number(
  p_organization_id uuid,
  p_date date default (now() at time zone 'Asia/Bangkok')::date
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix text := 'RCV' || to_char(p_date, 'YYMMDD');
  v_next numeric;
begin
  -- Match the printed number, since received_at can be backdated or edited.
  select coalesce(max(substring(receipt_number from 10)::numeric), 0) + 1
  into v_next
  from public.inventory_receipts
  where organization_id = p_organization_id
    and receipt_number like v_prefix || '%'
    and receipt_number ~ ('^' || v_prefix || '[0-9]+$');

  insert into public.inventory_receipt_number_counters (organization_id, receipt_date, last_number)
  values (p_organization_id, p_date, v_next)
  on conflict (organization_id, receipt_date) do update
    set last_number = greatest(public.inventory_receipt_number_counters.last_number + 1, excluded.last_number)
  returning last_number into v_next;

  return v_prefix || lpad(v_next::text, greatest(2, length(v_next::text)), '0');
end;
$$;

revoke all on function public.generate_receipt_number(uuid, date) from public, anon, authenticated;
grant execute on function public.generate_receipt_number(uuid, date) to service_role;
