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
};

export function StoreVehicleCell({
  customerId,
  customerName,
  date,
  defaultVehicleId,
  defaultVehicleName,
  vehicles,
}: Props) {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(defaultVehicleId);
  const selectedVehicleName = selectedVehicleId
    ? (vehicles.find((v) => v.id === selectedVehicleId)?.name ?? defaultVehicleName)
    : null;

  return (
    <>
      {/* Vehicle column cell */}
      <td className="hidden px-4 py-4 lg:table-cell">
        {defaultVehicleId ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <Truck className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={2.2} />
            {defaultVehicleName}
          </span>
        ) : vehicles.length > 0 ? (
          <select
            value={selectedVehicleId ?? ""}
            onChange={(e) => setSelectedVehicleId(e.target.value || null)}
            onClick={(e) => e.stopPropagation()}
            className={[
              "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
              selectedVehicleId
                ? "border-slate-200 text-slate-700"
                : "border-orange-300 bg-orange-50 text-orange-700",
            ].join(" ")}
          >
            <option value="">เลือกรถ...</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs text-slate-400">ยังไม่ผูก</span>
        )}
      </td>

      {/* Delivery button cell — uses selected vehicle */}
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
