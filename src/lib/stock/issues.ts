import "server-only";

import { cache } from "react";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type OrderRow = {
  created_at: string;
  customer_id: string;
  id: string;
  order_date: string;
  order_number: string;
  status: string;
  total_amount: number | string | null;
};

type CustomerRow = {
  customer_code: string | null;
  id: string;
  name: string | null;
  sort_order: number | string;
};

type ProductRow = {
  name: string | null;
  sku: string | null;
  unit: string | null;
};

type OrderItemRow = {
  id: string;
  line_total: number | string | null;
  order_id: string;
  product_id: string;
  products: ProductRow | ProductRow[] | null;
  quantity: number | string | null;
  quantity_in_base_unit: number | string | null;
  sale_unit_label: string | null;
  unit_price: number | string | null;
};

export type StockIssueItem = {
  id: string;
  lineTotal: number;
  productId: string;
  productName: string;
  quantity: number;
  quantityInBaseUnit: number;
  sku: string;
  unit: string;
  unitPrice: number;
};

export type StockIssueRow = {
  createdAt: string;
  customerCode: string;
  customerId: string;
  customerName: string;
  id: string;
  issueNumber: string;
  itemCount: number;
  items: StockIssueItem[];
  orderDate: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  totalQuantity: number;
};

function toNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function firstProduct(product: ProductRow | ProductRow[] | null | undefined) {
  if (Array.isArray(product)) {
    return product[0] ?? null;
  }

  return product ?? null;
}

export const getStockIssueHistoryData = cache(async (organizationId: string, limit = 50, offset = 0, date?: string): Promise<StockIssueRow[]> => {
  const admin = getSupabaseAdmin();

  let query = admin
    .from("orders")
    .select(`
      id, customer_id, order_number, order_date, status, total_amount, created_at,
      delivery_notes(delivery_number)
    `)
    .eq("organization_id", organizationId)
    .in("status", ["submitted", "confirmed"]);

  if (date) {
    query = query.eq("order_date", date);
  }

  query = query
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (!date) {
    query = query.range(offset, offset + limit - 1);
  }

  const { data: ordersData, error: ordersError } = await query;

  if (ordersError || !ordersData) {
    return [];
  }

  const orders = ordersData as (OrderRow & { delivery_notes: { delivery_number: string }[] | null })[];
  const orderIds = orders.map((order) => order.id);
  const customerIds = Array.from(new Set(orders.map((order) => order.customer_id)));

  const [customersResult, itemsResult] = await Promise.all([
    customerIds.length > 0
      ? admin
          .from("customers")
          .select("id, customer_code, name, sort_order")
          .in("id", customerIds)
          .order("sort_order", { ascending: true })
          .order("customer_code", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    orderIds.length > 0
      ? admin
          .from("order_items")
          .select(
            "id, order_id, product_id, quantity, quantity_in_base_unit, sale_unit_label, unit_price, line_total, products(name, sku, unit)",
          )
          .in("order_id", orderIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (customersResult.error || itemsResult.error) {
    return [];
  }

  const customers = (customersResult.data ?? []) as CustomerRow[];
  const items = (itemsResult.data ?? []) as OrderItemRow[];
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  const itemMap = new Map<string, StockIssueItem[]>();

  for (const item of items) {
    const product = firstProduct(item.products);
    const quantity = toNumber(item.quantity);
    const unitPrice = toNumber(item.unit_price);
    const lineTotal = toNumber(item.line_total) || quantity * unitPrice;
    const current = itemMap.get(item.order_id) ?? [];

    current.push({
      id: item.id,
      lineTotal,
      productId: item.product_id,
      productName: product?.name ?? "สินค้าไม่ทราบชื่อ",
      quantity,
      quantityInBaseUnit: toNumber(item.quantity_in_base_unit),
      sku: product?.sku ?? "-",
      unit: product?.unit || "-",
      unitPrice,
    });
    itemMap.set(item.order_id, current);
  }

  return orders.map((order) => {
    const customer = customerMap.get(order.customer_id);
    const orderItems = itemMap.get(order.id) ?? [];
    const deliveryNote = Array.isArray(order.delivery_notes) ? order.delivery_notes[0] : null;

    return {
      createdAt: order.created_at,
      customerCode: customer?.customer_code || "-",
      customerId: order.customer_id,
      customerName: customer?.name || "ร้านค้าไม่ทราบชื่อ",
      id: order.id,
      issueNumber: deliveryNote?.delivery_number || order.order_number,
      itemCount: orderItems.length,
      items: orderItems,
      orderDate: order.order_date,
      orderNumber: order.order_number,
      status: order.status,
      totalAmount: toNumber(order.total_amount),
      totalQuantity: orderItems.reduce((total, item) => total + item.quantity, 0),
    };
  });
});
