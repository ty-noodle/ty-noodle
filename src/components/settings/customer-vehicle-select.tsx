"use client";

import { useMemo, useState, useTransition } from "react";
import { Truck } from "lucide-react";
import { updateCustomerDefaultVehicleAction } from "@/app/settings/customers/actions";
import type { SettingsVehicle } from "@/lib/settings/admin";

type CustomerVehicleSelectProps = {
  className?: string;
  customerId: string;
  currentVehicleId: string | null;
  currentVehicleName: string | null;
  vehicles: SettingsVehicle[];
};

export function CustomerVehicleSelect({
  className,
  customerId,
  currentVehicleId,
  currentVehicleName,
  vehicles,
}: CustomerVehicleSelectProps) {
  const [selectedVehicleId, setSelectedVehicleId] = useState(currentVehicleId ?? "");
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const options = useMemo(() => {
    const activeVehicles = vehicles.filter((vehicle) => vehicle.isActive);
    if (!currentVehicleId || activeVehicles.some((vehicle) => vehicle.id === currentVehicleId)) {
      return activeVehicles;
    }

    return [
      ...activeVehicles,
      {
        driverName: null,
        id: currentVehicleId,
        isActive: false,
        licensePlate: null,
        name: currentVehicleName ?? "รถเดิมที่ปิดใช้งาน",
        sortOrder: Number.MAX_SAFE_INTEGER,
      },
    ];
  }, [currentVehicleId, currentVehicleName, vehicles]);

  function handleChange(nextVehicleId: string) {
    setSelectedVehicleId(nextVehicleId);
    setErrorMessage(null);

    startTransition(async () => {
      const result = await updateCustomerDefaultVehicleAction(customerId, nextVehicleId || null);

      if (result.error) {
        setErrorMessage(result.error);
        setSelectedVehicleId(currentVehicleId ?? "");
      }
    });
  }

  return (
    <div className={className}>
      <div className="relative">
        <Truck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#003366]" strokeWidth={2.1} />
        <select
          value={selectedVehicleId}
          disabled={isPending}
          onChange={(event) => handleChange(event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-8 text-sm font-medium text-slate-700 outline-none transition focus:border-[#003366]/30 focus:ring-2 focus:ring-[#003366]/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          aria-label="เลือกรถประจำร้าน"
        >
          <option value="">ยังไม่กำหนดรถประจำร้าน</option>
          {options.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.name}
            </option>
          ))}
        </select>
      </div>
      {errorMessage ? (
        <p className="mt-1 text-xs font-medium text-red-600">{errorMessage}</p>
      ) : null}
    </div>
  );
}
