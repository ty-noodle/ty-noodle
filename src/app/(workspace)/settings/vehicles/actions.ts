"use server";

import { revalidatePath } from "next/cache";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type VehicleField = "name";

export type CreateVehicleActionState = {
  fieldErrors: Partial<Record<VehicleField, string>>;
  message: string;
  status: "error" | "idle" | "success";
};

function getTrimmedText(value: unknown) {
  return String(value ?? "").trim();
}

function getVehiclePayload(formData: FormData) {
  return {
    driverName: getTrimmedText(formData.get("driverName")) || null,
    licensePlate: getTrimmedText(formData.get("licensePlate")) || null,
    name: getTrimmedText(formData.get("name")),
  };
}

function validateVehiclePayload(payload: ReturnType<typeof getVehiclePayload>) {
  const fieldErrors: Partial<Record<VehicleField, string>> = {};

  if (!payload.name) {
    fieldErrors.name = "กรอกชื่อรถก่อนบันทึก";
  } else if (payload.name.length > 120) {
    fieldErrors.name = "ชื่อรถต้องไม่เกิน 120 ตัวอักษร";
  }

  return {
    fieldErrors,
    success: Object.keys(fieldErrors).length === 0,
  };
}

function getValidationErrorState(fieldErrors: Partial<Record<VehicleField, string>>) {
  return {
    fieldErrors,
    message: "ยังบันทึกรถไม่ได้ กรุณาตรวจสอบข้อมูลที่กรอก",
    status: "error" as const,
  };
}

function revalidateVehiclePaths() {
  revalidatePath("/settings");
  revalidatePath("/settings/customers");
  revalidatePath("/settings/vehicles");
}

export async function createVehicleAction(
  _prevState: CreateVehicleActionState,
  formData: FormData,
): Promise<CreateVehicleActionState> {
  const session = await requireAppRole("admin");
  const payload = getVehiclePayload(formData);
  const validation = validateVehiclePayload(payload);

  if (!validation.success) {
    return getValidationErrorState(validation.fieldErrors);
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin.from("vehicles").insert({
    created_by: session.userId,
    driver_name: payload.driverName,
    license_plate: payload.licensePlate,
    name: payload.name,
    organization_id: session.organizationId,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        fieldErrors: {
          name: "ชื่อรถนี้ถูกใช้งานแล้ว",
        },
        message: "บันทึกไม่สำเร็จ เพราะมีชื่อรถนี้อยู่แล้ว",
        status: "error",
      };
    }

    return {
      fieldErrors: {},
      message: "ระบบบันทึกรถไม่สำเร็จ กรุณาลองอีกครั้ง",
      status: "error",
    };
  }

  revalidateVehiclePaths();

  return {
    fieldErrors: {},
    message: `บันทึกรถ ${payload.name} เรียบร้อยแล้ว`,
    status: "success",
  };
}

export async function updateVehicleAction(
  vehicleId: string,
  _prevState: CreateVehicleActionState,
  formData: FormData,
): Promise<CreateVehicleActionState> {
  const session = await requireAppRole("admin");
  const payload = getVehiclePayload(formData);
  const validation = validateVehiclePayload(payload);

  if (!validation.success) {
    return getValidationErrorState(validation.fieldErrors);
  }

  const admin = getSupabaseAdmin();
  const { data: vehicle, error: vehicleLookupError } = await admin
    .from("vehicles")
    .select("id")
    .eq("id", vehicleId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  if (vehicleLookupError || !vehicle) {
    return {
      fieldErrors: {},
      message: "ไม่พบรถที่ต้องการแก้ไข",
      status: "error",
    };
  }

  const { error } = await admin
    .from("vehicles")
    .update({
      driver_name: payload.driverName,
      license_plate: payload.licensePlate,
      name: payload.name,
    })
    .eq("id", vehicleId)
    .eq("organization_id", session.organizationId);

  if (error) {
    if (error.code === "23505") {
      return {
        fieldErrors: {
          name: "ชื่อรถนี้ถูกใช้งานแล้ว",
        },
        message: "บันทึกไม่สำเร็จ เพราะมีชื่อรถนี้อยู่แล้ว",
        status: "error",
      };
    }

    return {
      fieldErrors: {},
      message: "ระบบแก้ไขข้อมูลรถไม่สำเร็จ กรุณาลองอีกครั้ง",
      status: "error",
    };
  }

  revalidateVehiclePaths();

  return {
    fieldErrors: {},
    message: `อัปเดตรถ ${payload.name} เรียบร้อยแล้ว`,
    status: "success",
  };
}

export async function deleteVehicleAction(vehicleId: string): Promise<void> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();

  await admin
    .from("vehicles")
    .delete()
    .eq("id", vehicleId)
    .eq("organization_id", session.organizationId);

  revalidateVehiclePaths();
}
