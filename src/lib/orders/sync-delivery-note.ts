import "server-only";

import { syncBillingSnapshotsForDeliveryNumbers } from "@/lib/billing/actions";
import { revalidateDashboardPages } from "@/lib/dashboard/revalidate-dashboard-pages";
import { revalidateReportPages } from "@/lib/reports/revalidate-report-pages";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

type Admin = SupabaseClient<Database>;

type SyncResult =
  | { success: true; deliveryNumber: string }
  | { error: string };

async function resolveActorUserId(
  admin: Admin,
  organizationId: string,
  preferredUserId: string | null,
) {
  if (preferredUserId) {
    return preferredUserId;
  }

  const { data } = await admin
    .from("app_users")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data?.id ?? null;
}

export async function syncDeliveryNoteForOrder(
  admin: Admin,
  input: {
    lossInBaseUnitByItemId?: Map<string, number>;
    orderId: string;
    organizationId: string;
    skipBillingSync?: boolean;
    userId: string | null;
    skipRevalidate?: boolean;
  },
): Promise<SyncResult> {
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, customer_id, order_date, notes")
    .eq("id", input.orderId)
    .single();

  if (orderError || !order) {
    return {
      error: `ไม่พบข้อมูลออเดอร์ (ID: ${input.orderId.slice(0, 8)}...) ${orderError?.message ?? ""}`,
    };
  }

  const [customerResult, sameDayOrdersResult] = await Promise.all([
    admin
      .from("customers")
      .select("default_vehicle_id")
      .eq("id", order.customer_id)
      .single(),
    admin
      .from("orders")
      .select("id, notes")
      .eq("organization_id", input.organizationId)
      .eq("customer_id", order.customer_id)
      .eq("order_date", order.order_date)
      .neq("status", "cancelled")
      .order("created_at", { ascending: true }),
  ]);

  if (sameDayOrdersResult.error) {
    return { error: "โหลดรายการออเดอร์ของร้านนี้ในวันเดียวกันไม่สำเร็จ" };
  }

  const customer = customerResult.data;
  const vehicleId = customer?.default_vehicle_id || null;
  const lossInBaseUnitByItemId = input.lossInBaseUnitByItemId ?? new Map<string, number>();
  const sameDayOrders = sameDayOrdersResult.data;

  const targetOrders = sameDayOrders ?? [];
  const targetOrderIds = targetOrders.map((item) => item.id);

  if (targetOrderIds.length === 0) {
    return { error: "ไม่พบออเดอร์ที่พร้อมซิงก์สำหรับร้านค้านี้" };
  }

  const { data: orderItems, error: itemsError } = await admin
    .from("order_items")
    .select("*")
    .in("order_id", targetOrderIds)
    .order("created_at", { ascending: true });

  if (itemsError) {
    return { error: "ไม่สามารถโหลดรายการสินค้าในออเดอร์ได้" };
  }

  const items = orderItems ?? [];
  const actorUserId = await resolveActorUserId(
    admin,
    input.organizationId,
    input.userId,
  );

  if (!actorUserId) {
    return { error: "ไม่พบผู้ใช้งานสำหรับซิงก์ใบส่งของ" };
  }

  const mergedNotes = targetOrders.reduce<string | null>((acc, item) => {
    const current = acc?.trim() ?? "";
    const incoming = item.notes?.trim() ?? "";

    if (!incoming) return current || null;
    if (!current) return incoming;
    if (current.includes(incoming)) return current;
    return `${current} / ${incoming}`;
  }, null);

  const itemIds = (orderItems ?? []).map((item) => item.id);
  let existingDn: { id: string; total_amount: number; delivery_date: string } | null = null;
  let existingDnError = null;

  if (itemIds.length > 0) {
    const { data: linkedDnItem, error: linkedError } = await admin
      .from("delivery_note_items")
      .select("delivery_note_id")
      .in("order_item_id", itemIds)
      .limit(1)
      .maybeSingle();

    if (linkedError) {
      existingDnError = linkedError;
    } else if (linkedDnItem?.delivery_note_id) {
      const { data: dn, error: dnError } = await admin
        .from("delivery_notes")
        .select("id, total_amount, delivery_date")
        .eq("id", linkedDnItem.delivery_note_id)
        .single();
      
      if (dnError) {
        existingDnError = dnError;
      } else {
        existingDn = dn as unknown as { id: string; total_amount: number; delivery_date: string };
      }
    }
  }

  // Fallback to customer/date if not found by items
  if (!existingDn && !existingDnError) {
    const { data: dn, error: dnError } = await admin
      .from("delivery_notes")
      .select("id, total_amount, delivery_date")
      .eq("organization_id", input.organizationId)
      .eq("customer_id", order.customer_id)
      .eq("delivery_date", order.order_date)
      .eq("status", "confirmed")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    
    if (dnError) existingDnError = dnError;
    else existingDn = dn as unknown as { id: string; total_amount: number; delivery_date: string };
  }

  if (existingDnError) {
    return { error: "โหลดข้อมูลใบส่งของเดิมไม่สำเร็จ" };
  }

  if (existingDn) {
    const { data: existingDnItems, error: existingDnItemsError } = await admin
      .from("delivery_note_items")
      .select("id, delivery_note_id, order_item_id, product_id, quantity_in_base_unit")
      .eq("delivery_note_id", existingDn.id);

    if (existingDnItemsError) {
      return { error: "โหลดรายการสินค้าในใบส่งของเดิมไม่สำเร็จ" };
    }

    const restoreByProduct = new Map<string, number>();

    for (const item of existingDnItems ?? []) {
      const lossQty = Math.min(
        Number(lossInBaseUnitByItemId.get(String(item.order_item_id)) ?? 0),
        Number(item.quantity_in_base_unit),
      );
      const qtyToRestore = Math.max(0, Number(item.quantity_in_base_unit) - lossQty);
      restoreByProduct.set(
        item.product_id,
        (restoreByProduct.get(item.product_id) ?? 0) + qtyToRestore,
      );
    }

    const productIdsToRestore = Array.from(restoreByProduct.keys());
    if (productIdsToRestore.length > 0) {
      const { data: productsToRestore } = await admin
        .from("products")
        .select("id, stock_quantity")
        .in("id", productIdsToRestore);

      const productMap = new Map(
        (productsToRestore ?? []).map((product) => [product.id, Number(product.stock_quantity)]),
      );
      const inventoryMovements: Database["public"]["Tables"]["inventory_movements"]["Insert"][] = [];

      for (const productId of productIdsToRestore) {
        const qtyBase = restoreByProduct.get(productId) ?? 0;
        if (qtyBase <= 0) continue;

        const stockBefore = productMap.get(productId);
        if (stockBefore === undefined) continue;

        const stockAfter = stockBefore + qtyBase;
        inventoryMovements.push({
          created_by: actorUserId,
          metadata: { source: "order_management_rebuild" },
          movement_type: "adjustment",
          notes: `คืนสต็อกจากการซิงก์ใบส่งของใหม่สำหรับออเดอร์ ${input.orderId}`,
          organization_id: input.organizationId,
          product_id: productId,
          quantity_delta: qtyBase,
          stock_after: stockAfter,
          stock_before: stockBefore,
        });

        const { error: updateError } = await admin
          .from("products")
          .update({ stock_quantity: stockAfter })
          .eq("id", productId);

        if (updateError) {
          console.error(`[syncDeliveryNoteForOrder:updateProduct:${productId}]`, updateError);
          return { error: "ปรับปรุงสต็อกสินค้าในคลังไม่สำเร็จ: " + updateError.message };
        }
      }

      if (inventoryMovements.length > 0) {
        await admin.from("inventory_movements").insert(inventoryMovements);
      }
    }

    if ((existingDnItems ?? []).length > 0) {
      await admin
        .from("delivery_note_items")
        .delete()
        .in("id", existingDnItems.map((item: { id: string }) => item.id));
    }

    await admin.from("delivery_notes").update({ total_amount: 0 }).eq("id", existingDn.id);
  }

  const payloadItems = items.map(
    (item: {
      id: string;
      product_id: string;
      product_sale_unit_id: string | null;
      quantity: number;
      sale_unit_label: string;
      sale_unit_ratio: number;
      unit_price: number;
    }) => ({
      orderItemId: item.id,
      productId: item.product_id,
      productSaleUnitId: item.product_sale_unit_id,
      quantityDelivered: Number(item.quantity),
      saleUnitLabel: item.sale_unit_label,
      saleUnitRatio: Number(item.sale_unit_ratio),
      unitPrice: Number(item.unit_price),
    }),
  );

  const { data: deliveryNumber, error: deliveryError } = await admin.rpc("create_store_delivery_note", {
    p_organization_id: input.organizationId,
    p_order_ids: targetOrderIds,
    p_customer_id: order.customer_id,
    p_vehicle_id: vehicleId as unknown as string,
    p_delivery_date: existingDn ? existingDn.delivery_date : order.order_date,
    p_notes: mergedNotes as unknown as string,
    p_created_by: actorUserId,
    p_items: payloadItems,
  });

  if (deliveryError) {
    return { error: "ปรับปรุงใบส่งของไม่สำเร็จ: " + deliveryError.message };
  }

  if (!input.skipBillingSync) {
    const billingSyncResult = await syncBillingSnapshotsForDeliveryNumbers({
      organizationId: input.organizationId,
      customerId: order.customer_id,
      deliveryNumbers: [String(deliveryNumber)],
      skipRevalidate: input.skipRevalidate,
    });

    if (!billingSyncResult.success) {
      return { error: billingSyncResult.error };
    }
  }

  if (!input.skipRevalidate) {
    revalidateReportPages();
    revalidateDashboardPages();
  }
  return { success: true, deliveryNumber: String(deliveryNumber) };
}
