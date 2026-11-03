create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop policy if exists organizations_deny_api_access on public.organizations;
create policy organizations_deny_api_access
on public.organizations
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists app_users_deny_api_access on public.app_users;
create policy app_users_deny_api_access
on public.app_users
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists app_sessions_deny_api_access on public.app_sessions;
create policy app_sessions_deny_api_access
on public.app_sessions
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists auth_audit_logs_deny_api_access on public.auth_audit_logs;
create policy auth_audit_logs_deny_api_access
on public.auth_audit_logs
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists customers_deny_api_access on public.customers;
create policy customers_deny_api_access
on public.customers
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists products_deny_api_access on public.products;
create policy products_deny_api_access
on public.products
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists product_images_deny_api_access on public.product_images;
create policy product_images_deny_api_access
on public.product_images
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists customer_product_prices_deny_api_access on public.customer_product_prices;
create policy customer_product_prices_deny_api_access
on public.customer_product_prices
as restrictive
for all
to anon, authenticated
using (false)
with check (false);
