import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { calculateLineTotal } from "@/lib/orders/quantity-rules";

type Admin = SupabaseClient<Database>;

export type MergeableOrderItemInput = {
  costPrice: number;
  productId: string;
  productSaleUnitId: string | null;
  quantity: number;
  quantityInBaseUnit: number;
  saleUnitLabel: string;
  saleUnitRatio: number;
  unitPrice: number;
};

type ExistingOrderItemRow = {
  cost_price: number | null;
  created_at: string | null;
  id: string;
  line_total: number | string | null;
  product_id: string;
  product_sale_unit_id: string | null;
  quantity: number | string | null;
  quantity_in_base_unit: number | string | null;
  sale_unit_label: string;
  sale_unit_ratio: number | string | null;
  unit_price: number | string | null;
};

function getOrderItemKey(productId: string, productSaleUnitId: string | null) {
  return `${productId}__${productSaleUnitId ?? "__default__"}`;
}

function normalizeMergedUnitPrice(lineTotal: number, quantity: number, fallback: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) return fallback;
  return lineTotal / quantity;
}

export function aggregateMergeableOrderItems(items: MergeableOrderItemInput[]) {
  const grouped = new Map<string, MergeableOrderItemInput>();

  for (const item of items) {
    const key = getOrderItemKey(item.productId, item.productSaleUnitId);
    const existing = grouped.get(key);
    const lineTotal = calculateLineTotal(Number(item.quantity), Number(item.unitPrice));

    if (!existing) {
      grouped.set(key, {
        costPrice: Number(item.costPrice) || 0,
        productId: item.productId,
        productSaleUnitId: item.productSaleUnitId,
        quantity: Number(item.quantity),
        quantityInBaseUnit: Number(item.quantityInBaseUnit),
        saleUnitLabel: item.saleUnitLabel,
        saleUnitRatio: Number(item.saleUnitRatio) || 1,
        unitPrice: Number(item.unitPrice) || 0,
      });
      continue;
    }

    const mergedQuantity = Number(existing.quantity) + Number(item.quantity);
    const mergedLineTotal =
      Number(existing.quantity) * Number(existing.unitPrice) + lineTotal;

    existing.quantity = mergedQuantity;
    existing.quantityInBaseUnit =
      Number(existing.quantityInBaseUnit) + Number(item.quantityInBaseUnit);
    existing.unitPrice = normalizeMergedUnitPrice(
      mergedLineTotal,
      mergedQuantity,
      Number(item.unitPrice) || Number(existing.unitPrice) || 0,
    );
    existing.saleUnitLabel = item.saleUnitLabel;
    existing.saleUnitRatio = Number(item.saleUnitRatio) || Number(existing.saleUnitRatio) || 1;
    existing.costPrice = Number(item.costPrice) || Number(existing.costPrice) || 0;
  }

  return Array.from(grouped.values());
}

export async function mergeItemsIntoOrder(
  admin: Admin,
  input: {
    items: MergeableOrderItemInput[];
    orderId: string;
    organizationId: string;
  },
) {
  const aggregatedIncomingItems = aggregateMergeableOrderItems(input.items);
  if (aggregatedIncomingItems.length === 0) {
    return { success: true as const };
  }

  const { data: existingRows, error: existingRowsError } = await admin
    .from("order_items")
    .select(
      "id, created_at, product_id, product_sale_unit_id, quantity, quantity_in_base_unit, line_total, sale_unit_label, sale_unit_ratio, unit_price, cost_price",
    )
    .eq("order_id", input.orderId)
    .order("created_at", { ascending: true });

  if (existingRowsError) {
    return { error: existingRowsError.message ?? "ไม่สามารถโหลดรายการสินค้าเดิมได้" };
  }

  const groupedExisting = new Map<string, ExistingOrderItemRow[]>();
  for (const row of (existingRows ?? []) as ExistingOrderItemRow[]) {
    const key = getOrderItemKey(row.product_id, row.product_sale_unit_id);
    const bucket = groupedExisting.get(key);
    if (bucket) {
      bucket.push(row);
    } else {
      groupedExisting.set(key, [row]);
    }
  }

  const rowsToDelete: string[] = [];
  const rowsToUpdate = new Map<string, Database["public"]["Tables"]["order_items"]["Update"]>();
  const rowsToInsert: Database["public"]["Tables"]["order_items"]["Insert"][] = [];

  for (const [key, rows] of groupedExisting.entries()) {
    if (rows.length <= 1) continue;

    const primary = rows[0];
    const duplicates = rows.slice(1);
    const mergedQuantity = rows.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
    const mergedBaseQuantity = rows.reduce(
      (sum, row) => sum + Number(row.quantity_in_base_unit ?? 0),
      0,
    );
    const mergedLineTotal = rows.reduce((sum, row) => sum + Number(row.line_total ?? 0), 0);
    const mergedUnitPrice = normalizeMergedUnitPrice(
      mergedLineTotal,
      mergedQuantity,
      Number(primary.unit_price ?? 0),
    );

    rowsToUpdate.set(primary.id, {
      cost_price: Number(primary.cost_price ?? 0),
      line_total: mergedLineTotal,
      product_id: primary.product_id,
      product_sale_unit_id: primary.product_sale_unit_id,
      quantity: mergedQuantity,
      quantity_in_base_unit: mergedBaseQuantity,
      sale_unit_label: primary.sale_unit_label,
      sale_unit_ratio: Number(primary.sale_unit_ratio ?? 1) || 1,
      unit_price: mergedUnitPrice,
    });

    rowsToDelete.push(...duplicates.map((row) => row.id));
    primary.quantity = mergedQuantity;
    primary.quantity_in_base_unit = mergedBaseQuantity;
    primary.line_total = mergedLineTotal;
    primary.unit_price = mergedUnitPrice;
    groupedExisting.set(key, [primary]);
  }

  for (const item of aggregatedIncomingItems) {
    const key = getOrderItemKey(item.productId, item.productSaleUnitId);
    const existingGroup = groupedExisting.get(key);
    const existing = existingGroup?.[0];
    const incomingLineTotal = calculateLineTotal(Number(item.quantity), Number(item.unitPrice));

    if (existing) {
      const currentQuantity = Number(existing.quantity ?? 0);
      const currentBaseQuantity = Number(existing.quantity_in_base_unit ?? 0);
      const currentLineTotal = Number(existing.line_total ?? 0);
      const mergedQuantity = currentQuantity + Number(item.quantity);
      const mergedBaseQuantity = currentBaseQuantity + Number(item.quantityInBaseUnit);
      const mergedLineTotal = currentLineTotal + incomingLineTotal;
      const mergedUnitPrice = normalizeMergedUnitPrice(
        mergedLineTotal,
        mergedQuantity,
        Number(item.unitPrice) || Number(existing.unit_price ?? 0),
      );

      rowsToUpdate.set(existing.id, {
        cost_price: Number(item.costPrice) || Number(existing.cost_price ?? 0),
        line_total: mergedLineTotal,
        product_id: existing.product_id,
        product_sale_unit_id: existing.product_sale_unit_id,
        quantity: mergedQuantity,
        quantity_in_base_unit: mergedBaseQuantity,
        sale_unit_label: item.saleUnitLabel,
        sale_unit_ratio: Number(item.saleUnitRatio) || 1,
        unit_price: mergedUnitPrice,
      });
      existing.quantity = mergedQuantity;
      existing.quantity_in_base_unit = mergedBaseQuantity;
      existing.line_total = mergedLineTotal;
      existing.unit_price = mergedUnitPrice;
      existing.sale_unit_label = item.saleUnitLabel;
      existing.sale_unit_ratio = Number(item.saleUnitRatio) || 1;
      continue;
    }

    rowsToInsert.push({
      cost_price: Number(item.costPrice) || 0,
      line_total: incomingLineTotal,
      order_id: input.orderId,
      organization_id: input.organizationId,
      product_id: item.productId,
      product_sale_unit_id: item.productSaleUnitId,
      quantity: Number(item.quantity),
      quantity_in_base_unit: Number(item.quantityInBaseUnit),
      sale_unit_label: item.saleUnitLabel,
      sale_unit_ratio: Number(item.saleUnitRatio) || 1,
      unit_price: Number(item.unitPrice) || 0,
    });
  }

  if (rowsToDelete.length > 0) {
    const { error: deleteError } = await admin.from("order_items").delete().in("id", rowsToDelete);
    if (deleteError) {
      return { error: deleteError.message ?? "ไม่สามารถลบรายการสินค้าซ้ำได้" };
    }
  }

  for (const [rowId, payload] of rowsToUpdate.entries()) {
    const { error: updateError } = await admin.from("order_items").update(payload).eq("id", rowId);
    if (updateError) {
      return { error: updateError.message ?? "ไม่สามารถรวมรายการสินค้าเดิมได้" };
    }
  }

  if (rowsToInsert.length > 0) {
    const { error: insertError } = await admin.from("order_items").insert(rowsToInsert);
    if (insertError) {
      return { error: insertError.message ?? "ไม่สามารถเพิ่มสินค้าในออเดอร์ได้" };
    }
  }

  return { success: true as const };
}
