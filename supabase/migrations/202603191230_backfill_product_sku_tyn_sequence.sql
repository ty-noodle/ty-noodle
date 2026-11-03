begin;

with ranked_products as (
  select
    id,
    organization_id,
    row_number() over (
      partition by organization_id
      order by created_at asc, id asc
    ) as seq
  from public.products
),
temporary_skus as (
  update public.products as products
  set sku = concat('__TYN_TMP__', ranked_products.organization_id::text, lpad(ranked_products.seq::text, 6, '0'))
  from ranked_products
  where products.id = ranked_products.id
  returning products.id
)
update public.products as products
set sku = concat('TYN', lpad(ranked_products.seq::text, 3, '0'))
from ranked_products
where products.id = ranked_products.id;

commit;
