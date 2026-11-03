import { Suspense } from "react";
import { NavigationLoading } from "@/components/navigation-loading";
import { getOrderSummaryItems, IncomingOrderPrintActions } from "./incoming-order-print-actions";
import { ClipboardList, Search } from "lucide-react";
import dynamic from "next/dynamic";
import { SettingsShell } from "@/components/settings/settings-shell";
import { IncomingOrdersInfiniteList } from "@/components/orders/incoming-orders-infinite-list";
import { IncomingOrderDateFilter } from "@/components/orders/incoming-order-date-filter";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";
import { OrderCustomerFilter } from "@/components/orders/order-customer-filter";
import { requireAppRole } from "@/lib/auth/authorization";
import { normalizeOrderDate, getTodayInBangkok } from "@/lib/orders/date";
import { getCustomerOrderCountsByDate, getIncomingOrders, getOrderDetailById } from "@/lib/orders/detail";
import { getBilledDeliveryNumbersForRange } from "@/lib/billing/billing-statement";
import { getPendingLineOrders } from "@/lib/orders/line-pending";
import { getCustomersForOrder, getProductsForOrder, getVehiclesForOrder } from "@/lib/orders/manage";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
const CreateOrderModal = dynamic(() =>
  import("@/components/orders/create-order-modal").then((mod) => mod.CreateOrderModal),
);
const IncomingOrderModal = dynamic(() =>
  import("@/components/orders/incoming-order-modal").then((mod) => mod.IncomingOrderModal),
);
const PendingLineOrdersSection = dynamic(() =>
  import("@/components/orders/pending-line-orders-section").then((mod) => mod.PendingLineOrdersSection),
);

export const metadata = { title: "รายการออเดอร์" };

type IncomingOrdersPageProps = {
  searchParams: Promise<{
    create?: string;
    customers?: string;
    date?: string;
    endDate?: string;
    expanded?: string;
    q?: string;
  }>;
};

type IncomingDeliveryNoteRow = {
  id: string;
  order_id: string | null;
  customer_id: string;
  delivery_date: string;
  delivery_number: string;
};

const INCOMING_ORDERS_PAGE_SIZE = 30;

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

export default async function IncomingOrdersPage({ searchParams }: IncomingOrdersPageProps) {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();
  const params = await searchParams;
  const orderDate = normalizeOrderDate(params.date);
  const endDate = params.endDate ? normalizeOrderDate(params.endDate) : orderDate;
  const searchTerm = params.q?.trim() ?? "";
  const expandedOrderId = params.expanded?.trim() ?? "";
  const autoOpenCreateModal = params.create === "1";
  const selectedCustomerIds = Array.from(
    new Set(
      (params.customers ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );

  const [
    initialPageOrders,
    printOrders,
    expandedDetail,
    customers,
    products,
    vehicles,
    pendingLineOrders,
    customerOrderCountsToday,
    billedDeliveryNumbers,
  ] = await Promise.all([
    getIncomingOrders(session.organizationId, {
      orderDate,
      endDate,
      searchTerm,
      customerIds: selectedCustomerIds,
      excludeCancelled: true,
      limit: INCOMING_ORDERS_PAGE_SIZE + 1,
      offset: 0,
    }),
    getIncomingOrders(session.organizationId, {
      orderDate,
      endDate,
      searchTerm,
      customerIds: selectedCustomerIds,
      excludeCancelled: true,
    }),
    expandedOrderId ? getOrderDetailById(session.organizationId, expandedOrderId) : Promise.resolve(null),
    getCustomersForOrder(session.organizationId),
    getProductsForOrder(session.organizationId),
    getVehiclesForOrder(session.organizationId),
    getPendingLineOrders(session.organizationId, { orderDate, endDate, searchTerm }),
    getCustomerOrderCountsByDate(session.organizationId, orderDate, endDate),
    getBilledDeliveryNumbersForRange(session.organizationId, orderDate, endDate),
  ]);

  const customerOptions = customers.map((customer) => ({
    id: customer.id,
    code: customer.code,
    name: customer.name,
  }));

  const hasMoreOrders = initialPageOrders.length > INCOMING_ORDERS_PAGE_SIZE;
  const initialOrders = initialPageOrders.slice(0, INCOMING_ORDERS_PAGE_SIZE);
  const activeOrders = initialOrders.filter((order) => order.status !== "cancelled");
  const printActiveOrders = printOrders.filter((order) => order.status !== "cancelled");
  const printActiveOrderIds = printActiveOrders.map((order) => order.id);
  const deliveryCustomerIds =
    selectedCustomerIds.length > 0
      ? selectedCustomerIds
      : Array.from(new Set(printActiveOrders.map((order) => order.customerId)));
  const summaryItems = getOrderSummaryItems(admin, printActiveOrderIds);
  // The print boundary handles errors; observe early rejection while delivery data loads.
  void summaryItems.catch(() => {});
  const [rangeDeliveryData, directDeliveryData] = await Promise.all([
    getIncomingDeliveryNoteRows(
      admin,
      session.organizationId,
      orderDate,
      endDate,
      deliveryCustomerIds,
    ),
    getDirectDeliveryNoteRowsByOrderIds(admin, session.organizationId, printActiveOrderIds),
  ]);
  const deliveryData = Array.from(
    new Map([...rangeDeliveryData, ...directDeliveryData].map((note) => [note.id, note])).values(),
  );

  const filteredOrders =
    selectedCustomerIds.length > 0
      ? activeOrders.filter((order) => selectedCustomerIds.includes(order.customerId))
      : activeOrders;
  const filteredPrintOrders =
    selectedCustomerIds.length > 0
      ? printActiveOrders.filter((order) => selectedCustomerIds.includes(order.customerId))
      : printActiveOrders;

  const filteredExpandedDetail =
    expandedDetail &&
    expandedDetail.status !== "cancelled" &&
    (selectedCustomerIds.length === 0 || selectedCustomerIds.includes(expandedDetail.customer.id))
      ? expandedDetail
      : null;

  const deliveryMap = new Map<string, string[]>();
  const deliveryIdMap = new Map<string, string[]>();
  const activeOrderById = new Map(printActiveOrders.map((order) => [order.id, order]));

  for (const item of deliveryData) {
    const key = `${item.customer_id}_${item.delivery_date}`;
    const currentNumbers = deliveryMap.get(key) ?? [];
    const currentIds = deliveryIdMap.get(key) ?? [];
    if (!currentNumbers.includes(item.delivery_number)) {
      currentNumbers.push(item.delivery_number);
    }
    if (!currentIds.includes(item.id)) {
      currentIds.push(item.id);
    }
    deliveryMap.set(
      key,
      currentNumbers,
    );
    deliveryIdMap.set(
      key,
      currentIds,
    );
  }

  // Enrich with direct deliveries using orderDate!
  for (const note of deliveryData) {
    if (!note.order_id) continue;
    const matchedOrder = activeOrderById.get(note.order_id);
    if (matchedOrder) {
      // We map under key: customerId_orderDate
      const key = `${matchedOrder.customerId}_${matchedOrder.orderDate}`;

      const existingNumbers = deliveryMap.get(key) ?? [];
      if (!existingNumbers.includes(note.delivery_number)) {
        existingNumbers.push(note.delivery_number);
      }
      deliveryMap.set(key, existingNumbers);

      const existingIds = deliveryIdMap.get(key) ?? [];
      if (!existingIds.includes(note.id)) {
        existingIds.push(note.id);
      }
      deliveryIdMap.set(key, existingIds);
    }
  }

  const deliveryByCustomerId = Object.fromEntries(deliveryMap.entries());
  const billedDeliveryByCustomerDate = Object.fromEntries(
    Array.from(deliveryMap.entries()).map(([key, deliveryNumbers]) => [
      key,
      deliveryNumbers.some((deliveryNumber) => billedDeliveryNumbers.has(deliveryNumber)),
    ]),
  );

  return (
    <SettingsShell
      title="คำสั่งซื้อ"
      description=""
      floatingSubmit={false}
      headerContent={
        <div className="hidden rounded-2xl border border-white/15 bg-white/10 p-3 shadow-[0_18px_50px_rgba(0,0,0,0.16)] backdrop-blur-md lg:block">
          <form action="/orders/incoming" method="get" className="hidden flex-1 items-center gap-2 lg:flex">
            <label className="relative block flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-700" />
              <input
                type="search"
                name="q"
                defaultValue={searchTerm}
                placeholder="ค้นหาชื่อร้าน หรือเลขออเดอร์"
                className="w-full rounded-lg border border-white/25 bg-white py-2.5 pl-10 pr-4 text-sm font-medium text-slate-950 outline-none transition focus:border-white focus:ring-2 focus:ring-white/25"
              />
            </label>

            <div className="w-72">
              <OrderCustomerFilter
                options={customerOptions}
                selectedIds={selectedCustomerIds}
                placeholder="เลือกร้านค้า"
              />
            </div>

            <button
              type="submit"
              className="rounded-lg bg-white px-5 py-2.5 text-sm font-bold text-[#003366] shadow-sm transition hover:bg-slate-100 active:scale-[0.98]"
            >
              ค้นหา
            </button>

            <div className="ml-2 flex items-center gap-2 border-l border-white/20 pl-4">
              <div className="flex items-center gap-2">
                <div className="w-40">
                  <IncomingOrderDateFilter
                    id="incoming-date"
                    name="date"
                    defaultValue={orderDate}
                    noAutoSubmit={true}
                  />
                </div>
                <span className="font-bold text-white/40">ถึง</span>
                <div className="w-40">
                  <IncomingOrderDateFilter
                    id="incoming-endDate"
                    name="endDate"
                    defaultValue={endDate}
                    noAutoSubmit={true}
                  />
                </div>
              </div>
            </div>
          </form>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="fixed bottom-6 right-6 z-[100] hidden lg:block">
          <div className="group relative">
            <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-[#003366] to-[#1a237e] opacity-25 blur transition duration-300 group-hover:opacity-50" />
            <div className="relative">
              <CreateOrderModal
                autoOpen={autoOpenCreateModal}
                customerOrderCountsToday={customerOrderCountsToday}
                customers={customers}
                products={products}
                today={getTodayInBangkok()}
              />
            </div>
          </div>
        </div>

        <MobileSearchDrawer title="ค้นหาออเดอร์">
          <form action="/orders/incoming" method="get" className="flex flex-col gap-4 pb-32">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="ml-1 text-xs font-bold text-slate-900">จากวันที่</label>
                <IncomingOrderDateFilter
                  id="m-incoming-date"
                  name="date"
                  defaultValue={orderDate}
                  noAutoSubmit={true}
                />
              </div>
              <div className="space-y-1">
                <label className="ml-1 text-xs font-bold text-slate-900">ถึงวันที่</label>
                <IncomingOrderDateFilter
                  id="m-incoming-endDate"
                  name="endDate"
                  defaultValue={endDate}
                  noAutoSubmit={true}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="ml-1 text-xs font-bold text-slate-900">ค้นหาออเดอร์</label>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-700" />
                <input
                  type="search"
                  name="q"
                  defaultValue={searchTerm}
                  placeholder="ค้นหาจากเลขออเดอร์ ชื่อร้าน หรือช่องทาง"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-11 pr-4 text-base font-medium text-slate-950 outline-none transition focus:border-[#003366] focus:bg-white"
                />
              </label>
            </div>

            <div className="space-y-1">
              <label className="ml-1 text-xs font-bold text-slate-900">เลือกร้านค้า</label>
              <OrderCustomerFilter
                options={customerOptions}
                selectedIds={selectedCustomerIds}
                placeholder="เลือกร้านค้า"
              />
            </div>

            <button
              type="submit"
              className="mt-2 w-full rounded-2xl bg-[#003366] py-4 text-base font-bold text-white shadow-[0_12px_24px_rgba(0,51,102,0.2)] transition active:scale-[0.98]"
            >
              ค้นหา
            </button>
          </form>
        </MobileSearchDrawer>

        <PendingLineOrdersSection customers={customers} pendingOrders={pendingLineOrders} />

        <section className="relative mt-0 w-full bg-transparent">
          <div className="flex flex-col gap-3 px-1 py-1 sm:py-3">
            <div className="flex items-center justify-center gap-2 w-full">
              <ClipboardList className="h-5 w-5 text-[#003366] sm:h-6 sm:w-6" strokeWidth={2.5} />
              <h2 className="text-base font-bold text-slate-950 sm:text-xl">รายการออเดอร์เข้า</h2>
            </div>

            <Suspense fallback={<NavigationLoading compact />}>
              <IncomingOrderPrintActions
                summaryItems={summaryItems}
                filteredPrintOrders={filteredPrintOrders}
                products={products}
                deliveryMap={deliveryMap}
                deliveryIdMap={deliveryIdMap}
                orderDate={orderDate}
                endDate={endDate}
              />
            </Suspense>
          </div>

          {filteredOrders.length > 0 ? (
            <IncomingOrdersInfiniteList
              billedByCustomerDate={billedDeliveryByCustomerDate}
              deliveryByCustomerId={deliveryByCustomerId}
              endDate={endDate}
              hasMore={hasMoreOrders}
              initialExpandedDetail={filteredExpandedDetail}
              initialExpandedOrderId={expandedOrderId}
              key={`${orderDate}:${endDate}:${searchTerm}:${selectedCustomerIds.join(",")}`}
              orderDate={orderDate}
              orders={filteredOrders}
              products={products}
              searchTerm={searchTerm}
              selectedCustomerIds={selectedCustomerIds}
              vehicles={vehicles}
            />
          ) : (
            <div className="px-6 py-16 text-center">
              <p className="text-lg font-semibold text-slate-950">ยังไม่มีออเดอร์เข้าในช่วงวันที่เลือก</p>
              <p className="mt-2 text-sm font-medium text-slate-950">
                เมื่อลูกค้าส่งคำสั่งซื้อเข้ามา ระบบจะแสดงรายการออเดอร์แต่ละใบที่หน้านี้
              </p>
            </div>
          )}
        </section>
      </div>

      {expandedOrderId && filteredExpandedDetail ? (
        <IncomingOrderModal
          allOrders={filteredOrders}
          date={orderDate}
          detail={filteredExpandedDetail}
          expandedId={expandedOrderId}
          products={products}
          searchTerm={searchTerm}
        />
      ) : null}
    </SettingsShell>
  );
}
