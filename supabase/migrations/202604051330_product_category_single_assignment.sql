with ranked_items as (
  select
    id,
    row_number() over (
      partition by organization_id, product_id
      order by created_at asc, id asc
    ) as row_number_in_product
  from public.product_category_items
),
duplicate_items as (
  select id
  from ranked_items
  where row_number_in_product > 1
)
delete from public.product_category_items
where id in (select id from duplicate_items);

create unique index if not exists product_category_items_org_product_unique
  on public.product_category_items (organization_id, product_id);
