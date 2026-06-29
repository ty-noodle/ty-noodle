"use server";

import { revalidatePath, revalidateTag, updateTag } from "next/cache";
import { requireAppRole } from "@/lib/auth/authorization";
import {
  getNextCustomerCode,
  normalizeCustomerCode,
  validateCustomerCode,
} from "@/lib/settings/customer-code";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type CreateCustomerField = "address" | "customerCode" | "defaultVehicleId" | "name";
type CustomerCodeMode = "auto" | "manual";

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

function buildAddressMetadata(address: AddressPayload) {
  return {
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
  };
}

function revalidateCustomerSettings(organizationId: string) {
  updateTag(`settings-${organizationId}`);
  revalidatePath("/settings");
  revalidatePath("/settings/customers");
  revalidatePath("/settings/customers/pricing");
  revalidatePath("/settings/customer-data");
  revalidatePath("/delivery");
  revalidatePath("/orders");
  revalidateTag(`settings-${organizationId}`, "max");
}

function getCustomerCodeMode(value: FormDataEntryValue | null): CustomerCodeMode {
  return value === "manual" ? "manual" : "auto";
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

async function customerCodeExists(
  organizationId: string,
  customerCode: string,
  excludedCustomerId?: string,
) {
  const admin = getSupabaseAdmin();
  const query = admin
    .from("customers")
    .select("id")
    .eq("organization_id", organizationId)
    .ilike("customer_code", customerCode);
  const { data, error } = excludedCustomerId
    ? await query.neq("id", excludedCustomerId).limit(1)
    : await query.limit(1);

  return {
    error: Boolean(error),
    exists: Boolean(data?.length),
  };
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

function validateCustomerForm(formData: FormData, options: { isEditMode: boolean }) {
  const customerCodeMode = options.isEditMode
    ? "manual"
    : getCustomerCodeMode(formData.get("customerCodeMode"));
  const customerCode = normalizeCustomerCode(formData.get("customerCode"));
  const defaultVehicleId = getTrimmedText(formData.get("defaultVehicleId"));
  const name = getTrimmedText(formData.get("name"));
  const address = getAddressPayload(formData.get("addressPayload"));
  const fieldErrors: Partial<Record<CreateCustomerField, string>> = {};

  if (customerCodeMode === "manual") {
    const customerCodeError = validateCustomerCode(customerCode);

    if (customerCodeError) {
      fieldErrors.customerCode = customerCodeError;
    }
  }

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
    customerCode,
    customerCodeMode,
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
  const validation = validateCustomerForm(formData, { isEditMode: false });

  if (!validation.success || !validation.address) {
    return {
      fieldErrors: validation.fieldErrors,
      message: "ยังบันทึกร้านค้าไม่ได้ กรุณาตรวจสอบข้อมูลที่กรอก",
      status: "error",
    };
  }

  const admin = getSupabaseAdmin();
  const { address, defaultVehicleId, name } = validation;
  const customerCode =
    validation.customerCodeMode === "auto"
      ? await generateCustomerCode(session.organizationId)
      : validation.customerCode;

  if (!customerCode) {
    return {
      fieldErrors: {},
      message: "ระบบยังสร้างรหัสร้านค้าอัตโนมัติไม่สำเร็จ กรุณาลองอีกครั้ง",
      status: "error",
    };
  }

  if (validation.customerCodeMode === "manual") {
    const duplicateCheck = await customerCodeExists(session.organizationId, customerCode);

    if (duplicateCheck.error) {
      return {
        fieldErrors: {},
        message: "ระบบตรวจสอบรหัสร้านไม่สำเร็จ กรุณาลองอีกครั้ง",
        status: "error",
      };
    }

    if (duplicateCheck.exists) {
      return {
        fieldErrors: {
          customerCode: "รหัสร้านนี้ถูกใช้งานแล้ว",
        },
        message: "บันทึกไม่สำเร็จ เพราะมีรหัสร้านนี้อยู่แล้ว",
        status: "error",
      };
    }
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
    district: address.districtName || null,
    metadata: {
      address: buildAddressMetadata(address),
    },
    name,
    organization_id: session.organizationId,
    postal_code: address.postalCode || null,
    province: address.provinceName || null,
    subdistrict: address.subdistrictName || null,
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

  revalidateCustomerSettings(session.organizationId);
  revalidatePath("/settings/vehicles");

  return {
    fieldErrors: {},
    message: `บันทึกร้านค้า ${name} เรียบร้อยแล้ว`,
    status: "success",
  };
}

export async function updateCustomerAction(
  customerId: string,
  _prevState: CreateCustomerActionState,
  formData: FormData,
): Promise<CreateCustomerActionState> {
  const session = await requireAppRole("admin");
  const validation = validateCustomerForm(formData, { isEditMode: true });

  if (!validation.success || !validation.address) {
    return {
      fieldErrors: validation.fieldErrors,
      message: "ยังบันทึกการแก้ไขร้านค้าไม่ได้ กรุณาตรวจสอบข้อมูลที่กรอก",
      status: "error",
    };
  }

  const admin = getSupabaseAdmin();
  const { address, customerCode, defaultVehicleId, name } = validation;

  const { data: customer, error: customerLookupError } = await admin
    .from("customers")
    .select("id, customer_code, metadata")
    .eq("id", customerId)
    .eq("organization_id", session.organizationId)
    .eq("is_active", true)
    .maybeSingle();

  if (customerLookupError || !customer) {
    return {
      fieldErrors: {},
      message: "ไม่พบร้านค้าที่ต้องการแก้ไข",
      status: "error",
    };
  }

  if (customerCode !== customer.customer_code) {
    const duplicateCheck = await customerCodeExists(
      session.organizationId,
      customerCode,
      customerId,
    );

    if (duplicateCheck.error) {
      return {
        fieldErrors: {},
        message: "ระบบตรวจสอบรหัสร้านไม่สำเร็จ กรุณาลองอีกครั้ง",
        status: "error",
      };
    }

    if (duplicateCheck.exists) {
      return {
        fieldErrors: {
          customerCode: "รหัสร้านนี้ถูกใช้งานแล้ว",
        },
        message: "บันทึกไม่สำเร็จ เพราะมีรหัสร้านนี้อยู่แล้ว",
        status: "error",
      };
    }
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
        message: "ยังบันทึกการแก้ไขร้านค้าไม่ได้ เพราะไม่พบรถที่เลือกไว้",
        status: "error",
      };
    }
  }

  const currentMetadata = isRecord(customer.metadata) ? customer.metadata : {};
  const { error } = await admin
    .from("customers")
    .update({
      address: address.addressSummary,
      customer_code: customerCode,
      default_vehicle_id: defaultVehicleId,
      district: address.districtName || null,
      metadata: {
        ...currentMetadata,
        address: buildAddressMetadata(address),
      },
      name,
      postal_code: address.postalCode || null,
      province: address.provinceName || null,
      subdistrict: address.subdistrictName || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId)
    .eq("organization_id", session.organizationId);

  if (error) {
    if (error.code === "23505") {
      return {
        fieldErrors: {
          customerCode: "รหัสร้านนี้ถูกใช้งานแล้ว",
        },
        message: "บันทึกไม่สำเร็จ เพราะมีรหัสร้านนี้อยู่แล้ว",
        status: "error",
      };
    }

    return {
      fieldErrors: {},
      message: "ระบบบันทึกการแก้ไขร้านค้าไม่สำเร็จ กรุณาลองอีกครั้ง",
      status: "error",
    };
  }

  revalidateCustomerSettings(session.organizationId);

  return {
    fieldErrors: {},
    message: `บันทึกการแก้ไข ${name} เรียบร้อยแล้ว`,
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

  revalidateCustomerSettings(session.organizationId);
  revalidatePath("/settings/vehicles");

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

  revalidateCustomerSettings(session.organizationId);

  return {};
}
