create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  platform text,
  user_agent text,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists push_subscriptions_org_active_idx
  on public.push_subscriptions (organization_id, is_active, updated_at desc);

create index if not exists push_subscriptions_user_active_idx
  on public.push_subscriptions (user_id, is_active, updated_at desc);
