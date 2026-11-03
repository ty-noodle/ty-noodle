-- Migration: Add is_complete status and HIDE completed stores from summary
-- Date: 2026-04-13

BEGIN;

-- Update get_order_daily_store_summaries to return is_complete status and FILTER them out
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
    -- Demand only for orders that are NOT complete and NOT cancelled on this date
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
  WHERE COALESCE(cr.is_complete, false) = false -- KEY FIX: Hide completed stores from the result
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

COMMIT;
