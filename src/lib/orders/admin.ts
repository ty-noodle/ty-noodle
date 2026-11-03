import "server-only";

import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { compareCustomerOrder } from "@/lib/settings/customer-order";

type QueryError = {
  message?: string;
} | null;

type RpcResult = Promise<{ data: unknown; error: QueryError }>;

type OrdersSelectResult = Promise<{ data: OrderRoundRow[] | null; error: QueryError }>;

type OrdersSelectChain = {
  eq: (column: string, value: string) => OrdersSelectChain;
  order: (column: string, options: { ascending: boolean }) => OrdersSelectResult;
};

type OrdersTable = {
  select: (columns: string) => OrdersSelectChain;
};

type OrderAdminClient = ReturnType<typeof getSupabaseAdmin> & {
  from: (table: "orders") => OrdersTable;
  rpc: (fn: string, params: Record<string, unknown>) => RpcResult;
};

type SummaryRow = {
  customer_code: string;
  customer_id: string;
  customer_name: string;
  is_complete: boolean;
  latest_order_at: string;
  order_rounds: number | string;
  product_count: number | string;
  shortage_product_count: number | string;
  total_amount: number | string;
  total_quantity: number | string;
};

type ItemAggregateRow = {
  current_stock_quantity: number | string;
  deliverable_quantity: number | string;
  image_url: string | null;
  line_total: number | string;
  order_rounds: number | string;
  ordered_quantity: number | string;
  product_id: string;
  product_name: string;
  product_sale_unit_id: string | null;
  product_sku: string;
  product_unit: string;
  product_unit_ratio: number | string;
  short_quantity: number | string;
  unit_price: number | string;
};

type OrderRoundRow = {
  created_at: string;
  id: string;
  order_number: string;
  status: "draft" | "submitted" | "confirmed" | "cancelled";
  total_amount: number | string;
};

type RawOrderItemDeliveryRow = {
  id: string;
  product_id: string;
  product_sale_unit_id: string | null;
  sale_unit_label: string | null;
};

type RawDeliveryNoteItemQtyRow = {
  order_item_id: string;
  quantity_delivered: number | string;
};

export type OrderStoreSummary = {
  customerCode: string;
  customerId: string;
  customerName: string;
  sortOrder: number;
  isComplete: boolean;
  latestOrderAt: string;
  orderRounds: number;
  productCount: number;
  shortageProductCount: number;
  totalAmount: number;
  totalQuantity: number;
  vehicleId: string | null;
  vehicleName: string | null;
};

export type OrderItemAggregate = {
  currentStockBaseQuantity: number;
  currentStockQuantity: number;
  deliverableQuantity: number;
  deliveredQuantity: number;
  imageUrl: string | null;
  lineTotal: number;
  orderRounds: number;
  orderedBaseQuantity: number;
  orderedQuantity: number;
  pendingQuantity: number;
  productBaseUnit: string;
  productId: string;
  productName: string;
  productSaleUnitId: string | null;
  productSku: string;
  productUnit: string;
  productUnitRatio: number;
  shortBaseQuantity: number;
  shortQuantity: number;
  unitPrice: number;
};

export type OrderRoundSummary = {
  createdAt: string;
  id: string;
  orderNumber: string;
  status: "draft" | "submitted" | "confirmed" | "cancelled";
  totalAmount: number;
};

export type OrderStoreDetail = {
  customerCode: string;
  customerId: string;
  customerName: string;
  items: OrderItemAggregate[];
  latestOrderAt: string | null;
  orderRounds: OrderRoundSummary[];
  shortageProductCount: number;
  totalAmount: number;
  totalDeliverableQuantity: number;
  totalOrderedQuantity: number;
  totalShortQuantity: number;
};

export type OrderWorkboardData = {
  selectedCustomerId: string | null;
  selectedStore: OrderStoreDetail | null;
  stats: {
    activeStoreCount: number;
    shortageStoreCount: number;
    totalAmount: number;
    totalOrderRounds: number;
  };
  stores: OrderStoreSummary[];
};

function normalizeNumeric(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeSearchTerm(value: string | null | undefined) {
  const nextValue = value?.trim();
  return nextValue ? nextValue : null;
}

function normalizeVisibleStores(stores: OrderStoreSummary[]) {
  const uniqueStores = new Map<string, OrderStoreSummary>();

  for (const store of [...stores].filter((entry) => !entry.isComplete).sort(compareCustomerOrder)) {
    if (!uniqueStores.has(store.customerId)) {
      uniqueStores.set(store.customerId, store);
    }
  }

  return Array.from(uniqueStores.values());
}

async function getOrderStoreSummaries(
  organizationId: string,
  orderDate: string,
  searchTerm: string | null,
) {
  const supabase = getSupabaseAdmin() as unknown as OrderAdminClient;

  const { data, error } = await supabase.rpc("get_order_daily_store_summaries", {
    p_limit: 80,
    p_offset: 0,
    p_order_date: orderDate,
    p_organization_id: organizationId,
    p_search: searchTerm,
  });

  if (error) {
    throw new Error(error.message ?? "Failed to load order summaries.");
  }

  const rows = (data ?? []) as SummaryRow[];
  if (rows.length === 0) return { stores: [], vehicles: [] };

  const customerIds = rows.map((r) => r.customer_id);

  const admin = getSupabaseAdmin();
  const [customersResult, vehiclesResult] = await Promise.all([
    admin
      .from("customers")
      .select("id, default_vehicle_id, sort_order")
      .eq("organization_id", organizationId)
      .in("id", customerIds),
    admin
      .from("vehicles")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);

  const vehicles = ((vehiclesResult.data ?? []) as { id: string; name: string }[]);
  const vehicleNameMap = new Map(vehicles.map((v) => [v.id, v.name]));
  const customerMap = new Map(
    ((customersResult.data ?? []) as unknown as Array<{
      id: string;
      default_vehicle_id: string | null;
      sort_order: number | string;
    }>).map((c) => [c.id, c]),
  );

  const stores = rows.map((row) => {
    const customer = customerMap.get(row.customer_id);
    const vehicleId = customer?.default_vehicle_id ?? null;
    return {
      customerCode: row.customer_code,
      customerId: row.customer_id,
      customerName: row.customer_name,
      sortOrder: Number(customer?.sort_order ?? Number.MAX_SAFE_INTEGER),
      isComplete: !!row.is_complete,
      latestOrderAt: row.latest_order_at,
      orderRounds: normalizeNumeric(row.order_rounds),
      productCount: normalizeNumeric(row.product_count),
      shortageProductCount: normalizeNumeric(row.shortage_product_count),
      totalAmount: normalizeNumeric(row.total_amount),
      totalQuantity: normalizeNumeric(row.total_quantity),
      vehicleId,
      vehicleName: vehicleId ? (vehicleNameMap.get(vehicleId) ?? null) : null,
    };
  });

  return { stores: stores.toSorted(compareCustomerOrder), vehicles };
}

async function getOrderStoreDetail(
  organizationId: string,
  orderDate: string,
  customerId: string,
  stores: OrderStoreSummary[],
): Promise<OrderStoreDetail | null> {
  const supabase = getSupabaseAdmin() as unknown as OrderAdminClient;
  const currentStore = stores.find((store) => store.customerId === customerId) ?? null;

  if (!currentStore) {
    return null;
  }

  const [{ data: itemsData, error: itemsError }, { data: roundsData, error: roundsError }] =
    await Promise.all([
      supabase.rpc("get_order_daily_store_items", {
        p_customer_id: customerId,
        p_order_date: orderDate,
        p_organization_id: organizationId,
      }),
      supabase
        .from("orders")
        .select("id, order_number, status, total_amount, created_at")
        .eq("organization_id", organizationId)
        .eq("customer_id", customerId)
        .eq("order_date", orderDate)
        .order("created_at", { ascending: false }),
    ]);

  if (itemsError) {
    throw new Error(itemsError.message ?? "Failed to load order items.");
  }

  if (roundsError) {
    throw new Error(roundsError.message ?? "Failed to load order rounds.");
  }

  const orderIds = ((roundsData ?? []) as OrderRoundRow[]).map((row) => row.id);
  const deliveredQtyMap = new Map<string, number>();

  if (orderIds.length > 0) {
    const { data: orderItemRows, error: orderItemsError } = await getSupabaseAdmin()
      .from("order_items")
      .select("id, product_id, product_sale_unit_id, sale_unit_label")
      .in("order_id", orderIds);

    if (orderItemsError) {
      throw new Error(orderItemsError.message ?? "Failed to load delivered item mappings.");
    }

    const rawOrderItemRows = (orderItemRows ?? []) as RawOrderItemDeliveryRow[];
    const orderItemIds = rawOrderItemRows.map((row) => row.id);

    if (orderItemIds.length > 0) {
      const { data: deliveredRows, error: deliveredError } = await getSupabaseAdmin()
        .from("delivery_note_items")
        .select("order_item_id, quantity_delivered")
        .in("order_item_id", orderItemIds);

      if (deliveredError) {
        throw new Error(deliveredError.message ?? "Failed to load delivered quantities.");
      }

      const orderItemKeyMap = new Map<string, string>();
      for (const row of rawOrderItemRows) {
        const saleUnitKey = row.sale_unit_label ?? "";
        orderItemKeyMap.set(row.id, `${row.product_id}::${saleUnitKey}`);
      }

      for (const row of (deliveredRows ?? []) as RawDeliveryNoteItemQtyRow[]) {
        const key = orderItemKeyMap.get(row.order_item_id);
        if (!key) continue;
        deliveredQtyMap.set(key, (deliveredQtyMap.get(key) ?? 0) + normalizeNumeric(row.quantity_delivered));
      }
    }
  }

  const itemRows = (itemsData ?? []) as ItemAggregateRow[];
  const productIds = Array.from(new Set(itemRows.map((row) => row.product_id)));
  const productBaseMap = new Map<string, { stockQuantity: number; unit: string }>();

  if (productIds.length > 0) {
    const { data: productRows, error: productError } = await getSupabaseAdmin()
      .from("products")
      .select("id, stock_quantity, unit")
      .in("id", productIds);

    if (productError) {
      throw new Error(productError.message ?? "Failed to load product stock.");
    }

    for (const product of (productRows ?? []) as Array<{
      id: string;
      stock_quantity: number | string | null;
      unit: string | null;
    }>) {
      productBaseMap.set(product.id, {
        stockQuantity: normalizeNumeric(product.stock_quantity),
        unit: product.unit ?? "",
      });
    }
  }

  const orderedBaseByProduct = new Map<string, number>();
  for (const row of itemRows) {
    const ratio = normalizeNumeric(row.product_unit_ratio) || 1;
    const orderedBase = normalizeNumeric(row.ordered_quantity) * ratio;
    orderedBaseByProduct.set(
      row.product_id,
      (orderedBaseByProduct.get(row.product_id) ?? 0) + orderedBase,
    );
  }

  const shortBaseByProduct = new Map<string, number>();
  for (const [productId, orderedBase] of orderedBaseByProduct.entries()) {
    const stockBase = productBaseMap.get(productId)?.stockQuantity ?? 0;
    shortBaseByProduct.set(productId, Math.max(0, orderedBase - stockBase));
  }

  const items = itemRows.map((row) => {
    const deliveredQuantity = deliveredQtyMap.get(`${row.product_id}::${row.product_unit}`) ?? 0;
    const pendingQuantity = Math.max(0, normalizeNumeric(row.ordered_quantity) - deliveredQuantity);
    const ratio = normalizeNumeric(row.product_unit_ratio) || 1;
    const orderedBaseQuantity = normalizeNumeric(row.ordered_quantity) * ratio;
    const productBase = productBaseMap.get(row.product_id) ?? {
      stockQuantity: normalizeNumeric(row.current_stock_quantity) * ratio,
      unit: "",
    };
    const shortBaseQuantity = shortBaseByProduct.get(row.product_id) ?? 0;

    return {
      currentStockBaseQuantity: productBase.stockQuantity,
      currentStockQuantity: normalizeNumeric(row.current_stock_quantity),
      deliverableQuantity: normalizeNumeric(row.deliverable_quantity),
      deliveredQuantity,
      imageUrl: row.image_url ?? null,
      lineTotal: normalizeNumeric(row.line_total),
      orderRounds: normalizeNumeric(row.order_rounds),
      orderedBaseQuantity,
      orderedQuantity: normalizeNumeric(row.ordered_quantity),
      pendingQuantity,
      productBaseUnit: productBase.unit || row.product_unit,
      productId: row.product_id,
      productName: row.product_name,
      productSaleUnitId: row.product_sale_unit_id,
      productSku: row.product_sku,
      productUnit: row.product_unit,
      productUnitRatio: ratio,
      shortBaseQuantity,
      shortQuantity: shortBaseQuantity > 0 ? shortBaseQuantity / ratio : 0,
      unitPrice: normalizeNumeric(row.unit_price),
    };
  });

  const orderRounds = ((roundsData ?? []) as OrderRoundRow[]).map((row) => ({
    createdAt: row.created_at,
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    totalAmount: normalizeNumeric(row.total_amount),
  }));

  return {
    customerCode: currentStore.customerCode,
    customerId: currentStore.customerId,
    customerName: currentStore.customerName,
    items,
    latestOrderAt: currentStore.latestOrderAt,
    orderRounds,
    shortageProductCount: currentStore.shortageProductCount,
    totalAmount: currentStore.totalAmount,
    totalDeliverableQuantity: items.reduce((total, item) => total + item.deliverableQuantity, 0),
    totalOrderedQuantity: items.reduce((total, item) => total + item.orderedQuantity, 0),
    totalShortQuantity: Array.from(shortBaseByProduct.values()).reduce(
      (total, shortBase) => total + shortBase,
      0,
    ),
  } satisfies OrderStoreDetail;
}

export type OrderDailyData = {
  expandedDetails: Record<string, OrderStoreDetail>;
  stats: {
    activeStoreCount: number;
    shortageStoreCount: number;
    totalAmount: number;
    totalOrderRounds: number;
  };
  stores: OrderStoreSummary[];
  vehicles: { id: string; name: string }[];
};

async function getOrderDailyDataCached(
  organizationId: string,
  {
    expandedIds,
    orderDate,
    searchTerm,
  }: {
    expandedIds: string[];
    orderDate: string;
    searchTerm?: string | null;
  },
): Promise<OrderDailyData> {
  const { stores: rawStores, vehicles } = await getOrderStoreSummaries(
    organizationId,
    orderDate,
    normalizeSearchTerm(searchTerm),
  );

  // Keep a single canonical store list for table rendering and mobile navigation.
  const stores = normalizeVisibleStores(rawStores);

  const validIds = expandedIds.filter((id) => stores.some((s) => s.customerId === id));

  const detailResults = await Promise.all(
    validIds.map((id) => getOrderStoreDetail(organizationId, orderDate, id, stores)),
  );

  const expandedDetails: Record<string, OrderStoreDetail> = {};
  validIds.forEach((id, i) => {
    const detail = detailResults[i];
    if (detail) expandedDetails[id] = detail;
  });

  return {
    expandedDetails,
    stats: {
      activeStoreCount: stores.length,
      shortageStoreCount: stores.filter((s) => s.shortageProductCount > 0).length,
      totalAmount: stores.reduce((sum, s) => sum + s.totalAmount, 0),
      totalOrderRounds: stores.reduce((sum, s) => sum + s.orderRounds, 0),
    },
    stores,
    vehicles,
  };
}

export function getOrderDailyData(
  organizationId: string,
  opts: { expandedIds: string[]; orderDate: string; searchTerm?: string | null },
): Promise<OrderDailyData> {
  const expandedKey = [...opts.expandedIds].sort().join(",");

  return unstable_cache(
    () => getOrderDailyDataCached(organizationId, opts),
    ["orders", organizationId, opts.orderDate, opts.searchTerm ?? "", expandedKey],
    { tags: [`orders-${organizationId}`] },
  )();
}

export async function getOrderWorkboardData(
  organizationId: string,
  {
    orderDate,
    searchTerm,
    selectedCustomerId,
  }: {
    orderDate: string;
    searchTerm?: string | null;
    selectedCustomerId?: string | null;
  },
): Promise<OrderWorkboardData> {
  const { stores } = await getOrderStoreSummaries(
    organizationId,
    orderDate,
    normalizeSearchTerm(searchTerm),
  );
  const visibleStores = normalizeVisibleStores(stores);

  const nextSelectedCustomerId =
    selectedCustomerId && visibleStores.some((store) => store.customerId === selectedCustomerId)
      ? selectedCustomerId
      : (visibleStores[0]?.customerId ?? null);

  return {
    selectedCustomerId: nextSelectedCustomerId,
    selectedStore: nextSelectedCustomerId
      ? await getOrderStoreDetail(organizationId, orderDate, nextSelectedCustomerId, visibleStores)
      : null,
    stats: {
      activeStoreCount: visibleStores.length,
      shortageStoreCount: visibleStores.filter((store) => store.shortageProductCount > 0).length,
      totalAmount: visibleStores.reduce((total, store) => total + store.totalAmount, 0),
      totalOrderRounds: visibleStores.reduce((total, store) => total + store.orderRounds, 0),
    },
    stores: visibleStores,
  };
}

export async function getGlobalShortageDetails(organizationId: string, orderDate: string): Promise<OrderStoreDetail[]> {
  const { stores } = await getOrderStoreSummaries(organizationId, orderDate, null);
  const visibleStores = normalizeVisibleStores(stores);
  const shortageIds = visibleStores.filter((store) => store.shortageProductCount > 0).map((store) => store.customerId);
  if (shortageIds.length === 0) return [];
  
  const results = await Promise.all(
    shortageIds.map((id) => getOrderStoreDetail(organizationId, orderDate, id, visibleStores))
  );
  
  return results.filter((r): r is OrderStoreDetail => r !== null);
}
