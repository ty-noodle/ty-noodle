create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'app_role'
  ) then
    create type public.app_role as enum ('admin', 'member');
  end if;
end $$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  display_name text not null,
  email text,
  role public.app_role not null default 'member',
  pin_lookup text not null unique,
  pin_hash text not null,
  is_active boolean not null default true,
  failed_pin_attempts integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  last_failed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists app_users_org_email_unique
  on public.app_users (organization_id, email)
  where email is not null;

create index if not exists app_users_org_role_idx
  on public.app_users (organization_id, role);

create index if not exists app_users_active_idx
  on public.app_users (is_active, locked_until);

create table if not exists public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz,
  ip_hash text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists app_sessions_active_idx
  on public.app_sessions (user_id, expires_at desc)
  where revoked_at is null;

create table if not exists public.auth_audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.app_users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  attempted_lookup text,
  event_type text not null,
  ip_hash text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists auth_audit_logs_user_created_idx
  on public.auth_audit_logs (user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
before update on public.organizations
for each row
execute function public.set_updated_at();

drop trigger if exists app_users_set_updated_at on public.app_users;
create trigger app_users_set_updated_at
before update on public.app_users
for each row
execute function public.set_updated_at();

create or replace function public.record_pin_auth_result(
  p_user_id uuid,
  p_attempted_lookup text,
  p_success boolean,
  p_ip_hash text default null,
  p_user_agent text default null
)
returns table (
  failed_pin_attempts integer,
  locked_until timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.app_users%rowtype;
  v_attempts integer;
  v_locked_until timestamptz;
begin
  if p_user_id is null then
    insert into public.auth_audit_logs (
      attempted_lookup,
      event_type,
      ip_hash,
      user_agent
    )
    values (
      p_attempted_lookup,
      'pin_login_failed_unknown_user',
      p_ip_hash,
      p_user_agent
    );

    return query
    select 0::integer, null::timestamptz;
    return;
  end if;

  select *
  into v_user
  from public.app_users
  where id = p_user_id
  for update;

  if p_success then
    update public.app_users
    set
      failed_pin_attempts = 0,
      locked_until = null,
      last_login_at = timezone('utc', now())
    where id = p_user_id;

    insert into public.auth_audit_logs (
      user_id,
      organization_id,
      attempted_lookup,
      event_type,
      ip_hash,
      user_agent
    )
    values (
      v_user.id,
      v_user.organization_id,
      p_attempted_lookup,
      'pin_login_succeeded',
      p_ip_hash,
      p_user_agent
    );

    return query
    select 0::integer, null::timestamptz;
    return;
  end if;

  v_attempts := coalesce(v_user.failed_pin_attempts, 0) + 1;
  v_locked_until := null;

  if v_attempts >= 5 then
    v_locked_until := timezone('utc', now()) + interval '15 minutes';
    v_attempts := 0;
  end if;

  update public.app_users
  set
    failed_pin_attempts = v_attempts,
    locked_until = v_locked_until,
    last_failed_at = timezone('utc', now())
  where id = p_user_id;

  insert into public.auth_audit_logs (
    user_id,
    organization_id,
    attempted_lookup,
    event_type,
    ip_hash,
    user_agent,
    metadata
  )
  values (
    v_user.id,
    v_user.organization_id,
    p_attempted_lookup,
    case
      when v_locked_until is not null then 'pin_login_locked'
      else 'pin_login_failed'
    end,
    p_ip_hash,
    p_user_agent,
    jsonb_build_object('failed_pin_attempts', v_attempts)
  );

  return query
  select v_attempts, v_locked_until;
end;
$$;

create or replace function public.create_app_session(
  p_user_id uuid,
  p_ip_hash text default null,
  p_user_agent text default null
)
returns table (
  session_id uuid,
  organization_id uuid,
  role public.app_role,
  display_name text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.app_users%rowtype;
  v_session_id uuid;
  v_expires_at timestamptz;
begin
  select *
  into v_user
  from public.app_users
  where id = p_user_id and is_active = true;

  if not found then
    raise exception 'User is inactive or missing';
  end if;

  v_session_id := gen_random_uuid();
  v_expires_at := timezone('utc', now()) + interval '12 hours';

  insert into public.app_sessions (
    id,
    user_id,
    organization_id,
    role,
    expires_at,
    ip_hash,
    user_agent
  )
  values (
    v_session_id,
    v_user.id,
    v_user.organization_id,
    v_user.role,
    v_expires_at,
    p_ip_hash,
    p_user_agent
  );

  return query
  select
    v_session_id,
    v_user.organization_id,
    v_user.role,
    v_user.display_name,
    v_expires_at;
end;
$$;

create or replace function public.revoke_app_session(
  p_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.app_sessions
  set revoked_at = timezone('utc', now())
  where id = p_session_id and revoked_at is null;
end;
$$;

alter table public.organizations enable row level security;
alter table public.app_users enable row level security;
alter table public.app_sessions enable row level security;
alter table public.auth_audit_logs enable row level security;

alter table public.organizations force row level security;
alter table public.app_users force row level security;
alter table public.app_sessions force row level security;
alter table public.auth_audit_logs force row level security;

revoke all on public.organizations from anon, authenticated;
revoke all on public.app_users from anon, authenticated;
revoke all on public.app_sessions from anon, authenticated;
revoke all on public.auth_audit_logs from anon, authenticated;

revoke all on function public.record_pin_auth_result(uuid, text, boolean, text, text) from public, anon, authenticated;
revoke all on function public.create_app_session(uuid, text, text) from public, anon, authenticated;
revoke all on function public.revoke_app_session(uuid) from public, anon, authenticated;

grant execute on function public.record_pin_auth_result(uuid, text, boolean, text, text) to service_role;
grant execute on function public.create_app_session(uuid, text, text) to service_role;
grant execute on function public.revoke_app_session(uuid) to service_role;
