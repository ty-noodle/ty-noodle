-- Merge old duplicate delivery notes for the same organization + customer + delivery_date
-- so that historical data follows the current rule: 1 store / 1 day / 1 delivery note.

create temporary table tmp_delivery_note_merge_map on commit drop as
with ranked as (
  select
    dn.id,
    dn.organization_id,
    dn.customer_id,
    dn.delivery_date,
    dn.delivery_number,
    dn.created_at,
    first_value(dn.id) over (
      partition by dn.organization_id, dn.customer_id, dn.delivery_date
      order by dn.created_at asc, dn.id asc
    ) as keep_id,
    first_value(dn.delivery_number) over (
      partition by dn.organization_id, dn.customer_id, dn.delivery_date
      order by dn.created_at asc, dn.id asc
    ) as keep_number,
    row_number() over (
      partition by dn.organization_id, dn.customer_id, dn.delivery_date
      order by dn.created_at asc, dn.id asc
    ) as rn,
    count(*) over (
      partition by dn.organization_id, dn.customer_id, dn.delivery_date
    ) as cnt
  from public.delivery_notes dn
)
select *
from ranked
where cnt > 1
  and id <> keep_id;

-- Move line items to the kept note
update public.delivery_note_items dni
set delivery_note_id = m.keep_id
from tmp_delivery_note_merge_map m
where dni.delivery_note_id = m.id;

-- Update inventory movement references and metadata
update public.inventory_movements im
set
  reference_number = m.keep_number,
  metadata = case
    when im.metadata ? 'delivery_note_id'
      then jsonb_set(im.metadata, '{delivery_note_id}', to_jsonb(m.keep_id::text))
    else im.metadata
  end
from tmp_delivery_note_merge_map m
where im.reference_number = m.delivery_number
   or (
     im.metadata ? 'delivery_note_id'
     and im.metadata->>'delivery_note_id' = m.id::text
   );

-- Merge notes/vehicle info into the kept note
update public.delivery_notes keep_dn
set
  vehicle_id = coalesce(keep_dn.vehicle_id, dup.vehicle_id),
  notes = case
    when (keep_dn.notes is null or trim(keep_dn.notes) = '') and (dup.notes is null or trim(dup.notes) = '') then null
    when keep_dn.notes is null or trim(keep_dn.notes) = '' then dup.notes
    when dup.notes is null or trim(dup.notes) = '' then keep_dn.notes
    when position(dup.notes in keep_dn.notes) > 0 then keep_dn.notes
    else keep_dn.notes || ' / ' || dup.notes
  end
from public.delivery_notes dup
join tmp_delivery_note_merge_map m on m.id = dup.id
where keep_dn.id = m.keep_id;

-- Recalculate kept note totals from moved items
update public.delivery_notes dn
set total_amount = coalesce(agg.total_amount, 0)
from (
  select delivery_note_id, sum(line_total) as total_amount
  from public.delivery_note_items
  group by delivery_note_id
) agg
where dn.id = agg.delivery_note_id;

-- Update billing snapshots so duplicate note numbers collapse into the kept number
update public.billing_records br
set snapshot_rows = (
  select jsonb_agg(
    jsonb_build_object(
      'lineNumber', new_row.line_number,
      'deliveryNumber', new_row.delivery_number,
      'deliveryDate', new_row.delivery_date,
      'totalAmount', new_row.total_amount,
      'notes', new_row.notes
    )
    order by new_row.line_number
  )
  from (
    select
      row_number() over (order by grp.delivery_date, grp.delivery_number) as line_number,
      grp.delivery_number,
      grp.delivery_date,
      grp.total_amount,
      grp.notes
    from (
      select
        coalesce(m.keep_number, elem->>'deliveryNumber') as delivery_number,
        elem->>'deliveryDate' as delivery_date,
        sum(coalesce((elem->>'totalAmount')::numeric, 0)) as total_amount,
        string_agg(nullif(elem->>'notes', ''), ' / ') filter (where nullif(elem->>'notes', '') is not null) as notes
      from jsonb_array_elements(coalesce(br.snapshot_rows, '[]'::jsonb)) as rows(elem)
      left join tmp_delivery_note_merge_map m
        on m.delivery_number = rows.elem->>'deliveryNumber'
      group by coalesce(m.keep_number, elem->>'deliveryNumber'), elem->>'deliveryDate'
    ) grp
  ) new_row
)
where br.snapshot_rows is not null;

-- Delete duplicate headers after their items have been moved
delete from public.delivery_notes dn
using tmp_delivery_note_merge_map m
where dn.id = m.id;
