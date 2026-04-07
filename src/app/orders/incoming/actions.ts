"use server";

import { revalidatePath } from "next/cache";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTodayInBangkok } from "@/lib/orders/date";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActionResult = { error: string } | { success: true; orderNumber?: string };

type SingleResult<T> = Promise<{ data: T | null; error: { message?: string } | null }>;
type ManyResult<T> = Promise<{ data: T[] | null; error: { message?: string } | null }>;

type OrderRow = {
  customer_id: string;
  id: string;
  order_date: string;
  order_number: string;
  organization_id: string;
  status: string;
  total_amount: number | string;
};

type OrderItemRow = {
  id: string;
  line_total: number | string;
  order_id: string;
  product_id: string;
  product_sale_unit_id: string | null;
  quantity: number | string;
  quantity_in_base_unit: number | string;
  sale_unit_label: string;
  sale_unit_ratio: number | string;
  unit_price: number | string;
};

type ProductStockRow = { reserved_quantity: number | string; stock_quantity: number | string };
type PriceRow = { product_id: string; product_sale_unit_id: string | null; sale_price: number | string };
type OrderIdRow = { id: string };
type NewOrderRow = { id: string };
type SelectChain<T> = {
  eq: (col: string, val: string) => SelectChain<T>;
  in: (col: string, vals: string[]) => ManyResult<T>;
  single: () => SingleResult<T>;
};

type UpdateChain = { eq: (col: string, val: string) => Promise<{ error: { message?: string } | null }> };
type DeleteChain = { eq: (col: string, val: string) => Promise<{ error: { message?: string } | null }> };
type InsertChain = Promise<{ error: { message?: string } | null }>;
type InsertSelectChain = {
  select: (cols: string) => { single: () => SingleResult<NewOrderRow> };
};

type ActionsAdmin = ReturnType<typeof getSupabaseAdmin> & {
  from(table: "orders"): {
    select: (cols: string) => SelectChain<OrderRow>;
    update: (vals: Record<string, unknown>) => UpdateChain;
    insert: (vals: Record<string, unknown>) => InsertSelectChain;
  };
  from(table: "order_items"): {
    select: (cols: string) => SelectChain<OrderItemRow>;
    update: (vals: Record<string, unknown>) => UpdateChain;
    insert: (vals: Record<string, unknown>) => InsertChain;
    delete: () => DeleteChain;
  };
  from(table: "products"): {
    select: (cols: string) => SelectChain<ProductStockRow>;
    update: (vals: Record<string, unknown>) => UpdateChain;
  };
  from(table: "inventory_movements"): {
    insert: (vals: Record<string, unknown>) => InsertChain;
  };
  from(table: "customer_product_prices"): {
    select: (cols: string) => SelectChain<PriceRow>;
  };
  from(table: "product_sale_units"): {
    select: (cols: string) => SelectChain<{ id: string; unit_label: string; base_unit_quantity: number | string }>;
  };
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

// For the remaining-items check (need .eq().select() chain returning id array)
type SimpleSelectChain = {
  eq: (col: string, val: string) => Promise<{ data: OrderIdRow[] | null; error: unknown }>;
};
type MinimalAdmin = { from(table: string): { select: (cols: string) => SimpleSelectChain } };

export type CustomerYesterdayItem = {
  productId: string;
  quantity: number;
  saleUnitBaseQty: number;
  saleUnitId: string | null;
  saleUnitLabel: string;
  unitPrice: number;
};

export type CustomerYesterdaySnapshot = {
  items: CustomerYesterdayItem[];
  orderCount: number;
  sourceDate: string;
};

function getPreviousDate(isoDate: string) {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? isoDate : getTodayInBangkok();
  const [year, month, day] = safeDate.split("-").map((value) => Number(value));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

// ─── Helper: release reserved stock ──────────────────────────────────────────

async function releaseItemStock(
  admin: ActionsAdmin,
  orgId: string,
  userId: string,
  productId: string,
  qtyBase: number,
  note: string,
) {
  if (qtyBase <= 0) return;

  const { data: product } = await admin
    .from("products")
    .select("stock_quantity, reserved_quantity")
    .eq("id", productId)
    .single();

  if (!product) return;

  const stockQty = Number(product.stock_quantity);
  const newReserved = Math.max(0, Number(product.reserved_quantity) - qtyBase);

  await Promise.all([
    admin.from("products").update({ reserved_quantity: newReserved }).eq("id", productId),
    admin.from("inventory_movements").insert({
      created_by: userId,
      metadata: { source: "order_management" },
      movement_type: "release",
      notes: note,
      organization_id: orgId,
      product_id: productId,
      quantity_delta: qtyBase,
      stock_after: stockQty,
      stock_before: stockQty,
    }),
  ]);
}

// ─── Cancel order ─────────────────────────────────────────────────────────────

export async function cancelOrderAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;
  const orderId = String(formData.get("orderId") ?? "").trim();

  if (!orderId) return { error: "ไม่พบรหัสออเดอร์" };

  const { data: order } = await admin
    .from("orders")
    .select("id, status, order_number, organization_id")
    .eq("id", orderId)
    .eq("organization_id", session.organizationId)
    .single();

  if (!order) return { error: "ไม่พบออเดอร์นี้" };
  if (order.status !== "submitted") return { error: "ยกเลิกได้เฉพาะออเดอร์สถานะ 'รับแล้ว' เท่านั้น" };

  const { data: items } = await admin
    .from("order_items")
    .select("product_id, quantity_in_base_unit")
    .eq("order_id", orderId)
    .in("order_id", [orderId]);

  await Promise.all(
    (items ?? []).map((item) =>
      releaseItemStock(
        admin,
        session.organizationId,
        session.userId,
        item.product_id,
        Number(item.quantity_in_base_unit),
        `ยกเลิกออเดอร์ ${order.order_number}`,
      ),
    ),
  );

  await admin.from("orders").update({ status: "cancelled" }).eq("id", orderId);

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  return { success: true };
}

// ─── Update item quantity ─────────────────────────────────────────────────────

export async function updateOrderItemQtyAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;
  const itemId = String(formData.get("itemId") ?? "").trim();
  const newQty = Number(formData.get("quantity"));

  if (!itemId || !Number.isFinite(newQty) || newQty <= 0) return { error: "ข้อมูลไม่ถูกต้อง" };

  const { data: item } = await admin
    .from("order_items")
    .select("order_id, product_id, quantity, quantity_in_base_unit, sale_unit_ratio, unit_price")
    .eq("id", itemId)
    .single();

  if (!item) return { error: "ไม่พบรายการสินค้า" };

  const { data: order } = await admin
    .from("orders")
    .select("id, status, organization_id, total_amount, order_number")
    .eq("id", item.order_id)
    .single();

  if (!order || order.organization_id !== session.organizationId) return { error: "ไม่พบออเดอร์" };
  if (order.status !== "submitted") return { error: "แก้ไขได้เฉพาะออเดอร์สถานะ 'รับแล้ว'" };

  const oldQty = Number(item.quantity);
  const ratio = Number(item.sale_unit_ratio) || 1;
  const unitPrice = Number(item.unit_price);
  const newQtyBase = newQty * ratio;
  const oldQtyBase = Number(item.quantity_in_base_unit);
  const qtyDelta = newQtyBase - oldQtyBase;
  const newLineTotal = newQty * unitPrice;
  const oldLineTotal = oldQty * unitPrice;
  const newTotal = Math.max(0, Number(order.total_amount) + (newLineTotal - oldLineTotal));

  await admin
    .from("order_items")
    .update({ line_total: newLineTotal, quantity: newQty, quantity_in_base_unit: newQtyBase })
    .eq("id", itemId);

  await admin
    .from("orders")
    .update({ subtotal_amount: newTotal, total_amount: newTotal })
    .eq("id", item.order_id);

  if (qtyDelta !== 0) {
    const { data: product } = await admin
      .from("products")
      .select("reserved_quantity, stock_quantity")
      .eq("id", item.product_id)
      .single();

    if (product) {
      const stockQty = Number(product.stock_quantity);
      const newReserved = Math.max(0, Number(product.reserved_quantity) + qtyDelta);
      await Promise.all([
        admin.from("products").update({ reserved_quantity: newReserved }).eq("id", item.product_id),
        admin.from("inventory_movements").insert({
          created_by: session.userId,
          metadata: { order_id: item.order_id, order_item_id: itemId, source: "order_management" },
          movement_type: qtyDelta > 0 ? "reserve" : "release",
          notes: `แก้ไขจำนวน ออเดอร์ ${order.order_number}`,
          organization_id: session.organizationId,
          product_id: item.product_id,
          quantity_delta: Math.abs(qtyDelta),
          stock_after: stockQty,
          stock_before: stockQty,
        }),
      ]);
    }
  }

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  return { success: true };
}

// ─── Remove item ──────────────────────────────────────────────────────────────

export async function removeOrderItemAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;
  const itemId = String(formData.get("itemId") ?? "").trim();

  if (!itemId) return { error: "ไม่พบรหัสรายการ" };

  const { data: item } = await admin
    .from("order_items")
    .select("order_id, product_id, quantity_in_base_unit, line_total")
    .eq("id", itemId)
    .single();

  if (!item) return { error: "ไม่พบรายการสินค้า" };

  const { data: order } = await admin
    .from("orders")
    .select("id, status, organization_id, total_amount, order_number")
    .eq("id", item.order_id)
    .single();

  if (!order || order.organization_id !== session.organizationId) return { error: "ไม่พบออเดอร์" };
  if (order.status !== "submitted") return { error: "แก้ไขได้เฉพาะออเดอร์สถานะ 'รับแล้ว'" };

  const qtyBase = Number(item.quantity_in_base_unit);
  const lineTotal = Number(item.line_total);

  await admin.from("order_items").delete().eq("id", itemId);
  await releaseItemStock(
    admin,
    session.organizationId,
    session.userId,
    item.product_id,
    qtyBase,
    `ลบรายการจากออเดอร์ ${order.order_number}`,
  );

  const newTotal = Math.max(0, Number(order.total_amount) - lineTotal);
  await admin
    .from("orders")
    .update({ subtotal_amount: newTotal, total_amount: newTotal })
    .eq("id", item.order_id);

  // Auto-cancel if no items remain
  const minAdmin = getSupabaseAdmin() as unknown as MinimalAdmin;
  const { data: remaining } = await minAdmin
    .from("order_items")
    .select("id")
    .eq("order_id", item.order_id);

  if (!remaining || remaining.length === 0) {
    await admin.from("orders").update({ status: "cancelled" }).eq("id", item.order_id);
  }

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  return { success: true };
}

// ─── Fetch customer prices (called from client create-order modal) ─────────────

export async function fetchCustomerPricesAction(
  customerId: string,
): Promise<Record<string, number>> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;

  const { data } = await admin
    .from("customer_product_prices")
    .select("product_sale_unit_id, product_id, sale_price")
    .eq("customer_id", customerId)
    .eq("organization_id", session.organizationId)
    .in("customer_id", [customerId]);

  const result: Record<string, number> = {};
  for (const row of data ?? []) {
    const key = row.product_sale_unit_id ?? row.product_id;
    result[key] = Number(row.sale_price);
  }
  return result;
}

export async function fetchCustomerYesterdayItemsAction(
  customerId: string,
  orderDate: string,
): Promise<CustomerYesterdaySnapshot> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;

  if (!customerId) {
    return { items: [], orderCount: 0, sourceDate: getPreviousDate(orderDate) };
  }

  const sourceDate = getPreviousDate(orderDate);

  const { data: orders } = await admin
    .from("orders")
    .select("id, customer_id, order_date")
    .eq("organization_id", session.organizationId)
    .eq("customer_id", customerId)
    .eq("order_date", sourceDate)
    .in("status", ["submitted", "confirmed"]);

  const orderIds = (orders ?? []).map((row) => row.id);
  if (orderIds.length === 0) {
    return { items: [], orderCount: 0, sourceDate };
  }

  const { data: orderItems } = await admin
    .from("order_items")
    .select("product_id, product_sale_unit_id, quantity, sale_unit_label, sale_unit_ratio, unit_price")
    .in("order_id", orderIds);

  const grouped = new Map<string, CustomerYesterdayItem>();
  for (const row of orderItems ?? []) {
    const saleUnitId = row.product_sale_unit_id;
    const key = `${row.product_id}__${saleUnitId ?? "__default__"}`;
    const quantity = Number(row.quantity);
    const saleUnitBaseQty = Number(row.sale_unit_ratio) || 1;
    const unitPrice = Number(row.unit_price) || 0;

    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += quantity;
      continue;
    }

    grouped.set(key, {
      productId: row.product_id,
      quantity,
      saleUnitBaseQty,
      saleUnitId,
      saleUnitLabel: row.sale_unit_label,
      unitPrice,
    });
  }

  return {
    items: Array.from(grouped.values()),
    orderCount: orderIds.length,
    sourceDate,
  };
}

// ─── Create manual order ──────────────────────────────────────────────────────

type ManualOrderItem = {
  productId: string;
  quantity: number;
  saleUnitBaseQty: number;
  saleUnitId: string | null;
  saleUnitLabel: string;
  unitPrice: number;
};

export async function createManualOrderAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;

  const customerId = String(formData.get("customerId") ?? "").trim();
  const channel = String(formData.get("channel") ?? "created").trim();
  const orderDate = String(formData.get("orderDate") ?? getTodayInBangkok()).trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const itemsJson = String(formData.get("items") ?? "[]");

  let items: ManualOrderItem[];
  try {
    items = JSON.parse(itemsJson) as ManualOrderItem[];
  } catch {
    return { error: "ข้อมูลสินค้าไม่ถูกต้อง" };
  }

  if (!customerId) return { error: "กรุณาเลือกลูกค้า" };
  if (items.length === 0) return { error: "กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ" };

  const { data: orderNumber } = await admin.rpc("next_order_number", {
    p_order_date: orderDate,
    p_organization_id: session.organizationId,
  });

  if (!orderNumber) return { error: "ไม่สามารถสร้างเลขออเดอร์ได้" };

  const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const { data: newOrder } = await admin
    .from("orders")
    .insert({
      customer_id: customerId,
      fulfillment_status: "pending",
      metadata: { channel, source: "manual" },
      notes,
      order_date: orderDate,
      order_number: String(orderNumber),
      organization_id: session.organizationId,
      placed_by_user_id: session.userId,
      status: "submitted",
      subtotal_amount: totalAmount,
      total_amount: totalAmount,
    })
    .select("id")
    .single();

  if (!newOrder) return { error: "ไม่สามารถสร้างออเดอร์ได้" };

  const orderId = newOrder.id;

  for (const item of items) {
    const qtyBase = item.quantity * item.saleUnitBaseQty;
    const lineTotal = item.quantity * item.unitPrice;

    await admin.from("order_items").insert({
      cost_price: 0,
      line_total: lineTotal,
      order_id: orderId,
      organization_id: session.organizationId,
      product_id: item.productId,
      product_sale_unit_id: item.saleUnitId,
      quantity: item.quantity,
      quantity_in_base_unit: qtyBase,
      sale_unit_label: item.saleUnitLabel,
      sale_unit_ratio: item.saleUnitBaseQty,
      unit_price: item.unitPrice,
    });

    if (qtyBase > 0) {
      const { data: product } = await admin
        .from("products")
        .select("reserved_quantity, stock_quantity")
        .eq("id", item.productId)
        .single();

      if (product) {
        const stockQty = Number(product.stock_quantity);
        await Promise.all([
          admin
            .from("products")
            .update({ reserved_quantity: Number(product.reserved_quantity) + qtyBase })
            .eq("id", item.productId),
          admin.from("inventory_movements").insert({
            created_by: session.userId,
            metadata: { channel, order_id: orderId, source: "manual_order" },
            movement_type: "reserve",
            notes: `ออเดอร์ manual: ${String(orderNumber)}`,
            organization_id: session.organizationId,
            product_id: item.productId,
            quantity_delta: qtyBase,
            stock_after: stockQty,
            stock_before: stockQty,
          }),
        ]);
      }
    }
  }

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  return { success: true, orderNumber: String(orderNumber) };
}
