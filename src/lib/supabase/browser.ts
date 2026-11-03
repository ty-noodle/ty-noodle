import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { hasSupabaseEnv } from "./env";

export function createClient() {
  if (!hasSupabaseEnv()) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
