"use server";

import { revalidatePath } from "next/cache";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrderItemsForDelivery, getStoreOrdersForDelivery } from "@/lib/delivery/admin";
import type { DeliveryFormData } from "@/lib/delivery/admin";

// ─── Get form data ─────────────────────────────────────────────────────────────

export async function getDeliveryFormDataAction(
  orderId: string,
): Promise<DeliveryFormData | null> {
  const session = await requireAppRole("admin");
  return getOrderItemsForDelivery(session.organizationId, orderId);
}

export async function getStoreDeliveryDataAction(
  customerId: string,
  orderDate: string,
): Promise<DeliveryFormData[]> {
  const session = await requireAppRole("admin");
  return getStoreOrdersForDelivery(session.organizationId, customerId, orderDate);
}

export async function getBatchStoreDeliveryDataAction(
  customerIds: string[],
  orderDate: string,
): Promise<Record<string, DeliveryFormData[]>> {
  const session = await requireAppRole("admin");
  const uniqueCustomerIds = Array.from(
    new Set(customerIds.map((id) => id.trim()).filter(Boolean)),
  );

  if (uniqueCustomerIds.length === 0) {
    return {};
  }

  const rows = await Promise.all(
    uniqueCustomerIds.map(async (customerId) => {
      const orders = await getStoreOrdersForDelivery(
        session.organizationId,
        customerId,
        orderDate,
      );
      return [customerId, orders] as const;
    }),
  );

  return Object.fromEntries(rows);
}

// ─── Create delivery note ──────────────────────────────────────────────────────

export type CreateDeliveryState = {
  message: string;
  status: "idle" | "success" | "error";
  deliveryNumber?: string;
  deliveryId?: string;
};

function bangkokTodayIsoDate() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
}

type RpcAdmin = ReturnType<typeof getSupabaseAdmin> & {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  from: (table: "delivery_notes") => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          single: () => Promise<{ data: { id: string } | null }>;
        };
      };
    };
  };
};

export async function createDeliveryNoteAction(
  _prev: CreateDeliveryState | null,
  formData: FormData,
): Promise<CreateDeliveryState> {
  const session = await requireAppRole("admin");

  const orderIdsJson = String(formData.get("orderIds") ?? "[]");
  const customerId = String(formData.get("customerId") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const itemsJson = String(formData.get("items") ?? "[]");

  let orderIds: string[];
  try {
    orderIds = JSON.parse(orderIdsJson);
  } catch {
    return { status: "error", message: "ข้อมูลออเดอร์ไม่ถูกต้อง" };
  }

  if (!Array.isArray(orderIds) || orderIds.length === 0 || !customerId) {
    return { status: "error", message: "ข้อมูลออเดอร์ไม่ครบถ้วน" };
  }

  let items: unknown[];
  try {
    items = JSON.parse(itemsJson);
  } catch {
    return { status: "error", message: "ข้อมูลสินค้าไม่ถูกต้อง" };
  }

  if (!Array.isArray(items) || items.length === 0) {
    return { status: "error", message: "ต้องใส่จำนวนส่งอย่างน้อย 1 รายการ" };
  }

  const admin = getSupabaseAdmin() as unknown as RpcAdmin;

  const { data, error } = await admin.rpc("create_store_delivery_note", {
    p_organization_id: session.organizationId,
    p_order_ids: orderIds,
    p_customer_id: customerId,
    p_vehicle_id: null,
    p_delivery_date: bangkokTodayIsoDate(),
    p_notes: notes || null,
    p_created_by: session.userId,
    p_items: items,
  });

  if (error) {
    return {
      status: "error",
      message: error.message ?? "สร้างใบส่งของไม่สำเร็จ",
    };
  }

  revalidatePath("/orders");
  revalidatePath("/stock");
  revalidatePath("/settings/stock");

  const deliveryNumber = String(data);
  const { data: dnRow } = await admin
    .from("delivery_notes")
    .select("id")
    .eq("organization_id", session.organizationId)
    .eq("delivery_number", deliveryNumber)
    .single();

  return {
    status: "success",
    message: "สร้างใบส่งของเรียบร้อยแล้ว",
    deliveryNumber,
    deliveryId: (dnRow as { id: string } | null)?.id,
  };
}
