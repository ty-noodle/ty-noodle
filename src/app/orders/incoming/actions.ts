"use server";

import { revalidatePath, revalidateTag, updateTag } from "next/cache";
import { after } from "next/server";
import { requireAppRole } from "@/lib/auth/authorization";
import { linkLineCustomerAndConvertPendingOrders } from "@/lib/orders/line-pending";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTodayInBangkok } from "@/lib/orders/date";
import { getEffectiveSaleUnitCost } from "@/lib/products/sale-unit-cost";
import { getCustomersForOrder, getProductsForOrder, type OrderCustomerOption, type OrderProductOption } from "@/lib/orders/manage";
import { getIncomingOrders, getOrderDetailById, type IncomingOrderListItem, type OrderDetailData } from "@/lib/orders/detail";
import { syncBillingSnapshotsForDeliveryNumbers } from "@/lib/billing/actions";
import { revalidateDashboardPages } from "@/lib/dashboard/revalidate-dashboard-pages";
import { mergeItemsIntoOrder, type MergeableOrderItemInput } from "@/lib/orders/merge-order-items";
import { notifyUpdatedCustomerReceiptForOrder } from "@/lib/orders/notify-customer-receipt";
import { syncDeliveryNoteForOrder } from "@/lib/orders/sync-delivery-note";
import {
  calculateBaseQuantity,
  calculateLineTotal,
  isValidOrderQuantity,
} from "@/lib/orders/quantity-rules";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ActionResult, CustomerLastOrderSnapshot, CustomerLastOrderItem } from "./types";



type OrderIdRow = { id: string };

type ActionsAdmin = SupabaseClient<Database>;

// For the remaining-items check (need .eq().select() chain returning id array)
type SimpleSelectChain = {
  eq: (col: string, val: string) => Promise<{ data: OrderIdRow[] | null; error: unknown }>;
};
type MinimalAdmin = { from(table: string): { select: (cols: string) => SimpleSelectChain } };

type StockReductionMode = "return" | "lost";

function isEditableOrderStatus(status: string | null | undefined) {
  return status !== "cancelled";
}

function mergeOrderNotes(existingNotes: string | null, nextNotes: string | null) {
  const current = existingNotes?.trim() ?? "";
  const incoming = nextNotes?.trim() ?? "";

  if (!incoming) return current || null;
  if (!current) return incoming;
  if (current.includes(incoming)) return current;
  return `${current} / ${incoming}`;
}

export async function fetchIncomingOrderDetailAction(
  orderId: string,
): Promise<{ detail: OrderDetailData | null; error?: string }> {
  const session = await requireAppRole("admin");
  const id = orderId.trim();

  if (!id) return { detail: null, error: "ไม่พบรหัสออเดอร์" };

  const admin = getSupabaseAdmin() as ActionsAdmin;
  const { data, error } = await admin
    .from("orders")
    .select("id")
    .eq("id", id)
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  if (error) return { detail: null, error: error.message ?? "โหลดรายละเอียดออเดอร์ไม่สำเร็จ" };
  if (!data) return { detail: null, error: "ไม่พบออเดอร์นี้ในองค์กรของคุณ" };

  const detail = await getOrderDetailById(session.organizationId, id);
  return { detail };
}

export async function fetchIncomingOrderModalDataAction(
  orderId: string,
  orderDate: string,
): Promise<{
  allOrders: IncomingOrderListItem[];
  detail: OrderDetailData | null;
  error?: string;
  products: OrderProductOption[];
}> {
  const session = await requireAppRole("admin");
  const id = orderId.trim();

  if (!id) {
    return {
      allOrders: [],
      detail: null,
      error: "ไม่พบรหัสออเดอร์",
      products: [],
    };
  }

  const safeOrderDate = /^\d{4}-\d{2}-\d{2}$/.test(orderDate) ? orderDate : getTodayInBangkok();

  const admin = getSupabaseAdmin() as ActionsAdmin;
  const { data, error } = await admin
    .from("orders")
    .select("id")
    .eq("id", id)
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  if (error) {
    return {
      allOrders: [],
      detail: null,
      error: error.message ?? "โหลดรายละเอียดออเดอร์ไม่สำเร็จ",
      products: [],
    };
  }

  if (!data) {
    return {
      allOrders: [],
      detail: null,
      error: "ไม่พบออเดอร์นี้ในองค์กรของคุณ",
      products: [],
    };
  }

  const [detail, allOrders, products] = await Promise.all([
    getOrderDetailById(session.organizationId, id),
    getIncomingOrders(session.organizationId, { orderDate: safeOrderDate }),
    getProductsForOrder(session.organizationId),
  ]);

  return { allOrders, detail, products };
}

function getPreviousDate(isoDate: string) {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? isoDate : getTodayInBangkok();
  const [year, month, day] = safeDate.split("-").map((value) => Number(value));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

async function restoreItemStock(
  admin: ActionsAdmin,
  orgId: string,
  userId: string,
  productId: string,
  qtyBase: number,
  note: string,
) {
  const { data: product } = await admin
    .from("products")
    .select("id, stock_quantity")
    .eq("id", productId)
    .eq("organization_id", orgId)
    .single();

  if (!product) return;

  const stockBefore = Number(product.stock_quantity ?? 0);
  const stockAfter = stockBefore + Number(qtyBase || 0);

  await Promise.all([
    admin.from("products").update({ stock_quantity: stockAfter }).eq("id", productId),
    admin.from("inventory_movements").insert({
      created_by: userId,
      movement_type: "adjustment",
      notes: note,
      organization_id: orgId,
      product_id: productId,
      quantity_delta: qtyBase,
      stock_after: stockAfter,
      stock_before: stockBefore,
    }),
  ]);
}



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
  if (order.status !== "submitted" && order.status !== "confirmed") return { error: "ยกเลิกได้เฉพาะออเดอร์สถานะ 'รับแล้ว' หรือ 'ยืนยันแล้ว' เท่านั้น" };

  // If confirmed, it might have delivery note items that deducted stock.
  // We need to clean them up.
  if (order.status === "confirmed") {
    // Delete delivery note items for this order and restore stock
    // Actually restoreItemStock already handles stock, but we should make sure we only restore what was DELIVERED if it's different.
    // In this system, we usually deliver 100% of order quantity.
  }

  const { data: items } = await admin
    .from("order_items")
    .select("product_id, quantity_in_base_unit")
    .eq("order_id", orderId);

  await Promise.all(
    (items ?? []).map((item) =>
      restoreItemStock(
        admin,
        session.organizationId,
        session.userId,
        item.product_id,
        Number(item.quantity_in_base_unit),
        `ยกเลิกออเดอร์ ${order.order_number}`,
      ),
    ),
  );

  // If there are delivery note items, delete them
  await admin.from("delivery_note_items").delete().eq("order_id", orderId);

  await admin.from("orders").update({ status: "cancelled", fulfillment_status: "pending" }).eq("id", orderId);

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  revalidateDashboardPages();
  return { success: true };
}



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
  if (!isEditableOrderStatus(order.status)) return { error: "ออเดอร์ที่ยกเลิกแล้วไม่สามารถแก้ไขได้" };

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

  if (qtyDelta !== 0 && order.status === "submitted") {
    const { data: product } = await admin
      .from("products")
      .select("stock_quantity")
      .eq("id", item.product_id)
      .single();

    if (product) {
      const stockBefore = Number(product.stock_quantity);
      // qtyDelta > 0 means more items ordered -> deduct stock
      // qtyDelta < 0 means fewer items ordered -> restore stock
      const stockAfter = stockBefore - qtyDelta;

      await Promise.all([
        admin.from("products").update({ stock_quantity: stockAfter }).eq("id", item.product_id),
        admin.from("inventory_movements").insert({
          created_by: session.userId,
          metadata: { order_id: item.order_id, order_item_id: itemId, source: "order_management" },
          movement_type: qtyDelta > 0 ? "issue" : "adjustment",
          notes: `แก้ไขจำนวน ออเดอร์ ${order.order_number}`,
          organization_id: session.organizationId,
          product_id: item.product_id,
          quantity_delta: -qtyDelta,
          stock_after: stockAfter,
          stock_before: stockBefore,
        }),

      ]);
    }
  }

  if (order.status === "confirmed") {
    const syncRes = await syncOrderDeliveryNoteAction(item.order_id);
    if ("error" in syncRes) {
      return { error: "ปรับปรุงใบส่งของไม่สำเร็จ: " + syncRes.error };
    }
  }

  after(() => {
    notifyUpdatedCustomerReceiptForOrder(admin, {
      orderId: item.order_id,
      organizationId: session.organizationId,
    }).catch((err) => {
      console.error("Background notify error:", err);
    });
  });

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  revalidatePath("/billing");
  revalidatePath("/settings/customers/pricing");
  revalidateDashboardPages();
  return { success: true };
}



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
  if (!isEditableOrderStatus(order.status)) return { error: "ออเดอร์ที่ยกเลิกแล้วไม่สามารถแก้ไขได้" };

  const qtyBase = Number(item.quantity_in_base_unit);
  const lineTotal = Number(item.line_total);

  await admin.from("order_items").delete().eq("id", itemId);
  if (order.status === "submitted") {
    await restoreItemStock(
      admin,
      session.organizationId,
      session.userId,
      item.product_id,
      qtyBase,
      `ลบรายการจากออเดอร์ ${order.order_number}`,
    );
  }

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

  if (order.status === "confirmed") {
    const syncRes = await syncOrderDeliveryNoteAction(item.order_id);
    if ("error" in syncRes) {
      return { error: "ปรับปรุงใบส่งของไม่สำเร็จ: " + syncRes.error };
    }
  }

  after(() => {
    notifyUpdatedCustomerReceiptForOrder(admin, {
      orderId: item.order_id,
      organizationId: session.organizationId,
    }).catch((err) => {
      console.error("Background notify error:", err);
    });
  });

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  revalidatePath("/billing");
  revalidateDashboardPages();
  return { success: true };
}



export async function updateCustomerVehicleFromIncomingOrderAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();
  const customerId = String(formData.get("customerId") ?? "").trim();
  const vehicleId = String(formData.get("vehicleId") ?? "").trim();
  const orderDate = String(formData.get("orderDate") ?? "").trim();

  if (!customerId || !vehicleId) {
    return { error: "กรุณาเลือกรถส่งของ" };
  }

  const { data: vehicle, error: vehicleError } = await admin
    .from("vehicles")
    .select("id")
    .eq("organization_id", session.organizationId)
    .eq("id", vehicleId)
    .eq("is_active", true)
    .maybeSingle();

  if (vehicleError || !vehicle) {
    return { error: "ไม่พบรถส่งของที่เลือก" };
  }

  // 1. Update customer's default vehicle
  const { error } = await admin
    .from("customers")
    .update({
      default_vehicle_id: vehicleId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId)
    .eq("organization_id", session.organizationId)
    .eq("is_active", true);

  if (error) {
    return { error: error.message ?? "บันทึกรถส่งของไม่สำเร็จ" };
  }

  // 2. If orderDate is provided, also update existing delivery notes for this customer on that day
  if (orderDate && /^\d{4}-\d{2}-\d{2}$/.test(orderDate)) {
    await admin
      .from("delivery_notes")
      .update({ vehicle_id: vehicleId })
      .eq("customer_id", customerId)
      .eq("delivery_date", orderDate)
      .eq("organization_id", session.organizationId);
  }

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  revalidatePath("/delivery");
  revalidatePath("/settings/customers");
  return { success: true };
}



export async function updateOrderItemsBatchAction(input: {
  orderId: string;
  notes?: string | null;
  removedIds: string[];
  updates: { itemId: string; quantity: number; unitPrice?: number; reductionMode?: StockReductionMode }[];
  additions: {
    productId: string;
    productSaleUnitId: string | null;
    quantity: number;
    unitPrice: number;
  }[];
}): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;
  const { orderId, notes, removedIds, updates, additions } = input;

  if (!orderId) return { error: "ไม่พบเลขออเดอร์" };

  // 1. Verify order
  const { data: order } = await admin
    .from("orders")
    .select("id, status, organization_id, customer_id, order_number, total_amount")
    .eq("id", orderId)
    .single();

  if (!order || order.organization_id !== session.organizationId) return { error: "ไม่พบออเดอร์" };
  if (!isEditableOrderStatus(order.status)) {
    return { error: "ออเดอร์ที่ยกเลิกแล้วไม่สามารถแก้ไขได้" };
  }

  // 2. Parallel Data Gathering
  const itemIdsToFetch = [...removedIds, ...updates.map((u) => u.itemId)];
  const additionProductIds = additions.map((a) => a.productId);
  const additionSaleUnitIds = additions.map((a) => a.productSaleUnitId).filter(Boolean) as string[];

  const [itemsRes, additionProductsRes, additionSaleUnitsRes] = await Promise.all([
    itemIdsToFetch.length > 0
      ? admin.from("order_items").select("*").in("id", itemIdsToFetch)
      : Promise.resolve({ data: [] }),
    additionProductIds.length > 0
      ? admin.from("products").select("id, cost_price, stock_quantity").in("id", additionProductIds)
      : Promise.resolve({ data: [] }),
    additionSaleUnitIds.length > 0
      ? admin.from("product_sale_units").select("*").in("id", additionSaleUnitIds)
      : Promise.resolve({ data: [] }),
  ]);

  const itemsMap = new Map((itemsRes.data ?? []).map((i) => [i.id, i]));
  const productsMap = new Map((additionProductsRes.data ?? []).map((p) => [p.id, p]));
  const saleUnitsMap = new Map((additionSaleUnitsRes.data ?? []).map((s) => [s.id, s]));

  // Also need products for existing items to handle stock correctly
  const existingProductIds = Array.from(new Set((itemsRes.data ?? []).map((i) => i.product_id)));
  const missingProductIdsForStock = existingProductIds.filter((id) => !productsMap.has(id));
  if (missingProductIdsForStock.length > 0) {
    const { data: extraProducts } = await admin
      .from("products")
      .select("id, cost_price, stock_quantity")
      .in("id", missingProductIdsForStock);
    (extraProducts ?? []).forEach((p) => productsMap.set(p.id, p));
  }

  // Handle default sale units for additions that don't specify one
  const needsDefaultSaleUnit = additions.filter((a) => !a.productSaleUnitId).map((a) => a.productId);
  if (needsDefaultSaleUnit.length > 0) {
    const { data: defaultUnits } = await admin
      .from("product_sale_units")
      .select("*")
      .in("product_id", needsDefaultSaleUnit)
      .eq("is_default", true);
    (defaultUnits ?? []).forEach((s) => saleUnitsMap.set(`default-${s.product_id}`, s));
  }

  // 3. Prepare Batch Operations
  const itemsToUpdate: Database["public"]["Tables"]["order_items"]["Insert"][] = [];
  const itemsToInsert: Database["public"]["Tables"]["order_items"]["Insert"][] = [];
  const stockDeltas = new Map<string, number>(); // productId -> total qty_in_base_unit change (+ ordered, - ordered)
  const reductionChoiceMap = new Map<string, StockReductionMode>(
    updates
      .filter((update) => update.reductionMode === "return" || update.reductionMode === "lost")
      .map((update) => [update.itemId, update.reductionMode ?? "return"]),
  );
  const lossInBaseUnitByItemId = new Map<string, number>();

  // Removals
  for (const itemId of removedIds) {
    const item = itemsMap.get(itemId);
    if (item && order.status === "submitted") {
      const current = stockDeltas.get(item.product_id) || 0;
      stockDeltas.set(item.product_id, current - Number(item.quantity_in_base_unit));
    }
  }

  // Updates
  for (const update of updates) {
    const item = itemsMap.get(update.itemId);
    if (item) {
      const nextUnitPrice = Number.isFinite(update.unitPrice)
        ? Number(update.unitPrice)
        : Number(item.unit_price);
      const qtyChanged = Number(item.quantity) !== update.quantity;
      const priceChanged = Number(item.unit_price) !== nextUnitPrice;
      if (!qtyChanged && !priceChanged) {
        continue;
      }
      const ratio = Number(item.sale_unit_ratio) || 1;
      const newQtyBase = update.quantity * ratio;
      const oldQtyBase = Number(item.quantity_in_base_unit);
      const qtyDelta = newQtyBase - oldQtyBase;
      const newLineTotal = update.quantity * nextUnitPrice;

      itemsToUpdate.push({
        id: item.id,
        order_id: item.order_id,
        organization_id: item.organization_id,
        product_id: item.product_id,
        sale_unit_label: item.sale_unit_label,
        unit_price: nextUnitPrice,
        quantity: update.quantity,
        quantity_in_base_unit: newQtyBase,
        line_total: newLineTotal,
        product_sale_unit_id: item.product_sale_unit_id,
        sale_unit_ratio: Number(item.sale_unit_ratio),
        cost_price: Number(item.cost_price),
      });

      if (qtyDelta !== 0) {
        const reductionMode = reductionChoiceMap.get(item.id) ?? "return";
        if (qtyDelta < 0 && reductionMode === "lost") {
          lossInBaseUnitByItemId.set(item.id, Math.abs(qtyDelta));
        }

        if (order.status === "submitted") {
          const current = stockDeltas.get(item.product_id) || 0;
          const effectiveDelta = qtyDelta < 0 && reductionMode === "lost" ? 0 : qtyDelta;
          stockDeltas.set(item.product_id, current + effectiveDelta);
        }
      }
    }
  }

  // Additions
  for (const add of additions) {
    const saleUnit = add.productSaleUnitId
      ? saleUnitsMap.get(add.productSaleUnitId)
      : saleUnitsMap.get(`default-${add.productId}`);

    if (saleUnit) {
      const product = productsMap.get(add.productId);
      const ratio = Number(saleUnit.base_unit_quantity) || 1;
      const lineTotal = add.quantity * add.unitPrice;
      const qtyBase = add.quantity * ratio;

      itemsToInsert.push({
        order_id: orderId,
        organization_id: session.organizationId,
        product_id: add.productId,
        product_sale_unit_id: saleUnit.id,
        quantity: add.quantity,
        quantity_in_base_unit: qtyBase,
        unit_price: add.unitPrice,
        line_total: lineTotal,
        sale_unit_label: saleUnit.unit_label,
        sale_unit_ratio: ratio,
        cost_price: Number(product?.cost_price ?? 0),
      });

      if (order.status === "submitted") {
        const current = stockDeltas.get(add.productId) || 0;
        stockDeltas.set(add.productId, current + qtyBase);
      }
    }
  }

  // 4. Execution
  // Delete removed items
  if (removedIds.length > 0) {
    await admin.from("order_items").delete().in("id", removedIds);
  }

  // Upsert updated and new items
  if (itemsToUpdate.length > 0) {
    const { error: upsertError } = await admin.from("order_items").upsert(itemsToUpdate);
    if (upsertError) return { error: "ไม่สามารถปรับปรุงรายการสินค้าได้: " + upsertError.message };
  }

  if (itemsToInsert.length > 0) {
    const { error: insertError } = await admin.from("order_items").insert(itemsToInsert);
    if (insertError) return { error: "ไม่สามารถเพิ่มรายการสินค้าได้: " + insertError.message };
  }

  const priceRowsByKey = new Map<
    string,
    {
      customer_id: string;
      organization_id: string;
      product_id: string;
      product_sale_unit_id: string;
      sale_price: number;
    }
  >();

  for (const update of updates) {
    const item = itemsMap.get(update.itemId);
    if (!item) continue;
    const nextUnitPrice = Number.isFinite(update.unitPrice)
      ? Number(update.unitPrice)
      : Number(item.unit_price);
    if (!Number.isFinite(nextUnitPrice) || nextUnitPrice < 0) continue;
    const saleUnitId = item.product_sale_unit_id ? String(item.product_sale_unit_id) : null;
    if (!saleUnitId) continue;
    const key = `${item.product_id}:${saleUnitId}`;
    priceRowsByKey.set(key, {
      customer_id: order.customer_id,
      organization_id: session.organizationId,
      product_id: item.product_id,
      product_sale_unit_id: saleUnitId,
      sale_price: nextUnitPrice,
    });
  }

  for (const add of additions) {
    const saleUnit = add.productSaleUnitId
      ? saleUnitsMap.get(add.productSaleUnitId)
      : saleUnitsMap.get(`default-${add.productId}`);
    const saleUnitId = saleUnit?.id ? String(saleUnit.id) : null;
    if (!saleUnitId || !Number.isFinite(add.unitPrice) || add.unitPrice < 0) continue;
    const key = `${add.productId}:${saleUnitId}`;
    priceRowsByKey.set(key, {
      customer_id: order.customer_id,
      organization_id: session.organizationId,
      product_id: add.productId,
      product_sale_unit_id: saleUnitId,
      sale_price: Number(add.unitPrice),
    });
  }

  if (priceRowsByKey.size > 0) {
    const { error: priceUpsertError } = await admin
      .from("customer_product_prices")
      .upsert(Array.from(priceRowsByKey.values()), {
        onConflict: "organization_id,customer_id,product_sale_unit_id",
      });

    if (priceUpsertError) {
      return { error: "อัปเดตราคาขายร้านค้าไม่สำเร็จ: " + priceUpsertError.message };
    }
  }

  // Update stocks and movements if needed
  if (stockDeltas.size > 0 && order.status === "submitted") {
    const movements: Database["public"]["Tables"]["inventory_movements"]["Insert"][] = [];
    for (const [productId, delta] of stockDeltas.entries()) {
      if (delta === 0) continue;
      const product = productsMap.get(productId);
      if (product) {
        const stockBefore = Number(product.stock_quantity);
        const stockAfter = stockBefore - delta;

        await admin.from("products").update({ stock_quantity: stockAfter }).eq("id", productId);
        movements.push({
          created_by: session.userId,
          metadata: { order_id: orderId, source: "order_management_batch_optimized" },
          movement_type: delta > 0 ? "issue" : "adjustment",
          notes: `ปรับออเดอร์ ${order.order_number} (Batch Optimized)`,
          organization_id: session.organizationId,
          product_id: productId,
          quantity_delta: -delta,
          stock_after: stockAfter,
          stock_before: stockBefore,
        });
      }
    }
    if (movements.length > 0) {
      await admin.from("inventory_movements").insert(movements);
    }
  }

  // 5. Recalculate Order Total
  const { data: finalItems } = await admin.from("order_items").select("line_total, product_id").eq("order_id", orderId);
  const finalTotal = (finalItems ?? []).reduce((sum, i) => sum + Number(i.line_total), 0);
  const finalProductCount = new Set((finalItems ?? []).map((item) => item.product_id)).size;
  const finalNotes = notes?.trim() ? notes.trim() : null;

  await admin.from("orders").update({
    notes: finalNotes,
    subtotal_amount: finalTotal,
    total_amount: finalTotal,
  }).eq("id", orderId);

  // 6. Sync Delivery Note if needed
  if (order.status === "confirmed" || order.status === "submitted") {
    const syncRes = await syncOrderDeliveryNoteAction(orderId, {
      lossInBaseUnitByItemId,
    });
    if ("error" in syncRes) return { error: "ปรับปรุงใบส่งของไม่สำเร็จ: " + syncRes.error };
  }

  after(() => {
    notifyUpdatedCustomerReceiptForOrder(admin, {
      orderId,
      organizationId: session.organizationId,
    }).catch((err) => {
      console.error("Background notify error:", err);
    });
  });

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  revalidatePath("/billing");
  revalidateTag(`orders-${session.organizationId}`, "max");
  updateTag(`orders-${session.organizationId}`);
  revalidateDashboardPages();
  return {
    success: true,
    updatedOrder: {
      id: orderId,
      notes: finalNotes,
      productCount: finalProductCount,
      totalAmount: finalTotal,
    },
  };
}

export async function addOrderItemAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;

  const orderId = String(formData.get("orderId") ?? "").trim();
  const productId = String(formData.get("productId") ?? "").trim();
  const productSaleUnitId = String(formData.get("productSaleUnitId") ?? "").trim();
  const quantity = Number(formData.get("quantity") ?? 0);
  const unitPrice = Number(formData.get("unitPrice") ?? 0);

  if (!orderId || !productId) return { error: "ข้อมูลสินค้าไม่ครบถ้วน" };
  if (!Number.isFinite(quantity) || quantity <= 0) return { error: "จำนวนสินค้าต้องมากกว่า 0" };
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return { error: "ราคาสินค้าต้องมากกว่า 0" };

  const { data: order } = await admin
    .from("orders")
    .select("id, customer_id, status, organization_id, total_amount, order_number")
    .eq("id", orderId)
    .single();

  if (!order || order.organization_id !== session.organizationId) return { error: "ไม่พบออเดอร์" };
  if (!isEditableOrderStatus(order.status)) return { error: "ออเดอร์ที่ยกเลิกแล้วไม่สามารถแก้ไขได้" };

  const { data: saleUnit } = productSaleUnitId
    ? await admin
        .from("product_sale_units")
        .select("id, product_id, unit_label, base_unit_quantity, is_default, cost_mode, fixed_cost_price")
        .eq("organization_id", session.organizationId)
        .eq("id", productSaleUnitId)
        .eq("is_active", true)
        .single()
    : await admin
        .from("product_sale_units")
        .select("id, product_id, unit_label, base_unit_quantity, is_default, cost_mode, fixed_cost_price")
        .eq("organization_id", session.organizationId)
        .eq("product_id", productId)
        .eq("is_active", true)
        .eq("is_default", true)
        .single();

  if (!saleUnit || saleUnit.product_id !== productId) {
    return { error: "ไม่พบหน่วยขายของสินค้านี้" };
  }

  const { data: product } = await admin
    .from("products")
    .select("stock_quantity, reserved_quantity, cost_price")
    .eq("organization_id", session.organizationId)
    .eq("id", productId)
    .single();

  if (!product) return { error: "ไม่พบสินค้า" };

  const saleUnitRatio = Number(saleUnit.base_unit_quantity) || 1;
  const effectiveCost = getEffectiveSaleUnitCost({
    baseCostPrice: Number(product.cost_price ?? 0),
    baseUnitQuantity: saleUnitRatio,
    costMode: saleUnit.cost_mode ?? null,
    fixedCostPrice:
      saleUnit.fixed_cost_price === null || saleUnit.fixed_cost_price === undefined
        ? null
        : Number(saleUnit.fixed_cost_price),
  });

  if (effectiveCost > 0 && unitPrice < effectiveCost) {
    return { error: `ราคาต่ำกว่าต้นทุน ฿${effectiveCost.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` };
  }

  const quantityInBaseUnit = quantity * saleUnitRatio;
  const lineTotal = quantity * unitPrice;

  const { error: priceError } = await admin.from("customer_product_prices").upsert(
    {
      customer_id: order.customer_id,
      organization_id: session.organizationId,
      product_id: productId,
      product_sale_unit_id: saleUnit.id,
      sale_price: unitPrice,
    },
    {
      onConflict: "organization_id,customer_id,product_sale_unit_id",
    },
  );

  if (priceError) {
    return { error: priceError.message ?? "บันทึกราคาสินค้าไม่สำเร็จ" };
  }

  await admin.from("order_items").insert({
    cost_price: Number(product.cost_price ?? 0),
    line_total: lineTotal,
    order_id: orderId,
    organization_id: session.organizationId,
    product_id: productId,
    product_sale_unit_id: saleUnit.id,
    quantity,
    quantity_in_base_unit: quantityInBaseUnit,
    sale_unit_label: saleUnit.unit_label,
    sale_unit_ratio: saleUnitRatio,
    unit_price: unitPrice,
  });
  if (order.status === "submitted") {
    const stockBefore = Number(product.stock_quantity);
    const stockAfter = stockBefore - quantityInBaseUnit;

    await Promise.all([
      admin.from("products").update({ stock_quantity: stockAfter }).eq("id", productId),

      admin.from("inventory_movements").insert({
        created_by: session.userId,
        metadata: { order_id: orderId, source: "order_management" },
        movement_type: "issue",
        notes: `เพิ่มสินค้าในออเดอร์ ${order.order_number}`,
        organization_id: session.organizationId,
        product_id: productId,
        quantity_delta: -quantityInBaseUnit,
        stock_after: stockAfter,
        stock_before: stockBefore,
      }),
    ]);
  }

  const nextTotal = Number(order.total_amount) + lineTotal;
  await admin
    .from("orders")
    .update({ subtotal_amount: nextTotal, total_amount: nextTotal })
    .eq("id", orderId);

  if (order.status === "confirmed") {
    const syncRes = await syncOrderDeliveryNoteAction(orderId);
    if ("error" in syncRes) {
      return { error: "ปรับปรุงใบส่งของไม่สำเร็จ: " + syncRes.error };
    }
  }

  after(() => {
    notifyUpdatedCustomerReceiptForOrder(admin, {
      orderId,
      organizationId: session.organizationId,
    }).catch((err) => {
      console.error("Background notify error:", err);
    });
  });

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  revalidatePath("/billing");
  revalidateDashboardPages();
  return { success: true };
}

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

export async function upsertCustomerPriceFromOrderModalAction(input: {
  customerId: string;
  productId: string;
  productSaleUnitId: string | null;
  salePrice: number;
}): Promise<{ success: true } | { error: string }> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;

  const customerId = String(input.customerId ?? "").trim();
  const productId = String(input.productId ?? "").trim();
  const salePrice = Number(input.salePrice);

  if (!customerId || !productId || !Number.isFinite(salePrice) || salePrice < 0) {
    return { error: "ข้อมูลราคาไม่ถูกต้อง" };
  }

  let productSaleUnitId = String(input.productSaleUnitId ?? "").trim();

  if (!productSaleUnitId) {
    const { data: defaultUnit, error: defaultUnitError } = await admin
      .from("product_sale_units")
      .select("id, product_id, unit_label, base_unit_quantity, is_default")
      .eq("organization_id", session.organizationId)
      .eq("product_id", productId)
      .eq("is_active", true)
      .eq("is_default", true)
      .single();

    if (defaultUnitError || !defaultUnit?.id) {
      return { error: "ไม่พบหน่วยขายหลักของสินค้า" };
    }

    productSaleUnitId = defaultUnit.id;
  }

  const { data: saleUnit, error: saleUnitError } = await admin
    .from("product_sale_units")
    .select("id, product_id, unit_label, base_unit_quantity, is_default")
    .eq("organization_id", session.organizationId)
    .eq("id", productSaleUnitId)
    .eq("is_active", true)
    .single();

  if (saleUnitError || !saleUnit) {
    return { error: "ไม่พบหน่วยขายที่ต้องการบันทึกราคา" };
  }

  const { error } = await admin.from("customer_product_prices").upsert(
    {
      customer_id: customerId,
      organization_id: session.organizationId,
      product_id: saleUnit.product_id,
      product_sale_unit_id: saleUnit.id,
      sale_price: salePrice,
    },
    {
      onConflict: "organization_id,customer_id,product_sale_unit_id",
    },
  );

  if (error) {
    return { error: error.message ?? "บันทึกราคาไม่สำเร็จ" };
  }

  revalidatePath("/orders/incoming");
  revalidatePath("/settings/customers/pricing");
  return { success: true };
}

export async function upsertCustomerPricesBatchFromOrderModalAction(input: {
  customerId: string;
  items: Array<{
    productId: string;
    productSaleUnitId: string | null;
    salePrice: number;
  }>;
}): Promise<{ success: true } | { error: string }> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;

  const customerId = String(input.customerId ?? "").trim();
  if (!customerId) {
    return { error: "ข้อมูลลูกค้าไม่ถูกต้อง" };
  }

  const items = input.items || [];
  if (items.length === 0) {
    return { success: true };
  }

  const resolvedItems = await Promise.all(
    items.map(async (item) => {
      const productId = String(item.productId ?? "").trim();
      const salePrice = Number(item.salePrice);

      if (!productId || !Number.isFinite(salePrice) || salePrice < 0) {
        return null;
      }

      let productSaleUnitId = String(item.productSaleUnitId ?? "").trim();

      if (!productSaleUnitId) {
        const { data: defaultUnit, error: defaultUnitError } = await admin
          .from("product_sale_units")
          .select("id, product_id, unit_label, base_unit_quantity, is_default")
          .eq("organization_id", session.organizationId)
          .eq("product_id", productId)
          .eq("is_active", true)
          .eq("is_default", true)
          .single();

        if (defaultUnitError || !defaultUnit?.id) {
          const { data: firstUnit } = await admin
            .from("product_sale_units")
            .select("id")
            .eq("organization_id", session.organizationId)
            .eq("product_id", productId)
            .eq("is_active", true)
            .limit(1)
            .maybeSingle();

          if (!firstUnit?.id) {
            return null;
          }
          productSaleUnitId = firstUnit.id;
        } else {
          productSaleUnitId = defaultUnit.id;
        }
      }

      const { data: saleUnit, error: saleUnitError } = await admin
        .from("product_sale_units")
        .select("id, product_id")
        .eq("organization_id", session.organizationId)
        .eq("id", productSaleUnitId)
        .eq("is_active", true)
        .single();

      if (saleUnitError || !saleUnit) {
        return null;
      }

      return {
        customer_id: customerId,
        organization_id: session.organizationId,
        product_id: saleUnit.product_id,
        product_sale_unit_id: saleUnit.id,
        sale_price: salePrice,
      };
    })
  );

  const upsertRows = resolvedItems.filter((row): row is Exclude<typeof row, null> => row !== null);

  if (upsertRows.length === 0) {
    return { success: true };
  }

  const { error } = await admin.from("customer_product_prices").upsert(
    upsertRows,
    {
      onConflict: "organization_id,customer_id,product_sale_unit_id",
    },
  );

  if (error) {
    return { error: error.message ?? "บันทึกราคาไม่สำเร็จ" };
  }

  revalidatePath("/orders/incoming");
  revalidatePath("/settings/customers/pricing");
  return { success: true };
}



export async function fetchCustomerLastOrderItemsAction(
  customerId: string,
  orderDate: string,
): Promise<CustomerLastOrderSnapshot> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;

  if (!customerId) {
    return { items: [], orderCount: 0, sourceDate: getPreviousDate(orderDate) };
  }

  // Find the most recent order date before orderDate
  const { data: lastOrder } = await admin
    .from("orders")
    .select("order_date")
    .eq("organization_id", session.organizationId)
    .eq("customer_id", customerId)
    .lt("order_date", orderDate)
    .in("status", ["submitted", "confirmed"])
    .order("order_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sourceDate = lastOrder?.order_date ?? getPreviousDate(orderDate);

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

  const grouped = new Map<string, CustomerLastOrderItem>();

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



type ManualOrderItem = {
  productId: string;
  quantity: number;
  saleUnitBaseQty: number;
  saleUnitId: string | null;
  saleUnitLabel: string;
  unitPrice: number;
};

function mapManualItemsToMergeableInputs(
  items: ManualOrderItem[],
): MergeableOrderItemInput[] {
  return items.map((item) => ({
    costPrice: 0,
    productId: item.productId,
    productSaleUnitId: item.saleUnitId,
    quantity: item.quantity,
    quantityInBaseUnit: calculateBaseQuantity(item.quantity, item.saleUnitBaseQty),
    saleUnitLabel: item.saleUnitLabel,
    saleUnitRatio: item.saleUnitBaseQty,
    unitPrice: item.unitPrice,
  }));
}

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

  const saleUnitIds = Array.from(
    new Set(items.map((item) => item.saleUnitId).filter((id): id is string => Boolean(id))),
  );
  const saleUnitsQuery = saleUnitIds.length > 0
    ? admin
        .from("product_sale_units")
        .select("id, product_id, unit_label, base_unit_quantity, min_order_qty, step_order_qty")
        .eq("organization_id", session.organizationId)
        .eq("is_active", true)
        .in("id", saleUnitIds)
    : Promise.resolve({ data: [], error: null });
  const existingOrdersQuery = admin
    .from("orders")
    .select("id, order_number, notes, subtotal_amount, total_amount, created_at, status")
    .eq("organization_id", session.organizationId)
    .eq("customer_id", customerId)
    .eq("order_date", orderDate)
    .order("created_at", { ascending: true });
  const customerQuery = admin
    .from("customers")
    .select("id, customer_code, name, default_vehicle_id, vehicles(id, name)")
    .eq("id", customerId)
    .eq("organization_id", session.organizationId)
    .single();
  const [saleUnitsResult, existingOrdersResult, customerResult] = await Promise.all([
    saleUnitsQuery,
    existingOrdersQuery,
    customerQuery,
  ]);
  const { data: saleUnits, error: saleUnitsError } = saleUnitsResult;

  if (saleUnitsError) return { error: "ไม่สามารถตรวจสอบหน่วยขายของสินค้าได้" };
  if (customerResult.error || !customerResult.data) {
    return { error: "ไม่พบข้อมูลร้านค้าที่เลือก" };
  }
  const saleUnitsById = new Map((saleUnits ?? []).map((unit) => [unit.id, unit] as const));
  const validatedItems: ManualOrderItem[] = [];

  for (const item of items) {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    if (!item.productId || !Number.isFinite(unitPrice) || unitPrice <= 0) {
      return { error: "ข้อมูลสินค้าและราคาไม่ถูกต้อง" };
    }

    const saleUnit = item.saleUnitId ? saleUnitsById.get(item.saleUnitId) : null;
    if (item.saleUnitId && (!saleUnit || saleUnit.product_id !== item.productId)) {
      return { error: "หน่วยขายของสินค้าไม่ถูกต้องหรือไม่ได้เปิดใช้งาน" };
    }

    const stepOrderQty = saleUnit?.step_order_qty == null
      ? null
      : Number(saleUnit.step_order_qty);
    const minOrderQty = Number(saleUnit?.min_order_qty ?? 1);
    if (!isValidOrderQuantity(quantity, minOrderQty, stepOrderQty)) {
      return { error: "จำนวนสินค้าต้องมากกว่า 0 มีทศนิยมได้ไม่เกิน 3 ตำแหน่ง และตรงตามเงื่อนไขการสั่ง" };
    }

    const baseUnitQuantity = Number(saleUnit?.base_unit_quantity ?? item.saleUnitBaseQty ?? 1);
    if (!Number.isFinite(baseUnitQuantity) || baseUnitQuantity <= 0) {
      return { error: "อัตราแปลงหน่วยของสินค้าไม่ถูกต้อง" };
    }

    validatedItems.push({
      ...item,
      quantity,
      saleUnitBaseQty: baseUnitQuantity,
      saleUnitLabel: saleUnit?.unit_label ?? item.saleUnitLabel,
      unitPrice,
    });
  }

  items = validatedItems;

  console.log(`[createManualOrderAction] Received Date: ${orderDate}, Customer: ${customerId}`);

  const totalAmount = items.reduce(
    (sum, item) => sum + calculateLineTotal(item.quantity, item.unitPrice),
    0,
  );
  const { data: existingOrderRows, error: existingOrderError } = existingOrdersResult;

  if (existingOrderError) {
    console.error("[createManualOrderAction] Existing Order Lookup Error:", existingOrderError);
    return { error: "ไม่สามารถตรวจสอบออเดอร์เดิมได้" };
  }

  const existingOrder = (existingOrderRows ?? []).find((row) => row.status !== "cancelled") ?? null;

  let orderId = existingOrder?.id ?? null;
  let effectiveOrderNumber = existingOrder?.order_number ?? null;

  if (!orderId) {
    const { data: nextOrderNumber } = await admin.rpc("next_order_number", {
      p_order_date: orderDate,
      p_organization_id: session.organizationId,
    });

    if (!nextOrderNumber) {
      return { error: "ไม่สามารถสร้างเลขออเดอร์ได้" };
    }

    const { data: newOrder, error: insertError } = await admin
      .from("orders")
      .insert({
        customer_id: customerId,
        fulfillment_status: "pending",
        metadata: { channel, source: "manual" },
        notes,
        order_date: orderDate,
        order_number: String(nextOrderNumber),
        organization_id: session.organizationId,
        placed_by_user_id: session.userId,
        status: "submitted",
        subtotal_amount: totalAmount,
        total_amount: totalAmount,
      })
      .select("id, order_number")
      .single();

    if (insertError || !newOrder) {
      console.error("[createManualOrderAction] Insert Error:", insertError);
      return { error: "ไม่สามารถสร้างออเดอร์ได้" };
    }

    orderId = newOrder.id;
    effectiveOrderNumber = newOrder.order_number;
    console.log(`[createManualOrderAction] Order Created: ${orderId} for Date: ${orderDate}`);
  } else {
    const currentOrder = existingOrder!;
    const mergedNotes = mergeOrderNotes(currentOrder.notes ?? null, notes);
    const updatePayload: Record<string, unknown> = {
      subtotal_amount: Number(currentOrder.subtotal_amount ?? 0) + totalAmount,
      total_amount: Number(currentOrder.total_amount ?? 0) + totalAmount,
    };

    if (mergedNotes !== (currentOrder.notes ?? null)) {
      updatePayload.notes = mergedNotes;
    }

    const { error: updateExistingOrderError } = await admin
      .from("orders")
      .update(updatePayload)
      .eq("id", orderId);

    if (updateExistingOrderError) {
      console.error("[createManualOrderAction] Existing Order Update Error:", updateExistingOrderError);
      return { error: "ไม่สามารถอัปเดตออเดอร์เดิมได้" };
    }

    console.log(`[createManualOrderAction] Merged Into Existing Order: ${orderId} for Date: ${orderDate}`);
  }

  const mergeResult = await mergeItemsIntoOrder(admin, {
    items: mapManualItemsToMergeableInputs(items),
    orderId,
    organizationId: session.organizationId,
  });

  if ("error" in mergeResult) {
    console.error("[createManualOrderAction] Merge Items Error:", mergeResult.error);
    return { error: mergeResult.error ?? "ไม่สามารถรวมรายการสินค้าในออเดอร์ได้" };
  }

  const syncResult = await syncDeliveryNoteForOrder(admin, {
    orderId,
    organizationId: session.organizationId,
    skipBillingSync: true,
    skipRevalidate: true,
    userId: session.userId,
  });

  if ("error" in syncResult) {
    console.error("[createManualOrderAction] Delivery Note Sync Error:", syncResult.error);
    return {
      success: true,
      orderNumber: String(effectiveOrderNumber),
      receiptWarning: `สร้างออเดอร์สำเร็จ แต่ไม่สามารถสร้างใบส่งของอัตโนมัติได้: ${syncResult.error}`,
    };
  }

  const syncedDeliveryNumber = String(syncResult.deliveryNumber);
  effectiveOrderNumber = syncedDeliveryNumber;
  await admin.from("orders").update({ order_number: syncedDeliveryNumber }).eq("id", orderId);

  after(() => {
    syncBillingSnapshotsForDeliveryNumbers({
      organizationId: session.organizationId,
      customerId,
      deliveryNumbers: [syncedDeliveryNumber],
    }).catch((err) => {
      console.error("Background billing sync error:", err);
    });

    notifyUpdatedCustomerReceiptForOrder(admin, {
      orderId,
      organizationId: session.organizationId,
    }).catch((err) => {
      console.error("Background notify error:", err);
    });

    revalidateDashboardPages();
    revalidatePath("/orders/incoming");
    revalidatePath("/orders");
    updateTag(`orders-${session.organizationId}`);
  });
  const [savedOrderResult, savedItemsResult] = await Promise.all([
    admin
      .from("orders")
      .select("id, order_number, order_date, status, fulfillment_status, total_amount, created_at, notes")
      .eq("id", orderId)
      .eq("organization_id", session.organizationId)
      .single(),
    admin
      .from("order_items")
      .select("product_id")
      .eq("order_id", orderId),
  ]);

  const savedOrder = savedOrderResult.data;
  const customer = customerResult.data;
  const customerVehicle = customer?.vehicles as { id: string; name: string } | null | undefined;
  const incomingOrder: IncomingOrderListItem | undefined = savedOrder && customer
    ? {
        channelLabel: "สร้าง",
        createdAt: savedOrder.created_at,
        customerCode: customer.customer_code,
        customerId,
        customerName: customer.name,
        sortOrder: Number.MAX_SAFE_INTEGER,
        id: savedOrder.id,
        notes: savedOrder.notes,
        orderDate: savedOrder.order_date,
        orderNumber: savedOrder.order_number,
        productCount: new Set((savedItemsResult.data ?? []).map((item) => item.product_id)).size,
        fulfillmentStatus: savedOrder.fulfillment_status,
        status: savedOrder.status,
        totalAmount: Number(savedOrder.total_amount),
        vehicleId: customer.default_vehicle_id,
        vehicleName: customerVehicle?.name ?? null,
      }
    : undefined;

  return {
    success: true,
    orderNumber: String(effectiveOrderNumber),
    deliveryNumber: syncedDeliveryNumber,
    incomingOrder,
  };
}
export async function linkPendingLineOrderAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const pendingOrderId = String(formData.get("pendingOrderId") ?? "").trim();
  const customerId = String(formData.get("customerId") ?? "").trim();

  if (!pendingOrderId || !customerId) {
    return { error: "กรุณาเลือกร้านค้าที่ต้องการผูก" };
  }

  const result = await linkLineCustomerAndConvertPendingOrders({
    customerId,
    organizationId: session.organizationId,
    pendingOrderId,
    userId: session.userId,
  });

  if ("error" in result) {
    return { error: result.error ?? "ผูกร้านค้าไม่สำเร็จ" };
  }

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  revalidatePath("/billing");
  revalidateDashboardPages();

  return {
    receiptWarning: result.receiptErrors.length > 0
      ? `สร้างออเดอร์แล้ว แต่ส่งใบยืนยันไป LINE ไม่สำเร็จ: ${result.receiptErrors.join(" | ")}`
      : undefined,
    success: true,
    orderNumber: result.orderNumbers.join(", "),
  };
}

export async function updateIncomingOrderDateAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;
  const orderId = String(formData.get("orderId") ?? "").trim();
  const nextOrderDate = String(formData.get("orderDate") ?? "").trim();

  if (!orderId) {
    return { error: "ไม่พบเลขออเดอร์ที่ต้องการแก้ไข" };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextOrderDate)) {
    return { error: "รูปแบบวันที่ออเดอร์ไม่ถูกต้อง" };
  }

  const { data: order } = await admin
    .from("orders")
    .select("id, status, order_number, order_date, organization_id, customer_id")
    .eq("id", orderId)
    .single();

  if (!order || order.organization_id !== session.organizationId) {
    return { error: "ไม่พบออเดอร์นี้" };
  }

  if (order.status === "cancelled") {
    return { error: "ออเดอร์ที่ยกเลิกแล้วไม่สามารถแก้ไขวันที่ได้" };
  }

  if (order.order_date === nextOrderDate) {
    return { success: true, orderDate: nextOrderDate, orderNumber: order.order_number };
  }

  // 1. Check if an order already exists on the NEXT date
  const { data: existingOrder } = await admin
    .from("orders")
    .select("id, status, total_amount")
    .eq("organization_id", session.organizationId)
    .eq("customer_id", order.customer_id)
    .eq("order_date", nextOrderDate)
    .neq("status", "cancelled")
    .limit(1)
    .maybeSingle();

  if (existingOrder) {
    // CASE 1: Order exists on next date -> MERGE!
    
    // Fetch items of the current order (to be moved)
    const { data: orderItems } = await admin
      .from("order_items")
      .select("*")
      .eq("order_id", orderId);

    const mergeableItems = (orderItems ?? []).map((item) => ({
      costPrice: Number(item.cost_price),
      productId: item.product_id,
      productSaleUnitId: item.product_sale_unit_id,
      quantity: Number(item.quantity),
      quantityInBaseUnit: Number(item.quantity_in_base_unit),
      saleUnitLabel: item.sale_unit_label,
      saleUnitRatio: Number(item.sale_unit_ratio),
      unitPrice: Number(item.unit_price),
    }));

    // Merge items into the existing order on the next date
    const mergeResult = await mergeItemsIntoOrder(admin, {
      items: mergeableItems,
      orderId: existingOrder.id,
      organizationId: session.organizationId,
    });

    if ("error" in mergeResult) {
      return { error: "ไม่สามารถรวมรายการสินค้าได้: " + mergeResult.error };
    }

    // Recalculate total for the target order
    const { data: finalItems } = await admin
      .from("order_items")
      .select("line_total")
      .eq("order_id", existingOrder.id);
      
    const finalTotal = (finalItems ?? []).reduce((sum, i) => sum + Number(i.line_total), 0);

    await admin.from("orders").update({
      subtotal_amount: finalTotal,
      total_amount: finalTotal,
    }).eq("id", existingOrder.id);

    // Clean up the SOURCE order and its items
    await admin.from("order_items").delete().eq("order_id", orderId);
    await admin.from("orders").delete().eq("id", orderId);

    // Clean up the SOURCE delivery note (if any) on the old date
    const { data: sourceDn } = await admin
      .from("delivery_notes")
      .select("id, delivery_number")
      .eq("organization_id", session.organizationId)
      .eq("customer_id", order.customer_id)
      .eq("delivery_date", order.order_date)
      .maybeSingle();

    if (sourceDn) {
      await admin.from("delivery_note_items").delete().eq("delivery_note_id", sourceDn.id);
      await admin.from("delivery_notes").delete().eq("id", sourceDn.id);
    }

    // Sync the delivery note on the NEXT date
    const syncRes = await syncOrderDeliveryNoteAction(existingOrder.id);

    if ("error" in syncRes) {
      return { error: "ปรับปรุงใบส่งของไม่สำเร็จ: " + syncRes.error };
    }

    const deliveryNumber = "deliveryNumber" in syncRes ? String(syncRes.deliveryNumber) : undefined;
    const deliveryNumbersForBillingSync = Array.from(
      new Set([
        sourceDn?.delivery_number ? String(sourceDn.delivery_number) : "",
        deliveryNumber ?? "",
      ].filter(Boolean)),
    );

    if (deliveryNumbersForBillingSync.length > 0) {
      const billingSync = await syncBillingSnapshotsForDeliveryNumbers({
        organizationId: session.organizationId,
        customerId: order.customer_id,
        deliveryNumbers: deliveryNumbersForBillingSync,
      });
      if (!billingSync.success) {
        return { error: billingSync.error };
      }
    }

	    revalidatePath("/orders/incoming");
	    revalidatePath("/orders");
	    revalidatePath("/delivery");
	    revalidatePath("/billing");
	    revalidatePath("/reports/billing");
	    revalidateDashboardPages();
	    revalidateTag(`orders-${session.organizationId}`, "max");

	    after(() => {
	      notifyUpdatedCustomerReceiptForOrder(admin, {
	        orderId: existingOrder.id,
	        organizationId: session.organizationId,
	      }).catch((err) => {
	        console.error("Background notify error:", err);
	      });
	    });

	    return { success: true, orderDate: nextOrderDate, deliveryNumber };
	  } else {
    // CASE 2: No order on next date -> Just update date!
    const year = nextOrderDate.substring(0, 4);
    const month = nextOrderDate.substring(5, 7);
    const startDateStr = `${year}-${month}-01`;
    
    let nextYear = Number(year);
    let nextMonth = Number(month) + 1;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    const nextMonthStr = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

    const { count, error: countError } = await admin
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", session.organizationId)
      .gte("order_date", startDateStr)
      .lt("order_date", nextMonthStr);

    if (countError) {
      console.error("[updateOrderDate:countError]", countError);
      return { error: "ไม่สามารถสร้างเลขออเดอร์ได้" };
    }

    const nextNum = (count ?? 0) + 1;
    const nextOrderNumber = `DN${year}${month}${String(nextNum).padStart(4, "0")}`;

  const { error: updateError } = await admin
    .from("orders")
    .update({
      order_date: nextOrderDate,
      order_number: String(nextOrderNumber),
    })
    .eq("id", orderId);

  if (updateError) {
    return { error: updateError.message ?? "บันทึกวันที่ออเดอร์ไม่สำเร็จ" };
  }

  // Clean up the SOURCE delivery note (if any) on the old date
  // Since the order is moved, there are no orders left on the old date
  const { data: sourceDn } = await admin
    .from("delivery_notes")
    .select("id, delivery_number")
    .eq("organization_id", session.organizationId)
    .eq("customer_id", order.customer_id)
    .eq("delivery_date", order.order_date)
    .maybeSingle();

  if (sourceDn) {
    await admin.from("delivery_note_items").delete().eq("delivery_note_id", sourceDn.id);
    await admin.from("delivery_notes").delete().eq("id", sourceDn.id);
  }

  // Sync the delivery note on the NEXT date (using the updated order)
  const syncRes = await syncOrderDeliveryNoteAction(orderId);

  if ("error" in syncRes) {
    return { error: "ปรับปรุงใบส่งของไม่สำเร็จ: " + syncRes.error };
  }

    const deliveryNumber = "deliveryNumber" in syncRes ? String(syncRes.deliveryNumber) : undefined;
    const deliveryNumbersForBillingSync = Array.from(
      new Set([
        sourceDn?.delivery_number ? String(sourceDn.delivery_number) : "",
        deliveryNumber ?? "",
      ].filter(Boolean)),
    );

    if (deliveryNumbersForBillingSync.length > 0) {
      const billingSync = await syncBillingSnapshotsForDeliveryNumbers({
        organizationId: session.organizationId,
        customerId: order.customer_id,
        deliveryNumbers: deliveryNumbersForBillingSync,
      });
      if (!billingSync.success) {
        return { error: billingSync.error };
      }
    }

	  revalidatePath("/orders/incoming");
	  revalidatePath("/orders");
	  revalidatePath("/delivery");
	  revalidatePath("/billing");
	  revalidatePath("/reports/billing");
	  revalidateDashboardPages();
	  revalidateTag(`orders-${session.organizationId}`, "max");

	    after(() => {
	      notifyUpdatedCustomerReceiptForOrder(admin, {
	        orderId,
	        organizationId: session.organizationId,
	      }).catch((err) => {
	        console.error("Background notify error:", err);
	      });
	    });

	    return { success: true, orderDate: nextOrderDate, orderNumber: String(nextOrderNumber), deliveryNumber };
	  }
}

export async function fetchOrderModalDataAction(): Promise<{
  customers: OrderCustomerOption[];
  products: OrderProductOption[];
  today: string;
}> {
  const session = await requireAppRole("admin");
  const [customers, products] = await Promise.all([
    getCustomersForOrder(session.organizationId),
    getProductsForOrder(session.organizationId),
  ]);

  return {
    customers,
    products,
    today: getTodayInBangkok(),
  };
}

export async function fetchCustomerOrderCountsForDateAction(
  orderDate: string,
): Promise<Record<string, number>> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;
  const normalizedDate = /^\d{4}-\d{2}-\d{2}$/.test(orderDate) ? orderDate : getTodayInBangkok();

  const { data, error } = await admin
    .from("orders")
    .select("customer_id, status")
    .eq("organization_id", session.organizationId)
    .eq("order_date", normalizedDate);

  if (error) return {};

  return (data ?? [])
    .filter((row) => row.status !== "cancelled")
    .reduce<Record<string, number>>((acc, row) => {
      acc[row.customer_id] = (acc[row.customer_id] ?? 0) + 1;
      return acc;
    }, {});
}

export async function syncOrderDeliveryNoteAction(
  orderId: string,
  options?: {
    lossInBaseUnitByItemId?: Map<string, number>;
  },
): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;
  const { data: orderBeforeSync } = await admin
    .from("orders")
    .select("id, customer_id, order_date")
    .eq("id", orderId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  const { data: oldOrderDnItems } = await admin
    .from("delivery_note_items")
    .select("delivery_note_id")
    .eq("order_id", orderId);

  const oldDeliveryNoteIds = Array.from(
    new Set((oldOrderDnItems ?? []).map((row) => String(row.delivery_note_id)).filter(Boolean)),
  );
  let oldDeliveryNumbers: string[] = [];
  if (oldDeliveryNoteIds.length > 0) {
    const { data: oldDeliveryNotes } = await admin
      .from("delivery_notes")
      .select("delivery_number")
      .in("id", oldDeliveryNoteIds);
    oldDeliveryNumbers = Array.from(
      new Set((oldDeliveryNotes ?? []).map((row) => String(row.delivery_number)).filter(Boolean)),
    );
  }

  const syncResult = await syncDeliveryNoteForOrder(admin, {
    lossInBaseUnitByItemId: options?.lossInBaseUnitByItemId,
    orderId,
    organizationId: session.organizationId,
    userId: session.userId,
  });

  if ("error" in syncResult) {
    return { error: syncResult.error };
  }

  const syncedDeliveryNumber = String(syncResult.deliveryNumber);
  await admin
    .from("orders")
    .update({ order_number: syncedDeliveryNumber })
    .eq("id", orderId)
    .eq("organization_id", session.organizationId);

  if (orderBeforeSync) {
    const { data: customerDayNotes } = await admin
      .from("delivery_notes")
      .select("delivery_number")
      .eq("organization_id", session.organizationId)
      .eq("customer_id", orderBeforeSync.customer_id)
      .eq("delivery_date", orderBeforeSync.order_date);

    const deliveryNumbers = Array.from(
      new Set(
        [
          ...oldDeliveryNumbers,
          syncedDeliveryNumber,
          ...((customerDayNotes ?? []).map((row) => String(row.delivery_number))),
        ].filter(Boolean),
      ),
    );

    if (deliveryNumbers.length > 0) {
      const billingSync = await syncBillingSnapshotsForDeliveryNumbers({
        organizationId: session.organizationId,
        customerId: orderBeforeSync.customer_id,
        deliveryNumbers,
      });

      if (!billingSync.success) {
        return { error: billingSync.error };
      }
    }
  }

  revalidatePath("/orders/incoming");
  revalidatePath("/billing");
  return { success: true, deliveryNumber: syncedDeliveryNumber };
}

export async function deleteOrderAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;
  const orderId = String(formData.get("orderId") ?? "").trim();

  if (!orderId) {
    return { error: "ไม่พบรหัสออเดอร์" };
  }

  const { data: order } = await admin
    .from("orders")
    .select("id, status, order_number, organization_id, customer_id")
    .eq("id", orderId)
    .eq("organization_id", session.organizationId)
    .single();

  if (!order) {
    return { error: "ไม่พบออเดอร์นี้" };
  }

  if (!isEditableOrderStatus(order.status)) {
    return { error: "ออเดอร์ที่ยกเลิกแล้วไม่สามารถลบได้" };
  }

  const { data: deliveryItems } = await admin
    .from("delivery_note_items")
    .select("delivery_note_id, product_id, quantity_in_base_unit")
    .eq("order_id", orderId);

  const restoreByProduct = new Map<string, number>();
  for (const item of deliveryItems ?? []) {
    restoreByProduct.set(
      item.product_id,
      (restoreByProduct.get(item.product_id) ?? 0) + Number(item.quantity_in_base_unit),
    );
  }

  if (restoreByProduct.size === 0) {
    const { data: orderItems } = await admin
      .from("order_items")
      .select("product_id, quantity_in_base_unit")
      .eq("order_id", orderId);

    for (const item of orderItems ?? []) {
      restoreByProduct.set(
        item.product_id,
        (restoreByProduct.get(item.product_id) ?? 0) + Number(item.quantity_in_base_unit),
      );
    }
  }

  await Promise.all(
    Array.from(restoreByProduct.entries()).map(([productId, quantityInBaseUnit]) =>
      restoreItemStock(
        admin,
        session.organizationId,
        session.userId,
        productId,
        quantityInBaseUnit,
        `ลบออเดอร์ ${order.order_number}`,
      ),
    ),
  );

  const deliveryNoteIds = Array.from(new Set((deliveryItems ?? []).map((item) => item.delivery_note_id)));
  let deliveryNumbers: string[] = [];
  if (deliveryNoteIds.length > 0) {
    const { data: deliveryNotes } = await admin
      .from("delivery_notes")
      .select("id, delivery_number")
      .in("id", deliveryNoteIds);

    deliveryNumbers = Array.from(new Set((deliveryNotes ?? []).map((note) => String(note.delivery_number))));
  }

  if (deliveryItems && deliveryItems.length > 0) {
    const { error: deleteDeliveryItemsError } = await admin
      .from("delivery_note_items")
      .delete()
      .eq("order_id", orderId);

    if (deleteDeliveryItemsError) {
      return { error: deleteDeliveryItemsError.message ?? "ไม่สามารถลบรายการใบส่งของได้" };
    }
  }

  if (deliveryNoteIds.length > 0) {
    const { error: deleteDeliveryNotesError } = await admin
      .from("delivery_notes")
      .delete()
      .in("id", deliveryNoteIds);

    if (deleteDeliveryNotesError) {
      return { error: deleteDeliveryNotesError.message ?? "ไม่สามารถลบใบส่งของได้" };
    }
  }

  const { error: deleteOrderItemsError } = await admin
    .from("order_items")
    .delete()
    .eq("order_id", orderId);

  if (deleteOrderItemsError) {
    return { error: deleteOrderItemsError.message ?? "ไม่สามารถลบรายการสินค้าในออเดอร์ได้" };
  }

  const { error: deleteOrderError } = await admin
    .from("orders")
    .delete()
    .eq("id", orderId)
    .eq("organization_id", session.organizationId);

  if (deleteOrderError) {
    return { error: deleteOrderError.message ?? "ไม่สามารถลบออเดอร์ได้" };
  }

  if (deliveryNumbers.length > 0) {
    const billingSync = await syncBillingSnapshotsForDeliveryNumbers({
      organizationId: session.organizationId,
      customerId: order.customer_id,
      deliveryNumbers,
    });

    if (!billingSync.success) {
      return { error: billingSync.error };
    }
  }

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  revalidatePath("/billing");
  revalidateDashboardPages();
  return { success: true };
}

export async function deleteOrderCascadeAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;
  const orderId = String(formData.get("orderId") ?? "").trim();

  if (!orderId) {
    return { error: "ไม่พบรหัสออเดอร์" };
  }

  const { data: order } = await admin
    .from("orders")
    .select("id, status, order_number, organization_id, customer_id")
    .eq("id", orderId)
    .eq("organization_id", session.organizationId)
    .single();

  if (!order) {
    return { error: "ไม่พบออเดอร์นี้" };
  }

  if (!isEditableOrderStatus(order.status)) {
    return { error: "ออเดอร์ที่ยกเลิกแล้วไม่สามารถลบได้" };
  }

  const { data: orderItems, error: orderItemsError } = await admin
    .from("order_items")
    .select("id, order_id, product_id, quantity_in_base_unit")
    .eq("order_id", orderId);

  if (orderItemsError) {
    return { error: orderItemsError.message ?? "ไม่สามารถโหลดรายการสินค้าในออเดอร์ได้" };
  }

  const orderItemIds = (orderItems ?? []).map((item) => item.id);

  const { data: deliveryItems, error: deliveryItemsError } =
    orderItemIds.length > 0
      ? await admin
          .from("delivery_note_items")
          .select("id, delivery_note_id, order_item_id, product_id, quantity_in_base_unit, line_total")
          .in("order_item_id", orderItemIds)
      : { data: [], error: null };

  if (deliveryItemsError) {
    return { error: deliveryItemsError.message ?? "ไม่สามารถโหลดรายการใบส่งของที่เกี่ยวข้องได้" };
  }

  const restoreByProduct = new Map<string, number>();
  for (const item of deliveryItems ?? []) {
    restoreByProduct.set(
      item.product_id,
      (restoreByProduct.get(item.product_id) ?? 0) + Number(item.quantity_in_base_unit),
    );
  }

  if (restoreByProduct.size === 0) {
    for (const item of orderItems ?? []) {
      restoreByProduct.set(
        item.product_id,
        (restoreByProduct.get(item.product_id) ?? 0) + Number(item.quantity_in_base_unit),
      );
    }
  }

  await Promise.all(
    Array.from(restoreByProduct.entries()).map(([productId, quantityInBaseUnit]) =>
      restoreItemStock(
        admin,
        session.organizationId,
        session.userId,
        productId,
        quantityInBaseUnit,
        `ลบออเดอร์ ${order.order_number}`,
      ),
    ),
  );

  const deliveryNoteIds = Array.from(new Set((deliveryItems ?? []).map((item) => item.delivery_note_id)));
  let deliveryNumbers: string[] = [];
  if (deliveryNoteIds.length > 0) {
    const { data: deliveryNotes } = await admin
      .from("delivery_notes")
      .select("id, delivery_number")
      .in("id", deliveryNoteIds);

    deliveryNumbers = Array.from(new Set((deliveryNotes ?? []).map((note) => String(note.delivery_number))));
  }

  if (deliveryItems && deliveryItems.length > 0) {
    const { error: deleteDeliveryItemsError } = await admin
      .from("delivery_note_items")
      .delete()
      .in(
        "id",
        deliveryItems.map((item) => item.id),
      );

    if (deleteDeliveryItemsError) {
      return { error: deleteDeliveryItemsError.message ?? "ไม่สามารถลบรายการใบส่งของได้" };
    }
  }

  for (const deliveryNoteId of deliveryNoteIds) {
    const { data: remainingDeliveryItems, error: remainingDeliveryItemsError } = await admin
      .from("delivery_note_items")
      .select("id, line_total, order_item_id")
      .eq("delivery_note_id", deliveryNoteId);

    if (remainingDeliveryItemsError) {
      return { error: remainingDeliveryItemsError.message ?? "ไม่สามารถตรวจสอบรายการใบส่งของคงเหลือได้" };
    }

    if (!remainingDeliveryItems || remainingDeliveryItems.length === 0) {
      const { error: deleteDeliveryNoteError } = await admin
        .from("delivery_notes")
        .delete()
        .eq("id", deliveryNoteId);

      if (deleteDeliveryNoteError) {
        return { error: deleteDeliveryNoteError.message ?? "ไม่สามารถลบใบส่งของได้" };
      }

      continue;
    }

    const nextTotalAmount = remainingDeliveryItems.reduce(
      (sum, item) => sum + Number(item.line_total),
      0,
    );

    const remainingOrderItemIds = remainingDeliveryItems
      .map((item) => item.order_item_id)
      .filter((value): value is string => Boolean(value));

    let replacementOrderId: string | null = null;
    if (remainingOrderItemIds.length > 0) {
      const { data: remainingOrderItems, error: remainingOrderItemsError } = await admin
        .from("order_items")
        .select("id, order_id")
        .in("id", remainingOrderItemIds);

      if (remainingOrderItemsError) {
        return { error: remainingOrderItemsError.message ?? "ไม่สามารถหาออเดอร์อ้างอิงใบส่งของได้" };
      }

      replacementOrderId = remainingOrderItems?.[0]?.order_id ?? null;
    }

    const updatePayload: { total_amount: number; order_id?: string } = {
      total_amount: nextTotalAmount,
    };

    if (replacementOrderId) {
      updatePayload.order_id = replacementOrderId;
    }

    const { error: updateDeliveryNoteError } = await admin
      .from("delivery_notes")
      .update(updatePayload)
      .eq("id", deliveryNoteId);

    if (updateDeliveryNoteError) {
      return { error: updateDeliveryNoteError.message ?? "ไม่สามารถอัปเดตใบส่งของหลังลบออเดอร์ได้" };
    }
  }

  const { error: deleteOrderItemsError } = await admin
    .from("order_items")
    .delete()
    .eq("order_id", orderId);

  if (deleteOrderItemsError) {
    return { error: deleteOrderItemsError.message ?? "ไม่สามารถลบรายการสินค้าในออเดอร์ได้" };
  }

  const { error: deleteOrderError } = await admin
    .from("orders")
    .delete()
    .eq("id", orderId)
    .eq("organization_id", session.organizationId);

  if (deleteOrderError) {
    return { error: deleteOrderError.message ?? "ไม่สามารถลบออเดอร์ได้" };
  }

  if (deliveryNumbers.length > 0) {
    const billingSync = await syncBillingSnapshotsForDeliveryNumbers({
      organizationId: session.organizationId,
      customerId: order.customer_id,
      deliveryNumbers,
    });

    if (!billingSync.success) {
      return { error: billingSync.error };
    }
  }

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  revalidatePath("/billing");
  return { success: true };
}

export async function deleteOrderCascadeActionV2(formData: FormData): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;
  const orderId = String(formData.get("orderId") ?? "").trim();

  if (!orderId) {
    return { error: "ไม่พบรหัสออเดอร์" };
  }

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, status, order_number, organization_id, customer_id")
    .eq("id", orderId)
    .eq("organization_id", session.organizationId)
    .single();

  if (orderError || !order) {
    return { error: orderError?.message ?? "ไม่พบออเดอร์นี้" };
  }

  if (!isEditableOrderStatus(order.status)) {
    return { error: "ออเดอร์ที่ยกเลิกแล้วไม่สามารถลบได้" };
  }

  const { data: orderItems, error: orderItemsError } = await admin
    .from("order_items")
    .select("id, order_id, product_id, quantity_in_base_unit")
    .eq("order_id", orderId);

  if (orderItemsError) {
    return { error: orderItemsError.message ?? "ไม่สามารถโหลดรายการสินค้าในออเดอร์ได้" };
  }

  const orderItemIds = (orderItems ?? []).map((item) => item.id);

  const { data: deliveryItems, error: deliveryItemsError } =
    orderItemIds.length > 0
      ? await admin
          .from("delivery_note_items")
          .select("id, delivery_note_id, order_item_id, product_id, quantity_in_base_unit, line_total")
          .in("order_item_id", orderItemIds)
      : { data: [], error: null };

  if (deliveryItemsError) {
    return { error: deliveryItemsError.message ?? "ไม่สามารถโหลดรายการใบจัดส่งที่เกี่ยวข้องได้" };
  }

  const restoreByProduct = new Map<string, number>();
  for (const item of deliveryItems ?? []) {
    restoreByProduct.set(
      item.product_id,
      (restoreByProduct.get(item.product_id) ?? 0) + Number(item.quantity_in_base_unit),
    );
  }

  if (restoreByProduct.size === 0) {
    for (const item of orderItems ?? []) {
      restoreByProduct.set(
        item.product_id,
        (restoreByProduct.get(item.product_id) ?? 0) + Number(item.quantity_in_base_unit),
      );
    }
  }

  await Promise.all(
    Array.from(restoreByProduct.entries()).map(([productId, quantityInBaseUnit]) =>
      restoreItemStock(
        admin,
        session.organizationId,
        session.userId,
        productId,
        quantityInBaseUnit,
        `ลบออเดอร์ ${order.order_number}`,
      ),
    ),
  );

  const deliveryNoteIds = Array.from(new Set((deliveryItems ?? []).map((item) => item.delivery_note_id)));
  let deliveryNumbers: string[] = [];

  if (deliveryNoteIds.length > 0) {
    const { data: deliveryNotes, error: deliveryNotesError } = await admin
      .from("delivery_notes")
      .select("id, delivery_number")
      .in("id", deliveryNoteIds);

    if (deliveryNotesError) {
      return { error: deliveryNotesError.message ?? "ไม่สามารถโหลดใบจัดส่งที่เกี่ยวข้องได้" };
    }

    deliveryNumbers = Array.from(new Set((deliveryNotes ?? []).map((note) => String(note.delivery_number))));
  }

  if (deliveryItems && deliveryItems.length > 0) {
    const { error: deleteDeliveryItemsError } = await admin
      .from("delivery_note_items")
      .delete()
      .in(
        "id",
        deliveryItems.map((item) => item.id),
      );

    if (deleteDeliveryItemsError) {
      return { error: deleteDeliveryItemsError.message ?? "ไม่สามารถลบรายการใบจัดส่งได้" };
    }
  }

  for (const deliveryNoteId of deliveryNoteIds) {
    const { data: remainingDeliveryItems, error: remainingDeliveryItemsError } = await admin
      .from("delivery_note_items")
      .select("id, line_total, order_item_id")
      .eq("delivery_note_id", deliveryNoteId);

    if (remainingDeliveryItemsError) {
      return { error: remainingDeliveryItemsError.message ?? "ไม่สามารถตรวจสอบรายการใบจัดส่งคงเหลือได้" };
    }

    if (!remainingDeliveryItems || remainingDeliveryItems.length === 0) {
      const { error: deleteDeliveryNoteError } = await admin
        .from("delivery_notes")
        .delete()
        .eq("id", deliveryNoteId);

      if (deleteDeliveryNoteError) {
        return { error: deleteDeliveryNoteError.message ?? "ไม่สามารถลบใบจัดส่งได้" };
      }

      continue;
    }

    const nextTotalAmount = remainingDeliveryItems.reduce((sum, item) => sum + Number(item.line_total), 0);
    const remainingOrderItemIds = remainingDeliveryItems
      .map((item) => item.order_item_id)
      .filter((value): value is string => Boolean(value));

    let replacementOrderId: string | null = null;

    if (remainingOrderItemIds.length > 0) {
      const { data: remainingOrderItems, error: remainingOrderItemsError } = await admin
        .from("order_items")
        .select("id, order_id")
        .in("id", remainingOrderItemIds);

      if (remainingOrderItemsError) {
        return { error: remainingOrderItemsError.message ?? "ไม่สามารถหาออเดอร์อ้างอิงของใบจัดส่งได้" };
      }

      replacementOrderId = remainingOrderItems?.[0]?.order_id ?? null;
    }

    const updatePayload: { total_amount: number; order_id?: string } = {
      total_amount: nextTotalAmount,
    };

    if (replacementOrderId) {
      updatePayload.order_id = replacementOrderId;
    }

    const { error: updateDeliveryNoteError } = await admin
      .from("delivery_notes")
      .update(updatePayload)
      .eq("id", deliveryNoteId);

    if (updateDeliveryNoteError) {
      return { error: updateDeliveryNoteError.message ?? "ไม่สามารถอัปเดตใบจัดส่งหลังลบออเดอร์ได้" };
    }
  }

  const { error: deleteOrderItemsError } = await admin
    .from("order_items")
    .delete()
    .eq("order_id", orderId);

  if (deleteOrderItemsError) {
    return { error: deleteOrderItemsError.message ?? "ไม่สามารถลบรายการสินค้าในออเดอร์ได้" };
  }

  const { error: deleteOrderError } = await admin
    .from("orders")
    .delete()
    .eq("id", orderId)
    .eq("organization_id", session.organizationId);

  if (deleteOrderError) {
    return { error: deleteOrderError.message ?? "ไม่สามารถลบออเดอร์ได้" };
  }

  if (deliveryNumbers.length > 0) {
    const billingSync = await syncBillingSnapshotsForDeliveryNumbers({
      organizationId: session.organizationId,
      customerId: order.customer_id,
      deliveryNumbers,
    });

    if (!billingSync.success) {
      return { error: billingSync.error };
    }
  }

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  revalidatePath("/billing");
  return { success: true };
}

export async function deleteOrderCascadeActionV3(formData: FormData): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;
  const orderId = String(formData.get("orderId") ?? "").trim();

  if (!orderId) {
    return { error: "ไม่พบรหัสออเดอร์" };
  }

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, status, order_number, organization_id, customer_id, order_date")
    .eq("id", orderId)
    .eq("organization_id", session.organizationId)
    .single();

  if (orderError || !order) {
    return { error: orderError?.message ?? "ไม่พบออเดอร์นี้" };
  }

  if (!isEditableOrderStatus(order.status)) {
    return { error: "ออเดอร์ที่ยกเลิกแล้วไม่สามารถลบได้" };
  }

  const { data: orderItems, error: orderItemsError } = await admin
    .from("order_items")
    .select("id, product_id, quantity_in_base_unit")
    .eq("order_id", orderId);

  if (orderItemsError) {
    return { error: orderItemsError.message ?? "ไม่สามารถโหลดรายการสินค้าในออเดอร์ได้" };
  }

  const orderItemIds = (orderItems ?? []).map((item) => item.id);

  const { data: deliveryItems, error: deliveryItemsError } =
    orderItemIds.length > 0
      ? await admin
          .from("delivery_note_items")
          .select("id, delivery_note_id, order_item_id, product_id, quantity_in_base_unit, line_total")
          .in("order_item_id", orderItemIds)
      : { data: [], error: null };

  if (deliveryItemsError) {
    return { error: deliveryItemsError.message ?? "ไม่สามารถโหลดรายการใบจัดส่งที่เกี่ยวข้องได้" };
  }

  const { data: primaryDeliveryNotes, error: primaryDeliveryNotesError } = await admin
    .from("delivery_notes")
    .select("id, delivery_number, customer_id, delivery_date")
    .eq("organization_id", session.organizationId)
    .eq("order_id", orderId);

  if (primaryDeliveryNotesError) {
    return { error: primaryDeliveryNotesError.message ?? "ไม่สามารถโหลดใบจัดส่งของออเดอร์นี้ได้" };
  }

  const restoreByProduct = new Map<string, number>();
  for (const item of deliveryItems ?? []) {
    restoreByProduct.set(
      item.product_id,
      (restoreByProduct.get(item.product_id) ?? 0) + Number(item.quantity_in_base_unit),
    );
  }

  if (restoreByProduct.size === 0) {
    for (const item of orderItems ?? []) {
      restoreByProduct.set(
        item.product_id,
        (restoreByProduct.get(item.product_id) ?? 0) + Number(item.quantity_in_base_unit),
      );
    }
  }

  await Promise.all(
    Array.from(restoreByProduct.entries()).map(([productId, quantityInBaseUnit]) =>
      restoreItemStock(
        admin,
        session.organizationId,
        session.userId,
        productId,
        quantityInBaseUnit,
        `ลบออเดอร์ ${order.order_number}`,
      ),
    ),
  );

  const deliveryNoteMap = new Map(
    (primaryDeliveryNotes ?? []).map((note) => [note.id, note] as const),
  );
  const deliveryNoteIds = Array.from(
    new Set([
      ...(deliveryItems ?? []).map((item) => item.delivery_note_id),
      ...(primaryDeliveryNotes ?? []).map((note) => note.id),
    ]),
  );
  let deliveryNumbers = Array.from(
    new Set((primaryDeliveryNotes ?? []).map((note) => String(note.delivery_number))),
  );

  if (deliveryNoteIds.length > 0 && deliveryNumbers.length === 0) {
    const { data: deliveryNotesById } = await admin
      .from("delivery_notes")
      .select("delivery_number")
      .in("id", deliveryNoteIds);

    deliveryNumbers = Array.from(
      new Set((deliveryNotesById ?? []).map((note) => String(note.delivery_number))),
    );
  }

  if ((deliveryItems ?? []).length > 0) {
    const { error: deleteDeliveryItemsError } = await admin
      .from("delivery_note_items")
      .delete()
      .in(
        "id",
        (deliveryItems ?? []).map((item) => item.id),
      );

    if (deleteDeliveryItemsError) {
      return { error: deleteDeliveryItemsError.message ?? "ไม่สามารถลบรายการใบจัดส่งได้" };
    }
  }

  for (const deliveryNoteId of deliveryNoteIds) {
    const { data: remainingDeliveryItems, error: remainingDeliveryItemsError } = await admin
      .from("delivery_note_items")
      .select("id, line_total, order_item_id")
      .eq("delivery_note_id", deliveryNoteId);

    if (remainingDeliveryItemsError) {
      return { error: remainingDeliveryItemsError.message ?? "ไม่สามารถตรวจสอบรายการใบจัดส่งคงเหลือได้" };
    }

    if (!remainingDeliveryItems || remainingDeliveryItems.length === 0) {
      const { error: deleteDeliveryNoteError } = await admin
        .from("delivery_notes")
        .delete()
        .eq("id", deliveryNoteId);

      if (deleteDeliveryNoteError) {
        return { error: deleteDeliveryNoteError.message ?? "ไม่สามารถลบใบจัดส่งได้" };
      }

      continue;
    }

    const nextTotalAmount = remainingDeliveryItems.reduce((sum, item) => sum + Number(item.line_total), 0);
    const remainingOrderItemIds = remainingDeliveryItems
      .map((item) => item.order_item_id)
      .filter((value): value is string => Boolean(value));

    let replacementOrderId: string | null = null;

    if (remainingOrderItemIds.length > 0) {
      const { data: remainingOrderItems, error: remainingOrderItemsError } = await admin
        .from("order_items")
        .select("id, order_id")
        .in("id", remainingOrderItemIds);

      if (remainingOrderItemsError) {
        return { error: remainingOrderItemsError.message ?? "ไม่สามารถหาออเดอร์อ้างอิงของใบจัดส่งได้" };
      }

      replacementOrderId = remainingOrderItems?.[0]?.order_id ?? null;
    }

    if (!replacementOrderId) {
      const knownNote = deliveryNoteMap.get(deliveryNoteId);
      const { data: fallbackDeliveryNote, error: fallbackDeliveryNoteError } = knownNote
        ? { data: knownNote, error: null }
        : await admin
            .from("delivery_notes")
            .select("id, customer_id, delivery_date")
            .eq("id", deliveryNoteId)
            .single();

      if (fallbackDeliveryNoteError || !fallbackDeliveryNote) {
        return { error: fallbackDeliveryNoteError?.message ?? "ไม่สามารถโหลดข้อมูลใบจัดส่งที่เหลืออยู่ได้" };
      }

      const { data: siblingOrders, error: siblingOrdersError } = await admin
        .from("orders")
        .select("id")
        .eq("organization_id", session.organizationId)
        .eq("customer_id", fallbackDeliveryNote.customer_id)
        .eq("order_date", fallbackDeliveryNote.delivery_date)
        .neq("id", orderId)
        .limit(1);

      if (siblingOrdersError) {
        return { error: siblingOrdersError.message ?? "ไม่สามารถหาออเดอร์อ้างอิงใหม่ได้" };
      }

      replacementOrderId = siblingOrders?.[0]?.id ?? null;
    }

    if (!replacementOrderId) {
      const orphanDeliveryItemIds = remainingDeliveryItems.map((item) => item.id);
      const { error: deleteOrphanItemsError } = await admin
        .from("delivery_note_items")
        .delete()
        .in("id", orphanDeliveryItemIds);

      if (deleteOrphanItemsError) {
        return { error: deleteOrphanItemsError.message ?? "ไม่สามารถลบรายการใบจัดส่งค้างได้" };
      }

      const { error: deleteOrphanDeliveryNoteError } = await admin
        .from("delivery_notes")
        .delete()
        .eq("id", deliveryNoteId);

      if (deleteOrphanDeliveryNoteError) {
        return { error: deleteOrphanDeliveryNoteError.message ?? "ไม่สามารถลบใบจัดส่งค้างได้" };
      }

      continue;
    }

    const { error: updateDeliveryNoteError } = await admin
      .from("delivery_notes")
      .update({
        total_amount: nextTotalAmount,
        order_id: replacementOrderId,
      })
      .eq("id", deliveryNoteId);

    if (updateDeliveryNoteError) {
      return { error: updateDeliveryNoteError.message ?? "ไม่สามารถอัปเดตใบจัดส่งหลังลบออเดอร์ได้" };
    }
  }

  const { error: deleteOrderItemsError } = await admin
    .from("order_items")
    .delete()
    .eq("order_id", orderId);

  if (deleteOrderItemsError) {
    return { error: deleteOrderItemsError.message ?? "ไม่สามารถลบรายการสินค้าในออเดอร์ได้" };
  }

  const { error: deleteOrderError } = await admin
    .from("orders")
    .delete()
    .eq("id", orderId)
    .eq("organization_id", session.organizationId);

  if (deleteOrderError) {
    return { error: deleteOrderError.message ?? "ไม่สามารถลบออเดอร์ได้" };
  }

  if (deliveryNumbers.length > 0) {
    const billingSync = await syncBillingSnapshotsForDeliveryNumbers({
      organizationId: session.organizationId,
      customerId: order.customer_id,
      deliveryNumbers,
    });

    if (!billingSync.success) {
      return { error: billingSync.error };
    }
  }

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  revalidatePath("/billing");
  return { success: true };
}


