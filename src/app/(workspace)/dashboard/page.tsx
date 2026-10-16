import "server-only";

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppSidebarLayout } from "@/components/app-sidebar";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { DashboardLoadingShell } from "@/components/dashboard/dashboard-loading-shell";
import { requireAppSession, roleHomePage } from "@/lib/auth/authorization";
import { getDashboardOverview } from "@/lib/dashboard/overview";
import { getIncomingOrders, getOrderDetailById } from "@/lib/orders/detail";
import { getTodayInBangkok } from "@/lib/orders/date";
import { getProductsForOrder } from "@/lib/orders/manage";
import { getOrderStoreStatusSummary } from "@/lib/orders/store-status";

import type { DashboardOverview } from "@/lib/dashboard/overview";
import type { IncomingOrderListItem, OrderDetailData } from "@/lib/orders/detail";
import type { OrderProductOption } from "@/lib/orders/manage";
import type { OrderStoreStatusSummary } from "@/lib/orders/store-status";

export const metadata = { title: "ภาพรวม" };

type DashboardPageProps = {
  searchParams: Promise<{ date?: string; expanded?: string; q?: string }>;
};

type DashboardDataContentProps = {
  expandedOrderId: string;
  orderDate: string;
  organizationId: string;
  today: string;
};

async function DashboardDataContent({
  expandedOrderId,
  orderDate,
  organizationId,
  today,
}: DashboardDataContentProps) {
  let overview: DashboardOverview | null = null;
  let storeStatusSummary: OrderStoreStatusSummary | null = null;
  let expandedDetail: OrderDetailData | null = null;
  let orders: IncomingOrderListItem[] = [];
  let products: OrderProductOption[] = [];

  try {
    const results = await Promise.all([
      getDashboardOverview(organizationId),
      getOrderStoreStatusSummary(organizationId, orderDate),
      expandedOrderId
        ? getOrderDetailById(organizationId, expandedOrderId)
        : Promise.resolve(null),
      expandedOrderId ? getIncomingOrders(organizationId, { orderDate }) : Promise.resolve([]),
      expandedOrderId ? getProductsForOrder(organizationId) : Promise.resolve([]),
    ]);

    overview = results[0];
    storeStatusSummary = results[1];
    expandedDetail = results[2];
    orders = results[3];
    products = results[4];
  } catch (error) {
    console.error("Dashboard data fetch error:", error);
    overview = {
      kpi: {
        todayOrderCount: 0,
        todayOrderAmount: 0,
        todayNetProfit: 0,
        todayCost: 0,
        submittedOrderCount: 0,
        pendingDeliveryCount: 0,
        pendingDeliveryAmount: 0,
        monthDeliveredAmount: 0,
        activeCustomerCount: 0,
        lowStockCount: 0,
      },
      recentOrders: [],
      weeklyTrend: [],
      dailyPerformanceRows: [],
      dailyPerformanceRangeStartDate: null,
      dailyPerformanceRangeEndDate: null,
      topCustomers: [],
      topProducts: [],
      stockProducts: [],
      stockSuppliers: [],
      lineOrders: [],
    };
    storeStatusSummary = {
      allStores: [],
      orderedStores: [],
      unorderedStores: [],
    };
  }

  return (
    <DashboardClient
      overview={overview}
      storeStatusSummary={storeStatusSummary}
      stockProducts={overview.stockProducts}
      stockSuppliers={overview.stockSuppliers}
      today={today}
      orderDate={orderDate}
      expandedDetail={expandedDetail}
      expandedOrderId={expandedOrderId}
      allOrders={orders}
      products={products}
    />
  );
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await requireAppSession();
  if (session.role === "warehouse") {
    redirect(roleHomePage("warehouse"));
  }

  const params = await searchParams;
  const today = getTodayInBangkok();
  const orderDate = params.date || today;
  const expandedOrderId = params.expanded?.trim() ?? "";
  const suspenseKey = `${session.organizationId}:${orderDate}:${expandedOrderId}`;

  return (
    <AppSidebarLayout>
      <Suspense key={suspenseKey} fallback={<DashboardLoadingShell />}>
        <DashboardDataContent
          expandedOrderId={expandedOrderId}
          orderDate={orderDate}
          organizationId={session.organizationId}
          today={today}
        />
      </Suspense>
    </AppSidebarLayout>
  );
}
