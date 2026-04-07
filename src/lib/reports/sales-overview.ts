import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MonthlySalesRow = {
  month: number;       // 1–12
  monthLabel: string;  // "ม.ค.", "ก.พ.", ...
  revenue: number;
  cost: number;
  profit: number;
  orderCount: number;
  revenuePercent: number; // % of year total
};

export type SalesOverviewSummary = {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  totalOrders: number;
  peakMonth: MonthlySalesRow | null;
  avgMonthlyRevenue: number;
};

export type SalesOverviewData = {
  year: number;
  rows: MonthlySalesRow[];
  summary: SalesOverviewSummary;
  prevYearRevenue: number[];    // index 0–11, for bar chart comparison
  prevYearRows: MonthlySalesRow[]; // full rows for table comparison
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

const MONTH_LABELS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

// ─── Main query ───────────────────────────────────────────────────────────────

async function fetchMonthlyRevenue(
  organizationId: string,
  fromDate: string,
  toDate: string,
): Promise<{ month: number; revenue: number; cost: number; orderCount: number }[]> {
  const supabase = getSupabaseAdmin();

    const { data: notes } = await supabase
    .from("delivery_notes")
    .select("delivery_date, total_amount, id")
    .eq("organization_id", organizationId)
    .eq("status", "confirmed")
    .gte("delivery_date", fromDate)
    .lte("delivery_date", toDate)
    .order("delivery_date", { ascending: true });

  if (!notes || notes.length === 0) return [];

  const noteIds = (notes as { id: string }[]).map((n) => n.id);

  // Fetch items + sale unit info to compute cost
    const { data: items } = await supabase
    .from("delivery_note_items")
    .select("delivery_note_id, quantity_delivered, product_sale_unit_id")
    .in("delivery_note_id", noteIds);

  const saleUnitIds = [
    ...new Set(
      ((items ?? []) as { product_sale_unit_id: string | null }[])
        .map((i) => i.product_sale_unit_id)
        .filter(Boolean) as string[],
    ),
  ];

  // Fetch sale units to get cost mode + fixed cost + base_unit_quantity + product ref
    const { data: saleUnits } = saleUnitIds.length > 0
    ? await supabase
        .from("product_sale_units")
        .select("id, product_id, base_unit_quantity, cost_mode, fixed_cost_price")
        .in("id", saleUnitIds)
    : { data: [] };

  const productIds = [
    ...new Set(
      ((saleUnits ?? []) as { product_id: string }[]).map((u) => u.product_id),
    ),
  ];

    const { data: products } = productIds.length > 0
    ? await supabase
        .from("products")
        .select("id, cost_price")
        .in("id", productIds)
    : { data: [] };

  const productCostMap = new Map<string, number>(
    ((products ?? []) as { id: string; cost_price: unknown }[]).map((p) => [
      p.id,
      toNum(p.cost_price),
    ]),
  );

  type SaleUnitRow = {
    id: string;
    product_id: string;
    base_unit_quantity: unknown;
    cost_mode: string | null;
    fixed_cost_price: unknown;
  };

  const saleUnitCostMap = new Map<string, number>(
    ((saleUnits ?? []) as SaleUnitRow[]).map((u) => {
      const baseCost = productCostMap.get(u.product_id) ?? 0;
      const qty = toNum(u.base_unit_quantity);
      const effectiveCost =
        u.cost_mode === "fixed" && u.fixed_cost_price != null
          ? toNum(u.fixed_cost_price)
          : baseCost * qty;
      return [u.id, effectiveCost];
    }),
  );

  // Build cost map per note
  const noteCostMap = new Map<string, number>();
  for (const item of (items ?? []) as {
    delivery_note_id: string;
    quantity_delivered: unknown;
    product_sale_unit_id: string | null;
  }[]) {
    const qty = toNum(item.quantity_delivered);
    const unitCost = item.product_sale_unit_id
      ? (saleUnitCostMap.get(item.product_sale_unit_id) ?? 0)
      : 0;
    const cost = unitCost * qty;
    noteCostMap.set(
      item.delivery_note_id,
      (noteCostMap.get(item.delivery_note_id) ?? 0) + cost,
    );
  }

  // Aggregate by month
  const buckets = new Map<number, { revenue: number; cost: number; orderCount: number }>();
  for (const note of notes as { delivery_date: string; total_amount: unknown; id: string }[]) {
    const month = parseInt(note.delivery_date.slice(5, 7), 10); // "2025-03-15" → 3
    const existing = buckets.get(month) ?? { revenue: 0, cost: 0, orderCount: 0 };
    existing.revenue += toNum(note.total_amount);
    existing.cost += noteCostMap.get(note.id) ?? 0;
    existing.orderCount += 1;
    buckets.set(month, existing);
  }

  return Array.from(buckets.entries()).map(([month, data]) => ({ month, ...data }));
}

export async function getSalesOverviewData(
  organizationId: string,
  year: number,
): Promise<SalesOverviewData> {
  const fromDate = `${year}-01-01`;
  const toDate = `${year}-12-31`;
  const prevFromDate = `${year - 1}-01-01`;
  const prevToDate = `${year - 1}-12-31`;

  const [current, prev] = await Promise.all([
    fetchMonthlyRevenue(organizationId, fromDate, toDate),
    fetchMonthlyRevenue(organizationId, prevFromDate, prevToDate),
  ]);

  const currentMap = new Map(current.map((r) => [r.month, r]));

  const totalRevenue = current.reduce((s, r) => s + r.revenue, 0);

  const rows: MonthlySalesRow[] = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const data = currentMap.get(month);
    const revenue = data?.revenue ?? 0;
    const cost = data?.cost ?? 0;
    return {
      month,
      monthLabel: MONTH_LABELS[i],
      revenue,
      cost,
      profit: revenue - cost,
      orderCount: data?.orderCount ?? 0,
      revenuePercent: totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0,
    };
  });

  const prevMap = new Map(prev.map((r) => [r.month, r]));
  const prevYearRevenue = Array.from({ length: 12 }, (_, i) =>
    prevMap.get(i + 1)?.revenue ?? 0,
  );

  const prevTotalRevenue = prev.reduce((s, r) => s + r.revenue, 0);
  const prevYearRows: MonthlySalesRow[] = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const data = prevMap.get(month);
    const revenue = data?.revenue ?? 0;
    const cost = data?.cost ?? 0;
    return {
      month,
      monthLabel: MONTH_LABELS[i],
      revenue,
      cost,
      profit: revenue - cost,
      orderCount: data?.orderCount ?? 0,
      revenuePercent: prevTotalRevenue > 0 ? (revenue / prevTotalRevenue) * 100 : 0,
    };
  });

  const activeRows = rows.filter((r) => r.revenue > 0);
  const peakMonth = activeRows.length > 0
    ? activeRows.reduce((best, r) => (r.revenue > best.revenue ? r : best))
    : null;

  const summary: SalesOverviewSummary = {
    totalRevenue,
    totalCost: rows.reduce((s, r) => s + r.cost, 0),
    totalProfit: rows.reduce((s, r) => s + r.profit, 0),
    totalOrders: rows.reduce((s, r) => s + r.orderCount, 0),
    peakMonth,
    avgMonthlyRevenue: activeRows.length > 0 ? totalRevenue / activeRows.length : 0,
  };

  return { year, rows, summary, prevYearRevenue, prevYearRows };
}

export async function getAvailableYears(organizationId: string): Promise<number[]> {
  const supabase = getSupabaseAdmin();
    const { data } = await supabase
    .from("delivery_notes")
    .select("delivery_date")
    .eq("organization_id", organizationId)
    .eq("status", "confirmed")
    .order("delivery_date", { ascending: true })
    .limit(1);

  const currentYear = new Date().getFullYear();
  if (!data || data.length === 0) return [currentYear];

  const firstYear = parseInt((data[0] as { delivery_date: string }).delivery_date.slice(0, 4), 10);
  const years: number[] = [];
  for (let y = firstYear; y <= currentYear; y++) years.push(y);
  return years.reverse();
}
