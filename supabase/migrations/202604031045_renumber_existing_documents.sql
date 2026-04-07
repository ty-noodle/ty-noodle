-- Renumber existing billing and delivery documents to the new yearly-running format.
-- Format:
--   Billing  = VBYYYYMMDD###
--   Delivery = DNYYYYMMDD###
-- Running number is per organization + per year, ordered by document date then created_at.

-- -----------------------------------------------------------------------------
-- Billing records
-- -----------------------------------------------------------------------------

create temporary table tmp_billing_number_map on commit drop as
with numbered as (
  select
    br.id,
    br.organization_id,
    br.billing_number as old_number,
    'VB'
      || to_char(br.billing_date, 'YYYYMMDD')
      || lpad(
        row_number() over (
          partition by br.organization_id, extract(year from br.billing_date)
          order by br.billing_date asc, br.created_at asc, br.id asc
        )::text,
        3,
        '0'
      ) as new_number,
    extract(year from br.billing_date)::int as billing_year
  from public.billing_records br
)
select * from numbered;

update public.billing_records br
set billing_number = m.new_number
from tmp_billing_number_map m
where br.id = m.id
  and br.billing_number is distinct from m.new_number;

insert into public.billing_number_counters_yearly (organization_id, billing_year, last_number)
select
  organization_id,
  billing_year,
  max(substring(new_number from '([0-9]+)$')::bigint) as last_number
from tmp_billing_number_map
group by organization_id, billing_year
on conflict (organization_id, billing_year) do update
set last_number = excluded.last_number;

-- -----------------------------------------------------------------------------
-- Delivery notes and dependent references
-- -----------------------------------------------------------------------------

create temporary table tmp_delivery_number_map on commit drop as
with numbered as (
  select
    dn.id,
    dn.organization_id,
    dn.delivery_number as old_number,
    'DN'
      || to_char(dn.delivery_date, 'YYYYMMDD')
      || lpad(
        row_number() over (
          partition by dn.organization_id, extract(year from dn.delivery_date)
          order by dn.delivery_date asc, dn.created_at asc, dn.id asc
        )::text,
        3,
        '0'
      ) as new_number,
    extract(year from dn.delivery_date)::int as delivery_year
  from public.delivery_notes dn
)
select * from numbered;

update public.delivery_notes dn
set delivery_number = m.new_number
from tmp_delivery_number_map m
where dn.id = m.id
  and dn.delivery_number is distinct from m.new_number;

update public.inventory_movements im
set reference_number = m.new_number
from tmp_delivery_number_map m
where im.organization_id = m.organization_id
  and im.reference_number = m.old_number;

update public.billing_records br
set snapshot_rows = (
  select jsonb_agg(
    case
      when elem ? 'deliveryNumber' then
        jsonb_set(elem, '{deliveryNumber}', to_jsonb(coalesce(m.new_number, elem->>'deliveryNumber')))
      else
        elem
    end
    order by ord
  )
  from jsonb_array_elements(coalesce(br.snapshot_rows, '[]'::jsonb)) with ordinality as rows(elem, ord)
  left join tmp_delivery_number_map m
    on m.old_number = rows.elem->>'deliveryNumber'
)
where br.snapshot_rows is not null;

insert into public.delivery_note_counters_yearly (organization_id, delivery_year, last_number)
select
  organization_id,
  delivery_year,
  max(substring(new_number from '([0-9]+)$')::bigint) as last_number
from tmp_delivery_number_map
group by organization_id, delivery_year
on conflict (organization_id, delivery_year) do update
set last_number = excluded.last_number;
