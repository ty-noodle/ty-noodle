import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

const PROFIT_SALES_RPC_WINDOW_DAYS = 365;

export type ProfitSalesRow = {
  isoDate: string;
  orderCount: number;
  sales: number;
  cost: number;
  netProfit: number;
  marginPercent: number;
};

export type ProfitSalesSummary = {
  totalSales: number;
  totalCost: number;
  totalNetProfit: number;
  totalOrders: number;
  avgMarginPercent: number;
};

export type ProfitSalesReportData = {
  rows: ProfitSalesRow[];
  summary: ProfitSalesSummary;
};

type ProfitSalesRpcRow = {
  iso_date: string;
  order_count: number | string | null;
  sales: number | string | null;
  cost: number | string | null;
  net_profit: number | string | null;
  margin_percent: number | string | null;
};

type RpcClient = {
  rpc: (
    fn: "get_profit_sales_report",
    args: {
      p_organization_id: string;
      p_from_date: string;
      p_to_date: string;
      p_customer_ids: string[] | null;
    },
  ) => Promise<{ data: ProfitSalesRpcRow[] | null; error: { message: string } | null }>;
};

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function eachDate(fromDate: string, toDate: string) {
  const dates: string[] = [];
  const currentDate = new Date(`${fromDate}T00:00:00Z`);
  const lastDate = new Date(`${toDate}T00:00:00Z`);

  while (currentDate <= lastDate) {
    dates.push(currentDate.toISOString().slice(0, 10));
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }

  return dates;
}

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function splitDateWindows(fromDate: string, toDate: string, windowDays: number) {
  const windows: Array<{ fromDate: string; toDate: string }> = [];
  let currentFromDate = fromDate;

  while (currentFromDate <= toDate) {
    const currentToDate = addDays(currentFromDate, windowDays - 1);
    windows.push({
      fromDate: currentFromDate,
      toDate: currentToDate < toDate ? currentToDate : toDate,
    });

    currentFromDate = addDays(currentToDate, 1);
  }

  return windows;
}

export async function getProfitSalesReport(params: {
  organizationId: string;
  fromDate: string;
  toDate: string;
  customerIds?: string[];
}): Promise<ProfitSalesReportData> {
  const { organizationId, fromDate, toDate, customerIds = [] } = params;
  const supabase = getSupabaseAdmin() as unknown as RpcClient;
  const windows = splitDateWindows(fromDate, toDate, PROFIT_SALES_RPC_WINDOW_DAYS);
  const rpcResults = await Promise.all(
    windows.map((window) =>
      supabase.rpc("get_profit_sales_report", {
        p_organization_id: organizationId,
        p_from_date: window.fromDate,
        p_to_date: window.toDate,
        p_customer_ids: customerIds.length > 0 ? customerIds : null,
      }),
    ),
  );

  const rowsByDate = new Map<string, ProfitSalesRow>();

  for (const result of rpcResults) {
    if (result.error) {
      throw new Error(result.error.message);
    }

    for (const row of result.data ?? []) {
      const sales = toNumber(row.sales);
      const cost = toNumber(row.cost);
      const netProfit = toNumber(row.net_profit);
      rowsByDate.set(String(row.iso_date), {
        isoDate: String(row.iso_date),
        orderCount: toNumber(row.order_count),
        sales,
        cost,
        netProfit,
        marginPercent: sales > 0 ? toNumber(row.margin_percent) : 0,
      });
    }
  }

  const rows = eachDate(fromDate, toDate).map((isoDate) => {
    return rowsByDate.get(isoDate) ?? {
      isoDate,
      orderCount: 0,
      sales: 0,
      cost: 0,
      netProfit: 0,
      marginPercent: 0,
    };
  });

  const summary = rows.reduce<ProfitSalesSummary>(
    (acc, row) => {
      acc.totalSales += row.sales;
      acc.totalCost += row.cost;
      acc.totalNetProfit += row.netProfit;
      acc.totalOrders += row.orderCount;
      return acc;
    },
    {
      totalSales: 0,
      totalCost: 0,
      totalNetProfit: 0,
      totalOrders: 0,
      avgMarginPercent: 0,
    },
  );

  summary.avgMarginPercent =
    summary.totalSales > 0 ? (summary.totalNetProfit / summary.totalSales) * 100 : 0;

  return {
    rows,
    summary,
  };
}
