import "server-only";

export type DeliveryAdjustmentMode = "lost" | "return_to_stock";

type AdjustDeliveryNoteItemRpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: { message?: string } | null }>;
};

type AdjustDeliveryNoteItemArgs = {
  supabase: AdjustDeliveryNoteItemRpcClient;
  organizationId: string;
  deliveryNoteItemId: string;
  newQuantityDelivered: number;
  adjustedBy: string;
  mode: DeliveryAdjustmentMode;
};

function usesLegacyAdjustDeliveryNoteItem(message: string) {
  return (
    message.includes("Could not find the function public.adjust_delivery_note_item") &&
    message.includes("p_resolution_mode")
  );
}

export async function adjustDeliveryNoteItemWithFallback({
  supabase,
  organizationId,
  deliveryNoteItemId,
  newQuantityDelivered,
  adjustedBy,
  mode,
}: AdjustDeliveryNoteItemArgs): Promise<{ error?: string }> {
  const nextCall = await supabase.rpc("adjust_delivery_note_item", {
    p_organization_id: organizationId,
    p_delivery_note_item_id: deliveryNoteItemId,
    p_new_quantity_delivered: newQuantityDelivered,
    p_adjusted_by: adjustedBy,
    p_resolution_mode: mode,
  });

  if (!nextCall.error) {
    return {};
  }

  const message = nextCall.error.message ?? "Unable to adjust delivered quantity.";
  if (!usesLegacyAdjustDeliveryNoteItem(message)) {
    return { error: message };
  }

  if (mode !== "lost") {
    return {
      error:
        "Database is not updated for return-to-stock mode yet. Please apply the latest migration first.",
    };
  }

  const legacyCall = await supabase.rpc("adjust_delivery_note_item", {
    p_organization_id: organizationId,
    p_delivery_note_item_id: deliveryNoteItemId,
    p_new_quantity_delivered: newQuantityDelivered,
    p_adjusted_by: adjustedBy,
  });

  if (legacyCall.error) {
    return { error: legacyCall.error.message ?? "Unable to adjust delivered quantity." };
  }

  return {};
}
