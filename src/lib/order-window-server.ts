import "server-only";

import { parseOrderWindowSettings, type OrderWindowSettings, DEFAULT_ORDER_WINDOW_SETTINGS } from "@/lib/order-window";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function getOrderWindowSettings(
  organizationId: string,
): Promise<OrderWindowSettings> {
  if (!organizationId.trim()) {
    return DEFAULT_ORDER_WINDOW_SETTINGS;
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("metadata")
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("[getOrderWindowSettings]", error);
    return DEFAULT_ORDER_WINDOW_SETTINGS;
  }

  return parseOrderWindowSettings(data?.metadata);
}
