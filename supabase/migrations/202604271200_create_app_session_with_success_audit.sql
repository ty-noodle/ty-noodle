create or replace function public.create_app_session_with_success_audit(
  p_user_id uuid,
  p_attempted_lookup text,
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
  where id = p_user_id and is_active = true
  for update;

  if not found then
    raise exception 'User is inactive or missing';
  end if;

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

revoke all on function public.create_app_session_with_success_audit(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.create_app_session_with_success_audit(uuid, text, text, text) to service_role;
