"use server";

import { revalidatePath } from "next/cache";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type ReceiveStockField = "productId" | "totalQuantity";

export type ReceiveStockActionState = {
  fieldErrors: Partial<Record<ReceiveStockField, string>>;
  message: string;
  status: "error" | "idle" | "success";
};

type SupabaseReceiptAdmin = ReturnType<typeof getSupabaseAdmin> & {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

function getText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getNumber(formData: FormData, key: string) {
  const value = Number(String(formData.get(key) ?? "").replace(/,/g, "").trim());
  return Number.isFinite(value) ? value : Number.NaN;
}

export async function receiveStockAction(
  _prevState: ReceiveStockActionState,
  formData: FormData,
): Promise<ReceiveStockActionState> {
  const session = await requireAppRole("admin");
  const productId = getText(formData, "productId");
  const totalQuantity = getNumber(formData, "totalQuantity");
  const baseUnit = getText(formData, "baseUnit");
  const avgUnitCost = getNumber(formData, "avgUnitCost");
  const receiptNumberInput = getText(formData, "receiptNumber");
  // Generate unique receipt number if not provided — avoids clash when submitting within the same second
  const receiptNumber = receiptNumberInput || `RCV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const supplierName = getText(formData, "supplierName") || "โรงงานหลัก";
  const receivedAt = getText(formData, "receivedAt");
  const notes = getText(formData, "notes");

  const fieldErrors: Partial<Record<ReceiveStockField, string>> = {};

  if (!productId) {
    fieldErrors.productId = "เลือกรายการสินค้าก่อน";
  }

  if (!Number.isFinite(totalQuantity) || totalQuantity <= 0) {
    fieldErrors.totalQuantity = "กรุณากรอกจำนวนรับเข้าอย่างน้อยหนึ่งหน่วย";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      fieldErrors,
      message: "ยังบันทึกรับเข้าไม่ได้ กรุณาตรวจสอบข้อมูลอีกครั้ง",
      status: "error",
    };
  }

  const admin = getSupabaseAdmin() as SupabaseReceiptAdmin;
  const { error } = await admin.rpc("create_inventory_receipt", {
    p_created_by: session.userId,
    p_items: [
      {
        productId,
        quantityReceived: totalQuantity,
        unit: baseUnit,
        unitCost: Number.isFinite(avgUnitCost) && avgUnitCost >= 0 ? avgUnitCost : 0,
      },
    ],
    p_notes: notes,
    p_organization_id: session.organizationId,
    p_receipt_number: receiptNumber,
    p_received_at: receivedAt ? new Date(receivedAt).toISOString() : new Date().toISOString(),
    p_supplier_name: supplierName,
  });

  if (error) {
    return {
      fieldErrors: {},
      message: error.message ?? "ระบบบันทึกรับเข้าไม่สำเร็จ",
      status: "error",
    };
  }

  revalidatePath("/stock");
  revalidatePath("/settings/stock");
  revalidatePath("/settings/products");

  return {
    fieldErrors: {},
    message: "บันทึกรับสินค้าเข้าเรียบร้อยแล้ว",
    status: "success",
  };
}
