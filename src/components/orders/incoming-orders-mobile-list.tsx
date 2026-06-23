"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { IncomingOrderOpenCard } from "./incoming-order-open-card";
import type { OrderVehicleOption } from "@/lib/orders/manage";

type MobileListOrder = {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerCode: string;
  channelLabel: string;
  orderDate: string;
  notes: string | null;
  productCount: number;
  totalAmount: number;
  totalAmountText: string;
  vehicleId: string | null;
  vehicleName: string | null;
  deliveryNumbers: string[] | undefined;
  isBilled: boolean;
};

function formatDisplayDate(value: string) {
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${parseInt(y, 10) + 543}`;
}

type IncomingOrdersMobileListProps = {
  orders: MobileListOrder[];
  vehicles: OrderVehicleOption[];
  currentListDate: string;
  currentEndDate?: string;
  searchTerm?: string;
  selectedCustomerIds?: string[];
};

export function IncomingOrdersMobileList({
  orders,
  vehicles,
  currentListDate,
  currentEndDate,
  searchTerm,
  selectedCustomerIds = [],
}: IncomingOrdersMobileListProps) {
  const [visibleCount, setVisibleCount] = useState(15);
  const [prevOrders, setPrevOrders] = useState(orders);
  const sensorRef = useRef<HTMLDivElement | null>(null);

  // Reset pagination count when orders list changes (e.g. new search or date filter)
  if (orders !== prevOrders) {
    setPrevOrders(orders);
    setVisibleCount(15);
  }

  useEffect(() => {
    const sensor = sensorRef.current;
    if (!sensor || visibleCount >= orders.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + 15, orders.length));
        }
      },
      { rootMargin: "200px" } // Pre-load when within 200px of bottom
    );

    observer.observe(sensor);
    return () => {
      observer.unobserve(sensor);
    };
  }, [orders.length, visibleCount]);

  const visibleOrders = orders.slice(0, visibleCount);
  const hasMore = visibleCount < orders.length;

  function buildDetailHref(orderId: string) {
    const params = new URLSearchParams();
    params.set("expanded", orderId);

    if (searchTerm?.trim()) {
      params.set("q", searchTerm.trim());
    }
    if (currentListDate) {
      params.set("date", currentListDate);
    }
    if (currentEndDate && currentEndDate !== currentListDate) {
      params.set("endDate", currentEndDate);
    }
    if (selectedCustomerIds.length > 0) {
      params.set("customers", selectedCustomerIds.join(","));
    }

    return `/orders/incoming?${params.toString()}`;
  }

  return (
    <div className="grid grid-cols-1 divide-y divide-slate-200 border-t border-slate-200 sm:grid-cols-2 sm:divide-y-0 sm:gap-px sm:bg-slate-200">
      {visibleOrders.map((order, index) => {
        const showDivider = index === 0 || order.orderDate !== visibleOrders[index - 1].orderDate;

        return (
          <Fragment key={order.id}>
            {showDivider ? (
              <div className="col-span-full flex items-center gap-3 bg-slate-50/80 px-4 py-3">
                <div className="h-[2px] flex-1 bg-slate-200" />
                <div className="shrink-0 rounded-2xl border border-slate-200 bg-white px-4 py-1.5 shadow-sm">
                  <span className="text-[13px] font-black uppercase tracking-wider text-[#003366]">
                    {formatDisplayDate(order.orderDate)}
                  </span>
                </div>
                <div className="h-[2px] flex-1 bg-slate-200" />
              </div>
            ) : null}

            <IncomingOrderOpenCard
              href={buildDetailHref(order.id)}
              orderId={order.id}
              orderNumber={order.orderNumber}
              customerId={order.customerId}
              customerName={order.customerName}
              customerCode={order.customerCode}
              channelLabel={order.channelLabel}
              currentListDate={currentListDate}
              deliveryNumbers={order.deliveryNumbers}
              displayDate={formatDisplayDate(order.orderDate)}
              isBilled={order.isBilled}
              notes={order.notes}
              orderDate={order.orderDate}
              productCount={order.productCount}
              searchTerm={searchTerm}
              selectedCustomerIds={selectedCustomerIds}
              totalAmountText={order.totalAmountText}
              vehicleId={order.vehicleId}
              vehicleName={order.vehicleName}
              vehicles={vehicles}
            />
          </Fragment>
        );
      })}

      {/* Sensor for Infinite Scrolling */}
      {hasMore && (
        <div ref={sensorRef} className="col-span-full flex items-center justify-center py-6 bg-white gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-[#003366]" strokeWidth={2.4} />
          <span className="text-sm font-semibold text-slate-500">กำลังโหลดออเดอร์เพิ่ม...</span>
        </div>
      )}
    </div>
  );
}
