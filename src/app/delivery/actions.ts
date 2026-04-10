"use server";

import { revalidateTag } from "next/cache";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type DeliveryNotesUpdateClient = ReturnType<typeof getSupabaseAdmin> & {
  from: (table: "delivery_notes") => {
    update: (patch: Record<string, unknown>) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => Promise<{ error: { message?: string } | null }>;
        };
      };
    };
  };
};

type RpcClient = ReturnType<typeof getSupabaseAdmin> & {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: { message?: string } | null }>;
};

export type DeliveryAdjustmentMode = "lost" | "return_to_stock";

async function updateDispatch(
  dnId: string,
  organizationId: string,
  patch: Record<string, unknown>,
): Promise<{ error?: string }> {
  const supabase = getSupabaseAdmin() as unknown as DeliveryNotesUpdateClient;
  const { error } = await supabase
    .from("delivery_notes")
    .update(patch)
    .eq("id", dnId)
    .eq("organization_id", organizationId)
    .eq("status", "confirmed");

  if (error) return { error: error.message ?? "เกิดข้อผิดพลาด" };

  revalidateTag(`delivery-${organizationId}`, "max");
  return {};
}

export async function markDeliveredAction(dnId: string): Promise<{ error?: string }> {
  const session = await requireAppRole("admin");
  return updateDispatch(dnId, session.organizationId, {
    dispatch_status: "delivered",
    dispatched_at: new Date().toISOString(),
    dispatch_note: null,
  });
}

export async function markProblemAction(dnId: string, note: string): Promise<{ error?: string }> {
  const session = await requireAppRole("admin");
  return updateDispatch(dnId, session.organizationId, {
    dispatch_status: "problem",
    dispatch_note: note.trim() || null,
    dispatched_at: null,
  });
}

export async function resetDispatchAction(dnId: string): Promise<{ error?: string }> {
  const session = await requireAppRole("admin");
  return updateDispatch(dnId, session.organizationId, {
    dispatch_status: "pending",
    dispatched_at: null,
    dispatch_note: null,
  });
}

export async function adjustDeliveryLineQtyAction(
  deliveryNoteItemId: string,
  newQty: number,
  mode: DeliveryAdjustmentMode,
): Promise<{ error?: string }> {
  const session = await requireAppRole("admin");

  if (!deliveryNoteItemId) return { error: "ไม่พบรายการที่ต้องการแก้ไข" };
  if (!Number.isFinite(newQty) || newQty < 0) {
    return { error: "จำนวนต้องเป็น 0 หรือมากกว่า" };
  }
  if (mode !== "lost" && mode !== "return_to_stock") {
    return { error: "โหมดการปรับจำนวนไม่ถูกต้อง" };
  }

  const supabase = getSupabaseAdmin() as unknown as RpcClient;
  const { error } = await supabase.rpc("adjust_delivery_note_item", {
    p_organization_id: session.organizationId,
    p_delivery_note_item_id: deliveryNoteItemId,
    p_new_quantity_delivered: newQty,
    p_adjusted_by: session.userId,
    p_resolution_mode: mode,
  });

  if (error) return { error: error.message ?? "แก้ไขจำนวนส่งจริงไม่สำเร็จ" };

  revalidateTag(`delivery-${session.organizationId}`, "max");
  revalidateTag(`orders-${session.organizationId}`, "max");
  return {};
}

export async function adjustDeliveryGroupQtyAction(
  items: Array<{ id: string; currentQty: number }>,
  newTotalQty: number,
  mode: DeliveryAdjustmentMode,
): Promise<{ error?: string }> {
  const session = await requireAppRole("admin");

  if (!Array.isArray(items) || items.length === 0) {
    return { error: "ไม่พบรายการที่ต้องการแก้ไข" };
  }
  if (!Number.isFinite(newTotalQty) || newTotalQty < 0) {
    return { error: "จำนวนต้องเป็น 0 หรือมากกว่า" };
  }
  if (mode !== "lost" && mode !== "return_to_stock") {
    return { error: "โหมดการปรับจำนวนไม่ถูกต้อง" };
  }

  const currentTotalQty = items.reduce((sum, item) => sum + item.currentQty, 0);
  if (newTotalQty > currentTotalQty) {
    return { error: "ไม่สามารถเพิ่มจำนวนส่งจริงได้" };
  }

  const supabase = getSupabaseAdmin() as unknown as RpcClient;
  let remaining = newTotalQty;
  const nextQuantities = new Map<string, number>();

  for (const item of items) {
    const appliedQty = Math.min(item.currentQty, remaining);
    nextQuantities.set(item.id, appliedQty);
    remaining -= appliedQty;
  }

  for (const item of items) {
    const nextQty = nextQuantities.get(item.id) ?? 0;
    const { error } = await supabase.rpc("adjust_delivery_note_item", {
      p_organization_id: session.organizationId,
      p_delivery_note_item_id: item.id,
      p_new_quantity_delivered: nextQty,
      p_adjusted_by: session.userId,
      p_resolution_mode: mode,
    });

    if (error) return { error: error.message ?? "แก้ไขจำนวนส่งจริงไม่สำเร็จ" };
  }

  revalidateTag(`delivery-${session.organizationId}`, "max");
  revalidateTag(`orders-${session.organizationId}`, "max");
  return {};
}
