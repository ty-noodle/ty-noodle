-- The product settings form exposes a single base cost and no fixed-cost
-- control for the default sale unit. Legacy fixed costs on the default unit
-- can make product lists and new orders keep using an old cost after editing
-- products.cost_price.
update public.product_sale_units psu
set
  unit_label = p.unit,
  base_unit_quantity = 1,
  cost_mode = 'derived',
  fixed_cost_price = null
from public.products p
where psu.product_id = p.id
  and psu.organization_id = p.organization_id
  and psu.is_active = true
  and psu.is_default = true
  and (
    psu.unit_label is distinct from p.unit
    or psu.base_unit_quantity is distinct from 1
    or psu.cost_mode is distinct from 'derived'
    or psu.fixed_cost_price is not null
  );
