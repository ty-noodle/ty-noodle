-- Migration: Daily-focused stock and auto-cleanup for stale orders
-- Date: 2026-04-13

BEGIN;

-- 1. Update get_order_daily_store_items to focus ONLY on the selected date for stock logic
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
    -- Calculate total demand for each product ON THIS SPECIFIC DATE ONLY
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
      AND (o.fulfillment_status IS NULL OR o.fulfillment_status <> 'complete')
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
    -- Calculation: Is stock enough for the total daily demand?
    -- If total daily demand > stock, we flag it. 
    -- For simplicity in FIFO context within a single day, we compare against total daily demand.
    CASE 
      WHEN dtd.total_daily_base_qty <= COALESCE(p.stock_quantity, 0) THEN ir.ordered_quantity
      ELSE LEAST(ir.ordered_quantity, FLOOR(COALESCE(p.stock_quantity, 0) / NULLIF(ir.sale_unit_ratio, 0)))
    END as deliverable_quantity,
    CASE 
      WHEN dtd.total_daily_base_qty <= COALESCE(p.stock_quantity, 0) THEN 0
      ELSE GREATEST(0, ir.ordered_quantity - FLOOR(COALESCE(p.stock_quantity, 0) / NULLIF(ir.sale_unit_ratio, 0)))
    END as short_quantity,
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
  JOIN public.products p ON p.id = ir.product_id
  LEFT JOIN daily_total_demand dtd ON dtd.product_id = ir.product_id
  ORDER BY p.name ASC, ir.sale_unit_label ASC;
$$;

-- 2. Update get_order_daily_store_summaries to focus ONLY on the selected date demand
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
    -- Calculate total demand for each product ON THIS SPECIFIC DATE ONLY
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
    SELECT
      o.id,
      o.customer_id,
      o.created_at,
      o.total_amount,
      o.fulfillment_status,
      o.status
    FROM public.orders o
    JOIN public.customers c ON c.id = o.customer_id
    WHERE o.organization_id = p_organization_id
      AND o.order_date = p_order_date
      AND c.organization_id = p_organization_id
      AND (o.fulfillment_status IS NULL OR o.fulfillment_status <> 'complete')
      AND (o.status IS NULL OR o.status <> 'cancelled')
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
        -- Flag as shortage ONLY if the total daily demand for this product exceeds stock
        WHERE dtd.total_daily_base_qty > COALESCE(p.stock_quantity, 0)
      ),
      0
    )::integer as shortage_product_count,
    COALESCE(cr.is_complete, false) as is_complete
  FROM customer_rollup cr
  JOIN public.customers c ON c.id = cr.customer_id
  LEFT JOIN item_rollup ir ON ir.customer_id = cr.customer_id
  LEFT JOIN public.products p ON p.id = ir.product_id
  LEFT JOIN daily_total_demand dtd ON dtd.product_id = ir.product_id
  GROUP BY
    c.id,
    c.customer_code,
    c.name,
    cr.order_rounds,
    cr.total_amount,
    cr.latest_order_at,
    cr.is_complete
  ORDER BY cr.latest_order_at DESC, c.name ASC
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
$$;

-- 3. Create a function to auto-cancel stale orders from previous days
-- This releases any logical reservations they might have held
CREATE OR REPLACE FUNCTION public.cleanup_stale_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Cancel orders that are older than today and not yet completed or cancelled
  UPDATE public.orders
  SET 
    status = 'cancelled',
    notes = COALESCE(notes || ' ', '') || '[Auto-cancelled: Expired order from previous day]',
    updated_at = TIMEZONE('utc', NOW())
  WHERE 
    order_date < CURRENT_DATE
    AND (fulfillment_status IS NULL OR fulfillment_status <> 'complete')
    AND (status IS NULL OR (status <> 'cancelled' AND status <> 'delivered'))
    AND organization_id IS NOT NULL;
    
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMIT;
