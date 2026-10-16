"use client";

import Link from "next/link";
import { useState } from "react";
import { IdCard, PencilLine, Store, Trash2, Truck, UserRound, UsersRound, X } from "lucide-react";
import { deleteVehicleAction } from "@/app/(workspace)/settings/vehicles/actions";
import type { SettingsVehicle } from "@/lib/settings/admin";
import {
  SettingsEmptyState,
  SettingsPanel,
  SettingsPanelBody,
} from "@/components/settings/settings-ui";

type VehicleListPanelProps = {
  vehicles: SettingsVehicle[];
};

function CustomerCountButton({
  onClick,
  vehicle,
}: {
  onClick: () => void;
  vehicle: SettingsVehicle;
}) {
  const count = vehicle.customers.length;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={count === 0}
      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-[#003366] shadow-sm transition hover:border-[#003366]/35 hover:bg-[#003366]/5 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-400 disabled:shadow-none"
    >
      <span>{count.toLocaleString("th-TH")} ร้านค้า</span>
      <UsersRound className="h-3.5 w-3.5" strokeWidth={2.4} />
    </button>
  );
}

function ActionButtons({ vehicleId }: { vehicleId: string }) {
  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/settings/vehicles?edit=${vehicleId}`}
        className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-[#003366]/30 hover:text-[#003366]"
      >
        <PencilLine className="h-3.5 w-3.5" strokeWidth={2.2} />
        แก้ไข
      </Link>

      <form action={deleteVehicleAction.bind(null, vehicleId)}>
        <button
          type="submit"
          className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
          ลบ
        </button>
      </form>
    </div>
  );
}

export function VehicleListPanel({ vehicles }: VehicleListPanelProps) {
  const [selectedVehicle, setSelectedVehicle] = useState<SettingsVehicle | null>(null);

  return (
    <>
      <SettingsPanel>
        <div className="border-b border-slate-100 px-6 py-5">
          <h2 className="text-xl font-semibold text-slate-950">รายการรถ</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            ใช้เก็บชื่อรถที่ระบบสามารถเลือกเป็นรถประจำร้านได้ และถ้ามีจะใส่ทะเบียนหรือชื่อคนขับไว้ได้ด้วย
          </p>
        </div>

        <SettingsPanelBody className="p-0">
          {vehicles.length === 0 ? (
            <div className="p-6">
              <SettingsEmptyState className="py-14">
                ยังไม่มีรถในระบบ กดปุ่ม “เพิ่มรถ” เพื่อสร้างรายการแรก
              </SettingsEmptyState>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:hidden">
                {vehicles.map((vehicle) => (
                  <article
                    key={vehicle.id}
                    className="w-full border-x-0 border-y border-slate-200 bg-white px-4 py-4 shadow-none first:border-t-0 last:border-b-0"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100">
                        <Truck className="h-5 w-5 text-[#003366]" strokeWidth={2.2} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-base font-semibold text-slate-950">{vehicle.name}</p>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                              vehicle.isActive
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {vehicle.isActive ? "พร้อมใช้งาน" : "ปิดใช้งาน"}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {vehicle.licensePlate ? (
                            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
                              <IdCard className="h-3.5 w-3.5 text-[#003366]" strokeWidth={2.2} />
                              {vehicle.licensePlate}
                            </div>
                          ) : null}

                          {vehicle.driverName ? (
                            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
                              <UserRound className="h-3.5 w-3.5 text-[#003366]" strokeWidth={2.2} />
                              {vehicle.driverName}
                            </div>
                          ) : null}

                          <CustomerCountButton
                            vehicle={vehicle}
                            onClick={() => setSelectedVehicle(vehicle)}
                          />
                        </div>

                        <div className="mt-4">
                          <ActionButtons vehicleId={vehicle.id} />
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="hidden overflow-x-auto sm:block">
                <table className="min-w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        ชื่อรถ
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        ทะเบียนรถ
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        ชื่อคนขับ
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        จำนวนร้านค้า
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        สถานะ
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        จัดการ
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {vehicles.map((vehicle) => (
                      <tr key={vehicle.id}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100">
                              <Truck className="h-5 w-5 text-[#003366]" strokeWidth={2.2} />
                            </div>
                            <p className="text-sm font-semibold text-slate-950">{vehicle.name}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {vehicle.licensePlate || <span className="text-slate-400">-</span>}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {vehicle.driverName || <span className="text-slate-400">-</span>}
                        </td>
                        <td className="px-6 py-4">
                          <CustomerCountButton
                            vehicle={vehicle}
                            onClick={() => setSelectedVehicle(vehicle)}
                          />
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                              vehicle.isActive
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {vehicle.isActive ? "พร้อมใช้งาน" : "ปิดใช้งาน"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <ActionButtons vehicleId={vehicle.id} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </SettingsPanelBody>
      </SettingsPanel>

      {selectedVehicle ? (
        <div className="fixed inset-0 z-[220] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-t-[32px] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.25)] sm:rounded-[32px]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#003366]/10 text-[#003366]">
                  <Truck className="h-5 w-5" strokeWidth={2.4} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                    รายชื่อร้านค้า
                  </p>
                  <h3 className="mt-1 truncate text-xl font-black text-slate-950">
                    {selectedVehicle.name}
                  </h3>
                  <p className="mt-1 text-sm font-bold text-[#003366]">
                    {selectedVehicle.customers.length.toLocaleString("th-TH")} ร้านค้า
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedVehicle(null)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900"
                aria-label="ปิด"
              >
                <X className="h-5 w-5" strokeWidth={2.5} />
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-5 sm:px-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {selectedVehicle.customers.map((customer) => (
                  <div
                    key={customer.id}
                    className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_10px_28px_rgba(15,23,42,0.04)]"
                  >
                    <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-[#003366]">
                      <Store className="h-4.5 w-4.5" strokeWidth={2.3} />
                    </div>
                    <p className="text-xs font-black text-[#003366]">{customer.code}</p>
                    <p className="mt-1 line-clamp-2 text-sm font-black leading-5 text-slate-950">
                      {customer.name}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
