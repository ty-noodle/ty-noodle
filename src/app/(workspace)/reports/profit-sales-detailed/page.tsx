import { Suspense } from "react";
import { ChevronLeft, ChevronRight, Filter, FileSpreadsheet, Store } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { AppSidebarLayout } from "@/components/app-sidebar";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";
import { PageLoader } from "@/components/page-loader";
import { ReportGetForm } from "@/components/report-get-form";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { requireAppSession } from "@/lib/auth/authorization";
import { getTodayInBangkok } from "@/lib/orders/date";
import {
  getDetailedProfitSalesPrintReport,
  getDetailedProfitSalesReport,
  type DetailedProfitProductItem,
  type DetailedProfitStoreGroup,
} from "@/lib/reports/profit-sales-detailed";
import { getCustomersForFilter } from "@/lib/reports/product-sales";
import { PrintButton } from "../product-sales/print-button";
import { StoreFilter } from "../product-sales/store-filter";
import styles from "./print.module.css";
import { MobileStoreCard } from "./mobile-store-card";

export const metadata = {
  title: "รายงานสินค้าและกำไรแยกตามสาขา",
};

type PageProps = {
  searchParams: Promise<{
    from?: string;
    to?: string;
    stores?: string;
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

function formatMonthYearThai(isoDate: string) {
  const [year, month] = isoDate.split("-");
  const monthNames = [
    "มกราคม",
    "กุมภาพันธ์",
    "มีนาคม",
    "เมษายน",
    "พฤษภาคม",
    "มิถุนายน",
    "กรกฎาคม",
    "สิงหาคม",
    "กันยายน",
    "ตุลาคม",
    "พฤศจิกายน",
    "ธันวาคม",
  ];
  return `${monthNames[Number(month) - 1]} ${Number(year) + 543}`;
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

function summarizeSelection(
  items: { id: string; name: string }[],
  selectedIds: string[],
  fallback: string,
) {
  if (selectedIds.length === 0) {
    return fallback;
  }

  const names = items.filter((item) => selectedIds.includes(item.id)).map((item) => item.name);
  return names.length <= 3 ? names.join(", ") : `${names.length} ร้านค้า`;
}

function buildPageHref(params: {
  fromDate: string;
  toDate: string;
  selectedStoreIds: string[];
  page: number;
}) {
  const nextParams = new URLSearchParams({
    from: params.fromDate,
    to: params.toDate,
    page: String(params.page),
  });

  if (params.selectedStoreIds.length > 0) {
    nextParams.set("stores", params.selectedStoreIds.join(","));
  }

  return `/reports/profit-sales-detailed?${nextParams.toString()}`;
}

interface PrintablePage {
  groups: {
    store: DetailedProfitStoreGroup;
    items: DetailedProfitProductItem[];
    isFirstPageOfStore: boolean;
    isLastPageOfStore: boolean;
  }[];
}

function paginateDetailedReport(stores: DetailedProfitStoreGroup[], maxRowsPerPage = 38): PrintablePage[] {
  const pages: PrintablePage[] = [];
  let currentPageGroups: PrintablePage["groups"] = [];
  let currentPageRowCount = 0;

  for (const store of stores) {
    let itemsRemaining = [...store.items];
    let isFirst = true;

    while (itemsRemaining.length > 0) {
      const headerCost = isFirst ? 1 : 0;
      let availableRows = maxRowsPerPage - currentPageRowCount - headerCost;

      if (availableRows < 2) {
        if (currentPageGroups.length > 0) {
          pages.push({ groups: currentPageGroups });
          currentPageGroups = [];
          currentPageRowCount = 0;
        }
        availableRows = maxRowsPerPage - 1;
      }

      const summaryCost = 1;
      const totalNeeded = itemsRemaining.length + summaryCost;

      if (totalNeeded <= availableRows) {
        currentPageGroups.push({
          store,
          items: itemsRemaining,
          isFirstPageOfStore: isFirst,
          isLastPageOfStore: true,
        });
        currentPageRowCount += headerCost + itemsRemaining.length + summaryCost;
        itemsRemaining = [];
      } else {
        const itemsToTakeCount = Math.max(1, availableRows);
        const itemsToTake = itemsRemaining.slice(0, itemsToTakeCount);

        currentPageGroups.push({
          store,
          items: itemsToTake,
          isFirstPageOfStore: isFirst,
          isLastPageOfStore: false,
        });
        currentPageRowCount += headerCost + itemsToTake.length;
        itemsRemaining = itemsRemaining.slice(itemsToTakeCount);
        isFirst = false;

        pages.push({ groups: currentPageGroups });
        currentPageGroups = [];
        currentPageRowCount = 0;
      }
    }
  }

  if (currentPageGroups.length > 0) {
    pages.push({ groups: currentPageGroups });
  }

  return pages;
}

export default async function Page({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<PageLoader />}>
      <DetailedProfitContent searchParams={searchParams} />
    </Suspense>
  );
}

async function DetailedProfitContent({ searchParams }: PageProps) {
  const session = await requireAppSession();
  const params = await searchParams;

  const today = getTodayInBangkok();
  const defaultFrom = firstOfMonth(today);
  const fromDate = params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from) ? params.from : defaultFrom;
  const toDate = params.to && /^\d{4}-\d{2}-\d{2}$/.test(params.to) ? params.to : today;
  const selectedStoreIds = params.stores ? params.stores.split(",").filter(Boolean) : [];
  const requestedPage = params.page ? Number.parseInt(params.page, 10) : 1;
  const currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const [report, printReport, customers] = await Promise.all([
    getDetailedProfitSalesReport({
      organizationId: session.organizationId,
      fromDate,
      toDate,
      customerIds: selectedStoreIds,
      page: currentPage,
    }),
    getDetailedProfitSalesPrintReport({
      organizationId: session.organizationId,
      fromDate,
      toDate,
      customerIds: selectedStoreIds,
    }),
    getCustomersForFilter(session.organizationId),
  ]);

  const selectedStoreLabel = summarizeSelection(customers, selectedStoreIds, "ทุกร้านค้า");
  const printedAt = formatPrintedAt(new Date());
  const reportPeriodThai = formatMonthYearThai(fromDate);
  const printablePages = printReport.stores.length > 0 ? paginateDetailedReport(printReport.stores, 38) : [];
  const currentUnits =
    Array.from(new Set(report.stores.flatMap((store) => store.items.map((item) => item.unit)).filter(Boolean))).join(
      ", ",
    ) || "หน่วย";
  const printableUnits =
    Array.from(
      new Set(printReport.stores.flatMap((store) => store.items.map((item) => item.unit)).filter(Boolean)),
    ).join(", ") || "หน่วย";
  const currentDateLabel = report.pagination.currentDate ? formatDateThai(report.pagination.currentDate) : "-";

  return (
    <AppSidebarLayout>
      <div className="min-h-screen bg-[#f8f9ff] text-[#0b1c30] print:bg-white print:text-black">
        <div className="mx-auto max-w-[1600px] px-6 py-8 no-print">
          <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <nav className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#45464d]">
                <span>Analytics</span>
                <span className="text-slate-300">›</span>
                <span className="text-[#000000]">รายงานสินค้าและกำไรแยกตามสาขา</span>
              </nav>
              <h1 className="text-[28px] font-bold leading-9 tracking-tight text-[#0b1c30]">
                รายงานสินค้าและกำไรแยกตามสาขา
              </h1>
              <p className="mt-1 text-[14px] text-[#45464d]">
                แสดงทีละ 1 วันต่อหน้า และพิมพ์หรือบันทึกรูปได้ครบทั้งช่วงวันที่เลือก
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                disabled
                className="cursor-not-allowed rounded-[4px] border border-[#c6c6cd] bg-white px-4 py-2 text-[12px] font-semibold uppercase tracking-wider text-[#0b1c30] opacity-50 transition hover:bg-[#eff4ff]"
              >
                <span className="flex items-center gap-1.5">
                  <FileSpreadsheet className="h-4 w-4 text-[#006c49]" />
                  Export Excel
                </span>
              </button>
              <PrintButton
                targetId="detailed-print-area"
                fileName={`รายงานสินค้าและกำไรแยกตามสาขา_${fromDate}_${toDate}`}
                hidePrintOnMobile
              />
            </div>
          </header>

          <MobileSearchDrawer title="ค้นหารายงานกำไรขายแบบละเอียด">
            <ReportGetForm action="/reports/profit-sales-detailed" className="flex flex-col gap-4 pb-32">
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-[#45464d]">
                  ร้านค้า
                </label>
                <StoreFilter customers={customers} selectedIds={selectedStoreIds} />
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-[#45464d]">
                  ช่วงวันที่
                </label>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <ThaiDatePicker
                      id="m-detailed-from"
                      name="from"
                      defaultValue={fromDate}
                      max={today}
                      placeholder="วันเริ่มต้น"
                      compact
                      matchFieldHeight
                    />
                  </div>
                  <span className="shrink-0 text-slate-300">—</span>
                  <div className="min-w-0 flex-1">
                    <ThaiDatePicker
                      id="m-detailed-to"
                      name="to"
                      defaultValue={toDate}
                      max={today}
                      placeholder="วันสิ้นสุด"
                      compact
                      matchFieldHeight
                    />
                  </div>
                </div>
              </div>
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-[4px] bg-[#131b2e] py-3 text-[14px] font-semibold text-white transition hover:opacity-90"
              >
                <Filter className="h-4 w-4" />
                ค้นหา
              </button>
            </ReportGetForm>
          </MobileSearchDrawer>

          <section className="mb-6 hidden rounded-[4px] border border-[#c6c6cd] bg-white md:block">
            <div className="px-4 py-4">
              <ReportGetForm
                action="/reports/profit-sales-detailed"
                className="flex flex-col gap-4 lg:flex-row lg:items-end"
              >
                <div className="w-full sm:min-w-[240px] sm:flex-1">
                  <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-[#45464d]">
                    ร้านค้า
                  </label>
                  <StoreFilter customers={customers} selectedIds={selectedStoreIds} />
                </div>
                <div className="min-w-[420px] flex-1">
                  <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-[#45464d]">
                    ช่วงวันที่
                  </label>
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <ThaiDatePicker
                        id="detailed-from"
                        name="from"
                        defaultValue={fromDate}
                        max={today}
                        placeholder="วันเริ่มต้น"
                        compact
                        matchFieldHeight
                      />
                    </div>
                    <span className="shrink-0 text-slate-300">—</span>
                    <div className="min-w-0 flex-1">
                      <ThaiDatePicker
                        id="detailed-to"
                        name="to"
                        defaultValue={toDate}
                        max={today}
                        placeholder="วันสิ้นสุด"
                        compact
                        matchFieldHeight
                      />
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="submit"
                    className="flex h-10 items-center justify-center gap-1.5 rounded-[4px] bg-[#131b2e] px-5 text-[12px] font-semibold uppercase tracking-wider text-white transition hover:opacity-90"
                  >
                    <Filter className="h-4 w-4" />
                    ค้นหา
                  </button>
                  <Link
                    href="/reports/profit-sales-detailed"
                    className="flex h-10 items-center justify-center rounded-[4px] border border-[#c6c6cd] bg-white px-4 text-[12px] font-semibold uppercase tracking-wider text-[#0b1c30] transition hover:bg-[#eff4ff]"
                  >
                    ล้างตัวกรอง
                  </Link>
                </div>
              </ReportGetForm>
            </div>
          </section>

          <div className="mb-4 flex flex-col gap-3 rounded-[4px] border border-[#d8e0f4] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-[#45464d]">
              <p className="font-semibold text-[#0b1c30]">
                วันที่ {currentDateLabel} · หน้า {report.pagination.page} / {report.pagination.totalPages}
              </p>
              <p>
                วันนี้มีใบจัดส่ง {report.pagination.currentDateOrderCount} ใบ
                {selectedStoreIds.length > 0 ? ` · ${selectedStoreLabel}` : ""}
              </p>
            </div>
            {report.pagination.totalPages > 1 ? (
              <div className="flex items-center gap-2">
                <Link
                  href={buildPageHref({
                    fromDate,
                    toDate,
                    selectedStoreIds,
                    page: Math.max(1, report.pagination.page - 1),
                  })}
                  className={`flex h-9 items-center gap-1 rounded-[4px] border px-3 text-sm font-semibold transition ${
                    report.pagination.page === 1
                      ? "pointer-events-none border-slate-200 text-slate-300"
                      : "border-[#c6c6cd] bg-white text-[#0b1c30] hover:bg-[#eff4ff]"
                  }`}
                >
                  <ChevronLeft className="h-4 w-4" />
                  ก่อนหน้า
                </Link>
                <Link
                  href={buildPageHref({
                    fromDate,
                    toDate,
                    selectedStoreIds,
                    page: Math.min(report.pagination.totalPages, report.pagination.page + 1),
                  })}
                  className={`flex h-9 items-center gap-1 rounded-[4px] border px-3 text-sm font-semibold transition ${
                    report.pagination.page === report.pagination.totalPages
                      ? "pointer-events-none border-slate-200 text-slate-300"
                      : "border-[#c6c6cd] bg-white text-[#0b1c30] hover:bg-[#eff4ff]"
                  }`}
                >
                  ถัดไป
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            ) : null}
          </div>

          <div className="mb-6 hidden overflow-hidden rounded-[4px] border border-[#c6c6cd] bg-white md:block">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-[#c6c6cd] bg-[#eff4ff]">
                    <th className="w-[10%] px-4 py-2.5 text-[14px] font-extrabold text-black">รหัสสินค้า</th>
                    <th className="w-[22%] px-4 py-2.5 text-[14px] font-extrabold text-black">รายการสินค้า</th>
                    <th className="w-[8%] px-4 py-2.5 text-right text-[14px] font-extrabold text-black">จำนวน</th>
                    <th className="w-[8%] px-4 py-2.5 text-[14px] font-extrabold text-black">หน่วย</th>
                    <th className="w-[12%] px-4 py-2.5 text-right text-[14px] font-extrabold text-black">
                      ต้นทุน/หน่วย (฿)
                    </th>
                    <th className="w-[12%] px-4 py-2.5 text-right text-[14px] font-extrabold text-black">
                      ต้นทุนรวม (฿)
                    </th>
                    <th className="w-[12%] px-4 py-2.5 text-right text-[14px] font-extrabold text-black">
                      จำนวนเงิน (฿)
                    </th>
                    <th className="w-[10%] px-4 py-2.5 text-right text-[14px] font-extrabold text-black">
                      กำไร (฿)
                    </th>
                    <th className="w-[8%] px-4 py-2.5 text-right text-[14px] font-extrabold text-black">
                      กำไร%
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#c6c6cd]/50 text-[14px] font-normal">
                  {report.stores.length > 0 ? (
                    report.stores.map((store) => (
                      <Suspense key={`${store.deliveryDate}-${store.deliveryNumber}`}>
                        <tr className="border-b border-[#c6c6cd] bg-[#dce9ff]/30">
                          <td colSpan={9} className="px-4 py-2.5 text-[14px] font-black text-[#0b1c30]">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span>วันที่: {formatDateThai(store.deliveryDate)}</span>
                              <span className="font-normal text-slate-400">|</span>
                              <span>เลขที่ใบจัดส่ง: {store.deliveryNumber}</span>
                              <span className="font-normal text-slate-400">|</span>
                              <span className="flex shrink-0 items-center gap-1.5 text-[#0b1c30]">
                                <Store className="inline h-4.5 w-4.5 text-[#131b2e]" />
                                <span>
                                  {store.customerCode} - {store.customerName}
                                </span>
                              </span>
                            </div>
                          </td>
                        </tr>
                        {store.items.map((item) => (
                          <tr
                            key={`${store.deliveryNumber}-${item.productSku}-${item.productName}-${item.unit}`}
                            className="border-b border-[#c6c6cd]/30 transition-colors hover:bg-[#eff4ff]/30"
                          >
                            <td className="px-4 py-2 font-mono font-medium text-slate-500">{item.productSku}</td>
                            <td className="px-4 py-2 font-semibold text-[#0b1c30]">{item.productName}</td>
                            <td className="px-4 py-2 text-right font-mono font-medium text-[#0b1c30]">
                              {item.quantity.toLocaleString("th-TH")}
                            </td>
                            <td className="px-4 py-2 text-slate-600">{item.unit}</td>
                            <td className="px-4 py-2 text-right font-mono text-slate-500">
                              {formatMoney(item.costPrice)}
                            </td>
                            <td className="px-4 py-2 text-right font-mono text-slate-500">
                              {formatMoney(item.costPrice * item.quantity)}
                            </td>
                            <td className="px-4 py-2 text-right font-mono font-medium text-[#0b1c30]">
                              {formatMoney(item.salesAmount)}
                            </td>
                            <td
                              className={`px-4 py-2 text-right font-mono font-semibold ${
                                item.profit >= 0 ? "text-[#006c49]" : "text-[#ba1a1a]"
                              }`}
                            >
                              {formatMoney(item.profit)}
                            </td>
                            <td
                              className={`px-4 py-2 text-right font-mono font-bold ${
                                item.marginPercent >= 0 ? "text-[#006c49]" : "text-[#ba1a1a]"
                              }`}
                            >
                              {formatPercent(item.marginPercent)}
                            </td>
                          </tr>
                        ))}
                        <tr className="border-b border-[#c6c6cd] bg-white">
                          <td colSpan={2} className="px-4 py-2.5 text-right text-[15px] font-black text-black">
                            ยอดรวม | {store.deliveryNumber}:
                          </td>
                          <td className="bg-white px-4 py-2.5 text-right font-mono text-[15px] font-black text-[#0b1c30]">
                            {store.totalQuantity.toLocaleString("th-TH")}
                          </td>
                          <td className="bg-white px-4 py-2.5 text-[14px] font-bold text-slate-600">
                            {Array.from(new Set(store.items.map((item) => item.unit).filter(Boolean))).join(", ") ||
                              "หน่วย"}
                          </td>
                          <td className="bg-white px-4 py-2.5" />
                          <td className="bg-white px-4 py-2.5 text-right font-mono text-[15px] font-black text-slate-500">
                            {formatMoney(store.totalCost)}
                          </td>
                          <td className="bg-white px-4 py-2.5 text-right font-mono text-[15px] font-black text-black">
                            {formatMoney(store.totalSales)}
                          </td>
                          <td className="bg-white px-4 py-2.5 text-right font-mono text-[15px] font-black text-[#006c49]">
                            {formatMoney(store.totalProfit)}
                          </td>
                          <td className="bg-white px-4 py-2.5 text-right font-mono text-[15px] font-black text-[#006c49]">
                            {formatPercent(store.avgMarginPercent)}
                          </td>
                        </tr>
                      </Suspense>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="bg-white px-4 py-8 text-center font-medium text-slate-400">
                        ไม่พบข้อมูลในช่วงวันที่หรือร้านค้าที่เลือก
                      </td>
                    </tr>
                  )}
                </tbody>
                {report.stores.length > 0 ? (
                  <tfoot>
                    <tr className="border-b border-[#c6c6cd] border-t-2 bg-[#eff4ff] text-[#0b1c30]">
                      <td colSpan={2} className="px-4 py-4 text-right text-[16px] font-black tracking-wider text-black">
                        ยอดรวมทั้งหมด ({reportPeriodThai}):
                      </td>
                      <td className="px-4 py-4 text-right font-mono text-[16px] font-black text-black">—</td>
                      <td className="bg-[#eff4ff] px-4 py-4 text-[15px] font-bold text-slate-600">{currentUnits}</td>
                      <td className="bg-[#eff4ff] px-4 py-4" />
                      <td className="px-4 py-4 text-right font-mono text-[16px] font-black text-slate-600">
                        {formatMoney(report.summary.totalCost)}
                      </td>
                      <td className="px-4 py-4 text-right font-mono text-[17px] font-black text-black">
                        {formatMoney(report.summary.totalSales)}
                      </td>
                      <td className="px-4 py-4 text-right font-mono text-[17px] font-black text-[#006c49]">
                        {formatMoney(report.summary.totalNetProfit)}
                      </td>
                      <td className="px-4 py-4 text-right font-mono text-[17px] font-black text-[#006c49]">
                        {formatPercent(report.summary.avgMarginPercent)}
                      </td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </div>

          <div className="mb-6 md:hidden">
            {report.stores.length > 0 ? (
              report.stores.map((store) => {
                const storeUnits =
                  Array.from(new Set(store.items.map((item) => item.unit).filter(Boolean))).join(", ") || "หน่วย";

                return (
                  <MobileStoreCard
                    key={`${store.deliveryDate}-${store.deliveryNumber}`}
                    store={store}
                    storeUnits={storeUnits}
                  />
                );
              })
            ) : (
              <div className="rounded-[4px] border border-[#c6c6cd] bg-white p-6 text-center font-medium text-slate-400">
                ไม่พบข้อมูลในช่วงวันที่หรือร้านค้าที่เลือก
              </div>
            )}
          </div>

          <footer className="mt-8 flex flex-col justify-between gap-3 text-[12px] font-semibold text-[#45464d] sm:flex-row sm:items-center">
            <p>รายงานนี้สร้างขึ้นโดยระบบอัตโนมัติเมื่อวันที่ {printedAt.datePart} เวลา {printedAt.timePart} น.</p>
          </footer>
        </div>

        <div
          id="detailed-print-area"
          className="pointer-events-none fixed -left-[9999px] top-0 opacity-0 print:pointer-events-auto print:static print:block print:opacity-100"
        >
          {printablePages.length === 0 ? (
            <div data-print-page="true" className={`${styles.printArea} ${styles.printPage}`}>
              <div>
                <div className={styles.printHeader}>
                  <div className="mb-1 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Image
                        src="/ty-noodles-logo-cropped.png"
                        alt="T&Y Noodle"
                        width={40}
                        height={40}
                        className="h-10 w-10 object-contain"
                      />
                      <div>
                        <p className="text-sm font-black leading-tight text-[#003366]">T&Y Noodle</p>
                        <p className="text-[10px] font-semibold text-slate-500">ระบบรายงานผลกำไรจากการขายสินค้า</p>
                      </div>
                    </div>
                    <div className="text-right text-[10px] font-semibold text-slate-500">
                      <p>วันที่พิมพ์: {printedAt.datePart}</p>
                      <p>เวลา: {printedAt.timePart} น.</p>
                      <p>หน้า: 1 / 1</p>
                    </div>
                  </div>
                  <p className="mt-2 text-base font-black text-[#003366]">รายงานสินค้าและกำไรแยกตามสาขา</p>
                  <p className="text-xs font-semibold text-slate-600">
                    ช่วงวันที่ {formatDateThai(fromDate)} — {formatDateThai(toDate)}
                    {selectedStoreIds.length > 0 ? ` · ${selectedStoreLabel}` : ""}
                  </p>
                </div>
                <div className="mt-8 rounded-[4px] border border-slate-200/50 bg-slate-50/50 py-12 text-center text-[11px] font-medium text-slate-400">
                  ไม่พบข้อมูลในช่วงวันที่หรือร้านค้าที่เลือก
                </div>
              </div>
              <div className={styles.printFooter}>พิมพ์จากระบบรายงานวิเคราะห์อัตรากำไรอัตโนมัติ (T&Y Noodle Corporate HQ) - หน้า 1 / 1</div>
            </div>
          ) : (
            printablePages.map((page, pageIndex) => (
              <div key={pageIndex} data-print-page="true" className={`${styles.printArea} ${styles.printPage}`}>
                <div>
                  <div className={styles.printHeader}>
                    <div className="mb-1 flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Image
                          src="/ty-noodles-logo-cropped.png"
                          alt="T&Y Noodle"
                          width={40}
                          height={40}
                          className="h-10 w-10 object-contain"
                        />
                        <div>
                          <p className="text-sm font-black leading-tight text-[#003366]">T&Y Noodle</p>
                          <p className="text-[10px] font-semibold text-slate-500">ระบบรายงานผลกำไรจากการขายสินค้า</p>
                        </div>
                      </div>
                      <div className="text-right text-[10px] font-semibold text-slate-500">
                        <p>วันที่พิมพ์: {printedAt.datePart}</p>
                        <p>เวลา: {printedAt.timePart} น.</p>
                        <p>หน้า: {pageIndex + 1} / {printablePages.length}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-base font-black text-[#003366]">รายงานสินค้าและกำไรแยกตามสาขา</p>
                    <p className="text-xs font-semibold text-slate-600">
                      ช่วงวันที่ {formatDateThai(fromDate)} — {formatDateThai(toDate)}
                      {selectedStoreIds.length > 0 ? ` · ${selectedStoreLabel}` : ""}
                    </p>
                  </div>

                  <table className="w-full border-collapse text-left text-[10px]">
                    <thead>
                      <tr className="border-b-2 border-[#8ba9db] bg-[#eff4ff]">
                        <th className="w-[10%] px-2 py-2 text-[11px] font-extrabold text-black">รหัสสินค้า</th>
                        <th className="w-[22%] px-2 py-2 text-[11px] font-extrabold text-black">รายการสินค้า</th>
                        <th className="w-[8%] px-2 py-2 text-right text-[11px] font-extrabold text-black">จำนวน</th>
                        <th className="w-[8%] px-2 py-2 text-[11px] font-extrabold text-black">หน่วย</th>
                        <th className="w-[11%] px-2 py-2 text-right text-[11px] font-extrabold text-black">ต้นทุน/หน่วย (฿)</th>
                        <th className="w-[11%] px-2 py-2 text-right text-[11px] font-extrabold text-black">ต้นทุนรวม (฿)</th>
                        <th className="w-[11%] px-2 py-2 text-right text-[11px] font-extrabold text-black">จำนวนเงิน (฿)</th>
                        <th className="w-[10%] px-2 py-2 text-right text-[11px] font-extrabold text-black">กำไร (฿)</th>
                        <th className="w-[9%] px-2 py-2 text-right text-[11px] font-extrabold text-black">กำไร%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#c6c6cd]/30">
                      {page.groups.map((group, groupIndex) => (
                        <Suspense key={`${group.store.deliveryNumber}-${groupIndex}`}>
                          {group.isFirstPageOfStore ? (
                            <tr className="border-y border-[#abbfdc] bg-[#f0f5ff]">
                              <td colSpan={9} className="px-2.5 py-2 text-[10.5px] font-black text-[#0b1c30]">
                                <div className="flex items-center justify-between">
                                  <div>
                                    วันที่: {formatDateThai(group.store.deliveryDate)}
                                    <span className="mx-2 font-normal text-[#8ba9db]">|</span>
                                    เลขที่ใบจัดส่ง: {group.store.deliveryNumber}
                                    <span className="mx-2 font-normal text-[#8ba9db]">|</span>
                                    ร้านค้า: {group.store.customerCode} - {group.store.customerName}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                          {group.items.map((item) => (
                            <tr
                              key={`${group.store.deliveryNumber}-${item.productSku}-${item.productName}-${item.unit}`}
                              className="hover:bg-slate-50/50"
                            >
                              <td className="px-2 py-1 font-mono text-slate-500">{item.productSku}</td>
                              <td className="px-2 py-1 font-semibold text-[#0b1c30]">{item.productName}</td>
                              <td className="px-2 py-1 text-right font-mono text-[#0b1c30]">
                                {item.quantity.toLocaleString("th-TH")}
                              </td>
                              <td className="px-2 py-1 text-slate-600">{item.unit}</td>
                              <td className="px-2 py-1 text-right font-mono text-slate-500">{formatMoney(item.costPrice)}</td>
                              <td className="px-2 py-1 text-right font-mono text-slate-500">{formatMoney(item.costPrice * item.quantity)}</td>
                              <td className="px-2 py-1 text-right font-mono text-[#0b1c30]">{formatMoney(item.salesAmount)}</td>
                              <td className={`px-2 py-1 text-right font-mono font-bold ${item.profit >= 0 ? "text-[#006c49]" : "text-[#ba1a1a]"}`}>
                                {formatMoney(item.profit)}
                              </td>
                              <td className={`px-2 py-1 text-right font-mono font-bold ${item.marginPercent >= 0 ? "text-[#006c49]" : "text-[#ba1a1a]"}`}>
                                {formatPercent(item.marginPercent)}
                              </td>
                            </tr>
                          ))}
                          {group.isLastPageOfStore ? (
                            <tr className="border-b border-[#c6c6cd] bg-slate-50">
                              <td colSpan={2} className="px-2 py-1.5 text-right text-[11px] font-black text-black">
                                ยอดรวม | {group.store.deliveryNumber}:
                              </td>
                              <td className="bg-slate-50 px-2 py-1.5 text-right font-mono text-[11px] font-black text-slate-900">
                                {group.store.totalQuantity.toLocaleString("th-TH")}
                              </td>
                              <td className="bg-slate-50 px-2 py-1.5 text-[10px] font-bold text-slate-600">
                                {Array.from(new Set(group.store.items.map((item) => item.unit).filter(Boolean))).join(", ") || "หน่วย"}
                              </td>
                              <td className="bg-slate-50 px-2 py-1.5" />
                              <td className="bg-slate-50 px-2 py-1.5 text-right font-mono text-[11px] font-black text-slate-600">
                                {formatMoney(group.store.totalCost)}
                              </td>
                              <td className="bg-slate-50 px-2 py-1.5 text-right font-mono text-[11px] font-black text-slate-900">
                                {formatMoney(group.store.totalSales)}
                              </td>
                              <td className="bg-slate-50 px-2 py-1.5 text-right font-mono text-[11px] font-black text-[#006c49]">
                                {formatMoney(group.store.totalProfit)}
                              </td>
                              <td className="bg-slate-50 px-2 py-1.5 text-right font-mono text-[11px] font-black text-[#006c49]">
                                {formatPercent(group.store.avgMarginPercent)}
                              </td>
                            </tr>
                          ) : null}
                        </Suspense>
                      ))}
                    </tbody>
                    {pageIndex === printablePages.length - 1 ? (
                      <tfoot>
                        <tr className="border-b border-[#8ba9db] border-t-2 bg-[#eff4ff] text-[11px] font-bold text-[#0b1c30]">
                          <td colSpan={2} className="px-2 py-2 text-right font-black text-black">
                            ยอดรวมทั้งหมด ({reportPeriodThai}):
                          </td>
                          <td className="px-2 py-2 text-right font-mono font-black text-black">—</td>
                          <td className="bg-[#eff4ff] px-2 py-2 text-[10px] font-bold text-slate-600">{printableUnits}</td>
                          <td className="bg-[#eff4ff] px-2 py-2" />
                          <td className="px-2 py-2 text-right font-mono font-black text-slate-600">
                            {formatMoney(printReport.summary.totalCost)}
                          </td>
                          <td className="px-2 py-2 text-right font-mono font-black text-black">
                            {formatMoney(printReport.summary.totalSales)}
                          </td>
                          <td className="px-2 py-2 text-right font-mono font-black text-[#006c49]">
                            {formatMoney(printReport.summary.totalNetProfit)}
                          </td>
                          <td className="px-2 py-2 text-right font-mono font-black text-[#006c49]">
                            {formatPercent(printReport.summary.avgMarginPercent)}
                          </td>
                        </tr>
                      </tfoot>
                    ) : null}
                  </table>
                </div>

                <div className={styles.printFooter}>
                  พิมพ์จากระบบรายงานวิเคราะห์อัตรากำไรอัตโนมัติ (T&Y Noodle Corporate HQ) - หน้า {pageIndex + 1} / {printablePages.length}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AppSidebarLayout>
  );
}
