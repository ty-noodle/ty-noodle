"use server";

import { revalidatePath } from "next/cache";
import { requireAppRole } from "@/lib/auth/authorization";
import { adjustDeliveryNoteItemWithFallback } from "@/lib/delivery/adjust-delivery-note-item";
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

  const { error } = await adjustDeliveryNoteItemWithFallback({
    supabase: rpcClient,
    organizationId: session.organizationId,
    deliveryNoteItemId: itemId,
    newQuantityDelivered: newQty,
    adjustedBy: session.userId,
    mode: "lost",
  });

  if (error) return { error };

  revalidatePath(`/orders/delivery-notes/${deliveryNoteId}`);
  return {};
}
