-- Migration: Fix inventory receipt units, shortage calculation, and store list consistency
-- Date: 2026-04-13

BEGIN;

-- 1. Update create_inventory_receipt to handle unit conversion and avoid unit check violation
CREATE OR REPLACE FUNCTION public.create_inventory_receipt(
  p_organization_id uuid,
  p_created_by uuid,
  p_receipt_number text,
  p_supplier_name text,
  p_received_at timestamptz,
  p_notes text,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_receipt_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric(12,3);
  v_unit text;
  v_unit_ratio numeric(12,3);
  v_unit_cost numeric(12,2);
  v_stock_before numeric(12,3);
  v_stock_after numeric(12,3);
  v_reference_number text;
  v_receipt_item_id uuid;
  v_base_increment numeric(12,3);
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Receipt must include at least one item';
  END IF;

  v_reference_number := NULLIF(TRIM(p_receipt_number), '');

  INSERT INTO public.inventory_receipts (
    organization_id,
    receipt_number,
    supplier_name,
    received_at,
    notes,
    created_by
  ) VALUES (
    p_organization_id,
    COALESCE(v_reference_number, CONCAT('RCV-', TO_CHAR(COALESCE(p_received_at, TIMEZONE('utc', NOW())), 'YYYYMMDDHH24MISS'))),
    COALESCE(NULLIF(TRIM(p_supplier_name), ''), 'โรงงานหลัก'),
    COALESCE(p_received_at, TIMEZONE('utc', NOW())),
    NULLIF(TRIM(p_notes), ''),
    p_created_by
  ) RETURNING id INTO v_receipt_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item ->> 'productId')::uuid;
    v_quantity := (v_item ->> 'quantityReceived')::numeric;
    v_unit := NULLIF(TRIM(v_item ->> 'unit'), '');
    v_unit_ratio := COALESCE((v_item ->> 'unitRatio')::numeric, 1.0);
    v_unit_cost := (v_item ->> 'unitCost')::numeric;

    IF v_product_id IS NULL OR v_quantity IS NULL OR v_unit IS NULL OR v_unit_cost IS NULL THEN
      RAISE EXCEPTION 'Each receipt item requires productId, quantityReceived, unit, and unitCost';
    END IF;

    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'Receipt quantity must be greater than zero';
    END IF;

    IF v_unit_cost < 0 THEN
      RAISE EXCEPTION 'Unit cost must be zero or greater';
    END IF;

    -- Lock product row
    SELECT stock_quantity
      INTO v_stock_before
    FROM public.products
    WHERE id = v_product_id
      AND organization_id = p_organization_id
    FOR UPDATE;

    IF v_stock_before IS NULL THEN
      RAISE EXCEPTION 'Product % was not found in this organization', v_product_id;
    END IF;

    -- Calculate increment in base unit
    v_base_increment := v_quantity * v_unit_ratio;
    v_stock_after := v_stock_before + v_base_increment;

    -- Update product: Increment stock and update cost price (normalized to base unit)
    UPDATE public.products
    SET stock_quantity = v_stock_after,
        cost_price = CASE WHEN v_unit_ratio > 0 THEN v_unit_cost / v_unit_ratio ELSE v_unit_cost END,
        updated_at = TIMEZONE('utc', NOW())
    WHERE id = v_product_id;

    -- Record receipt item (stores original unit and quantity as received)
    INSERT INTO public.inventory_receipt_items (
      organization_id,
      receipt_id,
      product_id,
      quantity_received,
      unit,
      unit_cost,
      stock_before,
      stock_after
    ) VALUES (
      p_organization_id,
      v_receipt_id,
      v_product_id,
      v_quantity,
      v_unit,
      v_unit_cost,
      v_stock_before,
      v_stock_after
    ) RETURNING id INTO v_receipt_item_id;

    -- Record movement (always in base units)
    INSERT INTO public.inventory_movements (
      organization_id,
      product_id,
      receipt_id,
      receipt_item_id,
      movement_type,
      quantity_delta,
      stock_before,
      stock_after,
      reference_number,
      notes,
      created_by,
      metadata
    ) VALUES (
      p_organization_id,
      v_product_id,
      v_receipt_id,
      v_receipt_item_id,
      'receipt',
      v_base_increment,
      v_stock_before,
      v_stock_after,
      v_reference_number,
      NULLIF(TRIM(p_notes), ''),
      p_created_by,
      JSONB_BUILD_OBJECT(
        'source', 'inventory_receipt',
        'received_unit', v_unit,
        'received_quantity', v_quantity,
        'unit_ratio', v_unit_ratio
      )
    );
  END LOOP;

  RETURN v_receipt_id;
END;
$$;

-- 2. Update get_order_daily_store_items to return unit ratio and INCLUDE complete orders
DROP FUNCTION IF EXISTS public.get_order_daily_store_items(uuid, date, uuid);

CREATE OR REPLACE FUNCTION public.get_order_daily_store_items(
  p_organization_id uuid,
  p_order_date date,
  p_customer_id uuid
)
RETURNS TABLE (
  product_id uuid,
  product_sku text,
  product_name text,
  product_unit text,
  product_unit_ratio numeric,
  product_sale_unit_id uuid, -- Added to track the specific sale unit
  ordered_quantity numeric,
  current_stock_quantity numeric,
  deliverable_quantity numeric,
  short_quantity numeric,
  unit_price numeric,
  line_total numeric,
  order_rounds integer,
  image_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped_orders AS (
    SELECT
      o.id
    FROM public.orders o
    WHERE o.organization_id = p_organization_id
      AND o.order_date = p_order_date
      AND o.customer_id = p_customer_id
  ),
  item_rollup AS (
    SELECT
      oi.product_id,
      COALESCE(oi.product_sale_unit_id, '00000000-0000-0000-0000-000000000000'::uuid) as product_sale_unit_id,
      COALESCE(oi.sale_unit_label, p.unit) as sale_unit_label,
      MAX(COALESCE(NULLIF(oi.sale_unit_ratio, 0), 1)) as sale_unit_ratio,
      SUM(oi.quantity) as ordered_quantity,
      SUM(COALESCE(oi.quantity_in_base_unit, oi.quantity)) as ordered_quantity_in_base_unit,
      MAX(oi.unit_price) as unit_price,
      SUM(oi.line_total) as line_total,
      COUNT(DISTINCT oi.order_id)::integer as order_rounds
    FROM public.order_items oi
    JOIN scoped_orders so
      ON so.id = oi.order_id
    JOIN public.products p
      ON p.id = oi.product_id
    GROUP BY
      oi.product_id,
      COALESCE(oi.product_sale_unit_id, '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE(oi.sale_unit_label, p.unit)
  )
  SELECT
    p.id as product_id,
    p.sku as product_sku,
    p.name as product_name,
    ir.sale_unit_label as product_unit,
    ir.sale_unit_ratio as product_unit_ratio,
    CASE 
      WHEN ir.product_sale_unit_id = '00000000-0000-0000-0000-000000000000'::uuid THEN NULL 
      ELSE ir.product_sale_unit_id 
    END as product_sale_unit_id,
    ir.ordered_quantity,
    COALESCE(p.stock_quantity, 0) as current_stock_quantity,
    LEAST(ir.ordered_quantity, FLOOR(COALESCE(p.stock_quantity, 0) / NULLIF(ir.sale_unit_ratio, 0))) as deliverable_quantity,
    GREATEST(0, ir.ordered_quantity - FLOOR(COALESCE(p.stock_quantity, 0) / NULLIF(ir.sale_unit_ratio, 0))) as short_quantity,
    ir.unit_price,
    ir.line_total,
    ir.order_rounds,
    (
      SELECT pi.public_url
      FROM public.product_images pi
      WHERE pi.product_id = p.id
      ORDER BY pi.sort_order ASC, pi.created_at ASC
      LIMIT 1
    ) as image_url
  FROM item_rollup ir
  JOIN public.products p
    ON p.id = ir.product_id
  ORDER BY p.name ASC, ir.sale_unit_label ASC;
$$;

-- 3. Update get_order_daily_store_summaries to INCLUDE complete orders
CREATE OR REPLACE FUNCTION public.get_order_daily_store_summaries(
  p_organization_id uuid,
  p_order_date date,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  customer_id uuid,
  customer_code text,
  customer_name text,
  order_rounds integer,
  product_count integer,
  total_quantity numeric,
  total_amount numeric,
  latest_order_at timestamptz,
  shortage_product_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped_orders AS (
    SELECT
      o.id,
      o.customer_id,
      o.created_at,
      o.total_amount
    FROM public.orders o
    JOIN public.customers c
      ON c.id = o.customer_id
    WHERE o.organization_id = p_organization_id
      AND o.order_date = p_order_date
      AND c.organization_id = p_organization_id
      AND (
        NULLIF(BTRIM(COALESCE(p_search, '')), '') IS NULL
        OR c.name ILIKE '%' || BTRIM(p_search) || '%'
        OR c.customer_code ILIKE '%' || BTRIM(p_search) || '%'
      )
  ),
  item_rollup AS (
    SELECT
      so.customer_id,
      oi.product_id,
      SUM(COALESCE(oi.quantity_in_base_unit, oi.quantity)) as ordered_quantity_in_base_unit,
      COUNT(DISTINCT CONCAT(oi.product_id::text, ':', COALESCE(oi.sale_unit_label, '')))::integer as item_variant_count
    FROM scoped_orders so
    JOIN public.order_items oi
      ON oi.order_id = so.id
    GROUP BY so.customer_id, oi.product_id
  ),
  customer_rollup AS (
    SELECT
      so.customer_id,
      COUNT(*)::integer as order_rounds,
      COALESCE(SUM(so.total_amount), 0) as total_amount,
      MAX(so.created_at) as latest_order_at
    FROM scoped_orders so
    GROUP BY so.customer_id
  )
  SELECT
    c.id as customer_id,
    c.customer_code,
    c.name as customer_name,
    cr.order_rounds,
    COALESCE(SUM(ir.item_variant_count), 0)::integer as product_count,
    COALESCE(SUM(ir.ordered_quantity_in_base_unit), 0) as total_quantity,
    cr.total_amount,
    cr.latest_order_at,
    COALESCE(
      COUNT(*) FILTER (
        WHERE ir.ordered_quantity_in_base_unit > COALESCE(p.stock_quantity, 0)
      ),
      0
    )::integer as shortage_product_count
  FROM customer_rollup cr
  JOIN public.customers c
    ON c.id = cr.customer_id
  LEFT JOIN item_rollup ir
    ON ir.customer_id = cr.customer_id
  LEFT JOIN public.products p
    ON p.id = ir.product_id
  GROUP BY
    c.id,
    c.customer_code,
    c.name,
    cr.order_rounds,
    cr.total_amount,
    cr.latest_order_at
  ORDER BY cr.latest_order_at DESC, c.name ASC
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
$$;

COMMIT;
