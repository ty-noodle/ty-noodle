import { createClient } from "@supabase/supabase-js";
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(supabaseUrl, supabaseKey);

async function checkProduct() {
  const productId = "1ef559f2-3f27-4183-9a25-e29bd1b2c134";
  
  const { data: product, error: pError } = await admin
    .from("products")
    .select("name, unit")
    .eq("id", productId)
    .single();
    
  if (pError) console.error("Product Error:", pError);
  console.log("Product in DB:", product);
  
  const { data: units, error: uError } = await admin
    .from("product_sale_units")
    .select("unit_label, is_active")
    .eq("product_id", productId);
    
  if (uError) console.error("Units Error:", uError);
  console.log("Units in DB:", units);
}

checkProduct().catch(console.error);
