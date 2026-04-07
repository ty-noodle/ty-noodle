-- adjust_delivery_note_item
-- Correct quantity_delivered for a single delivery note line item.
-- Stock is NOT updated in this function.
-- Only delivery note totals and order fulfillment status are recalculated.

create or replace function public.adjust_delivery_note_item(
  p_organization_id        uuid,
  p_delivery_note_item_id  uuid,
  p_new_quantity_delivered numeric,
  p_adjusted_by            uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dn_id            uuid;
  v_order_id         uuid;
  v_old_line_total   numeric;
  v_old_qty_delivered numeric;
  v_unit_price       numeric;
  v_sale_unit_ratio  numeric;
  v_new_qty_base     numeric;
  v_new_line_total   numeric;
  v_all_delivered    boolean;
  v_any_delivered    boolean;
  v_new_fulfillment  text;
begin
  if p_new_quantity_delivered <= 0 then
    raise exception 'Quantity must be greater than 0';
  end if;

  -- Fetch item and lock related delivery note row.
  select
    dni.delivery_note_id,
    dni.line_total,
    dni.quantity_delivered,
    dni.unit_price,
    dni.sale_unit_ratio
  into v_dn_id, v_old_line_total, v_old_qty_delivered, v_unit_price, v_sale_unit_ratio
  from public.delivery_note_items dni
  join public.delivery_notes dn on dn.id = dni.delivery_note_id
  where dni.id = p_delivery_note_item_id
    and dn.organization_id = p_organization_id
    and dn.status = 'confirmed'
  for update of dn;

  if v_dn_id is null then
    raise exception 'Delivery note item not found, or delivery note is not confirmed';
  end if;

  if p_new_quantity_delivered > v_old_qty_delivered then
    raise exception 'Cannot increase delivered quantity in adjustment mode';
  end if;

  v_new_qty_base := p_new_quantity_delivered * v_sale_unit_ratio;
  v_new_line_total := round(p_new_quantity_delivered * v_unit_price, 2);

  -- Update item quantities and amount.
  update public.delivery_note_items
  set
    quantity_delivered = p_new_quantity_delivered,
    quantity_in_base_unit = v_new_qty_base,
    line_total = v_new_line_total
  where id = p_delivery_note_item_id;

  -- Adjust delivery note total amount by the difference.
  update public.delivery_notes
  set total_amount = round(total_amount + (v_new_line_total - v_old_line_total), 2)
  where id = v_dn_id;

  -- Get order_id for fulfillment recalculation.
  select order_id into v_order_id
  from public.delivery_notes
  where id = v_dn_id;

  -- Recompute order fulfillment_status.
  select
    bool_and(coalesce(d.delivered_qty, 0) >= oi.quantity_in_base_unit),
    bool_or(coalesce(d.delivered_qty, 0) > 0)
  into v_all_delivered, v_any_delivered
  from public.order_items oi
  left join (
    select
      dni.order_item_id,
      sum(dni.quantity_in_base_unit) as delivered_qty
    from public.delivery_note_items dni
    join public.delivery_notes dn on dn.id = dni.delivery_note_id
    where dn.order_id = v_order_id
      and dn.status = 'confirmed'
    group by dni.order_item_id
  ) d on d.order_item_id = oi.id
  where oi.order_id = v_order_id;

  v_new_fulfillment := case
    when v_all_delivered then 'complete'
    when v_any_delivered then 'partial'
    else 'pending'
  end;

  update public.orders
  set fulfillment_status = v_new_fulfillment
  where id = v_order_id;
end;
$$;

