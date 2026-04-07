import "server-only";

import { cache } from "react";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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
  product_sku: string;
  product_unit: string;
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
  latestOrderAt: string;
  orderRounds: number;
  productCount: number;
  shortageProductCount: number;
  totalAmount: number;
  totalQuantity: number;
};

export type OrderItemAggregate = {
  currentStockQuantity: number;
  deliverableQuantity: number;
  deliveredQuantity: number;
  imageUrl: string | null;
  lineTotal: number;
  orderRounds: number;
  orderedQuantity: number;
  pendingQuantity: number;
  productId: string;
  productName: string;
  productSku: string;
  productUnit: string;
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

  return ((data ?? []) as SummaryRow[]).map((row) => ({
    customerCode: row.customer_code,
    customerId: row.customer_id,
    customerName: row.customer_name,
    latestOrderAt: row.latest_order_at,
    orderRounds: normalizeNumeric(row.order_rounds),
    productCount: normalizeNumeric(row.product_count),
    shortageProductCount: normalizeNumeric(row.shortage_product_count),
    totalAmount: normalizeNumeric(row.total_amount),
    totalQuantity: normalizeNumeric(row.total_quantity),
  }));
}

async function getOrderStoreDetail(
  organizationId: string,
  orderDate: string,
  customerId: string,
  stores: OrderStoreSummary[],
) {
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

  const items = ((itemsData ?? []) as ItemAggregateRow[]).map((row) => {
    const deliveredQuantity = deliveredQtyMap.get(`${row.product_id}::${row.product_unit}`) ?? 0;
    const pendingQuantity = Math.max(0, normalizeNumeric(row.ordered_quantity) - deliveredQuantity);

    return {
    currentStockQuantity: normalizeNumeric(row.current_stock_quantity),
    deliverableQuantity: normalizeNumeric(row.deliverable_quantity),
    deliveredQuantity,
    imageUrl: row.image_url ?? null,
    lineTotal: normalizeNumeric(row.line_total),
    orderRounds: normalizeNumeric(row.order_rounds),
    orderedQuantity: normalizeNumeric(row.ordered_quantity),
    pendingQuantity,
    productId: row.product_id,
    productName: row.product_name,
    productSku: row.product_sku,
    productUnit: row.product_unit,
    shortQuantity: normalizeNumeric(row.short_quantity),
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
    totalShortQuantity: items.reduce((total, item) => total + item.shortQuantity, 0),
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
};

export const getOrderDailyData = cache(
  async (
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
  ): Promise<OrderDailyData> => {
    const stores = await getOrderStoreSummaries(
      organizationId,
      orderDate,
      normalizeSearchTerm(searchTerm),
    );

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
    };
  },
);

export const getOrderWorkboardData = cache(
  async (
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
  ): Promise<OrderWorkboardData> => {
    const stores = await getOrderStoreSummaries(
      organizationId,
      orderDate,
      normalizeSearchTerm(searchTerm),
    );

    const nextSelectedCustomerId =
      selectedCustomerId && stores.some((store) => store.customerId === selectedCustomerId)
        ? selectedCustomerId
        : (stores[0]?.customerId ?? null);

    return {
      selectedCustomerId: nextSelectedCustomerId,
      selectedStore: nextSelectedCustomerId
        ? await getOrderStoreDetail(organizationId, orderDate, nextSelectedCustomerId, stores)
        : null,
      stats: {
        activeStoreCount: stores.length,
        shortageStoreCount: stores.filter((store) => store.shortageProductCount > 0).length,
        totalAmount: stores.reduce((total, store) => total + store.totalAmount, 0),
        totalOrderRounds: stores.reduce((total, store) => total + store.orderRounds, 0),
      },
      stores,
    };
  },
);
