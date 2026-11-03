"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Truck } from "lucide-react";
import { updateCustomerVehicleFromIncomingOrderAction } from "@/app/(workspace)/orders/incoming/actions";
import type { OrderVehicleOption } from "@/lib/orders/manage";

type Props = {
  customerId: string;
  currentVehicleId: string | null;
  currentVehicleName: string | null;
  vehicles: OrderVehicleOption[];
  variant?: "table" | "card";
  orderDate?: string;
};

export function IncomingOrderVehicleSelect({
  customerId,
  currentVehicleId,
  currentVehicleName,
  vehicles,
  variant = "table",
  orderDate,
}: Props) {
  const router = useRouter();
  const selectId = useId();
  const [selectedVehicleId, setSelectedVehicleId] = useState(currentVehicleId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (currentVehicleId) {
    const rawName = currentVehicleName ?? "รถส่งของ";
    const match = rawName.match(/^(.*?)\s*\((.*)\)\s*$/);
    const vehicleMainName = match ? match[1].trim() : rawName;
    const vehicleDetail = match ? match[2] : "";

    if (variant === "card") {
      return (
        <span className="block min-w-0">
          <span className="block truncate pt-0.5 text-base font-bold leading-6 text-slate-950">
            {vehicleMainName}
          </span>
          {vehicleDetail ? (
            <span className="mt-0.5 block truncate text-xs font-semibold leading-tight text-slate-500">
              {vehicleDetail}
            </span>
          ) : null}
        </span>
      );
    }

    return (
      <span
        className="block min-w-0 max-w-full truncate text-sm font-bold text-slate-950 xl:text-base"
        title={currentVehicleName ?? "รถส่งของ"}
      >
        {currentVehicleName ?? "รถส่งของ"}
      </span>
    );
  }

  if (vehicles.length === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
        <AlertCircle className="h-3.5 w-3.5" strokeWidth={2.2} />
        ยังไม่มีรถ
      </span>
    );
  }

  function handleChange(nextVehicleId: string) {
    setSelectedVehicleId(nextVehicleId);
    setError(null);
    if (!nextVehicleId) {
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.set("customerId", customerId);
      fd.set("vehicleId", nextVehicleId);
      if (orderDate) fd.set("orderDate", orderDate);
      const result = await updateCustomerVehicleFromIncomingOrderAction(fd);
      if ("error" in result) {
        setError(result.error);
        setSelectedVehicleId("");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className={variant === "card" ? "min-w-[9.5rem]" : "min-w-[10rem]"}>
      <label className="sr-only" htmlFor={selectId}>
        เลือกรถส่งของ
      </label>
      <div className="relative">
        <Truck
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          strokeWidth={2}
        />
        <select
          id={selectId}
          value={selectedVehicleId}
          onChange={(event) => handleChange(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          disabled={pending}
          className={[
            "w-full appearance-none rounded-lg border bg-white py-2 pl-9 pr-8 text-sm font-bold outline-none transition",
            "focus:border-[#003366] focus:ring-1 focus:ring-[#003366]/10 disabled:opacity-60",
            selectedVehicleId
              ? "border-slate-200 text-slate-700"
              : "border-slate-200 text-slate-400",
          ].join(" ")}
        >
          <option value="">เลือกรถ</option>
          {vehicles.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.name}
            </option>
          ))}
        </select>
        {pending ? (
          <Loader2
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#003366]"
            strokeWidth={2}
          />
        ) : (
          <span
            className="pointer-events-none absolute right-3 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rotate-45 border-b border-r border-slate-400"
            aria-hidden="true"
          />
        )}
      </div>
      {error ? <p className="mt-1 text-xs font-semibold text-rose-600">{error}</p> : null}
    </div>
  );
}
