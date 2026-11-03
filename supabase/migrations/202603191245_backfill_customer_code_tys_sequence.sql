begin;

with ranked_customers as (
  select
    id,
    organization_id,
    row_number() over (
      partition by organization_id
      order by created_at asc, id asc
    ) as seq
  from public.customers
),
temporary_codes as (
  update public.customers as customers
  set customer_code = concat('__TYS_TMP__', ranked_customers.organization_id::text, lpad(ranked_customers.seq::text, 6, '0'))
  from ranked_customers
  where customers.id = ranked_customers.id
  returning customers.id
)
update public.customers as customers
set customer_code = concat('TYS', lpad(ranked_customers.seq::text, 3, '0'))
from ranked_customers
where customers.id = ranked_customers.id;

commit;
