"use server";

import { revalidateTag } from "next/cache";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrderItemsForDelivery, getStoreOrdersForDelivery } from "@/lib/delivery/admin";
import type { DeliveryFormData } from "@/lib/delivery/admin";

export type BatchDeliveryReviewStoreInput = {
  customerId: string;
  customerName: string;
  customerCode: string;
  orderIds?: string[];
  orderNumbers?: string[];
  orderRounds: number;
  totalAmount: number;
};

export type BatchDeliveryReviewOrderItem = {
  orderId: string;
  orderItemId: string;
  productId: string;
  productSaleUnitId: string | null;
  quantityDelivered: number;
  saleUnitLabel: string;
  saleUnitRatio: number;
  unitPrice: number;
};

export type BatchDeliveryReviewItem = {
  groupKey: string;
  productId: string;
  productName: string;
  productSku: string;
  imageUrl: string | null;
  productUnit: string;
  productSaleUnitId: string | null;
  saleUnitLabel: string;
  saleUnitRatio: number;
  unitPrice: number;
  totalOrdered: number;
  totalRemaining: number;
  orderItems: BatchDeliveryReviewOrderItem[];
};

export type BatchDeliveryReviewGroup = BatchDeliveryReviewStoreInput & {
  groupedItems: BatchDeliveryReviewItem[];
  orderIds: string[];
  orderNumbers: string[];
};

type RawReviewOrderRow = {
  id: string;
  order_date: string;
  customer_id: string;
  customers: {
    name: string;
    customer_code: string;
  };
};

type RawReviewItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  product_sale_unit_id: string | null;
  quantity: number | string | null;
  quantity_in_base_unit: number | string | null;
  sale_unit_label: string | null;
  sale_unit_ratio: number | string | null;
  unit_price: number | string | null;
  products: {
    name: string;
    sku: string;
    unit: string;
  };
};

type RawProductImageRow = {
  product_id: string;
  public_url: string;
};

type RawDeliveredRow = {
  order_item_id: string;
  quantity_in_base_unit: number | string | null;
};

type ReviewRpcAdmin = ReturnType<typeof getSupabaseAdmin> & {
  rpc: (
    fn: "get_delivery_review_data",
    args: {
      p_organization_id: string;
      p_stores: BatchDeliveryReviewStoreInput[];
      p_order_date: string;
      p_include_order_items: boolean;
    },
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

function toNum(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toGroupKey(productId: string, saleUnitLabel: string) {
  return `${productId}::${saleUnitLabel}`;
}

function getOrderedSaleUnitQty(row: RawReviewItemRow, saleUnitRatio: number) {
  const orderedQty = toNum(row.quantity);
  if (orderedQty > 0) {
    return orderedQty;
  }

  const orderedBaseQty = toNum(row.quantity_in_base_unit);
  return saleUnitRatio > 0 ? orderedBaseQty / saleUnitRatio : orderedBaseQty;
}

async function getReviewImageMap(
  admin: ReturnType<typeof getSupabaseAdmin>,
  productIds: string[],
) {
  const uniqueProductIds = Array.from(new Set(productIds.filter(Boolean)));
  const imageMap = new Map<string, string>();

  if (uniqueProductIds.length === 0) {
    return imageMap;
  }

  const { data: imageRows, error: imageError } = await admin
    .from("product_images")
    .select("product_id, public_url")
    .in("product_id", uniqueProductIds)
    .order("sort_order", { ascending: true });

  if (imageError) {
    console.error("getBatchDeliveryReviewDataAction images error:", imageError);
    return imageMap;
  }

  for (const imageRow of (imageRows ?? []) as RawProductImageRow[]) {
    if (!imageMap.has(imageRow.product_id)) {
      imageMap.set(imageRow.product_id, imageRow.public_url);
    }
  }

  return imageMap;
}

async function attachReviewImages(
  admin: ReturnType<typeof getSupabaseAdmin>,
  groups: BatchDeliveryReviewGroup[],
) {
  const imageMap = await getReviewImageMap(
    admin,
    groups.flatMap((group) => group.groupedItems.map((item) => item.productId)),
  );

  if (imageMap.size === 0) {
    return groups;
  }

  return groups.map((group) => ({
    ...group,
    groupedItems: group.groupedItems.map((item) => ({
      ...item,
      imageUrl: imageMap.get(item.productId) ?? item.imageUrl ?? null,
    })),
  }));
}

function normalizeReviewGroups(value: unknown): BatchDeliveryReviewGroup[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value
    .map((group) => {
      if (!group || typeof group !== "object") return null;
      const row = group as Record<string, unknown>;
      const groupedItems = Array.isArray(row.groupedItems) ? row.groupedItems : [];
      return {
        customerId: String(row.customerId ?? ""),
        customerName: String(row.customerName ?? ""),
        customerCode: String(row.customerCode ?? ""),
        orderIds: Array.isArray(row.orderIds) ? row.orderIds.map((id) => String(id)) : [],
        orderNumbers: Array.isArray(row.orderNumbers) ? row.orderNumbers.map((id) => String(id)) : [],
        orderRounds: toNum(row.orderRounds as number | string | null),
        totalAmount: toNum(row.totalAmount as number | string | null),
        groupedItems: groupedItems.map((item) => {
          const itemRow = item as Record<string, unknown>;
          const orderItems = Array.isArray(itemRow.orderItems) ? itemRow.orderItems : [];
          return {
            groupKey: String(itemRow.groupKey ?? ""),
            productId: String(itemRow.productId ?? ""),
            productName: String(itemRow.productName ?? ""),
            productSku: String(itemRow.productSku ?? ""),
            imageUrl: itemRow.imageUrl ? String(itemRow.imageUrl) : null,
            productUnit: String(itemRow.productUnit ?? ""),
            productSaleUnitId: itemRow.productSaleUnitId ? String(itemRow.productSaleUnitId) : null,
            saleUnitLabel: String(itemRow.saleUnitLabel ?? ""),
            saleUnitRatio: toNum(itemRow.saleUnitRatio as number | string | null),
            unitPrice: toNum(itemRow.unitPrice as number | string | null),
            totalOrdered: toNum(itemRow.totalOrdered as number | string | null),
            totalRemaining: toNum(itemRow.totalRemaining as number | string | null),
            orderItems: orderItems.map((orderItem) => {
              const orderItemRow = orderItem as Record<string, unknown>;
              return {
                orderId: String(orderItemRow.orderId ?? ""),
                orderItemId: String(orderItemRow.orderItemId ?? ""),
                productId: String(orderItemRow.productId ?? ""),
                productSaleUnitId: orderItemRow.productSaleUnitId ? String(orderItemRow.productSaleUnitId) : null,
                quantityDelivered: toNum(orderItemRow.quantityDelivered as number | string | null),
                saleUnitLabel: String(orderItemRow.saleUnitLabel ?? ""),
                saleUnitRatio: toNum(orderItemRow.saleUnitRatio as number | string | null),
                unitPrice: toNum(orderItemRow.unitPrice as number | string | null),
              };
            }),
          };
        }),
      };
    })
    .filter((group): group is BatchDeliveryReviewGroup =>
      Boolean(group && group.customerId && group.groupedItems.length > 0),
    );
}

// Get form data

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

// Create delivery note

export async function getBatchOrderDeliveryDataAction(
  stores: { customerId: string; orderIds: string[] }[],
): Promise<Record<string, DeliveryFormData[]>> {
  const session = await requireAppRole("admin");
  const normalizedStores = stores
    .map((store) => ({
      customerId: store.customerId.trim(),
      orderIds: Array.from(new Set(store.orderIds.map((id) => id.trim()).filter(Boolean))),
    }))
    .filter((store) => store.customerId && store.orderIds.length > 0);

  if (normalizedStores.length === 0) {
    return {};
  }

  const rows = await Promise.all(
    normalizedStores.map(async (store) => {
      const orders = await Promise.all(
        store.orderIds.map((orderId) => getOrderItemsForDelivery(session.organizationId, orderId)),
      );
      return [
        store.customerId,
        orders.filter(
          (order): order is DeliveryFormData =>
            order !== null && order.customerId === store.customerId,
        ),
      ] as const;
    }),
  );

  return Object.fromEntries(rows);
}

export async function getBatchDeliveryReviewDataAction(
  stores: BatchDeliveryReviewStoreInput[],
  orderDate: string,
  includeOrderItems = false,
): Promise<BatchDeliveryReviewGroup[]> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();
  const normalizedStores = stores
    .map((store) => ({
      ...store,
      customerId: store.customerId.trim(),
      customerName: store.customerName.trim(),
      customerCode: store.customerCode.trim(),
      orderIds: Array.from(new Set((store.orderIds ?? []).map((id) => id.trim()).filter(Boolean))),
      orderNumbers: Array.from(new Set((store.orderNumbers ?? []).map((id) => id.trim()).filter(Boolean))),
    }))
    .filter((store) => store.customerId);

  if (normalizedStores.length === 0) {
    return [];
  }

  const requestedOrderIds = Array.from(new Set(normalizedStores.flatMap((store) => store.orderIds)));

  const { data: rpcData, error: rpcError } = await (admin as unknown as ReviewRpcAdmin).rpc(
    "get_delivery_review_data",
    {
      p_organization_id: session.organizationId,
      p_stores: normalizedStores,
      p_order_date: orderDate,
      p_include_order_items: includeOrderItems,
    },
  );

  if (!rpcError) {
    const rpcGroups = normalizeReviewGroups(rpcData);
    const hasRequestedOrderNumbers = normalizedStores.some((store) => store.orderNumbers.length > 0);
    const rpcHasOrderNumbers = !hasRequestedOrderNumbers || rpcGroups?.every((group) => group.orderNumbers.length > 0);
    if (rpcGroups && rpcHasOrderNumbers && (requestedOrderIds.length === 0 || rpcGroups.length >= normalizedStores.length)) {
      return attachReviewImages(admin, rpcGroups);
    }
  } else if (!rpcError.message?.includes("get_delivery_review_data")) {
    console.error("getBatchDeliveryReviewDataAction rpc error:", rpcError);
  }

  const storeByCustomerId = new Map(normalizedStores.map((store) => [store.customerId, store]));
  const customerIds = normalizedStores.map((store) => store.customerId);

  let orderQuery = admin
    .from("orders")
    .select("id, order_date, customer_id, customers!inner(name, customer_code)")
    .eq("organization_id", session.organizationId)
    .in("status", ["submitted", "confirmed"])
    .order("created_at", { ascending: true });

  if (requestedOrderIds.length > 0) {
    orderQuery = orderQuery.in("id", requestedOrderIds);
  } else {
    orderQuery = orderQuery.in("customer_id", customerIds).eq("order_date", orderDate);
  }

  const { data: orderRows, error: orderError } = await orderQuery;
  if (orderError) {
    console.error("getBatchDeliveryReviewDataAction orders error:", orderError);
    throw new Error("โหลดรายการสำหรับสร้างใบส่งของไม่สำเร็จ");
  }

  const orders = ((orderRows ?? []) as RawReviewOrderRow[]).filter((order) =>
    storeByCustomerId.has(order.customer_id),
  );
  if (orders.length === 0) {
    return [];
  }

  const orderById = new Map(orders.map((order) => [order.id, order]));
  const orderIds = orders.map((order) => order.id);

  const { data: itemRows, error: itemError } = await admin
    .from("order_items")
    .select(`
      id, order_id, product_id, product_sale_unit_id,
      quantity, quantity_in_base_unit,
      sale_unit_label, sale_unit_ratio, unit_price,
      products!inner(name, sku, unit)
    `)
    .eq("organization_id", session.organizationId)
    .in("order_id", orderIds);

  if (itemError) {
    console.error("getBatchDeliveryReviewDataAction items error:", itemError);
    throw new Error("โหลดรายการสินค้าไม่สำเร็จ");
  }

  const items = (itemRows ?? []) as RawReviewItemRow[];
  if (items.length === 0) {
    return [];
  }

  const imageMap = await getReviewImageMap(admin, items.map((item) => item.product_id));

  const orderItemIds = items.map((item) => item.id);
  const deliveredMap = new Map<string, number>();
  if (orderItemIds.length > 0) {
    const { data: deliveredRows, error: deliveredError } = await admin
      .from("delivery_note_items")
      .select("order_item_id, quantity_in_base_unit")
      .eq("organization_id", session.organizationId)
      .in("order_item_id", orderItemIds);

    if (deliveredError) {
      console.error("getBatchDeliveryReviewDataAction delivered error:", deliveredError);
      throw new Error("โหลดจำนวนที่สร้างใบส่งของแล้วไม่สำเร็จ");
    }

    for (const row of (deliveredRows ?? []) as RawDeliveredRow[]) {
      deliveredMap.set(
        row.order_item_id,
        (deliveredMap.get(row.order_item_id) ?? 0) + toNum(row.quantity_in_base_unit),
      );
    }
  }

  const groupByCustomerId = new Map<string, BatchDeliveryReviewGroup>();
  for (const store of normalizedStores) {
    groupByCustomerId.set(store.customerId, {
      ...store,
      orderIds: [],
      orderNumbers: store.orderNumbers,
      groupedItems: [],
    });
  }

  const itemBucketByCustomerAndKey = new Map<string, BatchDeliveryReviewItem>();
  for (const order of orders) {
    const group = groupByCustomerId.get(order.customer_id);
    if (!group) continue;
    group.orderIds.push(order.id);
  }

  for (const row of items) {
    const order = orderById.get(row.order_id);
    if (!order) continue;

    const group = groupByCustomerId.get(order.customer_id);
    if (!group) continue;

    const saleUnitRatio = toNum(row.sale_unit_ratio) || 1;
    const saleUnitLabel = row.sale_unit_label ?? row.products.unit;
    const orderedBaseQty = toNum(row.quantity_in_base_unit) || toNum(row.quantity) * saleUnitRatio;
    const deliveredBaseQty = deliveredMap.get(row.id) ?? 0;
    const remainingBaseQty = Math.max(0, orderedBaseQty - deliveredBaseQty);
    const remainingQty = saleUnitRatio > 0 ? remainingBaseQty / saleUnitRatio : remainingBaseQty;
    const orderedQty = getOrderedSaleUnitQty(row, saleUnitRatio);
    if (orderedQty <= 0) continue;

    const key = toGroupKey(row.product_id, saleUnitLabel);
    const bucketKey = `${order.customer_id}::${key}`;
    let bucket = itemBucketByCustomerAndKey.get(bucketKey);
    if (!bucket) {
      bucket = {
        groupKey: key,
        productId: row.product_id,
        productName: row.products.name,
        productSku: row.products.sku,
        imageUrl: imageMap.get(row.product_id) ?? null,
        productUnit: row.products.unit,
        productSaleUnitId: row.product_sale_unit_id,
        saleUnitLabel,
        saleUnitRatio,
        unitPrice: toNum(row.unit_price),
        totalOrdered: 0,
        totalRemaining: 0,
        orderItems: [],
      };
      itemBucketByCustomerAndKey.set(bucketKey, bucket);
      group.groupedItems.push(bucket);
    }

    bucket.totalOrdered += orderedQty;
    bucket.totalRemaining += remainingQty;
    if (includeOrderItems) {
      bucket.orderItems.push({
        orderId: row.order_id,
        orderItemId: row.id,
        productId: row.product_id,
        productSaleUnitId: row.product_sale_unit_id,
        quantityDelivered: orderedQty,
        saleUnitLabel,
        saleUnitRatio,
        unitPrice: toNum(row.unit_price),
      });
    }
  }

  return normalizedStores
    .map((store) => groupByCustomerId.get(store.customerId))
    .filter((group): group is BatchDeliveryReviewGroup =>
      Boolean(group && group.orderIds.length > 0 && group.groupedItems.length > 0),
    )
    .map((group) => ({
      ...group,
      orderIds: Array.from(new Set(group.orderIds)),
      groupedItems: group.groupedItems.sort((a, b) => a.productName.localeCompare(b.productName, "th")),
    }));
}

export type CreateDeliveryState = {
  message: string;
  status: "idle" | "success" | "error";
  deliveryNumber?: string;
  deliveryId?: string;
};

export type BatchCreateDeliveryItemInput = {
  orderItemId: string;
  productId: string;
  productSaleUnitId: string | null;
  quantityDelivered: number;
  saleUnitLabel: string;
  saleUnitRatio: number;
  unitPrice: number;
};

export type BatchCreateDeliveryNoteInput = {
  customerId: string;
  customerName: string;
  orderIds: string[];
  notes?: string;
  vehicleId?: string | null;
  items: BatchCreateDeliveryItemInput[];
};

export type BatchCreateDeliveryNoteResult = {
  customerId: string;
  customerName: string;
  state: CreateDeliveryState;
};

function bangkokTodayIsoDate() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
}

function normalizeDeliveryDate(value: FormDataEntryValue | null) {
  const date = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : bangkokTodayIsoDate();
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
  const vehicleId = String(formData.get("vehicleId") ?? "").trim() || null;
  const deliveryDate = normalizeDeliveryDate(formData.get("deliveryDate"));

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
    p_vehicle_id: vehicleId,
    p_delivery_date: deliveryDate,
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

  revalidateTag(`orders-${session.organizationId}`, "max");
  revalidateTag(`stock-${session.organizationId}`, "max");
  revalidateTag(`settings-${session.organizationId}`, "max");

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

export async function createBatchDeliveryNotesAction(
  groups: BatchCreateDeliveryNoteInput[],
  deliveryDate: string,
): Promise<BatchCreateDeliveryNoteResult[]> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as RpcAdmin;
  const normalizedDate = normalizeDeliveryDate(deliveryDate);
  const results: BatchCreateDeliveryNoteResult[] = [];
  let hasSuccess = false;

  for (const group of groups) {
    const customerId = group.customerId.trim();
    const orderIds = Array.from(new Set(group.orderIds.map((id) => id.trim()).filter(Boolean)));
    const items = group.items.filter((item) => item.quantityDelivered > 0);

    if (!customerId || orderIds.length === 0 || items.length === 0) {
      results.push({
        customerId: group.customerId,
        customerName: group.customerName,
        state: {
          status: "error",
          message: "ข้อมูลใบส่งของไม่ครบถ้วน",
        },
      });
      continue;
    }

    const { data, error } = await admin.rpc("create_store_delivery_note", {
      p_organization_id: session.organizationId,
      p_order_ids: orderIds,
      p_customer_id: customerId,
      p_vehicle_id: group.vehicleId?.trim() || null,
      p_delivery_date: normalizedDate,
      p_notes: group.notes?.trim() || null,
      p_created_by: session.userId,
      p_items: items,
    });

    if (error) {
      results.push({
        customerId: group.customerId,
        customerName: group.customerName,
        state: {
          status: "error",
          message: error.message ?? "สร้างใบส่งของไม่สำเร็จ",
        },
      });
      continue;
    }

    const deliveryNumber = String(data);
    const { data: dnRow } = await admin
      .from("delivery_notes")
      .select("id")
      .eq("organization_id", session.organizationId)
      .eq("delivery_number", deliveryNumber)
      .single();

    hasSuccess = true;
    results.push({
      customerId: group.customerId,
      customerName: group.customerName,
      state: {
        status: "success",
        message: "สร้างใบส่งของเรียบร้อยแล้ว",
        deliveryNumber,
        deliveryId: (dnRow as { id: string } | null)?.id,
      },
    });
  }

  if (hasSuccess) {
    revalidateTag(`orders-${session.organizationId}`, "max");
    revalidateTag(`stock-${session.organizationId}`, "max");
    revalidateTag(`settings-${session.organizationId}`, "max");
  }

  return results;
}

export async function createBatchDeliveryNotesFromStoresAction(
  stores: BatchDeliveryReviewStoreInput[],
  deliveryDate: string,
): Promise<BatchCreateDeliveryNoteResult[]> {
  const reviewGroups = await getBatchDeliveryReviewDataAction(stores, deliveryDate, true);
  const payload: BatchCreateDeliveryNoteInput[] = reviewGroups.map((group) => ({
    customerId: group.customerId,
    customerName: group.customerName,
    orderIds: group.orderIds,
    notes: "",
    items: group.groupedItems.flatMap((item) => item.orderItems),
  }));

  return createBatchDeliveryNotesAction(payload, deliveryDate);
}
