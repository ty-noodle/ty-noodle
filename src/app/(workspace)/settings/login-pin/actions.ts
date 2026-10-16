"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAppRole } from "@/lib/auth/authorization";
import { createPinLookup, hashPin, hashRequestIp } from "@/lib/auth/pin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type ChangeLoginPinState = {
  status: "idle" | "success" | "error";
  message: string;
  successId?: string;
};

function normalizePin(value: FormDataEntryValue | null) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 6);
}

export async function changeLoginPinAction(
  _previousState: ChangeLoginPinState,
  formData: FormData,
): Promise<ChangeLoginPinState> {
  const session = await requireAppRole("admin");
  const newPin = normalizePin(formData.get("newPin"));
  const confirmPin = normalizePin(formData.get("confirmPin"));

  if (newPin.length !== 6 || confirmPin.length !== 6) {
    return {
      status: "error",
      message: "กรุณาใส่รหัส 6 หลัก",
    };
  }

  if (newPin !== confirmPin) {
    return {
      status: "error",
      message: "รหัสทั้งสองช่องไม่ตรงกัน",
    };
  }

  const admin = getSupabaseAdmin();
  const pinLookup = createPinLookup(newPin);

  const { data: existingUser, error: existingError } = await admin
    .from("app_users")
    .select("id")
    .eq("pin_lookup", pinLookup)
    .neq("id", session.userId)
    .maybeSingle();

  if (existingError) {
    return {
      status: "error",
      message: "ตรวจสอบรหัสไม่สำเร็จ กรุณาลองใหม่",
    };
  }

  if (existingUser) {
    return {
      status: "error",
      message: "รหัสนี้ถูกใช้แล้ว กรุณาใช้รหัสอื่น",
    };
  }

  const { error: updateError } = await admin
    .from("app_users")
    .update({
      pin_lookup: pinLookup,
      pin_hash: hashPin(newPin),
      failed_pin_attempts: 0,
      locked_until: null,
      last_failed_at: null,
    })
    .eq("id", session.userId)
    .eq("organization_id", session.organizationId);

  if (updateError) {
    return {
      status: "error",
      message: "บันทึกรหัสใหม่ไม่สำเร็จ",
    };
  }

  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  await admin.from("auth_audit_logs").insert({
    user_id: session.userId,
    organization_id: session.organizationId,
    event_type: "pin_changed",
    ip_hash: hashRequestIp(ip),
    user_agent: requestHeaders.get("user-agent"),
    metadata: { source: "settings_login_pin" },
  });

  revalidatePath("/settings/login-pin");

  return {
    status: "success",
    message: "เปลี่ยนรหัสเข้าใช้งานสำเร็จแล้ว",
    successId: Date.now().toString(36),
  };
}
