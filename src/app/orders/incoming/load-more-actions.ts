"use server";

import { getBilledDeliveryNumbersForRange } from "@/lib/billing/billing-statement";
import { requireAppRole } from "@/lib/auth/authorization";
import { normalizeOrderDate } from "@/lib/orders/date";
import { getIncomingOrders } from "@/lib/orders/detail";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type IncomingDeliveryNoteRow = {
  id: string;
  order_id: string | null;
  customer_id: string;
  delivery_date: string;
  delivery_number: string;
};

type LoadMoreIncomingOrdersInput = {
  customerIds?: string[];
  endDate?: string;
  limit?: number;
  offset: number;
  orderDate: string;
  searchTerm?: string;
};

async function getIncomingDeliveryNoteRows(
  admin: ReturnType<typeof getSupabaseAdmin>,
  organizationId: string,
  fromDate: string,
  toDate: string,
  customerIds: string[],
) {
  let query = admin
    .from("delivery_notes")
    .select("id, order_id, customer_id, delivery_date, delivery_number")
    .eq("organization_id", organizationId)
    .eq("status", "confirmed")
    .gte("delivery_date", fromDate)
    .lte("delivery_date", toDate);

  if (customerIds.length > 0) {
    query = query.in("customer_id", customerIds);
  }

  const { data, error } = await query.order("delivery_date", { ascending: true });

  if (error) {
    throw new Error(error.message ?? "Failed to load delivery note numbers.");
  }

  return (data ?? []) as IncomingDeliveryNoteRow[];
}

async function getDirectDeliveryNoteRowsByOrderIds(
  admin: ReturnType<typeof getSupabaseAdmin>,
  organizationId: string,
  orderIds: string[],
) {
  if (orderIds.length === 0) {
    return [] as IncomingDeliveryNoteRow[];
  }

  const rows: IncomingDeliveryNoteRow[] = [];
  for (let index = 0; index < orderIds.length; index += 40) {
    const chunk = orderIds.slice(index, index + 40);
    const { data, error } = await admin
      .from("delivery_notes")
      .select("id, order_id, customer_id, delivery_date, delivery_number")
      .eq("organization_id", organizationId)
      .eq("status", "confirmed")
      .in("order_id", chunk);

    if (error) {
      throw new Error(error.message ?? "Failed to load direct delivery note numbers.");
    }

    rows.push(...((data ?? []) as IncomingDeliveryNoteRow[]));
  }

  return rows;
}

function buildDeliveryMaps(deliveryRows: IncomingDeliveryNoteRow[], orders: Awaited<ReturnType<typeof getIncomingOrders>>) {
  const deliveryMap = new Map<string, string[]>();
  const deliveryIdMap = new Map<string, string[]>();
  const orderById = new Map(orders.map((order) => [order.id, order]));

  for (const item of deliveryRows) {
    const key = `${item.customer_id}_${item.delivery_date}`;
    const currentNumbers = deliveryMap.get(key) ?? [];
    const currentIds = deliveryIdMap.get(key) ?? [];
    if (!currentNumbers.includes(item.delivery_number)) currentNumbers.push(item.delivery_number);
    if (!currentIds.includes(item.id)) currentIds.push(item.id);
    deliveryMap.set(key, currentNumbers);
    deliveryIdMap.set(key, currentIds);
  }

  for (const note of deliveryRows) {
    if (!note.order_id) continue;
    const matchedOrder = orderById.get(note.order_id);
    if (!matchedOrder) continue;
    const key = `${matchedOrder.customerId}_${matchedOrder.orderDate}`;
    const currentNumbers = deliveryMap.get(key) ?? [];
    const currentIds = deliveryIdMap.get(key) ?? [];
    if (!currentNumbers.includes(note.delivery_number)) currentNumbers.push(note.delivery_number);
    if (!currentIds.includes(note.id)) currentIds.push(note.id);
    deliveryMap.set(key, currentNumbers);
    deliveryIdMap.set(key, currentIds);
  }

  return {
    deliveryByCustomerDate: Object.fromEntries(deliveryMap.entries()),
    deliveryIdsByCustomerDate: Object.fromEntries(deliveryIdMap.entries()),
  };
}

export async function loadMoreIncomingOrdersAction(input: LoadMoreIncomingOrdersInput) {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();
  const orderDate = normalizeOrderDate(input.orderDate);
  const endDate = input.endDate ? normalizeOrderDate(input.endDate) : orderDate;
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 60);
  const customerIds = Array.from(new Set((input.customerIds ?? []).filter(Boolean)));

  const pageOrders = await getIncomingOrders(session.organizationId, {
    customerIds,
    endDate,
    excludeCancelled: true,
    limit: limit + 1,
    offset: Math.max(input.offset, 0),
    orderDate,
    searchTerm: input.searchTerm ?? "",
  });
  const orders = pageOrders.slice(0, limit);
  const orderIds = orders.map((order) => order.id);
  const deliveryCustomerIds =
    customerIds.length > 0
      ? customerIds
      : Array.from(new Set(orders.map((order) => order.customerId)));

  const [rangeDeliveryRows, directDeliveryRows, billedDeliveryNumbers] = await Promise.all([
    getIncomingDeliveryNoteRows(admin, session.organizationId, orderDate, endDate, deliveryCustomerIds),
    getDirectDeliveryNoteRowsByOrderIds(admin, session.organizationId, orderIds),
    getBilledDeliveryNumbersForRange(session.organizationId, orderDate, endDate),
  ]);
  const deliveryRows = Array.from(
    new Map([...rangeDeliveryRows, ...directDeliveryRows].map((note) => [note.id, note])).values(),
  );
  const { deliveryByCustomerDate } = buildDeliveryMaps(deliveryRows, orders);
  const billedByCustomerDate = Object.fromEntries(
    Object.entries(deliveryByCustomerDate).map(([key, deliveryNumbers]) => [
      key,
      deliveryNumbers.some((deliveryNumber) => billedDeliveryNumbers.has(deliveryNumber)),
    ]),
  );

  return {
    billedByCustomerDate,
    deliveryByCustomerDate,
    hasMore: pageOrders.length > limit,
    orders,
  };
}
