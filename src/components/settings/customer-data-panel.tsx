import Image from "next/image";
import { CalendarDays, Phone, Store, UserRound } from "lucide-react";
import type { CustomerDirectoryData, CustomerDirectoryItem } from "@/lib/settings/customer-directory";
import { CustomerDataActions } from "@/components/settings/customer-data-actions";
import { LineUserIdCopy } from "@/components/settings/line-user-id-copy";
import {
  SettingsEmptyState,
  SettingsMetricCard,
  SettingsPanel,
  SettingsPanelBody,
} from "@/components/settings/settings-ui";

type CustomerDataPanelProps = {
  data: CustomerDirectoryData;
};

function formatThaiDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Bangkok",
    year: "numeric",
  }).format(new Date(value));
}

function getLineName(customer: CustomerDirectoryItem) {
  return customer.lineDisplayName || "ยังไม่พบชื่อ LINE";
}

function CustomerAvatar({ customer }: { customer: CustomerDirectoryItem }) {
  if (customer.linePictureUrl) {
    return (
      <Image
        src={customer.linePictureUrl}
        alt={getLineName(customer)}
        width={48}
        height={48}
        sizes="48px"
        className="h-12 w-12 rounded-2xl object-cover ring-1 ring-[#06c755]/20"
      />
    );
  }

  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#06c755]/12 ring-1 ring-[#06c755]/20">
      <Image
        src="/icons8-line.svg"
        alt="LINE"
        width={22}
        height={22}
        className="h-[22px] w-[22px]"
      />
    </div>
  );
}

function StatusPill({ isActive, isLinked }: { isActive: boolean; isLinked: boolean }) {
  if (!isLinked) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        รอผูกร้านค้า
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
        isActive
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
          : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${isActive ? "bg-emerald-500" : "bg-slate-400"}`}
      />
      {isActive ? "ใช้งาน" : "ปิดใช้งาน"}
    </span>
  );
}

function getCustomerLabel(customer: CustomerDirectoryItem) {
  return customer.customerCode ? `${customer.customerCode}-${customer.name}` : "ยังไม่ผูกร้านค้า";
}

export function CustomerDataPanel({ data }: CustomerDataPanelProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-3">
        <SettingsMetricCard label="ลูกค้าที่เชื่อม LINE อยู่" value={data.totalCount} />
        <SettingsMetricCard label="สถานะใช้งาน" value={data.activeCount} />
        <SettingsMetricCard label="ปิดใช้งานแล้ว" value={data.disabledCount} />
      </div>

      <SettingsPanel className="overflow-hidden rounded-[1.75rem] border-slate-200 shadow-[0_20px_55px_rgba(15,23,42,0.06)]">
        <div className="border-b border-slate-100 bg-[linear-gradient(135deg,rgba(6,199,85,0.08),rgba(0,51,102,0.04))] px-5 py-5 md:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#06c755] ring-1 ring-[#06c755]/15">
                <Image
                  src="/icons8-line.svg"
                  alt="LINE"
                  width={14}
                  height={14}
                  className="h-3.5 w-3.5"
                />
                ข้อมูลลูกค้า LINE
              </div>
              <h2 className="mt-3 text-xl font-bold text-slate-950">รายการลูกค้าที่เชื่อม LINE</h2>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-600">
                หน้านี้ใช้สำหรับตรวจสอบข้อมูลลูกค้าที่เปิดร้านค้าผ่าน LINE และจัดการสิทธิ์การสั่งซื้อได้ทันทีจากฝั่งแอดมิน
              </p>
            </div>

          </div>
        </div>

        <SettingsPanelBody className="p-0">
          {data.customers.length === 0 ? (
            <div className="p-6">
              <SettingsEmptyState className="py-16">
                ยังไม่มีลูกค้าที่เชื่อมบัญชี LINE ในระบบ
              </SettingsEmptyState>
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-100 md:hidden">
                {data.customers.map((customer) => (
                  <div key={`${customer.id}-${customer.lineUserId}`} className="px-4 py-5">
                    <div className="flex items-start gap-4">
                      <CustomerAvatar customer={customer} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-bold text-slate-950">{getLineName(customer)}</p>
                          <StatusPill isActive={customer.isActive} isLinked={customer.isLinked} />
                        </div>
                        <div className="mt-1">
                          <LineUserIdCopy value={customer.lineUserId} />
                        </div>
                        <div className="mt-3 grid gap-2 text-sm text-slate-600">
                          <div className="flex items-center gap-2">
                            <Store className="h-4 w-4 text-slate-400" strokeWidth={2.1} />
                            <span>{getCustomerLabel(customer)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-slate-400" strokeWidth={2.1} />
                            <span>{customer.phone?.trim() || "-"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <CalendarDays className="h-4 w-4 text-slate-400" strokeWidth={2.1} />
                            <span>{formatThaiDate(customer.createdAt)}</span>
                          </div>
                        </div>
                        <div className="mt-4">
                          <CustomerDataActions
                            customerCode={customer.customerCode ?? "-"}
                            customerId={customer.customerId}
                            customerName={customer.customerId ? customer.name : getLineName(customer)}
                            isActive={customer.isActive}
                            lineLinkId={customer.lineLinkId}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-slate-50/90">
                      <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 md:px-6">
                        โปรไฟล์ LINE
                      </th>
                      <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        ชื่อ LINE
                      </th>
                      <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        ร้านค้า
                      </th>
                      <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        เบอร์โทร
                      </th>
                      <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        วันที่สร้าง
                      </th>
                      <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        สถานะ
                      </th>
                      <th className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        จัดการ
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.customers.map((customer) => (
                      <tr key={`${customer.id}-${customer.lineUserId}`} className="align-middle transition hover:bg-slate-50/60">
                        <td className="px-5 py-4 md:px-6">
                          <CustomerAvatar customer={customer} />
                        </td>
                        <td className="px-5 py-4">
                          <div className="min-w-[12rem]">
                            <div className="flex items-center gap-2">
                              <UserRound className="h-4 w-4 text-[#06c755]" strokeWidth={2.1} />
                              <p className="font-semibold text-slate-950">{getLineName(customer)}</p>
                            </div>
                            <div className="mt-1">
                              <LineUserIdCopy value={customer.lineUserId} />
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <Store className="h-4 w-4 text-[#003366]" strokeWidth={2.1} />
                            <span className="font-semibold text-slate-950">{getCustomerLabel(customer)}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600">
                          {customer.phone?.trim() || "-"}
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600">
                          {formatThaiDate(customer.createdAt)}
                        </td>
                        <td className="px-5 py-4">
                          <StatusPill isActive={customer.isActive} isLinked={customer.isLinked} />
                        </td>
                        <td className="px-5 py-4">
                          <CustomerDataActions
                            customerCode={customer.customerCode ?? "-"}
                            customerId={customer.customerId}
                            customerName={customer.customerId ? customer.name : getLineName(customer)}
                            isActive={customer.isActive}
                            lineLinkId={customer.lineLinkId}
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
    </div>
  );
}
