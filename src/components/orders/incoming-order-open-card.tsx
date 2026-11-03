"use client";

import { memo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, ChevronRight, Loader2, Package2, Truck } from "lucide-react";
import { IncomingOrderDateButton } from "@/components/orders/incoming-order-date-button";
import { IncomingOrderVehicleSelect } from "@/components/orders/incoming-order-vehicle-select";
import { OrderDeliveryActionButton } from "@/components/orders/order-delivery-action-button";
import type { OrderVehicleOption } from "@/lib/orders/manage";

type IncomingOrderOpenCardProps = {
  href: string;
  orderId: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerCode: string;
  channelLabel: string;
  displayDate: string;
  notes: string | null;
  totalAmountText: string;
  vehicleId: string | null;
  vehicleName: string | null;
  vehicles: OrderVehicleOption[];
  deliveryNumbers?: string[];
  currentListDate: string;
  orderDate: string;
  productCount: number;
  searchTerm?: string;
  selectedCustomerIds?: string[];
  isBilled: boolean;
};

function InfoBlock({
  label,
  value,
  icon,
  trailing,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-950">{label}</p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-[15px] font-semibold text-slate-950">
          <span className="shrink-0 text-slate-400">{icon}</span>
          <span className="truncate">{value}</span>
        </div>
        {trailing}
      </div>
    </div>
  );
}

export const IncomingOrderOpenCard = memo(function IncomingOrderOpenCard({
  href,
  orderId,
  orderNumber,
  customerId,
  customerName,
  customerCode,
  channelLabel,
  displayDate,
  notes,
  totalAmountText,
  vehicleId,
  vehicleName,
  vehicles,
  deliveryNumbers,
  currentListDate,
  orderDate,
  productCount,
  searchTerm,
  selectedCustomerIds = [],
  isBilled,
}: IncomingOrderOpenCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const hasDelivery = Boolean(deliveryNumbers && deliveryNumbers.length > 0);
  const fallbackDeliveryNumber = orderNumber.startsWith("DN") ? orderNumber : null;
  const displayDeliveryNumbers =
    hasDelivery && deliveryNumbers && deliveryNumbers.length > 0
      ? deliveryNumbers
      : fallbackDeliveryNumber
        ? [fallbackDeliveryNumber]
        : [];
  const hasDisplayDelivery = displayDeliveryNumbers.length > 0;

  function openDetail() {
    if (isPending) return;
    startTransition(() => {
      router.push(href, { scroll: false });
    });
  }

  return (
    <article className="border-b border-slate-400 bg-white px-5 py-4 shadow-[0_10px_26px_rgba(15,23,42,0.1)] last:border-b-0">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[1.18rem] font-bold leading-tight text-slate-950">
            <span translate="no">{customerCode}</span> - {customerName}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
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

        <div className="flex shrink-0 items-center gap-2">
          <IncomingOrderDateButton
            currentListDate={currentListDate}
            orderDate={orderDate}
            orderId={orderId}
            orderNumber={orderNumber}
            searchTerm={searchTerm}
            selectedCustomerIds={selectedCustomerIds}
          />
          {hasDelivery ? (
            <OrderDeliveryActionButton
              customerId={customerId}
              customerName={customerName}
              date={orderDate}
              iconOnly
              label="ดูใบยืนยัน"
              orderId={orderId}
            />
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
        <InfoBlock
          label="วันที่ออเดอร์"
          icon={<CalendarDays className="h-4 w-4" strokeWidth={2.2} />}
          value={displayDate}
        />
        <div className="min-w-0 border-l border-slate-300 pl-4">
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-950">ช่องทาง</p>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="inline-flex min-h-8 items-center py-1 text-sm font-semibold text-slate-950">
              {channelLabel}
            </span>
          </div>
        </div>

        <InfoBlock
          label="สินค้า"
          icon={<Package2 className="h-4 w-4" strokeWidth={2.2} />}
          value={`${productCount.toLocaleString("th-TH")} รายการ`}
        />
        <div className="min-w-0 border-l border-slate-300 pl-4">
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-950">ยอดรวม</p>
          <p className="mt-1.5 text-[1.05rem] font-bold leading-none text-slate-950">
            {totalAmountText}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-200 pt-4">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-950">การจัดส่ง</p>
          <div className="mt-2 flex items-center gap-2">
            <Truck className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2.2} />
            <div className="min-w-0 flex-1">
              <IncomingOrderVehicleSelect
                customerId={customerId}
                currentVehicleId={vehicleId}
                currentVehicleName={vehicleName}
                vehicles={vehicles}
                variant="card"
                orderDate={orderDate}
              />
            </div>
          </div>
        </div>

        <div className="min-w-0 border-l border-slate-300 pl-4">
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-950">เลขจัดส่ง</p>
          <div className="mt-1.5 min-w-0">
            {hasDisplayDelivery ? (
              <div className="flex flex-col gap-0.5">
                {displayDeliveryNumbers.map((num) => (
                  <span
                    key={num}
                    className="truncate py-0.5 font-mono text-[1.05rem] font-bold leading-none text-emerald-700"
                  >
                    {num}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-[1.05rem] font-medium text-slate-400">-</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-slate-200 pt-3">
        <p className="text-sm font-semibold leading-6 text-slate-700">
          <span className="mr-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-950">
            หมายเหตุ:
          </span>
          {notes?.trim() || "-"}
        </p>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={openDetail}
          disabled={isPending}
          className="inline-flex min-h-11 flex-1 items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 active:scale-[0.99] disabled:opacity-60"
        >
          <span>{isPending ? "กำลังเปิดรายละเอียด..." : "เปิดรายละเอียดออเดอร์"}</span>
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin text-[#003366]" strokeWidth={2.5} />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400" strokeWidth={2.6} />
          )}
        </button>
      </div>
    </article>
  );
});
