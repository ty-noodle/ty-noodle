"use server";

import { revalidatePath, revalidateTag, updateTag } from "next/cache";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getStockReceiptDetail, getStockDashboardData, type StockReceiptDetail, type StockProductOption, type StockSupplierOption } from "@/lib/stock/admin";
import { createActionClient } from "@/lib/supabase/action";

export async function fetchStockModalDataAction(): Promise<{
  products: StockProductOption[];
  suppliers: StockSupplierOption[];
}> {
  const session = await requireAppRole("admin");
  const data = await getStockDashboardData(session.organizationId, 0, 0);
  return {
    products: data.products,
    suppliers: data.suppliers,
  };
}
import type { Json } from "@/types/database";

const STOCK_RECEIPT_IMAGES_BUCKET = "stock-receipts";

type ReceiveStockField = "productId" | "totalQuantity";
type ReceiveStockItemInput = {
  productId: string;
  quantityReceived: number;
  unit: string;
  unitCost: number;
};

export type ReceiveStockActionState = {
  fieldErrors: Partial<Record<ReceiveStockField, string>>;
  message: string;
  status: "error" | "idle" | "success";
};

export type AdjustStockActionState = {
  message: string;
  status: "error" | "idle" | "success";
};

function revalidateStockSurfaces(organizationId: string) {
  revalidateTag(`stock-${organizationId}`, "max");
  revalidateTag(`orders-${organizationId}`, "max");
  revalidateTag(`settings-${organizationId}`, "max");

  updateTag(`stock-${organizationId}`);
  updateTag(`orders-${organizationId}`);
  updateTag(`settings-${organizationId}`);

  revalidatePath("/stock");
  revalidatePath("/stock/movements");
  revalidatePath("/settings/stock");
  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  revalidatePath("/dashboard");
}

function getText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getNumber(formData: FormData, key: string) {
  const value = Number(String(formData.get(key) ?? "").replace(/,/g, "").trim());
  return Number.isFinite(value) ? value : Number.NaN;
}

export async function getStockReceiptDetailAction(receiptId: string): Promise<StockReceiptDetail | null> {
  const session = await requireAppRole("admin");
  return getStockReceiptDetail(session.organizationId, receiptId);
}

export async function receiveStockAction(
  _prevState: ReceiveStockActionState,
  formData: FormData,
): Promise<ReceiveStockActionState> {
  const session = await requireAppRole("admin");

  const itemsJson = getText(formData, "itemsJson");
  let items: ReceiveStockItemInput[] = [];

  if (itemsJson) {
    try {
      items = JSON.parse(itemsJson) as ReceiveStockItemInput[];
    } catch (error) {
      console.error("[receiveStockAction] JSON parse error:", error);
    }
  } else {
    const productId = getText(formData, "productId");
    const totalQuantity = getNumber(formData, "totalQuantity");
    const baseUnit = getText(formData, "baseUnit");
    const avgUnitCost = getNumber(formData, "avgUnitCost");

    if (productId && totalQuantity > 0) {
      items = [
        {
          productId,
          quantityReceived: totalQuantity,
          unit: baseUnit,
          unitCost: Number.isFinite(avgUnitCost) && avgUnitCost >= 0 ? avgUnitCost : 0,
        },
      ];
    }
  }

  const receiptNumberInput = getText(formData, "receiptNumber");
  let receiptNumber = receiptNumberInput;

  const admin = getSupabaseAdmin();

  if (!receiptNumber) {
    const { data: generatedNumber, error: generateError } = await admin.rpc("generate_receipt_number", {
      p_organization_id: session.organizationId,
    });

    if (!generateError && generatedNumber) {
      receiptNumber = generatedNumber;
    } else {
      receiptNumber = `RCV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    }
  }

  const supplierId = getText(formData, "supplierId") || null;
  const supplierName = getText(formData, "supplierName") || "ผู้ขาย";
  const receivedAt = getText(formData, "receivedAt");
  const notes = getText(formData, "notes");
  const imageFile = formData.get("receiptImage") as File | null;

  if (items.length === 0) {
    return {
      fieldErrors: {},
      message: "กรุณาเลือกรายการสินค้าและระบุจำนวนก่อนบันทึก",
      status: "error",
    };
  }

  let receiptUrl: string | null = null;

  if (imageFile && imageFile.size > 0) {
    try {
      const supabase = await createActionClient();
      const fileExt = imageFile.name.split(".").pop() || "jpg";
      const fileName = `${session.organizationId}/${receiptNumber}.${fileExt}`;
      const buffer = Buffer.from(await imageFile.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from(STOCK_RECEIPT_IMAGES_BUCKET)
        .upload(fileName, buffer, {
          contentType: imageFile.type,
          upsert: true,
        });

      if (uploadError) {
        console.error("[receiveStockAction:upload]", uploadError);
        return {
          fieldErrors: {},
          message: `อัปโหลดรูปบิลไม่สำเร็จ: ${uploadError.message}`,
          status: "error",
        };
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(STOCK_RECEIPT_IMAGES_BUCKET).getPublicUrl(fileName);

      receiptUrl = publicUrl;
    } catch (error) {
      console.error("[receiveStockAction:upload_catch]", error);
      return {
        fieldErrors: {},
        message: "เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ",
        status: "error",
      };
    }
  }

  const { error } = await admin.rpc("create_inventory_receipt", {
    p_created_by: session.userId,
    p_items: items,
    p_notes: notes,
    p_organization_id: session.organizationId,
    p_receipt_number: receiptNumber,
    p_received_at: receivedAt ? new Date(receivedAt).toISOString() : new Date().toISOString(),
    p_supplier_name: supplierName,
    p_receipt_url: receiptUrl,
    p_supplier_id: supplierId,
  });

  if (error) {
    return {
      fieldErrors: {},
      message: error.message ?? "ระบบบันทึกรับเข้าไม่สำเร็จ",
      status: "error",
    };
  }

  revalidatePath("/stock");
  revalidatePath("/stock/history");
  revalidatePath("/settings/stock");
  revalidatePath("/settings/products");

  return {
    fieldErrors: {},
    message: "บันทึกรับสินค้าเข้าเรียบร้อยแล้ว",
    status: "success",
  };
}

export type BulkReceiveItem = {
  productId: string;
  quantityReceived: number;
  unit: string;
  unitRatio: number;
};

export async function bulkReceiveStockAction(
  items: BulkReceiveItem[],
  notes: string = "รับเข้าจากการตั้งเตือนสต็อกไม่พอ",
) {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();

  let receiptNumber = `RCV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const { data: generatedNumber, error: generateError } = await admin.rpc("generate_receipt_number", {
    p_organization_id: session.organizationId,
  });
  if (!generateError && generatedNumber) {
    receiptNumber = generatedNumber;
  }

  const { error } = await admin.rpc("create_inventory_receipt", {
    p_created_by: session.userId,
    p_items: items.map((item) => ({
      productId: item.productId,
      quantityReceived: item.quantityReceived,
      unit: item.unit,
      unitRatio: item.unitRatio,
      unitCost: 0,
    })),
    p_notes: notes,
    p_organization_id: session.organizationId,
    p_receipt_number: receiptNumber,
    p_received_at: new Date().toISOString(),
    p_supplier_name: "ดึงข้อมูลสต็อกฉุกเฉิน",
    p_supplier_id: null,
  });

  if (error) {
    return { success: false, message: error.message ?? "ระบบบันทึกรับเข้าไม่สำเร็จ" };
  }

  revalidatePath("/stock");
  revalidatePath("/stock/history");
  revalidatePath("/settings/stock");
  revalidatePath("/settings/products");
  revalidatePath("/orders");

  return { success: true, message: "บันทึกรับสินค้าเข้าเรียบร้อยแล้ว" };
}

export async function adjustStockAction(
  _prevState: AdjustStockActionState,
  formData: FormData,
): Promise<AdjustStockActionState> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();

  const productId = getText(formData, "productId");
  const newQuantity = getNumber(formData, "newQuantity");
  const notes = getText(formData, "notes");

  if (!productId) {
    return { status: "error", message: "ไม่พบรหัสสินค้า" };
  }

  if (!Number.isFinite(newQuantity)) {
    return { status: "error", message: "กรุณาระบุจำนวนสินค้าให้ถูกต้อง" };
  }

  const { error } = await admin.rpc("adjust_inventory", {
    p_organization_id: session.organizationId,
    p_product_id: productId,
    p_new_stock_quantity: newQuantity,
    p_adjusted_by: session.userId,
    p_notes: notes || "ปรับปรุงสต็อกด้วยตนเอง",
  });

  if (error) {
    console.error("[adjustStockAction] Error:", error);
    return { status: "error", message: error.message || "ไม่สามารถปรับปรุงสต็อกได้" };
  }

  revalidateStockSurfaces(session.organizationId);

  return { status: "success", message: "ปรับปรุงยอดสต็อกเรียบร้อยแล้ว" };
}

export type UpdateStockReceiptActionState = {
  fieldErrors: Partial<Record<"receivedAt" | "supplierId" | "supplierName" | "notes" | "items", string>>;
  message: string;
  status: "error" | "idle" | "success";
};

export async function updateStockReceiptAction(
  _prevState: UpdateStockReceiptActionState,
  formData: FormData,
): Promise<UpdateStockReceiptActionState> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();

  const receiptId = getText(formData, "receiptId");
  const receivedAt = getText(formData, "receivedAt");
  const originalReceivedAt = getText(formData, "originalReceivedAt");
  const supplierId = getText(formData, "supplierId");
  const supplierName = getText(formData, "supplierName");
  const notes = getText(formData, "notes");

  const items: Array<{
    productId: string;
    quantityReceived: number;
    unit: string;
    unitCost: number;
  }> = [];

  let itemIndex = 0;
  while (true) {
    const productId = getText(formData, `items[${itemIndex}].productId`);
    const quantityReceived = getNumber(formData, `items[${itemIndex}].quantityReceived`);
    const unit = getText(formData, `items[${itemIndex}].unit`);
    const unitCost = getNumber(formData, `items[${itemIndex}].unitCost`);

    if (!productId) break;

    if (quantityReceived <= 0 || !unit || unitCost < 0) {
      return {
        status: "error",
        message: "Please enter valid item values. Quantity must be greater than 0 and cost cannot be negative.",
        fieldErrors: { items: "Invalid item data." },
      };
    }

    items.push({ productId, quantityReceived, unit, unitCost });
    itemIndex++;
  }

  if (!receiptId) {
    return { status: "error", message: "Receipt ID is missing.", fieldErrors: {} };
  }

  if (!receivedAt) {
    return {
      fieldErrors: { receivedAt: "Please choose the receipt date." },
      status: "error",
      message: "Please choose the receipt date.",
    };
  }

  if (items.length === 0) {
    return {
      status: "error",
      message: "At least one item is required.",
      fieldErrors: { items: "No items found." },
    };
  }

  try {
    const parsedDate = new Date(receivedAt + "T00:00:00");
    const originalDate = originalReceivedAt ? new Date(originalReceivedAt) : null;
    if (isNaN(parsedDate.getTime()) || (originalDate && isNaN(originalDate.getTime()))) {
      return {
        fieldErrors: { receivedAt: "Invalid date format." },
        status: "error",
        message: "Invalid date format.",
      };
    }

    const originalDateKey = originalReceivedAt ? originalReceivedAt.split("T")[0] : "";
    const nextReceivedAt =
      originalDate && originalDateKey
        ? originalDateKey === receivedAt
          ? originalDate.toISOString()
          : new Date(
              Date.UTC(
                parsedDate.getUTCFullYear(),
                parsedDate.getUTCMonth(),
                parsedDate.getUTCDate(),
                originalDate.getUTCHours(),
                originalDate.getUTCMinutes(),
                originalDate.getUTCSeconds(),
                originalDate.getUTCMilliseconds(),
              ),
            ).toISOString()
        : parsedDate.toISOString();

    const { error: receiptError } = await admin.rpc("update_inventory_receipt", {
      p_organization_id: session.organizationId,
      p_receipt_id: receiptId,
      p_received_at: nextReceivedAt,
      p_supplier_id: (supplierId || null) as unknown as string,
      p_supplier_name: (supplierName || null) as unknown as string,
      p_notes: (notes || null) as unknown as string,
      p_items: items as unknown as Json,
      p_updated_by: session.userId,
    });

    if (receiptError) {
      console.error("[updateStockReceiptAction] Receipt update error:", receiptError);
      return {
        status: "error",
        message: receiptError.message || "Failed to update the stock receipt.",
        fieldErrors: {},
      };
    }

    revalidatePath("/stock/history");
    revalidatePath("/stock");
    revalidatePath("/settings/stock");
    revalidatePath("/orders");
    revalidatePath("/orders/incoming");

    return {
      status: "success",
      message: "Stock receipt updated successfully.",
      fieldErrors: {},
    };
  } catch (error) {
    console.error("[updateStockReceiptAction] Unexpected error:", error);
    return {
      status: "error",
      message: "Unexpected error while updating the stock receipt.",
      fieldErrors: {},
    };
  }
}
