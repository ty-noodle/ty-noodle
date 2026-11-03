import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing SUPABASE env vars. Did you run with --env-file=.env.local?");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function main() {
  // 1. Get the product ID for SKU TYN044
  const { data: product, error: pError } = await supabase
    .from("products")
    .select("id, sku, name, cost_price")
    .eq("sku", "TYN044")
    .maybeSingle();

  if (pError || !product) {
    console.error("Product with SKU TYN044 not found or query failed:", pError);
    process.exit(1);
  }

  console.log(`Found Product: ${product.name} (ID: ${product.id})`);

  // 2. Update all active sale units for this product to 'derived' and fixed_cost_price = null
  const { data: updatedUnits, error: uError } = await supabase
    .from("product_sale_units")
    .update({
      cost_mode: "derived",
      fixed_cost_price: null
    })
    .eq("product_id", product.id)
    .select();

  if (uError) {
    console.error("Error updating sale units:", uError);
    process.exit(1);
  }

  console.log("Successfully updated sale units:");
  console.log(JSON.stringify(updatedUnits, null, 2));
}

main();
