"use client";

import { useState } from "react";
import { Truck } from "lucide-react";
import { StoreDeliveryButton } from "./pending-orders-section";

type Props = {
  customerId: string;
  customerName: string;
  date: string;
  defaultVehicleId: string | null;
  defaultVehicleName: string | null;
  vehicles: { id: string; name: string }[];
  mode?: "table" | "stacked";
};

export function StoreVehicleCell({
  customerId,
  customerName,
  date,
  defaultVehicleId,
  defaultVehicleName,
  vehicles,
  mode = "table",
}: Props) {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(defaultVehicleId);
  const selectedVehicleName = selectedVehicleId
    ? (vehicles.find((vehicle) => vehicle.id === selectedVehicleId)?.name ?? defaultVehicleName)
    : null;

  const vehicleContent = defaultVehicleId ? (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
      <Truck className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={2.2} />
      {defaultVehicleName}
    </span>
  ) : vehicles.length > 0 ? (
    <select
      value={selectedVehicleId ?? ""}
      onChange={(event) => setSelectedVehicleId(event.target.value || null)}
      onClick={(event) => event.stopPropagation()}
      className={[
        "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
        selectedVehicleId
          ? "border-slate-200 text-slate-700"
          : "border-orange-300 bg-orange-50 text-orange-700",
      ].join(" ")}
    >
      <option value="">เลือกรถ...</option>
      {vehicles.map((vehicle) => (
        <option key={vehicle.id} value={vehicle.id}>
          {vehicle.name}
        </option>
      ))}
    </select>
  ) : (
    <span className="text-xs text-slate-400">ยังไม่ได้ผูกรถ</span>
  );

  if (mode === "stacked") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            รถจัดส่ง
          </span>
          <div className="shrink-0">{vehicleContent}</div>
        </div>

        <StoreDeliveryButton
          customerId={customerId}
          customerName={customerName}
          date={date}
          defaultVehicleId={selectedVehicleId}
          defaultVehicleName={selectedVehicleName}
          vehicles={vehicles}
        />
      </div>
    );
  }

  return (
    <>
      <td className="hidden px-4 py-4 lg:table-cell">
        {vehicleContent}
      </td>

      <td className="px-4 py-4 print:hidden">
        <StoreDeliveryButton
          customerId={customerId}
          customerName={customerName}
          date={date}
          defaultVehicleId={selectedVehicleId}
          defaultVehicleName={selectedVehicleName}
          vehicles={vehicles}
        />
      </td>
    </>
  );
}
