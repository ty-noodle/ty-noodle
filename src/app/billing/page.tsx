import { Fragment } from "react";
import { Building2, CalendarDays, FileText, Lock, Printer, Receipt, Search } from "lucide-react";
import { AppSidebarLayout } from "@/components/app-sidebar";
import { requireAppRole } from "@/lib/auth/authorization";
import {
  getBillingCustomers,
  getBillingHistory,
  type BillingRecord,
} from "@/lib/billing/billing-statement";
import { BillingForm } from "./billing-form";
import { fmt } from "@/components/print/print-shared";
import { fmtDateTH } from "@/lib/utils/date";

export const metadata = { title: "ใบวางบิล | T&YNoodle" };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateFull(iso: string) {
  return fmtDateTH(iso);
}

function fmtBaht(amount: number) {
  return `${fmt(amount)} บาท`;
}

function reprintUrl(record: BillingRecord) {
  return `/billing/print?customer=${record.customer_id}&from=${record.from_date}&to=${record.to_date}&save=false`;
}

// ─── Desktop: Table with group rows ───────────────────────────────────────────

function HistoryTable({ history }: { history: BillingRecord[] }) {
  return (
    <div className="hidden overflow-hidden rounded-2xl border border-slate-200 shadow-sm lg:block">
      <table className="w-full border-collapse bg-white text-sm">

        {/* Table head */}
        <thead className="bg-[#0f2f56]">
          <tr>
            <th className="w-12 px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-[0.1em] text-white/80">#</th>
            <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.1em] text-white/80">เลขที่ใบส่งของ</th>
            <th className="px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-[0.1em] text-white/80">วันที่ส่งของ</th>
            <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.1em] text-white/80">ยอด (บาท)</th>
            <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.1em] text-white/80">หมายเหตุ</th>
          </tr>
        </thead>

        <tbody>
          {history.map((record, groupIndex) => (
            <Fragment key={record.id}>

              {/* ── Billing record group header row ──────────────────────── */}
              <tr className={groupIndex > 0 ? "border-t-[3px] border-slate-200" : ""}>
                <td colSpan={5} className="bg-slate-50 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">

                    {/* Left: doc info chain */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {/* Billing number */}
                      <div className="flex items-center gap-2">
                        <Lock
                          className="h-3.5 w-3.5 shrink-0 text-emerald-600"
                          strokeWidth={2.5}
                        />
                        <span className="font-mono text-[15px] font-extrabold tracking-tight text-[#0f2f56]">
                          {record.billing_number}
                        </span>
                        {record.isSnapshotLocked && (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                            ยอดล็อก
                          </span>
                        )}
                      </div>

                      <span className="text-slate-300">·</span>

                      {/* Customer */}
                      <div className="flex items-center gap-1.5">
                        <Building2
                          className="h-3.5 w-3.5 shrink-0 text-slate-400"
                          strokeWidth={2}
                        />
                        <span className="font-semibold text-slate-700">{record.customer_name}</span>
                        <span className="font-mono text-xs text-slate-400">({record.customer_code})</span>
                      </div>

                      <span className="text-slate-300">·</span>

                      {/* Date range */}
                      <div className="flex items-center gap-1.5">
                        <CalendarDays
                          className="h-3.5 w-3.5 shrink-0 text-slate-400"
                          strokeWidth={2}
                        />
                        <span className="text-slate-600">
                          {fmtDateTH(record.from_date)}
                          <span className="mx-1 text-slate-400">–</span>
                          {fmtDateTH(record.to_date)}
                        </span>
                      </div>

                      <span className="text-xs text-slate-400">
                        ออกวันที่ {fmtDateFull(record.billing_date)}
                      </span>
                    </div>

                    {/* Right: print button */}
                    <a
                      href={reprintUrl(record)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-[#003366] hover:bg-[#003366] hover:text-white active:scale-95"
                    >
                      <Printer className="h-3.5 w-3.5" strokeWidth={2.2} />
                      พิมพ์อีกครั้ง
                    </a>

                  </div>
                </td>
              </tr>

              {/* ── Delivery note rows ───────────────────────────────────── */}
              {record.snapshot_rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="bg-white px-4 py-4 text-center text-sm italic text-slate-400"
                  >
                    ไม่มีข้อมูลรายการใบส่งของ
                  </td>
                </tr>
              ) : (
                record.snapshot_rows.map((row) => (
                  <tr
                    key={row.deliveryNumber}
                    className="border-t border-slate-100 bg-white transition-colors hover:bg-[#003366]/[0.025]"
                  >
                    <td className="px-4 py-3 text-center">
                      <span className="tabular-nums text-xs font-semibold text-slate-400">
                        {row.lineNumber}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-[#003366]">
                        {row.deliveryNumber}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">
                      {fmtDateTH(row.deliveryDate)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-slate-800">
                      {fmtBaht(row.totalAmount)}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {row.notes ?? "—"}
                    </td>
                  </tr>
                ))
              )}

              {/* ── Sub-total row ────────────────────────────────────────── */}
              {record.snapshot_rows.length > 0 && (
                <tr className="border-t border-slate-200 bg-slate-50/80">
                  <td
                    colSpan={3}
                    className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500"
                  >
                    รวม {record.snapshot_rows.length} ใบส่งของ
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-sm font-extrabold tabular-nums text-slate-800 underline decoration-dotted underline-offset-2">
                    {fmtBaht(record.total_amount)}
                  </td>
                  <td className="px-4 py-2.5" />
                </tr>
              )}

            </Fragment>
          ))}
        </tbody>

      </table>
    </div>
  );
}

// ─── Mobile: Card layout ──────────────────────────────────────────────────────

function BillingMobileCard({ record }: { record: BillingRecord }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

      {/* Card header */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <Lock
            className="h-3.5 w-3.5 shrink-0 text-emerald-600"
            strokeWidth={2.5}
          />
          <span className="font-mono text-[15px] font-extrabold tracking-tight text-[#0f2f56]">
            {record.billing_number}
          </span>
          {record.isSnapshotLocked && (
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
              ยอดล็อก
            </span>
          )}
        </div>
        <a
          href={reprintUrl(record)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 active:scale-95"
        >
          <Printer className="h-3.5 w-3.5" strokeWidth={2.2} />
          พิมพ์
        </a>
      </div>

      {/* Meta grid */}
      <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100">
        <div className="px-4 py-3">
          <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
            <Building2 className="h-3 w-3" strokeWidth={2} />
            ร้านค้า
          </p>
          <p className="text-sm font-bold text-slate-800">{record.customer_name}</p>
          <p className="font-mono text-xs text-slate-400">{record.customer_code}</p>
        </div>
        <div className="px-4 py-3">
          <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
            <CalendarDays className="h-3 w-3" strokeWidth={2} />
            ช่วงวันที่
          </p>
          <p className="text-sm font-semibold text-slate-700">
            {fmtDateTH(record.from_date)}
            <span className="mx-1 text-slate-400">–</span>
            {fmtDateTH(record.to_date)}
          </p>
          <p className="text-xs text-slate-400">ออก {fmtDateFull(record.billing_date)}</p>
        </div>
      </div>

      {/* Delivery note list */}
      <div>
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/50 px-4 py-2">
          <FileText className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} />
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
            รายการใบส่งของ
          </p>
        </div>
        {record.snapshot_rows.length === 0 ? (
          <p className="px-4 py-4 text-sm italic text-slate-400">ไม่มีข้อมูลรายการ</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {record.snapshot_rows.map((row) => (
              <div
                key={row.deliveryNumber}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="w-5 shrink-0 text-center text-xs font-semibold tabular-nums text-slate-400">
                    {row.lineNumber}
                  </span>
                  <div>
                    <p className="font-mono text-sm font-bold leading-tight text-[#003366]">
                      {row.deliveryNumber}
                    </p>
                    <p className="text-xs text-slate-400">{fmtDateTH(row.deliveryDate)}</p>
                  </div>
                </div>
                <p className="font-mono text-sm font-semibold tabular-nums text-slate-800">
                  {fmtBaht(row.totalAmount)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer: total */}
      <div className="flex items-center justify-between border-t-2 border-slate-100 bg-slate-50 px-4 py-3">
        <div className="flex items-center gap-2 text-slate-500">
          <Receipt className="h-4 w-4" strokeWidth={2} />
          <p className="text-sm font-semibold">
            รวม {record.snapshot_rows.length} ใบส่งของ
          </p>
        </div>
        <p className="font-mono text-lg font-extrabold tabular-nums text-slate-900">
          {fmtBaht(record.total_amount)}
        </p>
      </div>

    </article>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyHistory() {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-50">
        <FileText className="h-8 w-8 text-slate-300" strokeWidth={1.5} />
      </div>
      <p className="text-lg font-semibold text-slate-500">ยังไม่มีประวัติการวางบิล</p>
      <p className="mt-1 text-sm text-slate-400">
        ใบวางบิลที่กด &quot;บันทึกและพิมพ์&quot; จะแสดงที่นี่
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function BillingPage() {
  const session = await requireAppRole("admin");

  const [customers, history] = await Promise.all([
    getBillingCustomers(session.organizationId),
    getBillingHistory(session.organizationId),
  ]);

  const totalBilled = history.reduce((s, r) => s + r.total_amount, 0);

  return (
    <AppSidebarLayout>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div className="mb-8 flex items-center gap-4 border-b border-slate-100 pb-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#003366] shadow-md shadow-[#003366]/20">
            <FileText className="h-6 w-6 text-white" strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">ใบวางบิล</h1>
            <p className="text-sm text-slate-500">สร้าง ดูตัวอย่าง และพิมพ์ใบวางบิลรายร้านค้า</p>
          </div>
        </div>

        <div className="flex flex-col gap-10">

          {/* ── ออกใบวางบิลใหม่ ──────────────────────────────────────────── */}
          <section className="mx-auto w-full max-w-2xl">
            <h2 className="mb-4 text-base font-bold text-slate-700">ออกใบวางบิลใหม่</h2>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="p-6 sm:p-8">
                {customers.length === 0 ? (
                  <div className="flex flex-col items-center py-10 text-center">
                    <div className="mb-3 rounded-full bg-slate-100 p-3">
                      <Search className="h-5 w-5 text-slate-400" />
                    </div>
                    <p className="font-medium text-slate-500">ไม่พบรายชื่อร้านค้าในระบบ</p>
                  </div>
                ) : (
                  <BillingForm customers={customers} />
                )}
              </div>
            </div>
          </section>

          {/* ── ประวัติการวางบิล ──────────────────────────────────────────── */}
          <section>
            {/* Section header + summary */}
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-700">ประวัติการวางบิล</h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  ยอดในใบที่ออกแล้วถูกล็อก — แก้ใบส่งของย้อนหลังจะไม่กระทบยอดเดิม
                </p>
              </div>
              {history.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-right shadow-sm">
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">
                    รวมทั้งหมด {history.length} ฉบับ
                  </p>
                  <p className="font-mono text-base font-extrabold tabular-nums text-slate-800">
                    {fmtBaht(totalBilled)}
                  </p>
                </div>
              )}
            </div>

            {history.length === 0 ? (
              <EmptyHistory />
            ) : (
              <>
                {/* Desktop table */}
                <HistoryTable history={history} />

                {/* Mobile cards */}
                <div className="flex flex-col gap-4 lg:hidden">
                  {history.map((record) => (
                    <BillingMobileCard key={record.id} record={record} />
                  ))}
                </div>
              </>
            )}
          </section>

        </div>
      </div>
    </AppSidebarLayout>
  );
}
