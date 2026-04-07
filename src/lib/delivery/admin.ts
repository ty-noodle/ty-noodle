import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PendingOrder = {
  id: string;
  orderNumber: string;
  orderDate: string;
  customerId: string;
  customerName: string;
  customerCode: string;
  totalAmount: number;
  fulfillmentStatus: "pending" | "partial";
  pendingItems: PendingOrderItem[];
};

export type PendingOrderItem = {
  orderItemId: string;
  productId: string;
  productName: string;
  productSku: string;
  saleUnitLabel: string;
  orderedQty: number;
  deliveredQty: number;
  remainingQty: number;
};

export type DeliveryItemData = {
  orderItemId: string;
  productId: string;
  productName: string;
  productSku: string;
  productUnit: string;
  productSaleUnitId: string | null;
  saleUnitLabel: string;
  saleUnitRatio: number;
  orderedQty: number;
  orderedBaseQty: number;
  deliveredBaseQty: number;
  remainingBaseQty: number;
  availableStock: number;
  unitPrice: number;
  imageUrl: string | null;
};

export type DeliveryFormData = {
  orderId: string;
  orderNumber: string;
  orderDate: string;
  customerId: string;
  customerName: string;
  customerCode: string;
  items: DeliveryItemData[];
};

// ─── Raw DB row types ─────────────────────────────────────────────────────────

type RawPendingOrderRow = {
  id: string;
  order_number: string;
  order_date: string;
  total_amount: number | string;
  fulfillment_status: string;
  customer_id: string;
  customers: {
    name: string;
    customer_code: string;
  };
};

type RawOrderItemRow = {
  id: string;
  product_id: string;
  product_sale_unit_id: string | null;
  quantity: number | string;
  quantity_in_base_unit: number | string;
  sale_unit_label: string | null;
  sale_unit_ratio: number | string;
  unit_price: number | string;
  products: {
    name: string;
    sku: string;
    unit: string;
    stock_quantity: number | string;
    reserved_quantity: number | string;
  };
};

type RawOrderRow = {
  id: string;
  order_number: string;
  order_date: string;
  customer_id: string;
  customers: {
    name: string;
    customer_code: string;
  };
};

type RawDeliveredRow = {
  order_item_id: string;
  quantity_in_base_unit: number | string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: number | string | null | undefined) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Orders from PREVIOUS days with fulfillment_status pending or partial.
 * Shown as "ค้างส่ง" at the top of the workboard.
 */
export async function getPendingOrders(
  organizationId: string,
  today: string,
): Promise<PendingOrder[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, order_date, total_amount, fulfillment_status, customer_id, customers!inner(name, customer_code)")
    .eq("organization_id", organizationId)
    .eq("status", "confirmed")
    .in("fulfillment_status", ["pending", "partial"])
    .lt("order_date", today)
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getPendingOrders error:", error);
    return [];
  }

  const rows = (data ?? []) as RawPendingOrderRow[];
  if (rows.length === 0) return [];

  const orderIds = rows.map((row) => row.id);
  const { data: itemRows, error: itemError } = await supabase
    .from("order_items")
    .select(`
      id, order_id, product_id, quantity, quantity_in_base_unit,
      sale_unit_label, sale_unit_ratio,
      products!inner(name, sku)
    `)
    .eq("organization_id", organizationId)
    .in("order_id", orderIds);

  if (itemError) {
    console.error("getPendingOrders items error:", itemError);
    return rows.map((row) => ({
      id: row.id,
      orderNumber: row.order_number,
      orderDate: row.order_date,
      customerId: row.customer_id,
      customerName: row.customers.name,
      customerCode: row.customers.customer_code,
      totalAmount: toNum(row.total_amount),
      fulfillmentStatus: row.fulfillment_status === "partial" ? "partial" : "pending",
      pendingItems: [],
    }));
  }

  type RawPendingOrderItemRow = {
    id: string;
    order_id: string;
    product_id: string;
    quantity: number | string;
    quantity_in_base_unit: number | string;
    sale_unit_label: string | null;
    sale_unit_ratio: number | string;
    products: {
      name: string;
      sku: string;
    };
  };

  const pendingItemRows = (itemRows ?? []) as RawPendingOrderItemRow[];
  const orderItemIds = pendingItemRows.map((row) => row.id);
  const deliveredMap = new Map<string, number>();

  if (orderItemIds.length > 0) {
    const { data: deliveredRows, error: deliveredError } = await supabase
      .from("delivery_note_items")
      .select("order_item_id, quantity_in_base_unit")
      .in("order_item_id", orderItemIds);

    if (deliveredError) {
      console.error("getPendingOrders delivered items error:", deliveredError);
    } else {
      for (const row of (deliveredRows ?? []) as RawDeliveredRow[]) {
        const prev = deliveredMap.get(row.order_item_id) ?? 0;
        deliveredMap.set(row.order_item_id, prev + toNum(row.quantity_in_base_unit));
      }
    }
  }

  const pendingItemsByOrder = new Map<string, PendingOrderItem[]>();
  for (const row of pendingItemRows) {
    const saleUnitRatio = toNum(row.sale_unit_ratio) || 1;
    const orderedBaseQty = toNum(row.quantity_in_base_unit) || toNum(row.quantity) * saleUnitRatio;
    const deliveredBaseQty = deliveredMap.get(row.id) ?? 0;
    const remainingBaseQty = Math.max(0, orderedBaseQty - deliveredBaseQty);
    const remainingQty = saleUnitRatio > 0 ? remainingBaseQty / saleUnitRatio : remainingBaseQty;
    const deliveredQty = saleUnitRatio > 0 ? deliveredBaseQty / saleUnitRatio : deliveredBaseQty;

    if (remainingQty <= 0) continue;

    const bucket = pendingItemsByOrder.get(row.order_id) ?? [];
    bucket.push({
      orderItemId: row.id,
      productId: row.product_id,
      productName: row.products.name,
      productSku: row.products.sku,
      saleUnitLabel: row.sale_unit_label ?? "หน่วย",
      orderedQty: toNum(row.quantity),
      deliveredQty,
      remainingQty,
    });
    pendingItemsByOrder.set(row.order_id, bucket);
  }

  return rows.map((row) => ({
    id: row.id,
    orderNumber: row.order_number,
    orderDate: row.order_date,
    customerId: row.customer_id,
    customerName: row.customers.name,
    customerCode: row.customers.customer_code,
    totalAmount: toNum(row.total_amount),
    fulfillmentStatus: row.fulfillment_status === "partial" ? "partial" : "pending",
    pendingItems: pendingItemsByOrder.get(row.id) ?? [],
  }));
}

/**
 * All submitted/confirmed orders for a store on a given date,
 * used for the store-level "สร้างใบส่งของ" modal.
 */
export async function getStoreOrdersForDelivery(
  organizationId: string,
  customerId: string,
  orderDate: string,
): Promise<DeliveryFormData[]> {
  const supabase = getSupabaseAdmin();

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .eq("order_date", orderDate)
    .in("status", ["submitted", "confirmed"])
    .in("fulfillment_status", ["pending", "partial"])
    .order("created_at", { ascending: true });

  if (error || !orders || (orders as { id: string }[]).length === 0) return [];

  const results = await Promise.all(
    (orders as { id: string }[]).map((o) =>
      getOrderItemsForDelivery(organizationId, o.id),
    ),
  );

  return results.filter((r): r is DeliveryFormData => r !== null);
}

/**
 * Full item data for the "สร้างใบส่งของ" form,
 * including already-delivered quantities.
 */
export async function getOrderItemsForDelivery(
  organizationId: string,
  orderId: string,
): Promise<DeliveryFormData | null> {
  const supabase = getSupabaseAdmin();

  // 1. Order header
  const { data: orderRow, error: orderError } = await supabase
    .from("orders")
    .select("id, order_number, order_date, customer_id, customers!inner(name, customer_code)")
    .eq("id", orderId)
    .eq("organization_id", organizationId)
    .single();

  if (orderError || !orderRow) return null;

  const order = orderRow as RawOrderRow;

  // 2. Order items with product details
  const { data: itemRows, error: itemsError } = await supabase
    .from("order_items")
    .select(`
      id, product_id, product_sale_unit_id,
      quantity, quantity_in_base_unit,
      sale_unit_label, sale_unit_ratio, unit_price,
      products!inner(name, sku, unit, stock_quantity, reserved_quantity)
    `)
    .eq("order_id", orderId)
    .eq("organization_id", organizationId);

  if (itemsError || !itemRows) return null;

  // 3. Already-confirmed delivery notes for this order
  const { data: dnRows } = await supabase
    .from("delivery_notes")
    .select("id")
    .eq("order_id", orderId)
    .eq("status", "confirmed");

  const dnIds = ((dnRows ?? []) as { id: string }[]).map((r) => r.id);

  // 4. First product image per product
  const productIds = [...new Set((itemRows as RawOrderItemRow[]).map((r) => r.product_id))];
  const imageMap = new Map<string, string>();
  if (productIds.length > 0) {
    const { data: imgRows } = await supabase
      .from("product_images")
      .select("product_id, public_url")
      .in("product_id", productIds)
      .order("sort_order", { ascending: true });
    for (const img of (imgRows ?? []) as { product_id: string; public_url: string }[]) {
      if (!imageMap.has(img.product_id)) imageMap.set(img.product_id, img.public_url);
    }
  }

  // 5. Delivered quantities per order_item
  const deliveredMap = new Map<string, number>();
  if (dnIds.length > 0) {
    const { data: deliveredRows } = await supabase
      .from("delivery_note_items")
      .select("order_item_id, quantity_in_base_unit")
      .in("delivery_note_id", dnIds);

    for (const row of (deliveredRows ?? []) as RawDeliveredRow[]) {
      const prev = deliveredMap.get(row.order_item_id) ?? 0;
      deliveredMap.set(row.order_item_id, prev + toNum(row.quantity_in_base_unit));
    }
  }

  // 6. Build result
  const items: DeliveryItemData[] = (itemRows as RawOrderItemRow[]).map((row) => {
    const saleUnitRatio = toNum(row.sale_unit_ratio) || 1;
    const orderedBaseQty = toNum(row.quantity_in_base_unit) || toNum(row.quantity) * saleUnitRatio;
    const deliveredBaseQty = deliveredMap.get(row.id) ?? 0;
    const remainingBaseQty = Math.max(0, orderedBaseQty - deliveredBaseQty);
    const stockQty = toNum(row.products.stock_quantity);
    const reservedQty = toNum(row.products.reserved_quantity);
    const availableStock = Math.max(0, stockQty - reservedQty);

    return {
      orderItemId: row.id,
      productId: row.product_id,
      productName: row.products.name,
      productSku: row.products.sku,
      productUnit: row.products.unit,
      productSaleUnitId: row.product_sale_unit_id,
      saleUnitLabel: row.sale_unit_label ?? row.products.unit,
      saleUnitRatio,
      orderedQty: toNum(row.quantity),
      orderedBaseQty,
      deliveredBaseQty,
      remainingBaseQty,
      availableStock,
      unitPrice: toNum(row.unit_price),
      imageUrl: imageMap.get(row.product_id) ?? null,
    };
  });

  return {
    orderId: order.id,
    orderNumber: order.order_number,
    orderDate: order.order_date,
    customerId: order.customer_id,
    customerName: order.customers.name,
    customerCode: order.customers.customer_code,
    items,
  };
}
