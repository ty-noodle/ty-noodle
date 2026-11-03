-- FINAL SYSTEM FIX: Comprehensive Stock, Cost, and Store Visibility Update
-- Description:
-- 1. Fixes inventory receipt (stops changing base units, handles unit ratios).
-- 2. Implements Date-Specific Shortage logic (ignores old stale orders).
-- 3. Hides completed stores from summary and enables dynamic re-indexing (1/4 -> 1/3).
-- 4. Returns product_sale_unit_id for accurate price lookups.
-- 5. Adds auto-cleanup for stale orders.
-- Date: 2026-04-13

-- START CLEANUP: Remove all old versions to prevent signature mismatch errors
DROP FUNCTION IF EXISTS public.get_order_daily_store_summaries(uuid, date, text, integer, integer) CASCADE;
DROP FUNCTION IF EXISTS public.get_order_daily_store_items(uuid, date, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.create_inventory_receipt(uuid, uuid, text, text, timestamptz, text, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_stale_orders() CASCADE;

BEGIN;

-- 1. FUNCTION: create_inventory_receipt
-- Updates stock and cost based on unit ratios without violating product unit constraints.
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
  v_reference_number := NULLIF(TRIM(p_receipt_number), '');

  INSERT INTO public.inventory_receipts (
    organization_id, receipt_number, supplier_name, received_at, notes, created_by
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

    SELECT stock_quantity INTO v_stock_before FROM public.products 
    WHERE id = v_product_id AND organization_id = p_organization_id FOR UPDATE;

    v_base_increment := v_quantity * v_unit_ratio;
    v_stock_after := v_stock_before + v_base_increment;

    -- UPDATE PRODUCT: Increment stock and update cost price (normalized to base unit)
    -- WE DO NOT UPDATE THE 'unit' COLUMN HERE TO AVOID CONSTRAINT VIOLATION
    UPDATE public.products
    SET stock_quantity = v_stock_after,
        cost_price = CASE WHEN v_unit_ratio > 0 THEN v_unit_cost / v_unit_ratio ELSE v_unit_cost END,
        updated_at = TIMEZONE('utc', NOW())
    WHERE id = v_product_id;

    INSERT INTO public.inventory_receipt_items (
      organization_id, receipt_id, product_id, quantity_received, unit, unit_cost, stock_before, stock_after
    ) VALUES (p_organization_id, v_receipt_id, v_product_id, v_quantity, v_unit, v_unit_cost, v_stock_before, v_stock_after)
    RETURNING id INTO v_receipt_item_id;

    INSERT INTO public.inventory_movements (
      organization_id, product_id, receipt_id, receipt_item_id, movement_type, quantity_delta, stock_before, stock_after, created_by, metadata
    ) VALUES (
      p_organization_id, v_product_id, v_receipt_id, v_receipt_item_id, 'receipt', v_base_increment, v_stock_before, v_stock_after, p_created_by,
      JSONB_BUILD_OBJECT('source', 'inventory_receipt', 'unit_ratio', v_unit_ratio, 'received_unit', v_unit)
    );
  END LOOP;
  RETURN v_receipt_id;
END;
$$;

-- 2. FUNCTION: get_order_daily_store_items
-- Returns detailed items for a store on a specific date with real-time shortage calculation.
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
  product_sale_unit_id uuid,
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
  WITH daily_total_demand AS (
    -- Calculate total demand for EACH product on THIS date ONLY
    SELECT 
      oi.product_id,
      SUM(COALESCE(oi.quantity_in_base_unit, oi.quantity)) as total_daily_base_qty
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.organization_id = p_organization_id
      AND o.order_date = p_order_date
      AND (o.fulfillment_status IS NULL OR o.fulfillment_status <> 'complete')
      AND (o.status IS NULL OR o.status <> 'cancelled')
    GROUP BY oi.product_id
  ),
  scoped_orders AS (
    SELECT o.id
    FROM public.orders o
    WHERE o.organization_id = p_organization_id
      AND o.order_date = p_order_date
      AND o.customer_id = p_customer_id
      AND (o.status IS NULL OR o.status <> 'cancelled')
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
    JOIN scoped_orders so ON so.id = oi.order_id
    JOIN public.products p ON p.id = oi.product_id
    GROUP BY
      oi.product_id,
      COALESCE(oi.product_sale_unit_id, '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE(oi.sale_unit_label, p.unit)
  )
  SELECT
    p.id, p.sku, p.name, ir.sale_unit_label, ir.sale_unit_ratio,
    CASE WHEN ir.product_sale_unit_id = '00000000-0000-0000-0000-000000000000'::uuid THEN NULL ELSE ir.product_sale_unit_id END,
    ir.ordered_quantity, COALESCE(p.stock_quantity, 0),
    -- Logic: If total daily demand fits in stock, everyone is deliverable.
    CASE 
      WHEN dtd.total_daily_base_qty <= COALESCE(p.stock_quantity, 0) THEN ir.ordered_quantity
      ELSE LEAST(ir.ordered_quantity, FLOOR(COALESCE(p.stock_quantity, 0) / NULLIF(ir.sale_unit_ratio, 0)))
    END as deliverable_quantity,
    CASE 
      WHEN dtd.total_daily_base_qty <= COALESCE(p.stock_quantity, 0) THEN 0
      ELSE GREATEST(0, ir.ordered_quantity - FLOOR(COALESCE(p.stock_quantity, 0) / NULLIF(ir.sale_unit_ratio, 0)))
    END as short_quantity,
    ir.unit_price, ir.line_total, ir.order_rounds,
    (SELECT pi.public_url FROM public.product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order ASC, pi.created_at ASC LIMIT 1)
  FROM item_rollup ir
  JOIN public.products p ON p.id = ir.product_id
  LEFT JOIN daily_total_demand dtd ON dtd.product_id = ir.product_id
  ORDER BY p.name ASC, ir.sale_unit_label ASC;
$$;

-- 3. FUNCTION: get_order_daily_store_summaries
-- Returns store summaries. FILTERS OUT stores that are fully complete.
CREATE OR REPLACE FUNCTION public.get_order_daily_store_summaries(
  p_organization_id uuid,
  p_order_date date,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 80,
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
  shortage_product_count integer,
  is_complete boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH daily_total_demand AS (
    -- Demand for THIS DATE only
    SELECT 
      oi.product_id,
      SUM(COALESCE(oi.quantity_in_base_unit, oi.quantity)) as total_daily_base_qty
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.organization_id = p_organization_id
      AND o.order_date = p_order_date
      AND (o.fulfillment_status IS NULL OR o.fulfillment_status <> 'complete')
      AND (o.status IS NULL OR o.status <> 'cancelled')
    GROUP BY oi.product_id
  ),
  scoped_orders AS (
    SELECT o.id, o.customer_id, o.created_at, o.total_amount, o.fulfillment_status
    FROM public.orders o
    JOIN public.customers c ON c.id = o.customer_id
    WHERE o.organization_id = p_organization_id
      AND o.order_date = p_order_date
      AND c.organization_id = p_organization_id
      AND (o.status IS NULL OR o.status <> 'cancelled')
      AND (
        NULLIF(BTRIM(COALESCE(p_search, '')), '') IS NULL
        OR c.name ILIKE '%' || BTRIM(p_search) || '%'
        OR c.customer_code ILIKE '%' || BTRIM(p_search) || '%'
      )
  ),
  item_rollup AS (
    SELECT so.customer_id, oi.product_id, SUM(COALESCE(oi.quantity_in_base_unit, oi.quantity)) as ordered_quantity_in_base_unit
    FROM scoped_orders so
    JOIN public.order_items oi ON oi.order_id = so.id
    GROUP BY so.customer_id, oi.product_id
  ),
  customer_rollup AS (
    SELECT
      so.customer_id,
      COUNT(*)::integer as order_rounds,
      COALESCE(SUM(so.total_amount), 0) as total_amount,
      MAX(so.created_at) as latest_order_at,
      EVERY(so.fulfillment_status = 'complete') as is_complete
    FROM scoped_orders so
    GROUP BY so.customer_id
  )
  SELECT
    c.id, c.customer_code, c.name, cr.order_rounds,
    COUNT(DISTINCT ir.product_id)::integer as product_count,
    COALESCE(SUM(ir.ordered_quantity_in_base_unit), 0) as total_quantity,
    cr.total_amount, cr.latest_order_at,
    COALESCE(
      COUNT(DISTINCT ir.product_id) FILTER (WHERE dtd.total_daily_base_qty > COALESCE(p.stock_quantity, 0)),
      0
    )::integer as shortage_product_count,
    COALESCE(cr.is_complete, false) as is_complete
  FROM customer_rollup cr
  JOIN public.customers c ON c.id = cr.customer_id
  LEFT JOIN item_rollup ir ON ir.customer_id = cr.customer_id
  LEFT JOIN public.products p ON p.id = ir.product_id
  LEFT JOIN daily_total_demand dtd ON dtd.product_id = ir.product_id
  WHERE COALESCE(cr.is_complete, false) = false -- HIDE COMPLETED STORES
  GROUP BY c.id, c.customer_code, c.name, cr.order_rounds, cr.total_amount, cr.latest_order_at, cr.is_complete
  ORDER BY cr.latest_order_at DESC, c.name ASC
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
$$;

-- 4. FUNCTION: cleanup_stale_orders
-- Cancels orders from previous days that were never completed.
CREATE OR REPLACE FUNCTION public.cleanup_stale_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.orders
  SET status = 'cancelled',
      notes = COALESCE(notes || ' ', '') || '[Auto-cancelled: Stale order from previous day]',
      updated_at = TIMEZONE('utc', NOW())
  WHERE order_date < CURRENT_DATE
    AND (fulfillment_status IS NULL OR fulfillment_status <> 'complete')
    AND (status IS NULL OR (status <> 'cancelled' AND status <> 'delivered'))
    AND organization_id IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMIT;
