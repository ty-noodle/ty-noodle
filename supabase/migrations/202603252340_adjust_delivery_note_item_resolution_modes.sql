-- adjust_delivery_note_item
-- Supports adjustment resolution mode:
--   - lost: decrease delivered qty, do not return stock
--   - return_to_stock: decrease delivered qty, return difference to stock,
--     and close that remaining quantity (do not keep outstanding in orders)

create or replace function public.adjust_delivery_note_item(
  p_organization_id        uuid,
  p_delivery_note_item_id  uuid,
  p_new_quantity_delivered numeric,
  p_adjusted_by            uuid,
  p_resolution_mode        text default 'lost'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dn_id                 uuid;
  v_dn_number             text;
  v_order_item_id         uuid;
  v_order_id              uuid;
  v_product_id            uuid;
  v_old_line_total        numeric;
  v_old_qty_delivered     numeric;
  v_unit_price            numeric;
  v_sale_unit_ratio       numeric;
  v_old_qty_base          numeric;
  v_new_qty_base          numeric;
  v_qty_base_delta        numeric;
  v_new_line_total        numeric;
  v_stock_before          numeric;
  v_stock_after           numeric;
  v_order_item_delivered  numeric;
  v_order_item_sale_ratio numeric;
  v_order_item_unit_price numeric;
  v_order_item_qty_sale   numeric;
  v_all_delivered         boolean;
  v_any_delivered         boolean;
  v_new_fulfillment       text;
  v_mode                  text;
begin
  if p_new_quantity_delivered < 0 then
    raise exception 'Quantity must be zero or greater';
  end if;

  v_mode := lower(coalesce(nullif(trim(p_resolution_mode), ''), 'lost'));
  if v_mode not in ('lost', 'return_to_stock') then
    raise exception 'Invalid resolution mode: %', p_resolution_mode;
  end if;

  select
    dni.delivery_note_id,
    dn.delivery_number,
    dni.order_item_id,
    oi.order_id,
    dni.product_id,
    dni.line_total,
    dni.quantity_delivered,
    dni.unit_price,
    dni.sale_unit_ratio
  into
    v_dn_id,
    v_dn_number,
    v_order_item_id,
    v_order_id,
    v_product_id,
    v_old_line_total,
    v_old_qty_delivered,
    v_unit_price,
    v_sale_unit_ratio
  from public.delivery_note_items dni
  join public.delivery_notes dn
    on dn.id = dni.delivery_note_id
  left join public.order_items oi
    on oi.id = dni.order_item_id
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

  if v_order_item_id is null or v_order_id is null then
    raise exception 'Delivery note item is not linked to an order item';
  end if;

  v_old_qty_base := v_old_qty_delivered * v_sale_unit_ratio;
  v_new_qty_base := p_new_quantity_delivered * v_sale_unit_ratio;
  v_qty_base_delta := greatest(v_old_qty_base - v_new_qty_base, 0);
  v_new_line_total := round(p_new_quantity_delivered * v_unit_price, 2);

  update public.delivery_note_items
  set
    quantity_delivered = p_new_quantity_delivered,
    quantity_in_base_unit = v_new_qty_base,
    line_total = v_new_line_total
  where id = p_delivery_note_item_id;

  update public.delivery_notes
  set total_amount = round(total_amount + (v_new_line_total - v_old_line_total), 2)
  where id = v_dn_id;

  if v_mode = 'return_to_stock' and v_qty_base_delta > 0 then
    select p.stock_quantity
      into v_stock_before
    from public.products p
    where p.id = v_product_id
      and p.organization_id = p_organization_id
    for update;

    if v_stock_before is null then
      raise exception 'Product not found in this organization';
    end if;

    v_stock_after := v_stock_before + v_qty_base_delta;

    update public.products
    set stock_quantity = v_stock_after
    where id = v_product_id;

    insert into public.inventory_movements (
      organization_id,
      product_id,
      movement_type,
      quantity_delta,
      stock_before,
      stock_after,
      reference_number,
      notes,
      metadata,
      created_by
    ) values (
      p_organization_id,
      v_product_id,
      'adjustment',
      v_qty_base_delta,
      v_stock_before,
      v_stock_after,
      v_dn_number,
      'Return stock from delivery quantity adjustment',
      jsonb_build_object(
        'source', 'delivery_adjustment',
        'resolution_mode', v_mode,
        'delivery_note_id', v_dn_id,
        'delivery_note_item_id', p_delivery_note_item_id,
        'quantity_base_delta', v_qty_base_delta
      ),
      p_adjusted_by
    );

    select
      coalesce(sum(dni.quantity_in_base_unit), 0)
    into v_order_item_delivered
    from public.delivery_note_items dni
    join public.delivery_notes dn on dn.id = dni.delivery_note_id
    where dni.order_item_id = v_order_item_id
      and dn.status = 'confirmed';

    select
      greatest(coalesce(nullif(oi.sale_unit_ratio, 0), 1), 0.001),
      coalesce(oi.unit_price, 0)
    into v_order_item_sale_ratio, v_order_item_unit_price
    from public.order_items oi
    where oi.id = v_order_item_id
    for update;

    v_order_item_qty_sale := round(v_order_item_delivered / v_order_item_sale_ratio, 3);

    update public.order_items
    set
      quantity_in_base_unit = v_order_item_delivered,
      quantity = v_order_item_qty_sale,
      line_total = round(v_order_item_qty_sale * v_order_item_unit_price, 2),
      updated_at = timezone('utc', now())
    where id = v_order_item_id;

    update public.orders o
    set total_amount = coalesce((
      select round(sum(oi.line_total), 2)
      from public.order_items oi
      where oi.order_id = o.id
    ), 0)
    where o.id = v_order_id;
  end if;

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
    where dn.status = 'confirmed'
      and dni.order_item_id in (
        select id from public.order_items where order_id = v_order_id
      )
    group by dni.order_item_id
  ) d on d.order_item_id = oi.id
  where oi.order_id = v_order_id;

  v_new_fulfillment := case
    when coalesce(v_all_delivered, false) then 'complete'
    when coalesce(v_any_delivered, false) then 'partial'
    else 'pending'
  end;

  update public.orders
  set fulfillment_status = v_new_fulfillment
  where id = v_order_id;
end;
$$;
