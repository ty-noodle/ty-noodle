import { Suspense } from "react";
import { Filter, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { AppSidebarLayout } from "@/components/app-sidebar";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";
import { PageLoader } from "@/components/page-loader";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { requireAppSession } from "@/lib/auth/authorization";
import { getTodayInBangkok } from "@/lib/orders/date";
import { getProfitSalesReport } from "@/lib/reports/profit-sales";
import { PrintButton } from "../product-sales/print-button";
import { ProfitViewSwitcher } from "./profit-view-switcher";
import styles from "../product-sales/print.module.css";
import { ReportGetForm } from "@/components/report-get-form";

export const metadata = {
  title: "รายงานกำไรขาย",
};

type PageProps = {
  searchParams: Promise<{
    from?: string;
    to?: string;
    page?: string;
  }>;
};

function firstOfMonth(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

function formatDateThai(isoDate: string) {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${Number(year) + 543}`;
}

function formatDateThaiShortYear(isoDate: string) {
  const [year, month, day] = isoDate.split("-");
  const buddhistYearTwoDigits = String(Number(year) + 543).slice(-2);
  return `${day}/${month}/${buddhistYearTwoDigits}`;
}

function formatMoney(value: number) {
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: number) {
  return `${value.toLocaleString("th-TH", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function splitPages<T>(rows: T[], pageSize = 35) {
  const pages: T[][] = [];
  for (let i = 0; i < rows.length; i += pageSize) {
    pages.push(rows.slice(i, i + pageSize));
  }
  return pages;
}

function formatPrintedAt(date: Date) {
  const datePart = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return { datePart, timePart };
}

export default async function Page({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<PageLoader />}>
      <ProfitSalesContent searchParams={searchParams} />
    </Suspense>
  );
}

const monthsThai = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
];

const monthsThaiShort = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
];

interface ProfitRow {
  isoDate: string;
  orderCount: number;
  sales: number;
  cost: number;
  netProfit: number;
  marginPercent: number;
}

interface MonthlyGroup {
  isoDate: string;
  monthName: string;
  monthNameShort: string;
  orderCount: number;
  sales: number;
  cost: number;
  netProfit: number;
  marginPercent: number;
}

function aggregateByMonth(rows: ProfitRow[]): MonthlyGroup[] {
  const groups: Record<string, MonthlyGroup> = {};
  rows.forEach(row => {
    const date = new Date(row.isoDate);
    const month = date.getMonth();
    const year = date.getFullYear();
    const key = `${year}-${String(month + 1).padStart(2, '0')}`;
    
    if (!groups[key]) {
      groups[key] = {
        isoDate: key,
        monthName: `${monthsThai[month]} ${year + 543}`,
        monthNameShort: `${monthsThaiShort[month]} ${String(year + 543).slice(-2)}`,
        orderCount: 0,
        sales: 0,
        cost: 0,
        netProfit: 0,
        marginPercent: 0,
      };
    }
    
    groups[key].orderCount += row.orderCount;
    groups[key].sales += row.sales;
    groups[key].cost += row.cost;
    groups[key].netProfit += row.netProfit;
  });
  
  return Object.values(groups)
    .sort((a, b) => a.isoDate.localeCompare(b.isoDate))
    .map((group) => {
      if (group.sales > 0) {
        group.marginPercent = (group.netProfit / group.sales) * 100;
      } else {
        group.marginPercent = 0;
      }
      return group;
    });
}

async function ProfitSalesContent({ searchParams }: PageProps) {
  const session = await requireAppSession();
  const params = (await searchParams) as Record<string, string | undefined>;
  const today = getTodayInBangkok();
  const fromDate = params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from) ? params.from : firstOfMonth(today);
  const toDate = params.to && /^\d{4}-\d{2}-\d{2}$/.test(params.to) ? params.to : today;
  const currentPage = params.page ? parseInt(params.page, 10) : 1;
  const view = params.view === 'monthly' ? 'monthly' : 'daily';

  const report = await getProfitSalesReport({
    organizationId: session.organizationId,
    fromDate,
    toDate,
  });

  const displayRows = view === 'monthly' ? aggregateByMonth(report.rows) : report.rows;
  const pages = splitPages(displayRows);
  const totalPages = pages.length;
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages || 1);
  const currentPageRows = pages[safeCurrentPage - 1] || [];
  const printedAt = formatPrintedAt(new Date());

  return (
    <AppSidebarLayout>
      <div className="min-h-screen bg-slate-50/70 print:min-h-0 print:bg-white">
        <div className="mx-auto max-w-[1500px] px-0 py-0 sm:px-4 sm:py-8 no-print">
          <header className="mb-6 hidden sm:block">

            <h1 className="text-2xl font-extrabold tracking-tight text-[#003366] sm:text-3xl">รายงานกำไรขาย</h1>
          </header>

          <MobileSearchDrawer title="ค้นหารายงานกำไรขาย">
            <ReportGetForm action="/reports/profit-sales" className="flex flex-col gap-4 pb-32">
              <input type="hidden" name="view" value={view} />
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500">ช่วงวันที่</label>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1"><ThaiDatePicker id="m-profit-from" name="from" defaultValue={fromDate} placeholder="วันเริ่มต้น" compact matchFieldHeight /></div>
                  <span className="shrink-0 text-slate-300">—</span>
                  <div className="min-w-0 flex-1"><ThaiDatePicker id="m-profit-to" name="to" defaultValue={toDate} placeholder="วันสิ้นสุด" compact matchFieldHeight /></div>
                </div>
              </div>
              <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#003366] py-3.5 text-base font-bold text-white transition hover:bg-[#002244]">
                <Filter className="h-4 w-4" strokeWidth={2} />
                ค้นหา
              </button>
            </ReportGetForm>
          </MobileSearchDrawer>

          {/* Desktop Filter Card */}
          <section className="hidden md:block overflow-hidden bg-white shadow-sm sm:rounded-sm border border-slate-200 mb-6 no-print">
            <div className="px-4 py-4">
              <ReportGetForm action="/reports/profit-sales" className="flex flex-col gap-4 lg:flex-row lg:items-end">
                <input type="hidden" name="view" value={view} />
                <div className="min-w-[420px] flex-1">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500">ช่วงวันที่</label>
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="min-w-0 flex-1"><ThaiDatePicker id="profit-from" name="from" defaultValue={fromDate} placeholder="วันเริ่มต้น" compact matchFieldHeight /></div>
                    <span className="shrink-0 text-slate-300">—</span>
                    <div className="min-w-0 flex-1"><ThaiDatePicker id="profit-to" name="to" defaultValue={toDate} placeholder="วันสิ้นสุด" compact matchFieldHeight /></div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="submit" className="flex h-10 items-center justify-center gap-2 rounded-md bg-[#003366] px-5 text-sm font-bold text-white transition hover:bg-[#002244]">
                    <Filter className="h-4 w-4" strokeWidth={2.2} />
                    ค้นหา
                  </button>
                  <Link href={`/reports/profit-sales?view=${view}`} className="flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 transition hover:border-[#003366] hover:text-[#003366]">
                    ล้างตัวกรอง
                  </Link>
                </div>
              </ReportGetForm>
            </div>
          </section>

          {/* Switcher & Action Buttons */}
          <div className="lg:mx-auto lg:max-w-[210mm] flex justify-between items-center mb-4 no-print px-0 sm:px-0">
            <ProfitViewSwitcher fromDate={fromDate} toDate={toDate} view={view} />
          </div>

          {/* Table Section (Portrait A4 Paper) */}
          <div className="lg:mx-auto lg:max-w-[210mm] mb-12 flex flex-col gap-8">
            {totalPages > 0 ? (
              <div className="bg-white shadow-2xl border border-slate-100 p-2 sm:p-8 md:p-12 sm:rounded-sm lg:min-h-[297mm] flex flex-col">
                {/* Replicated Print Header for Screen */}
                <div className="mb-4 border-b border-[#003366] pb-2 p-4 sm:p-0">
                  <div className="mb-1 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/ty-noodles-logo-cropped.png" alt="T&Y Noodle" width={40} height={40} className="h-10 w-10 object-contain" />
                      <div>
                        <p className="text-sm font-black leading-tight text-[#003366]">T&Y Noodle</p>
                        <p className="text-[10px] font-semibold text-slate-500">ระบบรายงานผลกำไรจากการขายสินค้า</p>
                      </div>
                    </div>
                    <div className="text-right text-[10px] font-semibold text-slate-500">
                      {/* For Screen: Interactive Pagination */}
                      <div className="flex items-center gap-1 justify-end no-print">
                        <Link
                          href={`/reports/profit-sales?from=${fromDate}&to=${toDate}&page=${safeCurrentPage - 1}`}
                          className={`p-0.5 rounded-full text-[#003366] transition ${safeCurrentPage === 1 ? "pointer-events-none opacity-30" : "hover:bg-slate-100"}`}
                        >
                          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
                        </Link>
                        <span>หน้า {safeCurrentPage} / {totalPages}</span>
                        <Link
                          href={`/reports/profit-sales?from=${fromDate}&to=${toDate}&page=${safeCurrentPage + 1}`}
                          className={`p-0.5 rounded-full text-[#003366] transition ${safeCurrentPage === totalPages ? "pointer-events-none opacity-30" : "hover:bg-slate-100"}`}
                        >
                          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
                        </Link>
                      </div>
                      {/* For Print: Static Text */}
                      <p className="hidden print:block">หน้า: {safeCurrentPage} / {totalPages}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between no-print">
                    <p className="text-base font-black text-[#003366]">รายงานกำไรขาย</p>
                    <PrintButton targetId="report-print-area" fileName="รายงานกำไรขาย" hidePrintOnMobile />
                  </div>
                  <p className="text-base font-black text-[#003366] hidden print:block">รายงานกำไรขาย</p>
                  <p className="text-xs font-semibold text-slate-600">
                    ช่วงวันที่ {formatDateThai(fromDate)} — {formatDateThai(toDate)}
                  </p>
                </div>

                <div className="overflow-hidden flex-1">
                  <table className="w-full table-fixed border-collapse">
                    <colgroup>
                      <col style={{ width: "6%" }} />
                      <col style={{ width: "22%" }} />
                      <col style={{ width: "20%" }} />
                      <col style={{ width: "20%" }} />
                      <col style={{ width: "20%" }} />
                      <col style={{ width: "12%" }} />
                    </colgroup>
                    <thead>
                      <tr className="bg-[#003366]">
                        {["#", view === 'monthly' ? "เดือน" : "วันที่", "ยอดขาย", "ต้นทุน", "กำไรสุทธิ", "กำไร %"].map((label, idx) => (
                          <th
                            key={label}
                            className={`px-1.5 py-2 text-center text-[9px] leading-none font-black uppercase tracking-[0.02em] text-white sm:px-2 sm:text-[10px] md:py-3 md:text-[11px] md:tracking-[0.08em] ${idx >= 2 ? "md:px-4" : "md:px-3"} ${idx === 0 ? "md:!text-center" : ""} ${idx === 1 ? "md:!text-left" : ""} ${idx >= 2 ? "md:!text-right" : ""}`}
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#003366]/25">
                      {currentPageRows.map((row, index) => {
                        const isNoSales = row.orderCount === 0;
                        return (
                          <tr key={row.isoDate} className="odd:bg-white even:bg-slate-50/50">
                            <td className="px-1.5 py-1.5 text-center text-[10px] font-bold text-slate-700 sm:px-2 sm:text-[11px] md:px-3 md:py-2 md:text-sm">{(safeCurrentPage - 1) * 35 + index + 1}</td>
                            <td className="px-1.5 py-1.5 text-[10px] font-bold text-slate-900 sm:px-2 sm:text-[11px] md:px-3 md:py-2 md:text-sm">
                              {view === 'monthly' ? (
                                <>
                                  <span className="md:hidden">{(row as MonthlyGroup).monthNameShort}</span>
                                  <span className="hidden md:inline">{(row as MonthlyGroup).monthName}</span>
                                </>
                              ) : (
                                <>
                                  <span className="md:hidden">{formatDateThaiShortYear(row.isoDate)}</span>
                                  <span className="hidden md:inline">{formatDateThai(row.isoDate)}</span>
                                </>
                              )}
                            </td>
                            <td className="px-1.5 py-1.5 text-right text-[10px] font-bold tabular-nums text-slate-900 sm:px-2 sm:text-[11px] md:px-4 md:py-2 md:text-sm">{isNoSales ? "-" : formatMoney(row.sales)}</td>
                            <td className="px-1.5 py-1.5 text-right text-[10px] font-bold tabular-nums text-slate-700 sm:px-2 sm:text-[11px] md:px-4 md:py-2 md:text-sm">{isNoSales ? "-" : formatMoney(row.cost)}</td>
                            <td className={`px-1.5 py-1.5 text-right text-[10px] font-black tabular-nums sm:px-2 sm:text-[11px] md:px-4 md:py-2 md:text-sm ${row.netProfit >= 0 ? "text-emerald-700" : "text-red-700"}`}>{isNoSales ? "-" : formatMoney(row.netProfit)}</td>
                            <td className={`px-1.5 py-1.5 text-right text-[10px] font-black tabular-nums sm:px-2 sm:text-[11px] md:px-4 md:py-2 md:text-sm ${row.marginPercent >= 0 ? "text-emerald-700" : "text-red-700"}`}>{isNoSales ? "-" : formatPercent(row.marginPercent)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {safeCurrentPage === totalPages && report.rows.length > 0 && (
                      <tfoot>
                        <tr className="bg-slate-100">
                          <td colSpan={2} className="px-1.5 py-1.5 text-right text-[10px] font-black text-slate-700 sm:px-2 sm:text-[11px] md:px-3 md:py-2 md:text-sm">รวมทั้งหมด</td>
                          <td className="px-1.5 py-1.5 text-right text-[10px] font-black tabular-nums text-slate-900 sm:px-2 sm:text-[11px] md:px-3 md:py-2 md:text-sm">{formatMoney(report.summary.totalSales)}</td>
                          <td className="px-1.5 py-1.5 text-right text-[10px] font-black tabular-nums text-slate-700 sm:px-2 sm:text-[11px] md:px-3 md:py-2 md:text-sm">{formatMoney(report.summary.totalCost)}</td>
                          <td className={`px-1.5 py-1.5 text-right text-[10px] font-black tabular-nums sm:px-2 sm:text-[11px] md:px-3 md:py-2 md:text-sm ${report.summary.totalNetProfit >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatMoney(report.summary.totalNetProfit)}</td>
                          <td className={`px-1.5 py-1.5 text-right text-[10px] font-black tabular-nums sm:px-2 sm:text-[11px] md:px-3 md:py-2 md:text-sm ${report.summary.avgMarginPercent >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatPercent(report.summary.avgMarginPercent)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 p-4 sm:p-0 sm:pt-4">
                    <Link
                      href={`/reports/profit-sales?from=${fromDate}&to=${toDate}&page=${safeCurrentPage - 1}`}
                      className={`flex items-center gap-1 text-sm font-bold text-[#003366] transition ${safeCurrentPage === 1 ? "pointer-events-none opacity-30" : "hover:text-[#002244]"}`}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      ก่อนหน้า
                    </Link>
                    <span className="text-sm font-semibold text-slate-500">
                      หน้า {safeCurrentPage} / {totalPages}
                    </span>
                    <Link
                      href={`/reports/profit-sales?from=${fromDate}&to=${toDate}&page=${safeCurrentPage + 1}`}
                      className={`flex items-center gap-1 text-sm font-bold text-[#003366] transition ${safeCurrentPage === totalPages ? "pointer-events-none opacity-30" : "hover:text-[#002244]"}`}
                    >
                      ถัดไป
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white shadow-2xl border border-slate-100 p-6 text-center text-slate-400 sm:rounded-sm">
                ไม่พบข้อมูลในช่วงวันที่ที่เลือก
              </div>
            )}
          </div>
        </div>

        <div id="report-print-area" className="fixed -left-[9999px] top-0 opacity-0 pointer-events-none print:static print:opacity-100 print:pointer-events-auto print:block">
          {pages.map((rows, pageIndex) => (
            <div key={pageIndex} data-print-page="true" className={`${styles.printArea} ${styles.printPage}`}>
              <div className={styles.printHeader}>
                <div className="mb-1 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/ty-noodles-logo-cropped.png" alt="T&Y Noodle" width={40} height={40} className="h-10 w-10 object-contain" />
                    <div>
                      <p className="text-sm font-black leading-tight text-[#003366]">T&Y Noodle</p>
                      <p className="text-[10px] font-semibold text-slate-500">ระบบรายงานผลกำไรจากการขายสินค้า</p>
                    </div>
                  </div>
                  <div className="text-right text-[10px] font-semibold text-slate-500">
                    <p>วันที่พิมพ์: {printedAt.datePart}</p>
                    <p>เวลา: {printedAt.timePart} น.</p>
                    <p>หน้า: {pageIndex + 1} / {pages.length}</p>
                  </div>
                </div>
                <p className="text-base font-black text-[#003366]">รายงานกำไรขาย</p>
                <p className="text-xs font-semibold text-slate-600">
                  ช่วงวันที่ {formatDateThai(fromDate)} — {formatDateThai(toDate)}
                </p>
              </div>

              <table className="w-full table-fixed border-collapse">
                <colgroup>
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "22%" }} />
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "12%" }} />
                </colgroup>
                <thead>
                  <tr className="bg-[#003366]">
                    {["#", view === 'monthly' ? "เดือน" : "วันที่", "ยอดขาย", "ต้นทุน", "กำไรสุทธิ", "กำไร %"].map((label, idx) => (
                      <th key={label} className={`px-2 py-1 text-[10px] leading-none font-black tracking-wide text-white ${idx === 0 ? "text-center" : "text-right"} ${idx === 1 ? "!text-left" : ""}`}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const isNoSales = row.orderCount === 0;
                    return (
                      <tr key={row.isoDate} className="border-b border-slate-200">
                        <td className="px-2 py-1.5 text-center text-[11px] font-semibold">{pageIndex * 35 + index + 1}</td>
                        <td className="px-2 py-1.5 text-[11px] font-semibold">
                          {view === 'monthly' ? (row as MonthlyGroup).monthName : formatDateThai(row.isoDate)}
                        </td>
                        <td className="px-2 py-1.5 text-right text-[11px] font-semibold tabular-nums">{isNoSales ? "-" : formatMoney(row.sales)}</td>
                        <td className="px-2 py-1.5 text-right text-[11px] font-semibold tabular-nums">{isNoSales ? "-" : formatMoney(row.cost)}</td>
                        <td className={`px-2 py-1.5 text-right text-[11px] font-bold tabular-nums ${row.netProfit >= 0 ? "text-emerald-700" : "text-red-700"}`}>{isNoSales ? "-" : formatMoney(row.netProfit)}</td>
                        <td className={`px-2 py-1.5 text-right text-[11px] font-bold tabular-nums ${row.marginPercent >= 0 ? "text-emerald-700" : "text-red-700"}`}>{isNoSales ? "-" : formatPercent(row.marginPercent)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {pageIndex === pages.length - 1 ? (
                  <tfoot>
                    <tr className="bg-slate-100">
                      <td colSpan={2} className="px-2 py-2 text-right text-[11px] font-black">รวมทั้งหมด</td>
                      <td className="px-2 py-2 text-right text-[11px] font-black tabular-nums">{formatMoney(report.summary.totalSales)}</td>
                      <td className="px-2 py-2 text-right text-[11px] font-black tabular-nums">{formatMoney(report.summary.totalCost)}</td>
                      <td className={`px-2 py-2 text-right text-[11px] font-black tabular-nums ${report.summary.totalNetProfit >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatMoney(report.summary.totalNetProfit)}</td>
                      <td className={`px-2 py-2 text-right text-[11px] font-black tabular-nums ${report.summary.avgMarginPercent >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatPercent(report.summary.avgMarginPercent)}</td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
              <div className={styles.printFooter}>
                พิมพ์จากระบบรายงานอัตโนมัติ (T&Y Noodle) - หน้า {pageIndex + 1} / {pages.length}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppSidebarLayout>
  );
}
