"use server";

import { revalidatePath } from "next/cache";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type CustomerLookupRow = Pick<
  Database["public"]["Tables"]["customers"]["Row"],
  "id" | "is_active" | "line_user_id" | "metadata" | "name"
>;

type DeleteCustomerDataInput = {
  customerId?: string | null;
  lineLinkId?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function getCustomerForOrganization(customerId: string, organizationId: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("customers")
    .select("id, name, is_active, line_user_id, metadata")
    .eq("id", customerId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as CustomerLookupRow;
}

function revalidateCustomerPages() {
  revalidatePath("/settings");
  revalidatePath("/settings/customer-data");
  revalidatePath("/settings/customers");
  revalidatePath("/orders");
  revalidatePath("/order");
}

export async function toggleCustomerAvailabilityAction(
  customerId: string,
  nextActive: boolean,
): Promise<{ error?: string; success?: string }> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();
  const linkedCustomerId = customerId;
  if (!linkedCustomerId) {
    return { error: "ไม่พบลูกค้าที่ต้องการลบ" };
  }

  const customer = await getCustomerForOrganization(linkedCustomerId, session.organizationId);

  if (!customer) {
    return { error: "ไม่พบลูกค้าที่ต้องการอัปเดต" };
  }

  const { error } = await admin
    .from("customers")
    .update({
      is_active: nextActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId)
    .eq("organization_id", session.organizationId);

  if (error) {
    return { error: "อัปเดตสถานะลูกค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
  }

  revalidateCustomerPages();

  return {
    success: nextActive
      ? `เปิดใช้งาน ${customer.name} เรียบร้อยแล้ว`
      : `ปิดใช้งาน ${customer.name} เรียบร้อยแล้ว`,
  };
}

export async function deleteCustomerDataAction(
  input: DeleteCustomerDataInput,
): Promise<{ error?: string; success?: string }> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();
  const customerId = input.customerId?.trim() || null;
  const lineLinkId = input.lineLinkId?.trim() || null;

  if (!customerId && !lineLinkId) {
    return { error: "ไม่พบข้อมูลลูกค้าที่ต้องการลบ" };
  }

  if (!customerId && lineLinkId) {
    const { data: lineLink, error: lookupError } = await admin
      .from("line_order_customers")
      .select("id, line_display_name")
      .eq("id", lineLinkId)
      .eq("organization_id", session.organizationId)
      .maybeSingle();

    if (lookupError || !lineLink) {
      return { error: "ไม่พบข้อมูล LINE ที่ต้องการลบ" };
    }

    const { error: deleteError } = await admin
      .from("line_order_customers")
      .delete()
      .eq("id", lineLinkId)
      .eq("organization_id", session.organizationId);

    if (deleteError) {
      return { error: "ลบข้อมูลลูกค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
    }

    revalidateCustomerPages();

    return {
      success: `ลบข้อมูล LINE ${lineLink.line_display_name ?? ""} เรียบร้อยแล้ว`,
    };
  }

  const linkedCustomerId = customerId;
  if (!linkedCustomerId) {
    return { error: "ไม่พบลูกค้าที่ต้องการลบ" };
  }

  const customer = await getCustomerForOrganization(linkedCustomerId, session.organizationId);

  if (!customer) {
    return { error: "ไม่พบลูกค้าที่ต้องการลบ" };
  }

  const currentMetadata = isRecord(customer.metadata) ? { ...customer.metadata } : {};
  delete currentMetadata.lineProfile;

  const [{ error }, { error: lineLinkError }] = await Promise.all([
    admin
      .from("customers")
      .update({
        line_user_id: null,
        metadata: currentMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", linkedCustomerId)
      .eq("organization_id", session.organizationId),
    admin
      .from("line_order_customers")
      .delete()
      .eq("customer_id", linkedCustomerId)
      .eq("organization_id", session.organizationId),
  ]);

  if (error || lineLinkError) {
    return { error: "ลบข้อมูลลูกค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
  }

  revalidateCustomerPages();

  return {
    success: `ลบข้อมูลลูกค้า ${customer.name} เรียบร้อยแล้ว`,
  };
}
