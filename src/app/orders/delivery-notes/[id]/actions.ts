"use server";

import { revalidatePath } from "next/cache";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function adjustDeliveryNoteItemAction(
  deliveryNoteId: string,
  itemId: string,
  newQty: number,
): Promise<{ error?: string }> {
  const session = await requireAppRole("admin");
  const supabase = getSupabaseAdmin();

  const rpcClient = supabase as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { message?: string } | null }>;
  };

  const { error } = await rpcClient.rpc("adjust_delivery_note_item", {
    p_organization_id: session.organizationId,
    p_delivery_note_item_id: itemId,
    p_new_quantity_delivered: newQty,
    p_adjusted_by: session.userId,
    p_resolution_mode: "lost",
  });

  if (error) return { error: error.message ?? "Unable to adjust delivery item." };

  revalidatePath(`/orders/delivery-notes/${deliveryNoteId}`);
  return {};
}
