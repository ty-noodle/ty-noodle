import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing SUPABASE env vars. Did you run with --env-file=.env.local?");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function main() {
  const { data: product, error: pError } = await supabase
    .from("products")
    .select("id, sku, name, cost_price, is_active, unit")
    .eq("sku", "TYN044")
    .maybeSingle();

  if (pError) {
    console.error("Error fetching product:", pError);
    return;
  }

  if (!product) {
    console.log("Product with SKU TYN044 not found.");
    return;
  }

  console.log("=== Product ===");
  console.log(JSON.stringify(product, null, 2));

  const { data: saleUnits, error: sError } = await supabase
    .from("product_sale_units")
    .select("*")
    .eq("product_id", product.id);

  if (sError) {
    console.error("Error fetching sale units:", sError);
    return;
  }

  console.log("\n=== Sale Units ===");
  console.log(JSON.stringify(saleUnits, null, 2));

  // Let's also check if there are recent order items for this product to see what cost was saved.
  const { data: recentOrderItems, error: oiError } = await supabase
    .from("order_items")
    .select(`
      id,
      order_id,
      quantity,
      unit_price,
      cost_price,
      sale_unit_label,
      orders (
        order_number,
        order_date,
        status
      )
    `)
    .eq("product_id", product.id)
    .order("created_at", { ascending: false })
    .limit(3);

  if (oiError) {
    console.error("Error fetching order items:", oiError);
  } else {
    console.log("\n=== Recent Order Items ===");
    console.log(JSON.stringify(recentOrderItems, null, 2));
  }
}

main();
