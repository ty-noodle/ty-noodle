"use server";

import { revalidatePath } from "next/cache";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type SupplierActionState = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors?: Record<string, string[]>;
};

export async function createSupplierAction(
  prevState: SupplierActionState,
  formData: FormData
): Promise<SupplierActionState> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const addressDetails = String(formData.get("addressDetails") ?? "").trim();
  const province = String(formData.get("provinceName") ?? "").trim();
  const district = String(formData.get("districtName") ?? "").trim();
  const subdistrict = String(formData.get("subdistrictName") ?? "").trim();
  const postalCode = String(formData.get("postalCode") ?? "").trim();

  const provinceCode = String(formData.get("provinceCode") ?? "").trim();
  const districtCode = String(formData.get("districtCode") ?? "").trim();
  const subdistrictCode = String(formData.get("subdistrictCode") ?? "").trim();

  if (!name) return { status: "error", message: "กรุณาระบุชื่อผู้ขาย" };

  // 1. Get next code
  const { data: code, error: codeError } = await admin.rpc("next_supplier_code" as unknown as "next_customer_code", {
    p_organization_id: session.organizationId,
  });

  if (codeError) return { status: "error", message: "ไม่สามารถสร้างรหัสผู้ขายได้" };

  // 2. Insert
  const fullAddress = [addressDetails, subdistrict, district, province, postalCode]
    .filter(Boolean)
    .join(" ");

  const { error } = await admin.from("suppliers").insert({
    organization_id: session.organizationId,
    supplier_code: String(code),
    name,
    address: fullAddress,
    province,
    district,
    subdistrict,
    postal_code: postalCode,
    metadata: {
      address: {
        provinceCode,
        districtCode,
        subdistrictCode,
        provinceName: province,
        districtName: district,
        subdistrictName: subdistrict,
        postalCode,
        street: { details: addressDetails }
      }
    }
  });

  if (error) return { status: "error", message: "บันทึกข้อมูลไม่สำเร็จ: " + error.message };

  revalidatePath("/settings/suppliers");
  return { status: "success", message: "เพิ่มผู้ขายเรียบร้อยแล้ว" };
}

export async function updateSupplierAction(
  supplierId: string,
  prevState: SupplierActionState,
  formData: FormData
): Promise<SupplierActionState> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const addressDetails = String(formData.get("addressDetails") ?? "").trim();
  const province = String(formData.get("provinceName") ?? "").trim();
  const district = String(formData.get("districtName") ?? "").trim();
  const subdistrict = String(formData.get("subdistrictName") ?? "").trim();
  const postalCode = String(formData.get("postalCode") ?? "").trim();

  const provinceCode = String(formData.get("provinceCode") ?? "").trim();
  const districtCode = String(formData.get("districtCode") ?? "").trim();
  const subdistrictCode = String(formData.get("subdistrictCode") ?? "").trim();

  if (!name) return { status: "error", message: "กรุณาระบุชื่อผู้ขาย" };

  const fullAddress = [addressDetails, subdistrict, district, province, postalCode]
    .filter(Boolean)
    .join(" ");

  const { error } = await admin
    .from("suppliers")
    .update({
      name,
      address: fullAddress,
      province,
      district,
      subdistrict,
      postal_code: postalCode,
      metadata: {
        address: {
          provinceCode,
          districtCode,
          subdistrictCode,
          provinceName: province,
          districtName: district,
          subdistrictName: subdistrict,
          postalCode,
          street: { details: addressDetails }
        }
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", supplierId)
    .eq("organization_id", session.organizationId);

  if (error) return { status: "error", message: "แก้ไขข้อมูลไม่สำเร็จ: " + error.message };

  revalidatePath("/settings/suppliers");
  return { status: "success", message: "แก้ไขข้อมูลผู้ขายเรียบร้อยแล้ว" };
}

export async function deleteSupplierAction(supplierId: string): Promise<{ success: boolean; error?: string }> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();

  const { error } = await admin
    .from("suppliers")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", supplierId)
    .eq("organization_id", session.organizationId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/settings/suppliers");
  return { success: true };
}
