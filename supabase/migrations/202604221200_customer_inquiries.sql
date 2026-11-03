create table if not exists public.customer_inquiries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_name text not null,
  customer_phone text not null,
  source text not null default 'line',
  is_handled boolean not null default false,
  handled_at timestamptz,
  handled_by_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists customer_inquiries_org_created_idx
  on public.customer_inquiries (organization_id, created_at desc);

create index if not exists customer_inquiries_org_handled_idx
  on public.customer_inquiries (organization_id, is_handled, created_at desc);

alter table public.customer_inquiries enable row level security;

drop policy if exists customer_inquiries_deny_api_access on public.customer_inquiries;
create policy customer_inquiries_deny_api_access
on public.customer_inquiries
as restrictive
for all
to anon, authenticated
using (false)
with check (false);
