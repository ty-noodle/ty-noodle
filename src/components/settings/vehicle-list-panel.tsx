import Link from "next/link";
import { IdCard, PencilLine, Trash2, Truck, UserRound } from "lucide-react";
import { deleteVehicleAction } from "@/app/settings/vehicles/actions";
import type { SettingsVehicle } from "@/lib/settings/admin";
import {
  SettingsEmptyState,
  SettingsPanel,
  SettingsPanelBody,
} from "@/components/settings/settings-ui";

type VehicleListPanelProps = {
  vehicles: SettingsVehicle[];
};

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
  return (
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

                      {vehicle.licensePlate ? (
                        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
                          <IdCard className="h-3.5 w-3.5 text-[#003366]" strokeWidth={2.2} />
                          {vehicle.licensePlate}
                        </div>
                      ) : null}

                      {vehicle.driverName ? (
                        <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
                          <UserRound className="h-3.5 w-3.5 text-[#003366]" strokeWidth={2.2} />
                          {vehicle.driverName}
                        </div>
                      ) : null}

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
  );
}
