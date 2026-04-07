// One-off script to apply the ALTER TABLE migration directly via the Supabase service role
// Run with: node scripts/apply-line-user-id-migration.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
  process.exit(1);
}

const sql = readFileSync(
  path.join(__dirname, "../supabase/migrations/202603171500_customers_line_user_id.sql"),
  "utf8"
);

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { error } = await supabase.rpc("exec_sql", { sql });

if (error) {
  // Supabase doesn't expose a raw SQL RPC by default — use Postgres REST instead
  console.error("RPC method not available. Please run this SQL manually in the Supabase dashboard:");
  console.log("---\n" + sql + "\n---");
} else {
  console.log("Migration applied successfully.");
}
