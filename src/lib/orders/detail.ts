import "server-only";

import type { Json } from "@/types/database";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeSearch } from "@/lib/utils/search";

type QueryError = {
  message?: string;
} | null;

type SingleResult<T> = Promise<{ data: T | null; error: QueryError }>;
type ManyResult<T> = Promise<{ data: T[] | null; error: QueryError }>;

type SelectChain<T> = {
  eq: (column: string, value: string) => SelectChain<T>;
  in: (column: string, values: string[]) => {
    order: (column: string, options: { ascending: boolean }) => ManyResult<T>;
  };
  order: (column: string, options: { ascending: boolean }) => ManyResult<T>;
  single: () => SingleResult<T>;
};

type FlexibleTable<T> = {
  select: (columns: string) => SelectChain<T>;
};

type OrderDetailAdminClient = ReturnType<typeof getSupabaseAdmin> & {
  from: {
    (table: "orders"): FlexibleTable<OrderRow>;
    (table: "customers"): FlexibleTable<CustomerRow>;
    (table: "order_items"): FlexibleTable<OrderItemRow>;
    (table: "products"): FlexibleTable<ProductRow>;
    (table: "product_images"): FlexibleTable<ProductImageRow>;
  };
};

type OrderRow = {
  created_at: string;
  customer_id: string;
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
  orderNumber: string;
  productCount: number;
  status: "draft" | "submitted" | "confirmed" | "cancelled";
  totalAmount: number;
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

export async function getOrderDetailById(orderId: string): Promise<OrderDetailData | null> {
  const admin = getSupabaseAdmin() as unknown as OrderDetailAdminClient;

  const orderResult = await admin
    .from("orders")
    .select(
      "id, customer_id, order_number, order_date, status, subtotal_amount, total_amount, notes, metadata, created_at",
    )
    .eq("id", orderId)
    .single();

  if (orderResult.error) {
    throw new Error(orderResult.error.message ?? "Failed to load order.");
  }

  const order = orderResult.data;
  if (!order) {
    return null;
  }

  const [customerResult, orderItemsResult] = await Promise.all([
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
  ]);

  if (customerResult.error) {
    throw new Error(customerResult.error.message ?? "Failed to load customer.");
  }

  if (orderItemsResult.error) {
    throw new Error(orderItemsResult.error.message ?? "Failed to load order items.");
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
      unit: item.sale_unit_label ?? product?.unit ?? "-",
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
    searchTerm,
  }: {
    orderDate: string;
    searchTerm?: string | null;
  },
): Promise<IncomingOrderListItem[]> {
  const admin = getSupabaseAdmin() as unknown as OrderDetailAdminClient;
  const normalizedSearch = normalizeSearch(searchTerm ?? "");

  const ordersResult = await admin
    .from("orders")
    .select("id, customer_id, order_number, status, total_amount, metadata, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (ordersResult.error) {
    throw new Error(ordersResult.error.message ?? "Failed to load incoming orders.");
  }

  const orders = (ordersResult.data ?? []).filter((order) =>
    order.created_at.startsWith(orderDate),
  );

  const customerIds = Array.from(new Set(orders.map((order) => order.customer_id)));

  const customersResult =
    customerIds.length > 0
      ? await admin
          .from("customers")
          .select("id, customer_code, name, address")
          .in("id", customerIds)
          .order("name", { ascending: true })
      : { data: [], error: null };

  if (customersResult.error) {
    throw new Error(customersResult.error.message ?? "Failed to load customers.");
  }

  const customerMap = new Map(
    (customersResult.data ?? []).map((customer) => [customer.id, customer]),
  );

  const orderIds = orders.map((order) => order.id);

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
    .map((order) => {
      const customer = customerMap.get(order.customer_id);

      return {
        channelLabel: getChannelLabel(order.metadata),
        createdAt: order.created_at,
        customerCode: customer?.customer_code ?? "-",
        customerId: order.customer_id,
        customerName: customer?.name ?? "ร้านค้าไม่ทราบชื่อ",
        id: order.id,
        orderNumber: order.order_number,
        productCount: orderProductSets.get(order.id)?.size ?? 0,
        status: order.status,
        totalAmount: normalizeNumber(order.total_amount),
      } satisfies IncomingOrderListItem;
    })
    .filter((order) => {
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
