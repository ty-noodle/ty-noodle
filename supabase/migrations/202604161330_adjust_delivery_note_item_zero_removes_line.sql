-- When adjusted delivered quantity becomes 0, remove the line item instead of
-- writing zero into delivery_note_items, because the table enforces positive quantities.

BEGIN;

CREATE OR REPLACE FUNCTION public.adjust_delivery_note_item(
  p_organization_id uuid,
  p_delivery_note_item_id uuid,
  p_new_quantity_delivered numeric,
  p_adjusted_by uuid,
  p_resolution_mode text DEFAULT 'lost'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dn_id uuid;
  v_dn_number text;
  v_order_item_id uuid;
  v_order_id uuid;
  v_product_id uuid;
  v_old_line_total numeric;
  v_old_qty_delivered numeric;
  v_unit_price numeric;
  v_sale_unit_ratio numeric;
  v_old_qty_base numeric;
  v_new_qty_base numeric;
  v_qty_base_delta numeric;
  v_new_line_total numeric;
  v_stock_before numeric;
  v_stock_after numeric;
  v_order_item_delivered numeric;
  v_order_item_sale_ratio numeric;
  v_order_item_unit_price numeric;
  v_order_item_qty_sale numeric;
  v_all_delivered boolean;
  v_any_delivered boolean;
  v_new_fulfillment text;
  v_mode text;
BEGIN
  IF p_new_quantity_delivered < 0 THEN
    RAISE EXCEPTION 'Quantity must be zero or greater';
  END IF;

  v_mode := lower(coalesce(nullif(trim(p_resolution_mode), ''), 'lost'));
  IF v_mode NOT IN ('lost', 'return_to_stock') THEN
    RAISE EXCEPTION 'Invalid resolution mode: %', p_resolution_mode;
  END IF;

  SELECT
    dni.delivery_note_id,
    dn.delivery_number,
    dni.order_item_id,
    oi.order_id,
    dni.product_id,
    dni.line_total,
    dni.quantity_delivered,
    dni.unit_price,
    dni.sale_unit_ratio
  INTO
    v_dn_id,
    v_dn_number,
    v_order_item_id,
    v_order_id,
    v_product_id,
    v_old_line_total,
    v_old_qty_delivered,
    v_unit_price,
    v_sale_unit_ratio
  FROM public.delivery_note_items dni
  JOIN public.delivery_notes dn
    ON dn.id = dni.delivery_note_id
  LEFT JOIN public.order_items oi
    ON oi.id = dni.order_item_id
  WHERE dni.id = p_delivery_note_item_id
    AND dn.organization_id = p_organization_id
    AND dn.status = 'confirmed'
  FOR UPDATE OF dn;

  IF v_dn_id IS NULL THEN
    RAISE EXCEPTION 'Delivery note item not found, or delivery note is not confirmed';
  END IF;

  IF p_new_quantity_delivered > v_old_qty_delivered THEN
    RAISE EXCEPTION 'Cannot increase delivered quantity in adjustment mode';
  END IF;

  IF v_order_item_id IS NULL OR v_order_id IS NULL THEN
    RAISE EXCEPTION 'Delivery note item is not linked to an order item';
  END IF;

  v_old_qty_base := v_old_qty_delivered * v_sale_unit_ratio;
  v_new_qty_base := p_new_quantity_delivered * v_sale_unit_ratio;
  v_qty_base_delta := greatest(v_old_qty_base - v_new_qty_base, 0);
  v_new_line_total := round(p_new_quantity_delivered * v_unit_price, 2);

  IF p_new_quantity_delivered = 0 THEN
    DELETE FROM public.delivery_note_items
    WHERE id = p_delivery_note_item_id;
  ELSE
    UPDATE public.delivery_note_items
    SET
      quantity_delivered = p_new_quantity_delivered,
      quantity_in_base_unit = v_new_qty_base,
      line_total = v_new_line_total
    WHERE id = p_delivery_note_item_id;
  END IF;

  UPDATE public.delivery_notes
  SET total_amount = round(total_amount + (v_new_line_total - v_old_line_total), 2)
  WHERE id = v_dn_id;

  IF v_mode = 'return_to_stock' AND v_qty_base_delta > 0 THEN
    SELECT p.stock_quantity
    INTO v_stock_before
    FROM public.products p
    WHERE p.id = v_product_id
      AND p.organization_id = p_organization_id
    FOR UPDATE;

    IF v_stock_before IS NULL THEN
      RAISE EXCEPTION 'Product not found in this organization';
    END IF;

    v_stock_after := v_stock_before + v_qty_base_delta;

    UPDATE public.products
    SET stock_quantity = v_stock_after
    WHERE id = v_product_id;

    INSERT INTO public.inventory_movements (
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
    ) VALUES (
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

    SELECT coalesce(sum(dni.quantity_in_base_unit), 0)
    INTO v_order_item_delivered
    FROM public.delivery_note_items dni
    JOIN public.delivery_notes dn ON dn.id = dni.delivery_note_id
    WHERE dni.order_item_id = v_order_item_id
      AND dn.status = 'confirmed';

    SELECT
      greatest(coalesce(nullif(oi.sale_unit_ratio, 0), 1), 0.001),
      coalesce(oi.unit_price, 0)
    INTO v_order_item_sale_ratio, v_order_item_unit_price
    FROM public.order_items oi
    WHERE oi.id = v_order_item_id
    FOR UPDATE;

    v_order_item_qty_sale := round(v_order_item_delivered / v_order_item_sale_ratio, 3);

    UPDATE public.order_items
    SET
      quantity_in_base_unit = v_order_item_delivered,
      quantity = v_order_item_qty_sale,
      line_total = round(v_order_item_qty_sale * v_order_item_unit_price, 2),
      updated_at = timezone('utc', now())
    WHERE id = v_order_item_id;

    UPDATE public.orders o
    SET total_amount = coalesce((
      SELECT round(sum(oi.line_total), 2)
      FROM public.order_items oi
      WHERE oi.order_id = o.id
    ), 0)
    WHERE o.id = v_order_id;
  END IF;

  SELECT
    bool_and(coalesce(d.delivered_qty, 0) >= oi.quantity_in_base_unit),
    bool_or(coalesce(d.delivered_qty, 0) > 0)
  INTO v_all_delivered, v_any_delivered
  FROM public.order_items oi
  LEFT JOIN (
    SELECT
      dni.order_item_id,
      sum(dni.quantity_in_base_unit) AS delivered_qty
    FROM public.delivery_note_items dni
    JOIN public.delivery_notes dn ON dn.id = dni.delivery_note_id
    WHERE dn.status = 'confirmed'
      AND dni.order_item_id IN (
        SELECT id FROM public.order_items WHERE order_id = v_order_id
      )
    GROUP BY dni.order_item_id
  ) d ON d.order_item_id = oi.id
  WHERE oi.order_id = v_order_id;

  v_new_fulfillment := CASE
    WHEN coalesce(v_all_delivered, false) THEN 'complete'
    WHEN coalesce(v_any_delivered, false) THEN 'partial'
    ELSE 'pending'
  END;

  UPDATE public.orders
  SET fulfillment_status = v_new_fulfillment
  WHERE id = v_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_delivery_note_item(
  p_organization_id uuid,
  p_delivery_note_item_id uuid,
  p_new_quantity_delivered numeric,
  p_adjusted_by uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.adjust_delivery_note_item(
    p_organization_id,
    p_delivery_note_item_id,
    p_new_quantity_delivered,
    p_adjusted_by,
    'lost'
  );
$$;

COMMIT;
