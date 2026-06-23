import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import type { Json } from "@/types/database";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeSearch } from "@/lib/utils/search";

type QueryError = {
  message?: string;
} | null;

type SingleResult<T> = Promise<{ data: T | null; error: QueryError }>;

type SelectChain<T> = {
  eq: (column: string, value: string | number | boolean | null) => SelectChain<T>;
  gte: (column: string, value: string | number) => SelectChain<T>;
  lte: (column: string, value: string | number) => SelectChain<T>;
  in: (column: string, values: Array<string | number>) => SelectChain<T>;
  ilike: (column: string, pattern: string) => SelectChain<T>;
  limit: (count: number) => SelectChain<T>;
  neq: (column: string, value: string | number | boolean | null) => SelectChain<T>;
  order: (column: string, options?: { ascending: boolean }) => SelectChain<T>;
  range: (from: number, to: number) => SelectChain<T>;
  maybeSingle: () => SingleResult<T>;
  single: () => SingleResult<T>;
} & Promise<{ data: T[] | null; error: QueryError }>;

type FlexibleTable<T> = {
  select: (columns: string) => SelectChain<T>;
};

type OrderDetailAdminClient = ReturnType<typeof getSupabaseAdmin> & {
  from: {
    (table: "orders"): FlexibleTable<OrderRow>;
    (table: "customers"): FlexibleTable<CustomerRow>;
    (table: "order_items"): FlexibleTable<OrderItemRow>;
    (table: "delivery_notes"): FlexibleTable<DeliveryNoteRow>;
    (table: "products"): FlexibleTable<ProductRow>;
    (table: "product_images"): FlexibleTable<ProductImageRow>;
    (table: "vehicles"): FlexibleTable<VehicleRow>;
  };
};

type OrderRow = {
  created_at: string;
  customer_id: string;
  fulfillment_status: string | null;
  id: string;
  metadata: Json;
  notes: string | null;
  order_date: string;
  order_number: string;
  status: "draft" | "submitted" | "confirmed" | "cancelled";
  subtotal_amount: number | string;
  total_amount: number | string;
};

type CustomerRow = {
  address: string;
  customer_code: string;
  default_vehicle_id: string | null;
  id: string;
  name: string;
};

type VehicleRow = {
  id: string;
  name: string;
};

type OrderItemRow = {
  id: string;
  line_total: number | string;
  notes: string | null;
  order_id: string;
  product_id: string;
  product_sale_unit_id: string | null;
  quantity: number | string;
  quantity_in_base_unit: number | string;
  sale_unit_label: string;
  sale_unit_ratio: number | string;
  unit_price: number | string;
};

type ProductRow = {
  id: string;
  name: string;
  sku: string;
  stock_quantity: number | string;
  unit: string;
};

type ProductImageRow = {
  product_id: string;
  public_url: string;
  sort_order: number | string;
};

type DeliveryNoteRow = {
  delivery_number: string;
  order_id?: string | null;
};

export type OrderDetailItem = {
  id: string;
  imageUrl: string | null;
  lineTotal: number;
  notes: string | null;
  productId: string;
  productSaleUnitId: string | null;
  productName: string;
  quantity: number;
  shortQuantity: number;
  sku: string;
  stockQuantity: number;
  unit: string;
  unitPrice: number;
};

export type OrderDetailData = {
  channelLabel: string;
  createdAt: string;
  customer: {
    address: string;
    code: string;
    id: string;
    name: string;
  };
  id: string;
  items: OrderDetailItem[];
  notes: string | null;
  orderDate: string;
  deliveryNumber: string | null;
  orderNumber: string;
  status: "draft" | "submitted" | "confirmed" | "cancelled";
  subtotalAmount: number;
  totalAmount: number;
  totalQuantity: number;
};

export type IncomingOrderListItem = {
  channelLabel: string;
  createdAt: string;
  customerCode: string;
  customerId: string;
  customerName: string;
  id: string;
  notes: string | null;
  orderDate: string;
  orderNumber: string;
  productCount: number;
  fulfillmentStatus: string | null;
  status: "draft" | "submitted" | "confirmed" | "cancelled";
  totalAmount: number;
  vehicleId: string | null;
  vehicleName: string | null;
};

function normalizeNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function getChannelLabel(metadata: Json) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "LINE";
  }

  const valueCandidates = [
    metadata.channel,
    metadata.source,
    metadata.platform,
    metadata.orderSource,
    metadata.salesChannel,
  ]
    .map((value) => (typeof value === "string" ? value.trim().toLowerCase() : ""))
    .filter(Boolean);

  const channelValue = valueCandidates[0] ?? "line";

  if (channelValue.includes("lineman") || channelValue.includes("line man")) {
    return "LINE MAN";
  }

  if (channelValue.includes("tiktok")) {
    return "TikTok Shop";
  }

  if (channelValue.includes("created") || channelValue.includes("manual")) {
    return "สร้าง";
  }

  if (channelValue.includes("walk-in") || channelValue.includes("walkin")) {
    return "หน้าร้าน";
  }

  if (channelValue.includes("phone")) {
    return "โทรศัพท์";
  }

  if (channelValue.includes("chat")) {
    return "แชท";
  }

  if (channelValue.includes("line")) {
    return "LINE";
  }

  return channelValue.toUpperCase();
}

export async function getOrderDetailById(
  organizationId: string,
  orderId: string,
): Promise<OrderDetailData | null> {
  const admin = getSupabaseAdmin() as unknown as OrderDetailAdminClient;

  const orderResult = await admin
    .from("orders")
    .select(
      "id, customer_id, order_number, order_date, status, subtotal_amount, total_amount, notes, metadata, created_at",
    )
    .eq("organization_id", organizationId)
    .eq("id", orderId)
    .maybeSingle();

  if (orderResult.error) {
    throw new Error(orderResult.error.message ?? "Failed to load order.");
  }

  const order = orderResult.data;
  if (!order) {
    return null;
  }

  const [customerResult, orderItemsResult, deliveryNoteResult] = await Promise.all([
    admin
      .from("customers")
      .select("id, customer_code, name, address")
      .eq("id", order.customer_id)
      .single(),
    admin
      .from("order_items")
      .select(
        "id, product_id, product_sale_unit_id, quantity, quantity_in_base_unit, sale_unit_label, sale_unit_ratio, unit_price, line_total, notes",
      )
      .eq("order_id", order.id)
      .order("created_at", { ascending: true }),
    admin
      .from("delivery_notes")
      .select("delivery_number")
      .eq("organization_id", organizationId)
      .eq("order_id", order.id)
      .maybeSingle(),
  ]);

  if (customerResult.error) {
    throw new Error(customerResult.error.message ?? "Failed to load customer.");
  }

  if (orderItemsResult.error) {
    throw new Error(orderItemsResult.error.message ?? "Failed to load order items.");
  }
  if (deliveryNoteResult.error) {
    throw new Error(deliveryNoteResult.error.message ?? "Failed to load delivery note.");
  }

  const orderNumberDelivery =
    typeof order.order_number === "string" && order.order_number.startsWith("DN")
      ? order.order_number
      : null;

  let resolvedDeliveryNumber = deliveryNoteResult.data?.delivery_number ?? orderNumberDelivery;

  if (!resolvedDeliveryNumber) {
    const fallbackDeliveryNoteResult = await admin
      .from("delivery_notes")
      .select("delivery_number")
      .eq("organization_id", organizationId)
      .eq("customer_id", order.customer_id)
      .eq("delivery_date", order.order_date)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (fallbackDeliveryNoteResult.error) {
      throw new Error(
        fallbackDeliveryNoteResult.error.message ?? "Failed to load fallback delivery note.",
      );
    }

    resolvedDeliveryNumber = fallbackDeliveryNoteResult.data?.delivery_number ?? null;
  }

  const customer = customerResult.data;
  const orderItems = orderItemsResult.data ?? [];
  const productIds = Array.from(new Set(orderItems.map((item) => item.product_id)));

  const [productsResult, imagesResult] = await Promise.all([
    productIds.length > 0
      ? admin
          .from("products")
          .select("id, sku, name, unit, stock_quantity")
          .in("id", productIds)
          .order("name", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    productIds.length > 0
      ? admin
          .from("product_images")
          .select("product_id, public_url, sort_order")
          .in("product_id", productIds)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (productsResult.error) {
    throw new Error(productsResult.error.message ?? "Failed to load products.");
  }

  if (imagesResult.error) {
    throw new Error(imagesResult.error.message ?? "Failed to load product images.");
  }

  const productMap = new Map((productsResult.data ?? []).map((product) => [product.id, product]));
  const imageMap = new Map<string, string>();

  for (const image of imagesResult.data ?? []) {
    if (!imageMap.has(image.product_id)) {
      imageMap.set(image.product_id, image.public_url);
    }
  }

  const items = orderItems.map((item) => {
    const product = productMap.get(item.product_id);
    const quantity = normalizeNumber(item.quantity);
    const saleUnitRatio = normalizeNumber(item.sale_unit_ratio) || 1;
    const stockQuantity = Math.floor(normalizeNumber(product?.stock_quantity) / saleUnitRatio);

    return {
      id: item.id,
      imageUrl: imageMap.get(item.product_id) ?? null,
      lineTotal: normalizeNumber(item.line_total),
      notes: item.notes,
      productId: item.product_id,
      productSaleUnitId: item.product_sale_unit_id,
      productName: product?.name ?? "สินค้าไม่ทราบชื่อ",
      quantity,
      shortQuantity: Math.max(quantity - stockQuantity, 0),
      sku: product?.sku ?? "-",
      stockQuantity,
      unit: product?.unit ?? "-",
      unitPrice: normalizeNumber(item.unit_price),
    } satisfies OrderDetailItem;
  });

  return {
    channelLabel: getChannelLabel(order.metadata),
    createdAt: order.created_at,
    customer: {
      address: customer?.address ?? "-",
      code: customer?.customer_code ?? "-",
      id: customer?.id ?? order.customer_id,
      name: customer?.name ?? "ร้านค้าไม่ทราบชื่อ",
    },
    id: order.id,
    items,
    notes: order.notes,
    orderDate: order.order_date,
    deliveryNumber: resolvedDeliveryNumber,
    orderNumber: order.order_number,
    status: order.status,
    subtotalAmount: normalizeNumber(order.subtotal_amount),
    totalAmount: normalizeNumber(order.total_amount),
    totalQuantity: items.reduce((total, item) => total + item.quantity, 0),
  };
}

export async function getIncomingOrders(
  organizationId: string,
  {
    orderDate,
    endDate,
    searchTerm,
    customerIds,
    excludeCancelled,
    limit,
    offset,
  }: {
    orderDate: string;
    endDate?: string | null;
    searchTerm?: string | null;
    customerIds?: string[];
    excludeCancelled?: boolean;
    limit?: number;
    offset?: number;
  },
): Promise<IncomingOrderListItem[]> {
  "use cache";
  cacheLife({ revalidate: 3 });
  cacheTag(`orders-${organizationId}`);

  const admin = getSupabaseAdmin() as unknown as OrderDetailAdminClient;
  const normalizedSearch = normalizeSearch(searchTerm ?? "");

  let query = admin
    .from("orders")
    .select("id, customer_id, order_number, order_date, status, fulfillment_status, total_amount, metadata, created_at, notes")
    .eq("organization_id", organizationId);

  if (customerIds && customerIds.length > 0) {
    query = query.in("customer_id", customerIds);
  }

  if (excludeCancelled) {
    query = query.neq("status", "cancelled");
  }

  // If searchTerm is provided, we search across all dates (Global Search)
  if (!searchTerm) {
    if (endDate && endDate !== orderDate) {
      query = query.gte("order_date", orderDate).lte("order_date", endDate);
    } else {
      query = query.eq("order_date", orderDate);
    }
  } else {
    // Limit global search to latest 100 results for performance
    query = query.limit(100);
  }

  query = query
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (typeof limit === "number") {
    const from = Math.max(0, offset ?? 0);
    query = query.range(from, from + Math.max(1, limit) - 1);
  }

  const ordersResult = await query;

  if (ordersResult.error) {
    throw new Error(ordersResult.error.message ?? "Failed to load incoming orders.");
  }

  let orders = ordersResult.data ?? [];

  // If searchTerm is provided, also search for delivery notes by delivery_number
  // because the orders table doesn't contain DN numbers directly.
  if (searchTerm && searchTerm.trim().length >= 2) {
    const cleanSearch = searchTerm.trim();
    const { data: dnOrders } = await admin
      .from("delivery_notes")
      .select("order_id")
      .eq("organization_id", organizationId)
      .ilike("delivery_number", `%${cleanSearch}%`)
      .limit(50);
    
    if (dnOrders && dnOrders.length > 0) {
      const dnOrderIds = Array.from(new Set(dnOrders.map(d => d.order_id).filter(Boolean))) as string[];
      // Only fetch orders that aren't already in our result set
      const missingOrderIds = dnOrderIds.filter(id => !orders.some(o => o.id === id));
      
      if (missingOrderIds.length > 0) {
        let additionalOrdersQuery = admin
          .from("orders")
          .select("id, customer_id, order_number, order_date, status, fulfillment_status, total_amount, metadata, created_at, notes")
          .eq("organization_id", organizationId)
          .in("id", missingOrderIds);

        if (customerIds && customerIds.length > 0) {
          additionalOrdersQuery = additionalOrdersQuery.in("customer_id", customerIds);
        }

        const { data: additionalOrders } = await additionalOrdersQuery;
          
        if (additionalOrders) {
          orders = [...orders, ...additionalOrders];
        }
      }
    }
  }

  const orderCustomerIds = Array.from(new Set(orders.map((order: OrderRow) => order.customer_id)));

  const customersResult =
    orderCustomerIds.length > 0
      ? await admin
          .from("customers")
          .select("id, customer_code, name, address, default_vehicle_id")
          .in("id", orderCustomerIds)
          .order("name", { ascending: true })
      : { data: [], error: null };

  if (customersResult.error) {
    throw new Error(customersResult.error.message ?? "Failed to load customers.");
  }

  const customerMap = new Map(
    (customersResult.data ?? []).map((customer) => [customer.id, customer]),
  );
  const vehicleIds = Array.from(
    new Set(
      (customersResult.data ?? [])
        .map((customer) => customer.default_vehicle_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const vehiclesResult =
    vehicleIds.length > 0
      ? await admin
          .from("vehicles")
          .select("id, name")
          .in("id", vehicleIds)
          .order("name", { ascending: true })
      : { data: [], error: null };

  if (vehiclesResult.error) {
    throw new Error(vehiclesResult.error.message ?? "Failed to load vehicles.");
  }

  const vehicleNameMap = new Map(
    (vehiclesResult.data ?? []).map((vehicle) => [vehicle.id, vehicle.name]),
  );

  const orderIds = orders.map((order: OrderRow) => order.id);

  const itemsResult =
    orderIds.length > 0
      ? await admin
          .from("order_items")
          .select("order_id, product_id")
          .in("order_id", orderIds)
          .order("order_id", { ascending: true })
      : ({ data: [], error: null } as const);

  const orderProductSets = new Map<string, Set<string>>();
  for (const item of itemsResult.data ?? []) {
    const set = orderProductSets.get(item.order_id) ?? new Set<string>();
    set.add(item.product_id);
    orderProductSets.set(item.order_id, set);
  }

  return orders
    .map((order: OrderRow) => {
      const customer = customerMap.get(order.customer_id);

      return {
        channelLabel: getChannelLabel(order.metadata),
        createdAt: order.created_at,
        customerCode: customer?.customer_code ?? "-",
        customerId: order.customer_id,
        customerName: customer?.name ?? "ร้านค้าไม่ทราบชื่อ",
        id: order.id,
        notes: order.notes,
        orderDate: order.order_date,
        orderNumber: order.order_number,
        productCount: orderProductSets.get(order.id)?.size ?? 0,
        fulfillmentStatus: order.fulfillment_status,
        status: order.status,
        totalAmount: normalizeNumber(order.total_amount),
        vehicleId: customer?.default_vehicle_id ?? null,
        vehicleName: customer?.default_vehicle_id
          ? (vehicleNameMap.get(customer.default_vehicle_id) ?? null)
          : null,
      } satisfies IncomingOrderListItem;
    })
    .filter((order: IncomingOrderListItem) => {
      if (!normalizedSearch) {
        return true;
      }

      return (
        normalizeSearch(order.orderNumber).includes(normalizedSearch) ||
        normalizeSearch(order.customerCode).includes(normalizedSearch) ||
        normalizeSearch(order.customerName).includes(normalizedSearch) ||
        normalizeSearch(order.channelLabel).includes(normalizedSearch)
      );
    });
}

export async function getCustomerOrderCountsByDate(
  organizationId: string,
  orderDate: string,
  endDate?: string,
): Promise<Record<string, number>> {
  "use cache";
  cacheLife({ revalidate: 3 });
  cacheTag(`orders-${organizationId}`);

  const admin = getSupabaseAdmin() as unknown as OrderDetailAdminClient;
  let query = admin
    .from("orders")
    .select("customer_id, status")
    .eq("organization_id", organizationId);

  if (endDate && endDate !== orderDate) {
    query = query.gte("order_date", orderDate).lte("order_date", endDate);
  } else {
    query = query.eq("order_date", orderDate);
  }

  const { data, error } = await query.order("customer_id", { ascending: true });

  if (error) {
    throw new Error(error.message ?? "Failed to load customer order counts.");
  }

  const rawData = (data ?? []) as Array<{ status: string; customer_id: string }>;
  return rawData.filter((order) => order.status !== "cancelled").reduce<Record<string, number>>((counts, order) => {
    counts[order.customer_id] = (counts[order.customer_id] ?? 0) + 1;
    return counts;
  }, {});
}
