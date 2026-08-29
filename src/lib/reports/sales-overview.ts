import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTodayInBangkok } from "@/lib/orders/date";

export type MonthlySalesRow = {
  month: number;
  monthLabel: string;
  revenue: number;
  cost: number;
  profit: number;
  orderCount: number;
  revenuePercent: number;
  isoDate: string;
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
  prevYearRevenue: number[];
  prevYearRows: MonthlySalesRow[];
  lineOrderCount: number;
  rangeStartDate: string | null;
  rangeEndDate: string | null;
};

export type RecentDailyPerformanceData = {
  rows: MonthlySalesRow[];
  rangeStartDate: string | null;
  rangeEndDate: string | null;
};

type DeliveryNoteRow = {
  id: string;
  delivery_date: string;
  total_amount: number | string | null;
};

type DeliveryNoteItemRow = {
  delivery_note_id: string;
  quantity_delivered: number | string | null;
  product_sale_unit_id: string | null;
  cost_price: number | string | null;
};


type OrderMetadataRow = {
  metadata: { source?: string } | null;
};

const MAX_DAILY_POINTS = 13;

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatShortDate(isoDate: string) {
  const month = isoDate.slice(5, 7);
  const day = isoDate.slice(8, 10);
  return `${day}/${month}`;
}

function subtractDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day - days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

async function loadNoteCosts(noteIds: string[]) {
  if (noteIds.length === 0) return new Map<string, number>();

  const supabase = getSupabaseAdmin();
  const chunkSize = 50;

  // 1. Chunk delivery_note_items query
  const typedItems: DeliveryNoteItemRow[] = [];
  for (let i = 0; i < noteIds.length; i += chunkSize) {
    const chunk = noteIds.slice(i, i + chunkSize);
    const { data: items, error } = await supabase
      .from("delivery_note_items")
      .select("delivery_note_id, quantity_delivered, cost_price")
      .in("delivery_note_id", chunk);

    if (error) throw new Error(error.message);
    if (items) {
      typedItems.push(...(items as DeliveryNoteItemRow[]));
    }
  }

  const noteCostById = new Map<string, number>();

  for (const item of typedItems) {
    const quantity = toNumber(item.quantity_delivered);
    const unitCost = toNumber(item.cost_price);

    noteCostById.set(
      item.delivery_note_id,
      (noteCostById.get(item.delivery_note_id) ?? 0) + unitCost * quantity,
    );
  }

  return noteCostById;
}

async function loadLineOrderCount(
  organizationId: string,
  fromDate: string,
  toDate: string,
) {
  const supabase = getSupabaseAdmin();

  const { data } = await supabase
    .from("orders")
    .select("metadata")
    .eq("organization_id", organizationId)
    .gte("order_date", fromDate)
    .lte("order_date", toDate)
    .neq("status", "cancelled");

  return ((data ?? []) as OrderMetadataRow[]).reduce((count, row) => {
    const source = String(row.metadata?.source ?? "").toLowerCase();
    return source.includes("line") ? count + 1 : count;
  }, 0);
}

function buildRowsFromDates(
  dateList: string[],
  noteBuckets: Map<string, { revenue: number; cost: number; orderCount: number }>,
) {
  const totalRevenue = dateList.reduce(
    (sum, isoDate) => sum + (noteBuckets.get(isoDate)?.revenue ?? 0),
    0,
  );

  const rows: MonthlySalesRow[] = dateList.map((isoDate, index) => {
    const bucket = noteBuckets.get(isoDate) ?? { revenue: 0, cost: 0, orderCount: 0 };
    const revenue = bucket.revenue;
    const cost = bucket.cost;

    return {
      month: index + 1,
      monthLabel: formatShortDate(isoDate),
      revenue,
      cost,
      profit: revenue - cost,
      orderCount: bucket.orderCount,
      revenuePercent: totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0,
      isoDate,
    };
  });

  return { rows, totalRevenue };
}

async function fetchDailyBucketsForYear(
  organizationId: string,
  year: number,
) {
  const supabase = getSupabaseAdmin();
  const fromDate = `${year}-01-01`;
  const toDate = `${year}-12-31`;

  const { data: notes } = await supabase
    .from("delivery_notes")
    .select("id, delivery_date, total_amount")
    .eq("organization_id", organizationId)
    .eq("status", "confirmed")
    .gte("delivery_date", fromDate)
    .lte("delivery_date", toDate)
    .order("delivery_date", { ascending: true });

  const typedNotes = (notes ?? []) as DeliveryNoteRow[];
  if (typedNotes.length === 0) {
    return {
      rows: [] as MonthlySalesRow[],
      summary: {
        totalRevenue: 0,
        totalCost: 0,
        totalProfit: 0,
        totalOrders: 0,
        peakMonth: null,
        avgMonthlyRevenue: 0,
      } satisfies SalesOverviewSummary,
      rangeStartDate: null as string | null,
      rangeEndDate: null as string | null,
      allDates: [] as string[],
    };
  }

  const allDates = [...new Set(typedNotes.map((note) => note.delivery_date))];
  const selectedDates = allDates.slice(-MAX_DAILY_POINTS);
  const selectedDateSet = new Set(selectedDates);
  const selectedNotes = typedNotes.filter((note) => selectedDateSet.has(note.delivery_date));
  const noteCostById = await loadNoteCosts(selectedNotes.map((note) => note.id));

  const noteBuckets = new Map<string, { revenue: number; cost: number; orderCount: number }>();

  for (const note of selectedNotes) {
    const bucket = noteBuckets.get(note.delivery_date) ?? { revenue: 0, cost: 0, orderCount: 0 };
    bucket.revenue += toNumber(note.total_amount);
    bucket.cost += noteCostById.get(note.id) ?? 0;
    bucket.orderCount += 1;
    noteBuckets.set(note.delivery_date, bucket);
  }

  const { rows, totalRevenue } = buildRowsFromDates(selectedDates, noteBuckets);
  const activeRows = rows.filter((row) => row.revenue > 0);
  const peakMonth =
    activeRows.length > 0
      ? activeRows.reduce((currentPeak, row) =>
          row.revenue > currentPeak.revenue ? row : currentPeak,
        )
      : null;

  const summary: SalesOverviewSummary = {
    totalRevenue,
    totalCost: rows.reduce((sum, row) => sum + row.cost, 0),
    totalProfit: rows.reduce((sum, row) => sum + row.profit, 0),
    totalOrders: rows.reduce((sum, row) => sum + row.orderCount, 0),
    peakMonth,
    avgMonthlyRevenue: activeRows.length > 0 ? totalRevenue / activeRows.length : 0,
  };

  return {
    rows,
    summary,
    rangeStartDate: selectedDates[0] ?? null,
    rangeEndDate: selectedDates[selectedDates.length - 1] ?? null,
    allDates,
  };
}

export async function getRecentDailyPerformance(
  organizationId: string,
  limit = 7,
  endIsoDate?: string,
): Promise<RecentDailyPerformanceData> {
  const supabase = getSupabaseAdmin();
  const safeLimit = Math.max(1, limit);

  let endDate = endIsoDate;
  if (!endDate) {
    const { data: latestNote } = await supabase
      .from("delivery_notes")
      .select("delivery_date")
      .eq("organization_id", organizationId)
      .eq("status", "confirmed")
      .order("delivery_date", { ascending: false })
      .limit(1);

    endDate = latestNote?.[0]?.delivery_date ?? getTodayInBangkok();
  }

  const startDate = subtractDays(endDate, safeLimit - 1);
  const selectedDates = Array.from({ length: safeLimit }, (_, index) =>
    subtractDays(endDate, safeLimit - 1 - index),
  );

  const { data, error } = await supabase.rpc("get_profit_sales_report" as never, {
    p_organization_id: organizationId,
    p_from_date: startDate,
    p_to_date: endDate,
    p_customer_ids: null,
  } as never);

  if (error) {
    throw new Error(error.message);
  }

  const rpcRows = (data ?? []) as Array<{
    iso_date: string;
    order_count: number;
    sales: number;
    cost: number;
    net_profit: number;
  }>;

  const noteBuckets = new Map<string, { revenue: number; cost: number; orderCount: number }>();
  for (const row of rpcRows) {
    noteBuckets.set(row.iso_date, {
      revenue: Number(row.sales),
      cost: Number(row.cost),
      orderCount: Number(row.order_count),
    });
  }

  const { rows } = buildRowsFromDates(selectedDates, noteBuckets);

  return {
    rows,
    rangeStartDate: selectedDates[0] ?? null,
    rangeEndDate: selectedDates[selectedDates.length - 1] ?? null,
  };
}

export async function getSalesOverviewData(
  organizationId: string,
  year: number,
): Promise<SalesOverviewData> {
  const current = await fetchDailyBucketsForYear(organizationId, year);
  const previous = await fetchDailyBucketsForYear(organizationId, year - 1);
  const latestVisibleDate = current.rangeEndDate ?? `${year}-12-31`;
  const lineOrderCount = await loadLineOrderCount(
    organizationId,
    latestVisibleDate,
    latestVisibleDate,
  );

  return {
    year,
    rows: current.rows,
    summary: current.summary,
    prevYearRevenue: previous.rows.map((row) => row.revenue),
    prevYearRows: previous.rows,
    lineOrderCount,
    rangeStartDate: current.rangeStartDate,
    rangeEndDate: current.rangeEndDate,
  };
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
  const firstDeliveryDate = data?.[0]?.delivery_date;

  if (!firstDeliveryDate) {
    return [currentYear];
  }

  const firstYear = Number.parseInt(firstDeliveryDate.slice(0, 4), 10);
  const years: number[] = [];

  for (let value = firstYear; value <= currentYear; value += 1) {
    years.push(value);
  }

  return years.reverse();
}
