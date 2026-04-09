import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTodayInBangkok } from "@/lib/orders/date";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DashboardKpi = {
  todayOrderCount: number;
  todayOrderAmount: number;
  submittedOrderCount: number;
  pendingDeliveryCount: number;
  pendingDeliveryAmount: number;
  monthDeliveredAmount: number;
  activeCustomerCount: number;
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

export type DashboardOverview = {
  kpi: DashboardKpi;
  recentOrders: RecentOrder[];
  weeklyTrend: WeeklyBar[];
  topCustomers: TopCustomer[];
  topProducts: TopProduct[];
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

// ─── Query ────────────────────────────────────────────────────────────────────

export async function getDashboardOverview(organizationId: string): Promise<DashboardOverview> {
  const supabase = getSupabaseAdmin();
  const today = getTodayInBangkok();
  const monthStart = firstOfMonth(today);
  const sixDaysAgo = subtractDays(today, 6);

  const [
    todayOrdersRes,
    submittedOrdersRes,
    pendingDeliveryRes,
    monthDeliveredRes,
    activeCustomerRes,
    recentOrdersRes,
    weeklyOrdersRes,
    monthOrdersRes,
  ] = await Promise.all([
    // 1. Today's submitted/confirmed orders
    supabase.from("orders")
      .select("id, total_amount")
      .eq("organization_id", organizationId)
      .eq("order_date", today)
      .in("status", ["submitted", "confirmed"]),

    // 2. All unconfirmed (submitted) orders — need admin action
    supabase.from("orders")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "submitted"),

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

    // 6. Last 7 days — weekly trend chart
    supabase.from("orders")
      .select("order_date, total_amount")
      .eq("organization_id", organizationId)
      .in("status", ["submitted", "confirmed"])
      .gte("order_date", sixDaysAgo)
      .lte("order_date", today),

    // 7. This month's orders with customer + items+product — for Top 5 rankings
    supabase.from("orders")
      .select(`
        total_amount,
        customer_id,
        customers!inner(name),
        order_items(product_id, line_total, products(name, product_images(public_url, sort_order)))
      `)
      .eq("organization_id", organizationId)
      .in("status", ["submitted", "confirmed"])
      .gte("order_date", monthStart)
      .lte("order_date", today),
  ]);

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

  const kpi: DashboardKpi = {
    todayOrderCount: todayOrders.length,
    todayOrderAmount: todayOrders.reduce((s, r) => s + toNum(r.total_amount), 0),
    submittedOrderCount: toNum(submittedOrdersRes.count),
    pendingDeliveryCount: pendingDeliveries.length,
    pendingDeliveryAmount: pendingDeliveries.reduce((s, r) => s + toNum(r.total_amount), 0),
    monthDeliveredAmount: monthDelivered.reduce((s, r) => s + toNum(r.total_amount), 0),
    activeCustomerCount: toNum(activeCustomerRes.count),
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

  return { kpi, recentOrders, weeklyTrend, topCustomers, topProducts };
}
