"use server";

import { revalidatePath } from "next/cache";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type CreateCustomerField = "address" | "customerCode" | "defaultVehicleId" | "name";

export type CreateCustomerActionState = {
  fieldErrors: Partial<Record<CreateCustomerField, string>>;
  message: string;
  status: "error" | "idle" | "success";
};

type AddressPayload = {
  addressDetails: string;
  addressLine: string;
  addressSummary: string;
  districtCode: string;
  districtName: string;
  postalCode: string;
  provinceCode: string;
  provinceName: string;
  subdistrictCode: string;
  subdistrictName: string;
};

function getTrimmedText(value: unknown) {
  return String(value ?? "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getNextCustomerCode(codes: string[]) {
  const maxSequence = codes.reduce((max, code) => {
    const match = /^TYS(\d+)$/i.exec(code.trim());

    if (!match) {
      return max;
    }

    const sequence = Number.parseInt(match[1], 10);
    return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
  }, 0);

  return `TYS${String(maxSequence + 1).padStart(3, "0")}`;
}

async function generateCustomerCode(organizationId: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("customers")
    .select("customer_code")
    .eq("organization_id", organizationId);

  if (error) {
    return null;
  }

  return getNextCustomerCode((data ?? []).map((customer) => customer.customer_code ?? ""));
}

function getAddressPayload(value: FormDataEntryValue | null): AddressPayload | null {
  const raw = getTrimmedText(value);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!isRecord(parsed)) {
      return null;
    }

    return {
      addressDetails: getTrimmedText(parsed.addressDetails ?? ""),
      addressLine: getTrimmedText(parsed.addressLine ?? ""),
      addressSummary: getTrimmedText(parsed.addressSummary ?? ""),
      districtCode: getTrimmedText(parsed.districtCode ?? ""),
      districtName: getTrimmedText(parsed.districtName ?? ""),
      postalCode: getTrimmedText(parsed.postalCode ?? ""),
      provinceCode: getTrimmedText(parsed.provinceCode ?? ""),
      provinceName: getTrimmedText(parsed.provinceName ?? ""),
      subdistrictCode: getTrimmedText(parsed.subdistrictCode ?? ""),
      subdistrictName: getTrimmedText(parsed.subdistrictName ?? ""),
    };
  } catch {
    return null;
  }
}

function validateCustomerForm(formData: FormData) {
  const defaultVehicleId = getTrimmedText(formData.get("defaultVehicleId"));
  const name = getTrimmedText(formData.get("name"));
  const address = getAddressPayload(formData.get("addressPayload"));
  const fieldErrors: Partial<Record<CreateCustomerField, string>> = {};

  if (!name) {
    fieldErrors.name = "กรอกชื่อร้านค้าก่อนบันทึก";
  } else if (name.length > 120) {
    fieldErrors.name = "ชื่อร้านค้าต้องไม่เกิน 120 ตัวอักษร";
  }

  if (!address) {
    fieldErrors.address = "ข้อมูลที่อยู่ไม่สมบูรณ์ ลองกรอกใหม่อีกครั้ง";
  } else {
    if (address.addressLine && address.addressLine.length < 1) {
      fieldErrors.address = "กรอกรายละเอียดที่อยู่ร้านค้า";
    }

    if (address.postalCode && !/^\d{5}$/.test(address.postalCode)) {
      fieldErrors.address = "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก";
    }
  }

  return {
    address,
    defaultVehicleId: defaultVehicleId || null,
    fieldErrors,
    name,
    success: Object.keys(fieldErrors).length === 0,
  };
}

export async function createCustomerAction(
  _prevState: CreateCustomerActionState,
  formData: FormData,
): Promise<CreateCustomerActionState> {
  const session = await requireAppRole("admin");
  const validation = validateCustomerForm(formData);

  if (!validation.success || !validation.address) {
    return {
      fieldErrors: validation.fieldErrors,
      message: "ยังบันทึกร้านค้าไม่ได้ กรุณาตรวจสอบข้อมูลที่กรอก",
      status: "error",
    };
  }

  const admin = getSupabaseAdmin();
  const { address, defaultVehicleId, name } = validation;
  const customerCode = await generateCustomerCode(session.organizationId);

  if (!customerCode) {
    return {
      fieldErrors: {},
      message: "ระบบยังสร้างรหัสร้านค้าอัตโนมัติไม่สำเร็จ กรุณาลองอีกครั้ง",
      status: "error",
    };
  }

  if (defaultVehicleId) {
    const { data: vehicle, error: vehicleError } = await admin
      .from("vehicles")
      .select("id")
      .eq("organization_id", session.organizationId)
      .eq("id", defaultVehicleId)
      .eq("is_active", true)
      .maybeSingle();

    if (vehicleError || !vehicle) {
      return {
        fieldErrors: {
          defaultVehicleId: "เลือกรถประจำร้านใหม่อีกครั้ง",
        },
        message: "ยังบันทึกร้านค้าไม่ได้ เพราะไม่พบรถที่เลือกไว้",
        status: "error",
      };
    }
  }

  const { error } = await admin.from("customers").insert({
    address: address.addressSummary,
    customer_code: customerCode,
    default_vehicle_id: defaultVehicleId,
    metadata: {
      address: {
        districtCode: address.districtCode,
        districtName: address.districtName,
        line1: address.addressLine,
        postalCode: address.postalCode,
        provinceCode: address.provinceCode,
        provinceName: address.provinceName,
        street: {
          details: address.addressDetails,
        },
        subdistrictCode: address.subdistrictCode,
        subdistrictName: address.subdistrictName,
      },
    },
    name,
    organization_id: session.organizationId,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        fieldErrors: {
          customerCode: "รหัสร้านค้านี้ถูกใช้งานแล้ว",
        },
        message: "บันทึกไม่สำเร็จ เพราะมีรหัสร้านค้านี้อยู่แล้ว",
        status: "error",
      };
    }

    return {
      fieldErrors: {},
      message: "ระบบบันทึกร้านค้าไม่สำเร็จ กรุณาลองอีกครั้ง",
      status: "error",
    };
  }

  revalidatePath("/settings");
  revalidatePath("/settings/customers");
  revalidatePath("/settings/vehicles");

  return {
    fieldErrors: {},
    message: `บันทึกร้านค้า ${name} เรียบร้อยแล้ว`,
    status: "success",
  };
}

export async function updateCustomerDefaultVehicleAction(
  customerId: string,
  defaultVehicleId: string | null,
): Promise<{ error?: string }> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();

  const { data: customer, error: customerLookupError } = await admin
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .eq("organization_id", session.organizationId)
    .eq("is_active", true)
    .maybeSingle();

  if (customerLookupError || !customer) {
    return { error: "ไม่พบร้านค้าที่ต้องการอัปเดต" };
  }

  if (defaultVehicleId) {
    const { data: vehicle, error: vehicleLookupError } = await admin
      .from("vehicles")
      .select("id")
      .eq("id", defaultVehicleId)
      .eq("organization_id", session.organizationId)
      .eq("is_active", true)
      .maybeSingle();

    if (vehicleLookupError || !vehicle) {
      return { error: "ไม่พบรถที่เลือก กรุณาลองเลือกใหม่อีกครั้ง" };
    }
  }

  const { error: updateError } = await admin
    .from("customers")
    .update({
      default_vehicle_id: defaultVehicleId,
    })
    .eq("id", customerId)
    .eq("organization_id", session.organizationId);

  if (updateError) {
    return { error: "อัปเดตรถประจำร้านไม่สำเร็จ กรุณาลองอีกครั้ง" };
  }

  revalidatePath("/settings/customers");
  revalidatePath("/settings/vehicles");
  revalidatePath("/delivery");

  return {};
}

export async function deleteCustomerAction(customerId: string): Promise<{ error?: string }> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();

  // Verify the customer belongs to this org before deleting
  const { data: customer, error: fetchError } = await admin
    .from("customers")
    .select("id, name")
    .eq("id", customerId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  if (fetchError || !customer) {
    return { error: "ไม่พบร้านค้าที่ต้องการลบ" };
  }

  const { error } = await admin
    .from("customers")
    .update({ is_active: false })
    .eq("id", customerId)
    .eq("organization_id", session.organizationId);

  if (error) {
    return { error: "ลบร้านค้าไม่สำเร็จ กรุณาลองอีกครั้ง" };
  }

  revalidatePath("/settings/customers");
  revalidatePath("/orders");

  return {};
}
