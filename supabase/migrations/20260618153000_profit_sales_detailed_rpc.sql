BEGIN;

CREATE OR REPLACE FUNCTION public.get_profit_sales_detailed_rows(
  p_note_ids uuid[]
)
RETURNS TABLE (
  delivery_note_id uuid,
  customer_id uuid,
  customer_code text,
  customer_name text,
  delivery_date date,
  delivery_number text,
  product_sku text,
  product_name text,
  unit text,
  quantity numeric,
  total_cost numeric,
  sales_amount numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  select
    dn.id as delivery_note_id,
    dn.customer_id,
    coalesce(c.customer_code, '-') as customer_code,
    coalesce(c.name, 'Unknown Store') as customer_name,
    dn.delivery_date,
    dn.delivery_number,
    coalesce(p.sku, '-') as product_sku,
    coalesce(p.name, '-') as product_name,
    coalesce(dni.sale_unit_label, p.unit, '-') as unit,
    sum(coalesce(dni.quantity_delivered, 0)::numeric) as quantity,
    sum(
      coalesce(dni.quantity_delivered, 0)::numeric *
      coalesce(dni.cost_price, 0)::numeric
    ) as total_cost,
    sum(coalesce(dni.line_total, 0)::numeric) as sales_amount
  from public.delivery_note_items dni
  join public.delivery_notes dn
    on dn.id = dni.delivery_note_id
  left join public.customers c
    on c.id = dn.customer_id
  left join public.products p
    on p.id = dni.product_id
  where dni.delivery_note_id = any(p_note_ids)
  group by
    dn.id,
    dn.customer_id,
    c.customer_code,
    c.name,
    dn.delivery_date,
    dn.delivery_number,
    p.sku,
    p.name,
    coalesce(dni.sale_unit_label, p.unit, '-')
  order by
    dn.delivery_date asc,
    coalesce(c.customer_code, '-') asc,
    dn.delivery_number asc,
    coalesce(p.sku, '-') asc,
    coalesce(dni.sale_unit_label, p.unit, '-') asc;
$$;

COMMIT;
