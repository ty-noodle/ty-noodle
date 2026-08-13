"use client";

import { Fragment, memo, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Building2, Check, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { fetchIncomingOrderDetailAction } from "@/app/orders/incoming/actions";
import { DesktopOrderDetail } from "@/components/orders/desktop-order-detail";
import { IncomingOrderModal } from "@/components/orders/incoming-order-modal";
import { IncomingOrderDateButton } from "@/components/orders/incoming-order-date-button";
import { IncomingOrderVehicleSelect } from "@/components/orders/incoming-order-vehicle-select";
import { OrderDeliveryActionButton } from "@/components/orders/order-delivery-action-button";
import type { IncomingOrderListItem, OrderDetailData } from "@/lib/orders/detail";
import type { OrderProductOption, OrderVehicleOption } from "@/lib/orders/manage";

type IncomingOrdersDesktopTableProps = {
  billedByCustomerDate: Record<string, boolean>;
  deliveryByCustomerId: Record<string, string[]>;
  initialExpandedDetail: OrderDetailData | null;
  initialExpandedOrderId: string;
  orderDate: string;
  orders: IncomingOrderListItem[];
  products: OrderProductOption[];
  searchTerm: string;
  selectedCustomerIds: string[];
  vehicles: OrderVehicleOption[];
};

function formatCurrency(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatOrderDate(value: string) {
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${parseInt(y, 10) + 543}`;
}

type IncomingOrderRowProps = {
  order: IncomingOrderListItem;
  index: number;
  orders: IncomingOrderListItem[];
  isExpanded: boolean;
  isLoading: boolean;
  detail: OrderDetailData | null;
  detailError: string | null;
  deliveryNumbers: string[] | undefined;
  isBilled: boolean;
  vehicles: OrderVehicleOption[];
  orderDate: string;
  searchTerm: string;
  selectedCustomerIds: string[];
  toggleOrder: (orderId: string) => void;
  onEdit: (detail: OrderDetailData) => void;
};

const IncomingOrderRow = memo(function IncomingOrderRow({
  order,
  index,
  orders,
  isExpanded,
  isLoading,
  detail,
  detailError,
  deliveryNumbers,
  isBilled,
  vehicles,
  orderDate,
  searchTerm,
  selectedCustomerIds,
  toggleOrder,
  onEdit,
}: IncomingOrderRowProps) {
  const hasDelivery = Boolean(deliveryNumbers && deliveryNumbers.length > 0);
  const fallbackDeliveryNumber =
    order.orderNumber.startsWith("DN") ? order.orderNumber : null;
  const displayDeliveryNumbers =
    hasDelivery && deliveryNumbers && deliveryNumbers.length > 0
      ? deliveryNumbers
      : fallbackDeliveryNumber
        ? [fallbackDeliveryNumber]
        : [];
  const hasDisplayDelivery = displayDeliveryNumbers.length > 0;
  const showDivider = index === 0 || order.orderDate !== orders[index - 1].orderDate;

  return (
    <Fragment key={order.id}>
      {showDivider ? (
        <tr className="bg-slate-50/50">
          <td colSpan={7} className="border-y border-slate-200 px-3 py-3 xl:px-6 xl:py-4">
            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-slate-300" />
              <span className="rounded-2xl border border-slate-200 bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-[#003366] shadow-sm xl:px-5 xl:py-2 xl:text-xs">
                {formatOrderDate(order.orderDate)}
              </span>
              <div className="h-px flex-1 bg-slate-300" />
            </div>
          </td>
        </tr>
      ) : null}

      <tr className="align-middle transition-colors hover:bg-slate-50/80">
        <td className="px-2 py-2 xl:px-3 xl:py-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <Building2 className="h-4 w-4 shrink-0 text-[#003366]" strokeWidth={2.2} />
              <p className="min-w-0 break-words line-clamp-2 text-sm font-bold leading-tight text-slate-950 xl:text-base">
                <span translate="no">{order.customerCode}</span> - {order.customerName}
              </p>
            </div>
            <div className="mt-1 flex items-center gap-2 pl-6">
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 ring-1 ring-slate-200">
                {order.channelLabel}
              </span>
              {isBilled ? (
                <span
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-white"
                  title="วางบิลแล้ว"
                  aria-label="วางบิลแล้ว"
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              ) : null}
            </div>
          </div>
        </td>
        <td className="whitespace-nowrap px-2 py-2 text-center text-sm font-semibold text-slate-950 xl:px-3 xl:py-3 xl:text-base">
          {formatOrderDate(order.orderDate)}
        </td>
        <td className="px-2 py-2 text-center xl:px-3 xl:py-3">
          <p className="whitespace-nowrap text-sm font-semibold text-slate-950 xl:text-base">
            {order.productCount.toLocaleString("th-TH")} รายการ
          </p>
        </td>
        <td className="whitespace-nowrap px-2 py-2 text-center xl:px-3 xl:py-3">
          <p className="font-mono text-sm font-bold text-slate-950 xl:text-base">฿{formatCurrency(order.totalAmount)}</p>
        </td>
        <td className="min-w-0 px-2 py-2 text-left xl:px-3 xl:py-3">
          {hasDisplayDelivery ? (
            <div className="flex min-w-0 flex-col items-start gap-1">
              {displayDeliveryNumbers.map((num) => (
                <span key={num} className="whitespace-nowrap font-mono text-sm font-bold text-emerald-700 xl:text-base">
                  {num}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-sm font-medium text-slate-400 xl:text-base">-</span>
          )}
        </td>
        <td className="min-w-0 px-2 py-2 xl:px-3 xl:py-3">
          <div className="flex min-w-0 max-w-full justify-start">
            <IncomingOrderVehicleSelect
              customerId={order.customerId}
              currentVehicleId={order.vehicleId}
              currentVehicleName={order.vehicleName}
              vehicles={vehicles}
              orderDate={orderDate}
            />
          </div>
        </td>
        <td className="px-2 py-2 xl:px-3 xl:py-3">
          <div className="flex w-full items-center justify-center gap-2">
            <IncomingOrderDateButton
              currentListDate={orderDate}
              orderDate={order.orderDate}
              orderId={order.id}
              orderNumber={order.orderNumber}
              searchTerm={searchTerm}
              selectedCustomerIds={selectedCustomerIds}
            />
            <button
              type="button"
              onClick={() => void toggleOrder(order.id)}
              disabled={isLoading}
              aria-busy={isLoading}
              aria-label={isExpanded ? "ซ่อนรายละเอียดออเดอร์" : "แสดงรายละเอียดออเดอร์"}
              title={isExpanded ? "ซ่อนรายละเอียดออเดอร์" : "แสดงรายละเอียดออเดอร์"}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white p-0 leading-none text-slate-950 shadow-sm transition hover:border-[#003366]/30 hover:bg-slate-50 hover:text-[#003366] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003366]/20 disabled:opacity-85"
            >
              {isLoading ? (
                <Loader2 className="h-4.5 w-4.5 animate-spin" strokeWidth={2.2} />
              ) : isExpanded ? (
                <ChevronUp className="h-4.5 w-4.5" strokeWidth={2.2} />
              ) : (
                <ChevronDown className="h-4.5 w-4.5" strokeWidth={2.2} />
              )}
            </button>
            {hasDelivery ? (
              <OrderDeliveryActionButton
                customerId={order.customerId}
                customerName={order.customerName}
                date={order.orderDate}
                iconOnly
                label="ดูใบยืนยัน"
                orderId={order.id}
              />
            ) : null}
          </div>
        </td>
      </tr>

      {isExpanded ? (
        <tr className="bg-white">
          <td colSpan={7} className="p-0">
            {detail ? (
              <DesktopOrderDetail
                detail={detail}
                deliveryNumbers={deliveryNumbers}
                onEdit={onEdit}
              />
            ) : (
              <div className="flex items-center justify-center gap-3 border-y border-slate-300 bg-white px-6 py-8 text-base font-semibold text-slate-700">
                <Loader2 className="h-5 w-5 animate-spin text-[#003366]" strokeWidth={2.4} />
                กำลังโหลดรายละเอียดออเดอร์
              </div>
            )}
            {detailError && isLoading === false ? (
              <div className="border-t border-rose-100 bg-rose-50 px-6 py-3 text-sm font-semibold text-rose-700">
                {detailError}
              </div>
            ) : null}
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
});

export const IncomingOrdersDesktopTable = memo(function IncomingOrdersDesktopTable({
  billedByCustomerDate,
  deliveryByCustomerId,
  initialExpandedDetail,
  initialExpandedOrderId,
  orderDate,
  orders,
  products,
  searchTerm,
  selectedCustomerIds,
  vehicles,
}: IncomingOrdersDesktopTableProps) {
  const [expandedOrderId, setExpandedOrderId] = useState(initialExpandedOrderId);
  const [detailByOrderId, setDetailByOrderId] = useState<Record<string, OrderDetailData>>(() =>
    initialExpandedOrderId && initialExpandedDetail
      ? { [initialExpandedOrderId]: initialExpandedDetail }
      : {},
  );
  const [loadingOrderId, setLoadingOrderId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [editingDetail, setEditingDetail] = useState<OrderDetailData | null>(null);
  const [isPending, startTransition] = useTransition();
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [stickyFrame, setStickyFrame] = useState<{ left: number; width: number }>({ left: 0, width: 0 });
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  const stickyScrollRef = useRef<HTMLDivElement | null>(null);
  const stickyScrollInnerRef = useRef<HTMLDivElement | null>(null);

  const visibleOrderIds = useMemo(() => new Set(orders.map((order) => order.id)), [orders]);

  useEffect(() => {
    setExpandedOrderId(initialExpandedOrderId);
  }, [initialExpandedOrderId]);

  useEffect(() => {
    setDetailByOrderId((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([orderId]) => visibleOrderIds.has(orderId)),
      );

      if (initialExpandedOrderId && initialExpandedDetail) {
        next[initialExpandedOrderId] = initialExpandedDetail;
      }

      return next;
    });
  }, [initialExpandedDetail, initialExpandedOrderId, visibleOrderIds]);

  useEffect(() => {
    const main = mainScrollRef.current;
    const sticky = stickyScrollRef.current;
    const stickyInner = stickyScrollInnerRef.current;
    if (!main || !sticky || !stickyInner) return;

    let syncing = false;
    const threshold = 4;

    const syncWidths = () => {
      const rect = main.getBoundingClientRect();
      setStickyFrame({ left: rect.left, width: rect.width });
      stickyInner.style.width = `${main.scrollWidth}px`;
      sticky.scrollLeft = main.scrollLeft;
      const maxScrollLeft = Math.max(0, main.scrollWidth - main.clientWidth);
      setCanScrollLeft(main.scrollLeft > threshold);
      setCanScrollRight(maxScrollLeft - main.scrollLeft > threshold);
    };

    const onMainScroll = () => {
      if (syncing) return;
      syncing = true;
      sticky.scrollLeft = main.scrollLeft;
      syncing = false;
    };

    const onStickyScroll = () => {
      if (syncing) return;
      syncing = true;
      main.scrollLeft = sticky.scrollLeft;
      syncing = false;
    };

    syncWidths();
    main.addEventListener("scroll", onMainScroll, { passive: true });
    sticky.addEventListener("scroll", onStickyScroll, { passive: true });
    window.addEventListener("resize", syncWidths);
    window.addEventListener("scroll", syncWidths, { passive: true });

    return () => {
      main.removeEventListener("scroll", onMainScroll);
      sticky.removeEventListener("scroll", onStickyScroll);
      window.removeEventListener("resize", syncWidths);
      window.removeEventListener("scroll", syncWidths);
    };
  }, [orders.length, expandedOrderId]);

  async function toggleOrder(orderId: string) {
    setDetailError(null);

    if (expandedOrderId === orderId) {
      setExpandedOrderId("");
      return;
    }

    setExpandedOrderId(orderId);
    if (detailByOrderId[orderId]) return;

    setLoadingOrderId(orderId);
    startTransition(async () => {
      try {
        const result = await fetchIncomingOrderDetailAction(orderId);
        if (result.error || !result.detail) {
          setDetailError(result.error ?? "โหลดรายละเอียดออเดอร์ไม่สำเร็จ");
          return;
        }
        const nextDetail = result.detail;
        setDetailByOrderId((current) => ({ ...current, [orderId]: nextDetail }));
      } catch {
        setDetailError("โหลดรายละเอียดออเดอร์ไม่สำเร็จ");
      } finally {
        setLoadingOrderId(null);
      }
    });
  }

  return (
    <div className="rounded-[1.25rem] border border-slate-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.05)] lg:block">
      <div className="lg:min-w-0 xl:min-w-[1150px]">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 xl:px-6 xl:py-4">
          <div>
            <h3 className="text-lg font-bold text-slate-950 xl:text-xl">ตารางรายการคำสั่งซื้อล่าสุด</h3>
            <p className="mt-1 text-sm font-medium text-slate-950 xl:text-base">
              จัดการและติดตามสถานะออเดอร์ในวันที่เลือกจากจุดเดียว
            </p>
            <p className="mt-1 hidden text-xs font-semibold text-slate-500 lg:block xl:hidden">
              ↔ เลื่อนซ้าย-ขวาเพื่อดูข้อมูลเพิ่มเติม
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950 xl:text-base">
            <span className="h-2.5 w-2.5 rounded-full bg-[#003366]" />
            รายการทั้งหมด
          </div>
        </div>

        <div className="relative">
          {canScrollLeft ? (
            <div className="pointer-events-none absolute bottom-0 left-0 top-0 z-10 w-8 bg-gradient-to-r from-white to-transparent" />
          ) : null}
          {canScrollRight ? (
            <div className="pointer-events-none absolute bottom-0 right-0 top-0 z-10 w-8 bg-gradient-to-l from-white to-transparent" />
          ) : null}

          <div
            ref={mainScrollRef}
            data-horizontal-scroll="true"
            className="overflow-x-auto touch-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <table className="min-w-[1180px] border-collapse text-left">
            <thead className="bg-slate-50 text-slate-950">
              <tr className="border-b border-slate-200">
                <th className="w-[20%] px-2 py-2 text-xs font-bold tracking-[0.04em] text-slate-950 xl:px-3 xl:py-2.5 xl:text-sm">ร้านค้า</th>
                <th className="w-[11%] px-2 py-2 text-center text-xs font-bold tracking-[0.04em] text-slate-950 xl:px-3 xl:py-2.5 xl:text-sm">วันที่</th>
                <th className="w-[9%] px-2 py-2 text-center text-xs font-bold tracking-[0.04em] text-slate-950 xl:px-3 xl:py-2.5 xl:text-sm">สินค้า</th>
                <th className="w-[11%] whitespace-nowrap px-2 py-2 text-center text-xs font-bold tracking-[0.04em] text-slate-950 xl:px-3 xl:py-2.5 xl:text-sm">ยอดรวม</th>
                <th className="w-[13%] px-2 py-2 text-left text-xs font-bold tracking-[0.04em] text-slate-950 xl:px-3 xl:py-2.5 xl:text-sm">เลขจัดส่ง</th>
                <th className="w-[18%] px-2 py-2 text-left text-xs font-bold tracking-[0.04em] text-slate-950 xl:px-3 xl:py-2.5 xl:text-sm">การจัดส่ง</th>
                <th className="w-[18%] px-2 py-2 text-center text-xs font-bold tracking-[0.04em] text-slate-950 xl:px-3 xl:py-2.5 xl:text-sm">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {orders.map((order, index) => {
                const orderKey = `${order.customerId}_${order.orderDate}`;
                const isExpanded = expandedOrderId === order.id && visibleOrderIds.has(order.id);
                const detail = detailByOrderId[order.id] ?? null;
                const deliveryNumbers = deliveryByCustomerId[orderKey];
                const isBilled = billedByCustomerDate[orderKey] ?? false;
                const isLoading = loadingOrderId === order.id || (isPending && isExpanded && !detail);

                return (
                  <IncomingOrderRow
                    key={order.id}
                    order={order}
                    index={index}
                    orders={orders}
                    isExpanded={isExpanded}
                    isLoading={isLoading}
                    detail={detail}
                    detailError={detailError}
                    deliveryNumbers={deliveryNumbers}
                    isBilled={isBilled}
                    vehicles={vehicles}
                    orderDate={orderDate}
                    searchTerm={searchTerm}
                    selectedCustomerIds={selectedCustomerIds}
                    toggleOrder={toggleOrder}
                    onEdit={setEditingDetail}
                  />
                );
              })}
            </tbody>
            </table>
          </div>
        </div>

        <div
          className="fixed bottom-[max(0.35rem,env(safe-area-inset-bottom))] z-50 xl:hidden"
          style={{ left: `${stickyFrame.left}px`, width: `${stickyFrame.width}px` }}
        >
          <div className="w-full px-2 py-1">
          <div
            ref={stickyScrollRef}
            aria-label="แถบเลื่อนแนวนอน"
            className="overflow-x-auto touch-pan-x [scrollbar-color:#003366_#cbd5e1] [scrollbar-width:auto] [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#003366] [&::-webkit-scrollbar-thumb:hover]:bg-[#002952]"
          >
            <div ref={stickyScrollInnerRef} className="h-1 min-w-[1180px]" />
          </div>
          </div>
        </div>
      </div>
      {editingDetail ? (
        <IncomingOrderModal
          allOrders={orders}
          date={orderDate}
          detail={editingDetail}
          expandedId={editingDetail.id}
          initialEditMode
          onAfterClose={() => setEditingDetail(null)}
          products={products}
          routeManaged={false}
          searchTerm={searchTerm}
        />
      ) : null}
    </div>
  );
});
