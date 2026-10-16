"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import {
  buildOrderWindowMetadata,
  isValidTimeString,
} from "@/lib/order-window";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

export type OrderWindowSettingsActionState = {
  allowOrderAfterCutoff: boolean;
  closeTime: string;
  message: string;
  openTime: string;
  status: "idle" | "success" | "error";
};

function parseBooleanInput(value: FormDataEntryValue | null) {
  return value === "true";
}

function parseTimeInput(value: FormDataEntryValue | null, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const nextValue = value.trim();
  return isValidTimeString(nextValue) ? nextValue : fallback;
}

export async function updateOrderWindowSettingsAction(
  _previousState: OrderWindowSettingsActionState,
  formData: FormData,
): Promise<OrderWindowSettingsActionState> {
  const session = await requireAppRole("admin");
  const allowOrderAfterCutoff = parseBooleanInput(formData.get("allowOrderAfterCutoff"));
  const openTime = parseTimeInput(formData.get("openTime"), "00:00");
  const closeTime = parseTimeInput(formData.get("closeTime"), "17:00");

  if (openTime >= closeTime) {
    return {
      allowOrderAfterCutoff,
      closeTime,
      message: "เวลาเปิดรับต้องน้อยกว่าเวลาปิดรับ",
      openTime,
      status: "error",
    };
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: organization, error: loadError } = await supabaseAdmin
    .from("organizations")
    .select("metadata")
    .eq("id", session.organizationId)
    .single();

  if (loadError || !organization) {
    console.error("[updateOrderWindowSettingsAction:loadOrganization]", loadError);
    return {
      allowOrderAfterCutoff,
      closeTime,
      message: "ไม่สามารถโหลดการตั้งค่าปัจจุบันได้",
      openTime,
      status: "error",
    };
  }

  const nextMetadata = buildOrderWindowMetadata(organization.metadata, {
    allowOrderAfterCutoff,
    closeTime,
    openTime,
  });

  const { error: updateError } = await supabaseAdmin
    .from("organizations")
    .update({ metadata: nextMetadata as Json })
    .eq("id", session.organizationId);

  if (updateError) {
    console.error("[updateOrderWindowSettingsAction:updateOrganization]", updateError);
    return {
      allowOrderAfterCutoff,
      closeTime,
      message: "บันทึกการตั้งค่าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
      openTime,
      status: "error",
    };
  }

  revalidateTag(`settings-${session.organizationId}`, "max");
  revalidatePath("/settings");
  revalidatePath("/settings/order-window");
  revalidatePath("/order");

  return {
    allowOrderAfterCutoff,
    closeTime,
    message: "บันทึกเวลารับออเดอร์เรียบร้อยแล้ว",
    openTime,
    status: "success",
  };
}
