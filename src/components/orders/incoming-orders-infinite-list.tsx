"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { loadMoreIncomingOrdersAction } from "@/app/orders/incoming/load-more-actions";
import { IncomingOrdersDesktopTable } from "@/components/orders/incoming-orders-desktop-table";
import { IncomingOrdersMobileList } from "@/components/orders/incoming-orders-mobile-list";
import type { IncomingOrderListItem, OrderDetailData } from "@/lib/orders/detail";
import type { OrderProductOption, OrderVehicleOption } from "@/lib/orders/manage";

type IncomingOrdersInfiniteListProps = {
  billedByCustomerDate: Record<string, boolean>;
  deliveryByCustomerId: Record<string, string[]>;
  endDate: string;
  hasMore: boolean;
  initialExpandedDetail: OrderDetailData | null;
  initialExpandedOrderId: string;
  orderDate: string;
  orders: IncomingOrderListItem[];
  products: OrderProductOption[];
  searchTerm: string;
  selectedCustomerIds: string[];
  vehicles: OrderVehicleOption[];
};

type IncomingOrderUpdatedEventDetail = {
  id: string;
  notes: string | null;
  productCount: number;
  totalAmount: number;
};

const PAGE_SIZE = 30;
const LOADING_MORE_TEXT = "\u0e01\u0e33\u0e25\u0e31\u0e07\u0e42\u0e2b\u0e25\u0e14\u0e2d\u0e2d\u0e40\u0e14\u0e2d\u0e23\u0e4c\u0e40\u0e1e\u0e34\u0e48\u0e21...";

function formatCurrency(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function IncomingOrdersInfiniteList({
  billedByCustomerDate,
  deliveryByCustomerId,
  endDate,
  hasMore,
  initialExpandedDetail,
  initialExpandedOrderId,
  orderDate,
  orders,
  products,
  searchTerm,
  selectedCustomerIds,
  vehicles,
}: IncomingOrdersInfiniteListProps) {
  const [loadedOrders, setLoadedOrders] = useState(orders);
  const [loadedDeliveryByCustomerId, setLoadedDeliveryByCustomerId] = useState(deliveryByCustomerId);
  const [loadedBilledByCustomerDate, setLoadedBilledByCustomerDate] = useState(billedByCustomerDate);
  const [canLoadMore, setCanLoadMore] = useState(hasMore);
  const [loadMorePending, startLoadMoreTransition] = useTransition();
  const sensorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleIncomingOrderUpdated(event: Event) {
      const updatedOrder = (event as CustomEvent<IncomingOrderUpdatedEventDetail>).detail;
      if (!updatedOrder?.id) return;

      setLoadedOrders((current) =>
        current.map((order) =>
          order.id === updatedOrder.id
            ? {
                ...order,
                notes: updatedOrder.notes,
                productCount: updatedOrder.productCount,
                totalAmount: updatedOrder.totalAmount,
              }
            : order,
        ),
      );
    }

    window.addEventListener("incoming-order-updated", handleIncomingOrderUpdated);
    return () => window.removeEventListener("incoming-order-updated", handleIncomingOrderUpdated);
  }, []);

  useEffect(() => {
    const sensor = sensorRef.current;
    if (!sensor || !canLoadMore || loadMorePending) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || loadMorePending) return;
        startLoadMoreTransition(async () => {
          const result = await loadMoreIncomingOrdersAction({
            customerIds: selectedCustomerIds,
            endDate,
            limit: PAGE_SIZE,
            offset: loadedOrders.length,
            orderDate,
            searchTerm,
          });

          setLoadedOrders((current) => {
            const seen = new Set(current.map((order) => order.id));
            const nextOrders = result.orders.filter((order) => !seen.has(order.id));
            return [...current, ...nextOrders];
          });
          setLoadedDeliveryByCustomerId((current) => ({
            ...current,
            ...result.deliveryByCustomerDate,
          }));
          setLoadedBilledByCustomerDate((current) => ({
            ...current,
            ...result.billedByCustomerDate,
          }));
          setCanLoadMore(result.hasMore);
        });
      },
      { rootMargin: "500px" },
    );

    observer.observe(sensor);
    return () => observer.disconnect();
  }, [
    canLoadMore,
    endDate,
    loadMorePending,
    loadedOrders.length,
    orderDate,
    searchTerm,
    selectedCustomerIds,
  ]);

  const mobileOrders = loadedOrders.map((order) => {
    const deliveryNumbers = loadedDeliveryByCustomerId[`${order.customerId}_${order.orderDate}`];
    const isBilled = loadedBilledByCustomerDate[`${order.customerId}_${order.orderDate}`] ?? false;

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      customerName: order.customerName,
      customerCode: order.customerCode,
      channelLabel: order.channelLabel,
      orderDate: order.orderDate,
      notes: order.notes,
      productCount: order.productCount,
      totalAmount: order.totalAmount,
      totalAmountText: `${formatCurrency(order.totalAmount)} \u0e1a\u0e32\u0e17`,
      vehicleId: order.vehicleId,
      vehicleName: order.vehicleName,
      deliveryNumbers,
      isBilled,
    };
  });

  return (
    <>
      <div className="relative left-1/2 w-screen -translate-x-1/2 lg:hidden">
        <IncomingOrdersMobileList
          orders={mobileOrders}
          vehicles={vehicles}
          currentListDate={orderDate}
          currentEndDate={endDate}
          searchTerm={searchTerm}
          selectedCustomerIds={selectedCustomerIds}
        />
      </div>

      <div className="hidden overflow-x-auto no-scrollbar lg:block">
        <div className="lg:min-w-0 xl:min-w-[1100px]">
          <IncomingOrdersDesktopTable
            billedByCustomerDate={loadedBilledByCustomerDate}
            deliveryByCustomerId={loadedDeliveryByCustomerId}
            initialExpandedDetail={initialExpandedDetail}
            initialExpandedOrderId={initialExpandedOrderId}
            orderDate={orderDate}
            orders={loadedOrders}
            products={products}
            searchTerm={searchTerm}
            selectedCustomerIds={selectedCustomerIds}
            vehicles={vehicles}
          />
        </div>
      </div>

      {canLoadMore ? (
        <div ref={sensorRef} className="flex items-center justify-center gap-2 py-6 text-sm font-semibold text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-[#003366]" strokeWidth={2.4} />
          <span>{LOADING_MORE_TEXT}</span>
        </div>
      ) : null}
    </>
  );
}
