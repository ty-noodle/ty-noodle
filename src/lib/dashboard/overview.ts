import "server-only";

import { getTodayInBangkok } from "@/lib/orders/date";
import { getRecentDailyPerformance } from "@/lib/reports/sales-overview";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getStockDashboardData, type StockProductOption, type StockSupplierOption } from "@/lib/stock/admin";
import type { Json } from "@/types/database";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DashboardKpi = {
  todayOrderCount: number;
  todayOrderAmount: number;
  todayNetProfit: number;
  todayCost: number;
  submittedOrderCount: number;
  pendingDeliveryCount: number;
  pendingDeliveryAmount: number;
  monthDeliveredAmount: number;
  activeCustomerCount: number;
  lowStockCount: number;
};

export type RecentOrder = {
  id: string;
  orderNumber: string;
  orderDate: string;
  customerName: string;
  totalAmount: number;
  status: "draft" | "submitted" | "confirmed" | "cancelled";
};

export type WeeklyBar = {
  date: string;
  amount: number;
  count: number;
  label: string;
};

export type TopCustomer = {
  customerId: string;
  customerName: string;
  totalAmount: number;
};

export type TopProduct = {
  productId: string;
  productName: string;
  totalAmount: number;
  imageUrl: string | null;
};

export type DashboardDailyPerformanceRow = {
  isoDate: string;
  monthLabel: string;
  revenue: number;
  cost: number;
  profit: number;
  orderCount: number;
};

export type LineOrderOverviewItem = {
  id: string;
  orderNumber?: string | null;
  orderId: string | null;
  lineDisplayName: string | null;
  linePictureUrl: string | null;
  customerName: string | null;
  createdAt: string;
  status: "pending_link" | "converted";
  hasUnpricedItems?: boolean;
};

export type DashboardOverview = {
  kpi: DashboardKpi;
  recentOrders: RecentOrder[];
  weeklyTrend: WeeklyBar[];
  dailyPerformanceRows: DashboardDailyPerformanceRow[];
  dailyPerformanceRangeStartDate: string | null;
  dailyPerformanceRangeEndDate: string | null;
  topCustomers: TopCustomer[];
  topProducts: TopProduct[];
  stockProducts: StockProductOption[];
  stockSuppliers: StockSupplierOption[];
  lineOrders: LineOrderOverviewItem[];
};




type LinePendingOrderDashboardRow = {
  id: string;
  converted_customer_id: string | null;
  converted_order_id: string | null;
  created_at: string;
  line_display_name: string | null;
  line_picture_url: string | null;
  status: "pending_link" | "converted" | "cancelled";
};

type LineSourceOrderDashboardRow = {
  id: string;
  order_number: string | null;
  created_at: string;
  customer_id: string;
  customers: { line_user_id: string | null; name: string | null } | null;
  metadata: Json | null;
  order_items: { unit_price: number | string | null }[];
};

type LineCustomerProfileDashboardRow = {
  customer_id: string | null;
  line_display_name: string | null;
  line_picture_url: string | null;
  line_user_id: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function firstOfMonth(iso: string) {
  return iso.slice(0, 7) + "-01";
}

function subtractDays(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d - n);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

const THAI_DAY_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"] as const;

function thaiDayShort(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return THAI_DAY_SHORT[new Date(y, m - 1, d).getDay()];
}

async function loadTodayNetProfit(
  organizationId: string,
  isoDate: string,
): Promise<{ netProfit: number; totalCost: number; totalRevenue: number }> {
  const supabase = getSupabaseAdmin();
  const { data: notes } = await supabase
    .from("delivery_notes")
    .select(`
      id,
      total_amount,
      delivery_note_items (
        quantity_delivered,
        cost_price
      )
    `)
    .eq("organization_id", organizationId)
    .eq("status", "confirmed")
    .eq("delivery_date", isoDate);

  const typedNotes = (notes ?? []) as unknown as Array<{
    id: string;
    total_amount: number | string | null;
    delivery_note_items: Array<{
      quantity_delivered: number | string | null;
      cost_price: number | string | null;
    }>;
  }>;

  if (typedNotes.length === 0) {
    return { netProfit: 0, totalCost: 0, totalRevenue: 0 };
  }

  let totalRevenue = 0;
  let totalCost = 0;

  for (const note of typedNotes) {
    totalRevenue += toNum(note.total_amount);
    for (const item of note.delivery_note_items ?? []) {
      totalCost += toNum(item.quantity_delivered) * toNum(item.cost_price);
    }
  }

  return { netProfit: totalRevenue - totalCost, totalCost, totalRevenue };
}

// ─── Query ────────────────────────────────────────────────────────────────────

export async function getDashboardOverview(organizationId: string): Promise<DashboardOverview> {
  const supabase = getSupabaseAdmin();
  const today = getTodayInBangkok();
  const monthStart = firstOfMonth(today);

  const [
    todayOrdersRes,
    pendingDeliveryRes,
    monthDeliveredRes,
    activeCustomerRes,
    recentOrdersRes,
    weeklyOrdersRes,
    monthOrdersRes,
    stockDashboardRes,
    recentDailyPerformance,
    todayProfitSnapshot,
    pendingLineOrdersRes,
    lineSourceOrdersRes,
  ] = await Promise.all([
    // 1. Today's submitted/confirmed orders
    supabase.from("orders")
      .select("id, total_amount")
      .eq("organization_id", organizationId)
      .eq("order_date", today)
      .in("status", ["submitted", "confirmed"]),

    // 3. Pending delivery notes
    supabase.from("delivery_notes")
      .select("id, total_amount")
      .eq("organization_id", organizationId)
      .eq("status", "confirmed")
      .eq("dispatch_status", "pending"),

    // 3. This month's delivered amount
    supabase.from("delivery_notes")
      .select("total_amount")
      .eq("organization_id", organizationId)
      .eq("status", "confirmed")
      .eq("dispatch_status", "delivered")
      .gte("delivery_date", monthStart)
      .lte("delivery_date", today),

    // 4. Active customers
    supabase.from("customers")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("is_active", true),

    // 5. Recent 5 orders
    supabase.from("orders")
      .select("id, order_number, order_date, total_amount, status, customers!inner(name)")
      .eq("organization_id", organizationId)
      .in("status", ["submitted", "confirmed"])
      .order("created_at", { ascending: false })
      .limit(5),

    // 6. Last 7 days — weekly trend chart (Bypassed to optimize speed)
    Promise.resolve({ data: [] as unknown[] }),

    // 7. This month's orders — for Top 5 rankings (Bypassed to optimize speed)
    Promise.resolve({ data: [] as unknown[] }),

    // 8. Stock dashboard data (for low stock count)
    getStockDashboardData(organizationId, 0, 0),

    // 9. Recent daily performance for dashboard report section
    getRecentDailyPerformance(organizationId, 7, today),

    // 10. Today's profit snapshot
    loadTodayNetProfit(organizationId, today),

    // 11. Today's LINE orders that still need a store link
    supabase.from("line_pending_orders")
      .select("id, converted_customer_id, converted_order_id, line_display_name, line_picture_url, created_at, status")
      .eq("organization_id", organizationId)
      .eq("order_date", today)
      .eq("status", "pending_link"),

    // 12. Today's customer orders that came from the LINE ordering page
    supabase.from("orders")
      .select("id, order_number, customer_id, created_at, metadata, customers!inner(name, line_user_id), order_items(unit_price)")
      .eq("organization_id", organizationId)
      .eq("order_date", today)
      .in("status", ["submitted", "confirmed"]),
  ]);
  const { netProfit: todayNetProfit, totalCost: todayCost, totalRevenue: todayDeliveryRevenue } = todayProfitSnapshot;

  // ── Process core KPIs ──────────────────────────────────────────────────────

  const todayOrders = (todayOrdersRes.data ?? []) as { id: string; total_amount: unknown }[];
  const pendingDeliveries = (pendingDeliveryRes.data ?? []) as { id: string; total_amount: unknown }[];
  const monthDelivered = (monthDeliveredRes.data ?? []) as { total_amount: unknown }[];
  const recentRaw = (recentOrdersRes.data ?? []) as {
    id: string;
    order_number: string;
    order_date: string;
    total_amount: unknown;
    status: string;
    customers: { name: string };
  }[];
  const weeklyRaw = (weeklyOrdersRes.data ?? []) as {
    order_date: string;
    total_amount: unknown;
  }[];
  const monthRaw = (monthOrdersRes.data ?? []) as {
    total_amount: unknown;
    customer_id: string;
    customers: { name: string };
    order_items: Array<{
      product_id: string;
      line_total: unknown;
      products: { name: string; product_images?: Array<{ public_url: string; sort_order: number }> | null } | null;
    }>;
  }[];
  const lineOrderRows = (pendingLineOrdersRes.data ?? []) as LinePendingOrderDashboardRow[];
  const lineSourceOrderRows = ((lineSourceOrdersRes.data ?? []) as LineSourceOrderDashboardRow[])
    .filter((row) => {
      const metadata = row.metadata;
      const source =
        typeof metadata === "object" &&
        metadata !== null &&
        !Array.isArray(metadata) &&
        typeof metadata.source === "string"
          ? metadata.source
          : "";
      const hasLinkedLineCustomer = Boolean(row.customers?.line_user_id?.trim());
      return source === "line" || source === "line_pending" || hasLinkedLineCustomer;
    });

  const kpi: DashboardKpi = {
    todayOrderCount: todayOrders.length,
    todayOrderAmount: todayDeliveryRevenue,
    todayNetProfit,
    todayCost,
    submittedOrderCount: lineOrderRows.length + lineSourceOrderRows.length,
    pendingDeliveryCount: pendingDeliveries.length,
    pendingDeliveryAmount: pendingDeliveries.reduce((s, r) => s + toNum(r.total_amount), 0),
    monthDeliveredAmount: monthDelivered.reduce((s, r) => s + toNum(r.total_amount), 0),
    activeCustomerCount: toNum(activeCustomerRes.count),
    lowStockCount: stockDashboardRes.lowStockCount,
  };

  const recentOrders: RecentOrder[] = recentRaw.map((r) => ({
    id: r.id,
    orderNumber: r.order_number,
    orderDate: r.order_date,
    customerName: r.customers?.name ?? "—",
    totalAmount: toNum(r.total_amount),
    status: r.status as RecentOrder["status"],
  }));

  // ── Weekly trend ───────────────────────────────────────────────────────────

  const byDate = new Map<string, { amount: number; count: number }>();
  for (const row of weeklyRaw) {
    const cur = byDate.get(row.order_date) ?? { amount: 0, count: 0 };
    byDate.set(row.order_date, {
      amount: cur.amount + toNum(row.total_amount),
      count: cur.count + 1,
    });
  }

  const weeklyTrend: WeeklyBar[] = Array.from({ length: 7 }, (_, i) => {
    const date = subtractDays(today, 6 - i);
    const entry = byDate.get(date) ?? { amount: 0, count: 0 };
    return { date, amount: entry.amount, count: entry.count, label: thaiDayShort(date) };
  });

  const dailyPerformanceRows: DashboardDailyPerformanceRow[] = recentDailyPerformance.rows.map((row) => ({
    isoDate: row.isoDate,
    monthLabel: row.monthLabel,
    revenue: row.revenue,
    cost: row.cost,
    profit: row.profit,
    orderCount: row.orderCount,
  }));

  // ── Top 5 customers (by total order amount this month) ────────────────────

  const customerMap = new Map<string, { name: string; total: number }>();
  for (const order of monthRaw) {
    const prev = customerMap.get(order.customer_id) ?? {
      name: order.customers?.name ?? "—",
      total: 0,
    };
    customerMap.set(order.customer_id, {
      name: prev.name,
      total: prev.total + toNum(order.total_amount),
    });
  }
  const topCustomers: TopCustomer[] = [...customerMap.entries()]
    .map(([id, v]) => ({ customerId: id, customerName: v.name, totalAmount: v.total }))
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 5);

  // ── Top 5 products (by line_total this month) ─────────────────────────────

  const productMap = new Map<string, { name: string; total: number; imageUrl: string | null }>();
  for (const order of monthRaw) {
    for (const item of order.order_items ?? []) {
      const sortedImages = [...(item.products?.product_images ?? [])].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
      );
      const firstImageUrl = sortedImages[0]?.public_url ?? null;
      const prev = productMap.get(item.product_id) ?? {
        name: item.products?.name ?? "—",
        total: 0,
        imageUrl: firstImageUrl,
      };
      productMap.set(item.product_id, {
        name: prev.name,
        total: prev.total + toNum(item.line_total),
        imageUrl: prev.imageUrl ?? firstImageUrl,
      });
    }
  }
  const topProducts: TopProduct[] = [...productMap.entries()]
    .map(([id, v]) => ({
      productId: id,
      productName: v.name,
      totalAmount: v.total,
      imageUrl: v.imageUrl,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 5);

  const convertedCustomerIds = [
    ...new Set(
      lineOrderRows
        .map((row) => row.converted_customer_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const convertedOrderIds = [
    ...new Set(
      lineOrderRows
        .map((row) => row.converted_order_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const linkedCustomerIds = [
    ...new Set(lineSourceOrderRows.map((row) => row.customer_id).filter(Boolean)),
  ];
  const linkedLineUserIds = [
    ...new Set(
      lineSourceOrderRows
        .map((row) => row.customers?.line_user_id?.trim() ?? "")
        .filter(Boolean),
    ),
  ];

  const [
    { data: convertedCustomers },
    { data: convertedOrders },
    { data: lineProfilesByCustomer },
    { data: lineProfilesByUser },
  ] = await Promise.all([
    convertedCustomerIds.length > 0
      ? supabase
          .from("customers")
          .select("id, name")
          .eq("organization_id", organizationId)
          .in("id", convertedCustomerIds)
      : Promise.resolve({ data: [] }),
    convertedOrderIds.length > 0
      ? supabase
          .from("orders")
          .select("id, order_number")
          .eq("organization_id", organizationId)
          .in("id", convertedOrderIds)
      : Promise.resolve({ data: [] }),
    linkedCustomerIds.length > 0
      ? supabase
          .from("line_order_customers")
          .select("customer_id, line_user_id, line_display_name, line_picture_url")
          .eq("organization_id", organizationId)
          .in("customer_id", linkedCustomerIds)
      : Promise.resolve({ data: [] }),
    linkedLineUserIds.length > 0
      ? supabase
          .from("line_order_customers")
          .select("customer_id, line_user_id, line_display_name, line_picture_url")
          .eq("organization_id", organizationId)
          .in("line_user_id", linkedLineUserIds)
      : Promise.resolve({ data: [] }),
  ]);

  const customerNameById = new Map(
    ((convertedCustomers ?? []) as Array<{ id: string; name: string | null }>).map((customer) => [
      customer.id,
      customer.name,
    ]),
  );
  const orderNumberById = new Map(
    ((convertedOrders ?? []) as Array<{ id: string; order_number: string | null }>).map((order) => [
      order.id,
      order.order_number,
    ]),
  );
  const lineProfileByCustomerId = new Map<string, LineCustomerProfileDashboardRow>();
  const lineProfileByUserId = new Map<string, LineCustomerProfileDashboardRow>();
  for (const profile of [
    ...((lineProfilesByCustomer ?? []) as LineCustomerProfileDashboardRow[]),
    ...((lineProfilesByUser ?? []) as LineCustomerProfileDashboardRow[]),
  ]) {
    if (profile.customer_id) {
      lineProfileByCustomerId.set(profile.customer_id, profile);
    }
    if (profile.line_user_id?.trim()) {
      lineProfileByUserId.set(profile.line_user_id.trim(), profile);
    }
  }

  const pendingLineOrders = lineOrderRows.map((row) => ({
    id: row.id,
    orderNumber: row.converted_order_id ? (orderNumberById.get(row.converted_order_id) ?? null) : null,
    orderId: row.converted_order_id,
    lineDisplayName: row.line_display_name,
    linePictureUrl: row.line_picture_url,
    customerName: row.converted_customer_id ? (customerNameById.get(row.converted_customer_id) ?? null) : null,
    createdAt: row.created_at,
    status: "pending_link" as const,
  }));

  const linkedLineOrders = lineSourceOrderRows.map((row) => {
    const lineProfile =
      lineProfileByCustomerId.get(row.customer_id) ??
      lineProfileByUserId.get(row.customers?.line_user_id?.trim() ?? "");

    const hasUnpricedItems = row.order_items?.some(
      (item) => item.unit_price === null || item.unit_price === undefined || Number(item.unit_price) <= 0
    ) ?? false;

    return {
      id: row.id,
      orderNumber: row.order_number,
      orderId: row.id,
      lineDisplayName: lineProfile?.line_display_name ?? null,
      linePictureUrl: lineProfile?.line_picture_url ?? null,
      customerName: row.customers?.name ?? null,
      createdAt: row.created_at,
      status: "converted" as const,
      hasUnpricedItems,
    };
  });

  const lineOrders = [...pendingLineOrders, ...linkedLineOrders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return {
    kpi,
    recentOrders,
    weeklyTrend,
    dailyPerformanceRows,
    dailyPerformanceRangeStartDate: recentDailyPerformance.rangeStartDate,
    dailyPerformanceRangeEndDate: recentDailyPerformance.rangeEndDate,
    topCustomers,
    topProducts,
    stockProducts: stockDashboardRes.products,
    stockSuppliers: stockDashboardRes.suppliers,
    lineOrders,
  };
}
