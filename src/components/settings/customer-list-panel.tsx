import { ListTree, Store, Truck } from "lucide-react";
import type { SettingsCustomer } from "@/lib/settings/admin";
import {
  SettingsEmptyState,
  SettingsPanel,
  SettingsPanelBody,
} from "@/components/settings/settings-ui";
import { CustomerDeleteButton } from "@/components/settings/customer-delete-button";

type CustomerListPanelProps = {
  customers: SettingsCustomer[];
};

export function CustomerListPanel({ customers }: CustomerListPanelProps) {
  return (
    <SettingsPanel>
      <div className="border-b border-slate-100 px-5 py-4 md:px-6 md:py-5">
        <div className="flex items-center gap-2">
          <ListTree className="h-5 w-5 text-[#003366]" strokeWidth={2.2} />
          <h2 className="text-xl font-bold text-slate-950">รายการร้านค้า</h2>
          {customers.length > 0 && (
            <span className="ml-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-sm font-semibold tabular-nums text-slate-500">
              {customers.length}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          ร้านค้าที่บันทึกแล้วจะแสดงในรายการนี้ทันที พร้อมรถประจำร้านหากมีการกำหนดไว้
        </p>
      </div>

      <SettingsPanelBody className="p-0">
        {customers.length === 0 ? (
          <div className="p-6">
            <SettingsEmptyState className="py-14">
              ยังไม่มีร้านค้าในระบบ กดปุ่ม &quot;เพิ่มร้านค้า&quot; เพื่อสร้างรายการแรก
            </SettingsEmptyState>
          </div>
        ) : (
          <>
            {/* ── Mobile: card list ── */}
            <div className="divide-y divide-slate-100 sm:hidden">
              {customers.map((customer) => (
                <div key={customer.id} className="flex items-start gap-4 px-4 py-5">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#003366]/8">
                    <Store className="h-6 w-6 text-[#003366]" strokeWidth={2.2} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <p className="text-lg font-bold leading-snug text-slate-950">{customer.name}</p>
                      <p className="font-mono text-sm text-slate-400">{customer.code}</p>
                    </div>

                    {customer.address && (
                      <p className="mt-1.5 text-sm leading-6 text-slate-500">{customer.address}</p>
                    )}

                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-sky-50 px-3 py-1 text-sm font-medium text-sky-700">
                        ผูกราคา {customer.pricingCount} รายการ
                      </span>
                      {customer.defaultVehicleName && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
                          <Truck className="h-3.5 w-3.5 text-[#003366]" strokeWidth={2.2} />
                          {customer.defaultVehicleName}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 pt-1">
                    <CustomerDeleteButton
                      customerId={customer.id}
                      customerName={customer.name}
                      customerCode={customer.code}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* ── Desktop: table ── */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="min-w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 md:px-6">
                      ร้านค้า
                    </th>
                    <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      รหัสร้าน
                    </th>
                    <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      ที่อยู่
                    </th>
                    <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      ราคาที่ผูก
                    </th>
                    <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      รถประจำร้าน
                    </th>
                    <th className="px-4 py-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customers.map((customer) => (
                    <tr key={customer.id} className="align-middle transition hover:bg-slate-50/70">
                      <td className="px-5 py-4 md:px-6">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#003366]/8">
                            <Store className="h-5 w-5 text-[#003366]" strokeWidth={2.2} />
                          </div>
                          <p className="text-base font-semibold text-slate-950">{customer.name}</p>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-mono text-sm text-slate-600">{customer.code}</td>
                      <td className="max-w-xs px-5 py-4 text-sm leading-6 text-slate-500 xl:max-w-sm">
                        {customer.address || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-sm font-medium text-sky-700">
                          {customer.pricingCount} รายการ
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">
                        {customer.defaultVehicleName ? (
                          <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600">
                            <Truck className="h-3.5 w-3.5 text-[#003366]" strokeWidth={2.2} />
                            {customer.defaultVehicleName}
                          </span>
                        ) : (
                          <span className="text-slate-400">ยังไม่ได้กำหนด</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <CustomerDeleteButton
                          customerId={customer.id}
                          customerName={customer.name}
                          customerCode={customer.code}
                        />
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
