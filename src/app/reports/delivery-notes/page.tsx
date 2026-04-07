import Image from "next/image";
import Link from "next/link";
import { BadgeDollarSign, Building2, ChevronLeft, ChevronRight, FileSearch, Filter, Landmark, Package, PackageOpen, ReceiptText, ScrollText } from "lucide-react";
import { AppSidebarLayout } from "@/components/app-sidebar";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { requireAppSession } from "@/lib/auth/authorization";
import { getTodayInBangkok } from "@/lib/orders/date";
import { getCustomersForDeliveryNoteReport, getDeliveryNotesReport, type DeliveryNoteReportRow } from "@/lib/reports/delivery-notes";
import styles from "./print.module.css";
import { PrintButton } from "../product-sales/print-button";
import { StoreFilter } from "../product-sales/store-filter";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";

export const metadata = { title: "รายงานใบจัดส่งรายวัน" };

const PAGE_SIZE = 20;

function firstOfMonth(iso: string) {
  return iso.slice(0, 7) + "-01";
}

function fmt(n: number) {
  return n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

function fmtMoney(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " บาท";
}

function fmtMoneyCompact(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPercent(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + "%";
}

function isoToDisplay(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${parseInt(y, 10) + 543}`;
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

function summarizeSelection(items: { id: string; name: string }[], selectedIds: string[], fallback: string) {
  if (selectedIds.length === 0) return fallback;

  const selectedNames = items.filter((item) => selectedIds.includes(item.id)).map((item) => item.name);
  if (selectedNames.length <= 3) return selectedNames.join(", ");
  return `${selectedNames.length} รายการ`;
}

function groupRowsByDate(rows: DeliveryNoteReportRow[]) {
  const groups = new Map<string, DeliveryNoteReportRow[]>();
  for (const row of rows) {
    const bucket = groups.get(row.deliveryDate) ?? [];
    bucket.push(row);
    groups.set(row.deliveryDate, bucket);
  }
  return Array.from(groups.entries()).map(([date, items]) => ({ date, items }));
}

function sumGroup(items: DeliveryNoteReportRow[]) {
  return items.reduce(
    (acc, item) => {
      acc.totalCost += item.totalCost;
      acc.totalRevenue += item.totalRevenue;
      acc.netProfit += item.netProfit;
      return acc;
    },
    { totalCost: 0, totalRevenue: 0, netProfit: 0 },
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(27,27,33,0.05)] transition-shadow hover:shadow-[0_12px_40px_rgba(27,27,33,0.09)] sm:p-5">
      <div className="mb-3 flex items-center justify-center gap-2.5 text-center">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[#003366] sm:h-9 sm:w-9">
          <Icon className="h-4.5 w-4.5" strokeWidth={2} />
        </div>
        <p className="text-sm font-semibold text-slate-500 sm:text-base">{label}</p>
      </div>
      <p className="text-center text-2xl font-black tracking-tight text-[#003366] sm:text-3xl">{value}</p>
    </div>
  );
}

function DeliveryNoteRows({ row }: { row: DeliveryNoteReportRow }) {
  return (
    <>
      <tr className="border-t border-[#003366]/12 bg-slate-50 text-slate-700">
        <td colSpan={8} className="px-4 py-2">
          <div className={`flex flex-wrap items-center gap-x-8 gap-y-2 ${styles.noteMetaWrap}`}>
            <p className={`flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-700 ${styles.noteMetaItem}`}>
              <span className="shrink-0 text-[#003366]">
                <Building2 className="h-4 w-4" strokeWidth={2} />
              </span>

              <span className={`text-base font-bold text-slate-800 ${styles.noteMetaValue}`}>{row.customerCode} {row.customerName}</span>
            </p>
            <p className={`flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-700 ${styles.noteMetaItem}`}>
              <span className="shrink-0 text-[#003366]">
                <ScrollText className="h-4 w-4" strokeWidth={2} />
              </span>

              <span className={`font-mono text-base font-bold text-[#003366] ${styles.noteMetaValue}`}>{row.deliveryNumber}</span>
            </p>
          </div>
        </td>
      </tr>
      {row.lines.map((line) => (
        <tr key={line.id} className="bg-white">
          <td className="px-4 py-2 font-mono text-sm text-slate-400 whitespace-nowrap">{line.productSku}</td>
          <td className="border-l border-[#003366]/10 px-4 py-2">
            <div className={`flex min-w-0 items-center gap-3 ${styles.noteProductCell}`}>
              {line.imageUrl ? (
                <Image
                  src={line.imageUrl}
                  alt={line.productName}
                  width={36}
                  height={36}
                  className="h-9 w-9 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                  <Package className="h-4 w-4 text-slate-400" strokeWidth={1.8} />
                </div>
              )}
              <span className={`text-sm font-semibold text-slate-800 ${styles.noteProductName}`}>{line.productName}</span>
            </div>
          </td>
          <td className="border-l border-[#003366]/10 px-4 py-2 text-center text-sm font-semibold text-slate-700 whitespace-nowrap">{fmt(line.quantityDelivered)}</td>
          <td className="border-l border-[#003366]/10 px-4 py-2 text-center text-sm text-slate-500 whitespace-nowrap">{line.saleUnitLabel}</td>
          <td className="border-l border-[#003366]/10 px-4 py-2 text-center text-sm text-slate-600 whitespace-nowrap">{fmtMoney(line.lineCost)}</td>
          <td className="border-l border-[#003366]/10 px-4 py-2 text-center text-sm font-semibold text-[#003366] whitespace-nowrap">{fmtMoney(line.lineTotal)}</td>
          <td className={`border-l border-[#003366]/10 px-4 py-2 text-center text-sm font-semibold whitespace-nowrap ${line.profit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {fmtMoney(line.profit)}
          </td>
          <td className={`border-l border-[#003366]/10 px-4 py-2 text-center text-sm font-semibold whitespace-nowrap ${line.lineTotal > 0 && line.profit >= 0 ? "text-emerald-600" : "text-slate-500"}`}>
            {line.lineTotal > 0 ? fmtPercent((line.profit / line.lineTotal) * 100) : "0%"}
          </td>
        </tr>
      ))}
      <tr className="bg-slate-50/80">
        <td colSpan={4} className="px-4 py-2 text-right text-sm font-black tracking-[0.02em] text-slate-500 whitespace-nowrap">
          ยอดรวม — {row.customerName}
        </td>
        <td className="border-l border-[#003366]/10 px-4 py-2 text-center text-sm font-bold text-slate-700 whitespace-nowrap">{fmtMoney(row.totalCost)}</td>
        <td className="border-l border-[#003366]/10 px-4 py-2 text-center text-sm font-black text-[#003366] whitespace-nowrap">{fmtMoney(row.totalRevenue)}</td>
        <td className={`border-l border-[#003366]/10 px-4 py-2 text-center text-sm font-black whitespace-nowrap ${row.netProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
          {fmtMoney(row.netProfit)}
        </td>
        <td className={`border-l border-[#003366]/10 px-4 py-2 text-center text-sm font-black whitespace-nowrap ${row.netProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
          {fmtPercent(row.marginPercent)}
        </td>
      </tr>
    </>
  );
}

function DeliveryNoteMobileCard({ row }: { row: DeliveryNoteReportRow }) {
  return (
    <div className="bg-white px-3 py-3.5 sm:px-4">
      <div className="-mx-3 -mt-3.5 flex flex-col items-center gap-2 border-b border-white/15 bg-[#003366] px-3 py-3 text-white sm:-mx-4 sm:px-4">
        <p className="flex min-w-0 items-center justify-center gap-2 text-center text-sm font-semibold text-white">
          <span className="shrink-0 text-white">
            <Building2 className="h-4 w-4" strokeWidth={2} />
          </span>

          <span className="truncate text-base font-bold text-white">{row.customerCode} {row.customerName}</span>
        </p>
        <p className="flex min-w-0 items-center justify-center gap-2 text-center text-sm font-semibold text-white">
          <span className="shrink-0 text-white">
            <ScrollText className="h-4 w-4" strokeWidth={2} />
          </span>

          <span className="truncate font-mono text-base font-bold text-white">{row.deliveryNumber}</span>
        </p>
      </div>

      <div className="mt-3 divide-y divide-[#003366]/18">
        {row.lines.map((line) => (
          <div key={line.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-center gap-3">
              {line.imageUrl ? (
                <Image
                  src={line.imageUrl}
                  alt={line.productName}
                  width={44}
                  height={44}
                  className="h-11 w-11 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                  <Package className="h-5 w-5 text-slate-400" strokeWidth={1.8} />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate font-mono text-sm text-slate-400">{line.productSku}</p>
                <p className="truncate text-base font-bold text-slate-800">{line.productName}</p>
              </div>
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2.5">
              <div className="bg-white px-3 py-2 text-center shadow-[0_8px_18px_rgba(27,27,33,0.1)]">
                <p className="text-sm text-slate-400">จำนวน</p>
                <p className="mt-0.5 text-base font-bold text-slate-800">
                  {fmt(line.quantityDelivered)} <span className="text-sm font-normal text-slate-400">{line.saleUnitLabel}</span>
                </p>
              </div>
              <div className="bg-white px-3 py-2 text-center shadow-[0_8px_18px_rgba(27,27,33,0.1)]">
                <p className="text-sm text-slate-400">ต้นทุน</p>
                <p className="mt-0.5 text-base font-bold text-slate-700">{fmtMoneyCompact(line.lineCost)}</p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
              <div className="bg-white px-3 py-2 text-center shadow-[0_8px_18px_rgba(27,27,33,0.1)]">
                <p className="text-sm text-slate-500">ยอดขาย</p>
                <p className="mt-0.5 text-base font-black text-[#003366]">{fmtMoneyCompact(line.lineTotal)}</p>
              </div>
              <div className={`px-3 py-2 text-center shadow-[0_8px_18px_rgba(27,27,33,0.1)] ${line.profit >= 0 ? "bg-emerald-600" : "bg-red-50"}`}>
                <p className={`text-sm ${line.profit >= 0 ? "text-emerald-100" : "text-slate-500"}`}>กำไร</p>
                <p className={`mt-0.5 inline-flex w-full items-center justify-center gap-1 whitespace-nowrap text-base font-black tracking-tight ${line.profit >= 0 ? "text-white" : "text-red-500"}`}>
                  <span>{fmtMoneyCompact(line.profit)}</span>
                  <span className={line.profit >= 0 ? "text-emerald-100" : "opacity-80"}>
                    ({line.lineTotal > 0 ? fmtPercent((line.profit / line.lineTotal) * 100) : "0%"})
                  </span>
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 border-t border-[#003366]/10 pt-3">
        <div className="rounded-xl border border-[#003366]/12 bg-white px-3 py-2.5 shadow-[0_6px_18px_rgba(27,27,33,0.08)]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-600">ยอดรวมร้าน {row.customerName}</p>
            <p className={`inline-flex items-center gap-1 whitespace-nowrap text-sm font-black tracking-tight ${row.netProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              <span>{fmtMoneyCompact(row.netProfit)}</span>
              <span className="opacity-80">({fmtPercent(row.marginPercent)})</span>
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-white px-2.5 py-2 text-center shadow-[0_8px_18px_rgba(27,27,33,0.1)]">
              <p className="text-[11px] font-medium text-slate-400">ต้นทุน</p>
              <p className="mt-0.5 text-sm font-bold text-slate-700">{fmtMoneyCompact(row.totalCost)}</p>
            </div>
            <div className="bg-white px-2.5 py-2 text-center shadow-[0_8px_18px_rgba(27,27,33,0.1)]">
              <p className="text-[11px] font-medium text-slate-500">ยอดขาย</p>
              <p className="mt-0.5 text-sm font-black text-[#003366]">{fmtMoneyCompact(row.totalRevenue)}</p>
            </div>
            <div className={`rounded-md px-2.5 py-2 text-center ${row.netProfit >= 0 ? "bg-emerald-600" : "bg-red-50"}`}>
              <p className={`text-[11px] font-medium ${row.netProfit >= 0 ? "text-emerald-100" : "text-slate-500"}`}>กำไร</p>
              <p className={`mt-0.5 text-sm font-black ${row.netProfit >= 0 ? "text-white" : "text-red-500"}`}>{fmtMoneyCompact(row.netProfit)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Pagination({
  page,
  total,
  pageSize,
  baseUrl,
}: {
  page: number;
  total: number;
  pageSize: number;
  baseUrl: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const pages: (number | "...")[] = [];
  const around = new Set(
    [1, totalPages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= totalPages),
  );
  const sorted = [...around].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) pages.push("...");
    pages.push(sorted[i]);
  }

  return (
    <div className="flex items-center gap-1.5">
      {page > 1 && (
        <Link
          href={`${baseUrl}&page=${page - 1}`}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 active:scale-95"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2.2} />
        </Link>
      )}
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`e-${i}`} className="px-1 text-base text-slate-400">…</span>
        ) : (
          <Link
            key={p}
            href={`${baseUrl}&page=${p}`}
            className={`flex h-10 w-10 items-center justify-center rounded-xl text-base font-semibold transition ${p === page ? "bg-[#003366] text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
              }`}
          >
            {p}
          </Link>
        ),
      )}
      {page < totalPages && (
        <Link
          href={`${baseUrl}&page=${page + 1}`}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 active:scale-95"
        >
          <ChevronRight className="h-5 w-5" strokeWidth={2.2} />
        </Link>
      )}
    </div>
  );
}

type PageProps = {
  searchParams: Promise<{
    q?: string;
    stores?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
};

export default async function DeliveryNotesReportPage({ searchParams }: PageProps) {
  const session = await requireAppSession();
  const params = await searchParams;

  const today = getTodayInBangkok();
  const defaultFrom = firstOfMonth(today);
  const fromDate = params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from) ? params.from : defaultFrom;
  const toDate = params.to && /^\d{4}-\d{2}-\d{2}$/.test(params.to) ? params.to : today;
  const keyword = params.q?.trim() ?? "";
  const selectedStoreIds = params.stores ? params.stores.split(",").filter(Boolean) : [];
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const [{ rows, summary, total }, customers] = await Promise.all([
    getDeliveryNotesReport({
      organizationId: session.organizationId,
      fromDate,
      toDate,
      customerIds: selectedStoreIds,
      keyword,
      billedOnly: true,
      page,
      pageSize: PAGE_SIZE,
    }),
    getCustomersForDeliveryNoteReport(session.organizationId),
  ]);

  const filterQs = new URLSearchParams({
    ...(keyword ? { q: keyword } : {}),
    ...(selectedStoreIds.length > 0 ? { stores: selectedStoreIds.join(",") } : {}),
    from: fromDate,
    to: toDate,
  }).toString();
  const paginationBase = `/reports/delivery-notes?${filterQs}`;
  const printedAt = formatPrintedAt(new Date());
  const selectedStoreLabel = summarizeSelection(customers, selectedStoreIds, "ทุกร้านค้า");
  const keywordLabel = keyword || "ทั้งหมด";
  const groupedRows = groupRowsByDate(rows);

  return (
    <AppSidebarLayout>
      <div className="min-h-screen bg-slate-50/60">
        <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8">
          <header className="mb-6 sm:mb-8">
            <nav className="mb-2 flex items-center gap-1 text-sm font-medium text-slate-400">
              <span>Analytics</span>
              <span className="text-slate-300">›</span>
              <span className="font-semibold text-[#003366]">รายงานใบจัดส่งรายวัน</span>
            </nav>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#003366] sm:text-3xl">
              รายงานใบจัดส่งรายวัน
            </h1>
          </header>

          <section className="mb-6 grid grid-cols-2 gap-3 sm:mb-8 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            <KpiCard label="ใบจัดส่ง" value={`${fmt(summary.noteCount)} ใบ`} icon={ReceiptText} />
            <KpiCard label="ยอดขายรวม" value={fmtMoney(summary.totalRevenue)} icon={PackageOpen} />
            <KpiCard label="ต้นทุนรวม" value={fmtMoney(summary.totalCost)} icon={Landmark} />
            <KpiCard label="กำไรสุทธิ" value={fmtMoney(summary.netProfit)} icon={BadgeDollarSign} />
          </section>

          {/* Mobile search drawer */}
          <MobileSearchDrawer title="ค้นหารายงานใบจัดส่ง">
            <form method="GET" action="/reports/delivery-notes" className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">ค้นหาเลขใบจัดส่ง</label>
                <div className="relative">
                  <FileSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={2} />
                  <input
                    name="q"
                    defaultValue={keyword}
                    placeholder="เลขใบจัดส่ง หรือชื่อร้าน..."
                    className="w-full rounded-xl border-0 bg-slate-50 py-3.5 pl-9 pr-4 text-base text-slate-800 ring-1 ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#003366]/20"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">ร้านค้า</label>
                <StoreFilter customers={customers} selectedIds={selectedStoreIds} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">ช่วงวันที่</label>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <ThaiDatePicker id="m-dn-from" name="from" defaultValue={fromDate} max={today} placeholder="วันเริ่มต้น" compact matchFieldHeight />
                  </div>
                  <span className="shrink-0 text-slate-300">—</span>
                  <div className="min-w-0 flex-1">
                    <ThaiDatePicker id="m-dn-to" name="to" defaultValue={toDate} max={today} placeholder="วันสิ้นสุด" compact matchFieldHeight />
                  </div>
                </div>
              </div>
              <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#003366] py-3.5 text-base font-bold text-white transition hover:bg-[#1a237e]">
                <Filter className="h-4 w-4" strokeWidth={2} />
                ค้นหา
              </button>
            </form>
          </MobileSearchDrawer>

          <section className="rounded-2xl bg-white shadow-[0_4px_20px_rgba(27,27,33,0.05)]">
            <div className="hidden border-b border-slate-100 px-5 py-4 md:block sm:px-6 sm:py-5">
              <form method="GET" action="/reports/delivery-notes" className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end lg:flex-nowrap">
                <div className="w-full sm:min-w-[220px] sm:flex-1 lg:min-w-[280px] lg:max-w-[360px] lg:flex-[1.05]">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">
                    ค้นหาเลขใบจัดส่ง
                  </label>
                  <div className="relative">
                    <FileSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={2} />
                    <input
                      name="q"
                      defaultValue={keyword}
                      placeholder="เลขใบจัดส่ง หรือชื่อร้าน..."
                      className="w-full rounded-xl border-0 bg-slate-50 py-3 pl-9 pr-4 text-base text-slate-800 ring-1 ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#003366]/20"
                    />
                  </div>
                </div>

                <div className="w-full sm:min-w-[220px] sm:flex-1">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">
                    ร้านค้า
                  </label>
                  <StoreFilter customers={customers} selectedIds={selectedStoreIds} />
                </div>

                <div className="w-full sm:min-w-[300px] sm:flex-1 lg:min-w-[420px] lg:flex-[1.1]">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">
                    ช่วงวันที่
                  </label>
                  <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                    <div className="min-w-0 flex-1">
                      <ThaiDatePicker
                        id="delivery-report-from"
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
                        id="delivery-report-to"
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

                <div className="w-full shrink-0 sm:w-auto">
                  <button
                    type="submit"
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#003366] px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#1a237e] active:scale-95 sm:w-auto"
                  >
                    <Filter className="h-4 w-4" strokeWidth={2} />
                    ค้นหา
                  </button>
                </div>
              </form>
            </div>

            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6 sm:py-5">
              <div>
                <h3 className="text-lg font-bold text-[#003366] sm:text-xl">สรุปรายใบจัดส่งที่วางบิลแล้ว</h3>
                <p className="mt-0.5 text-sm text-slate-400">
                  {isoToDisplay(fromDate)} — {isoToDisplay(toDate)}
                  {selectedStoreIds.length > 0 && ` · ${selectedStoreIds.length} ร้านค้า`}
                </p>
              </div>
              <PrintButton />
            </div>

            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
                <ReceiptText className="h-12 w-12" strokeWidth={1.5} />
                <p className="text-base">ไม่พบข้อมูลในช่วงเวลาที่เลือก</p>
              </div>
            ) : (
              <div className={`space-y-5 px-0 py-4 sm:px-5 sm:py-5 ${styles.printArea}`}>
                <div className={styles.printHeader}>
                  <div className={styles.printHeaderTop}>
                    <div className={styles.printBrand}>
                      <Image
                        src="/ty-noodles-logo-cropped.png"
                        alt="T&Y Noodle"
                        width={64}
                        height={64}
                        sizes="64px"
                        className={styles.printLogo}
                      />
                      <div>
                        <p className={styles.printCompanyName}>T&amp;Y Noodle</p>
                        <p className={styles.printSubtitle}>สรุปรายใบจัดส่ง ต้นทุน ยอดขาย กำไร และอัตรากำไรของแต่ละรายการ</p>
                      </div>
                    </div>
                    <div className={styles.printMeta}>
                      <p>วันที่พิมพ์: {printedAt.datePart}</p>
                      <p>เวลาพิมพ์: {printedAt.timePart} น.</p>
                    </div>
                  </div>
                  <div className={styles.printReportTitleBlock}>
                    <h1 className={styles.printReportTitle}>รายงานใบจัดส่งรายวัน</h1>
                  </div>
                  <div className={styles.printFilters}>
                    <div className={styles.printFilterItem}>
                      <span className={styles.printFilterLabel}>ช่วงวันที่:</span>
                      <span className={styles.printFilterValue}>{isoToDisplay(fromDate)} - {isoToDisplay(toDate)}</span>
                    </div>
                    <div className={styles.printFilterItem}>
                      <span className={styles.printFilterLabel}>ร้านค้า:</span>
                      <span className={styles.printFilterValue}>{selectedStoreLabel}</span>
                    </div>
                    <div className={styles.printFilterItem}>
                      <span className={styles.printFilterLabel}>ค้นหา:</span>
                      <span className={styles.printFilterValue}>{keywordLabel}</span>
                    </div>
                  </div>
                  <div className={styles.printDivider} />
                </div>
                {groupedRows.map((group) => {
                  const totals = sumGroup(group.items);

                  return (
                    <section
                      key={group.date}
                      className={`-mx-0 rounded-none border-y border-[#003366]/12 bg-white shadow-[0_4px_18px_rgba(27,27,33,0.05)] sm:mx-0 sm:rounded-2xl sm:border sm:border-[#003366]/12 ${styles.printDaySection}`}
                    >
                      <div className="lg:hidden print:hidden">
                        <div className="border-b border-[#003366]/12 bg-[#003366] px-4 py-2.5">
                          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-white/85">
                            วันที่ {isoToDisplay(group.date)}
                          </p>
                        </div>
                        <div className="divide-y divide-[#003366]/16">
                          {group.items.map((row) => (
                            <DeliveryNoteMobileCard key={row.id} row={row} />
                          ))}
                        </div>
                        <div className="border-t border-[#003366]/12 bg-[#003366]/[0.03] px-3 py-3 sm:px-4">
                          <div className="rounded-xl border border-[#003366]/12 bg-white px-3 py-2.5 text-slate-800 shadow-[0_8px_20px_rgba(27,27,33,0.1)]">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold">ยอดรวมทั้งวัน {isoToDisplay(group.date)}</p>
                              <p className={`inline-flex items-center gap-1 whitespace-nowrap text-sm font-black tracking-tight ${totals.netProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                <span>{fmtMoneyCompact(totals.netProfit)}</span>
                                <span className="opacity-80">
                                  ({fmtPercent(totals.totalRevenue > 0 ? (totals.netProfit / totals.totalRevenue) * 100 : 0)})
                                </span>
                              </p>
                            </div>
                            <div className="grid grid-cols-3 gap-2.5">
                              <div className="bg-white px-2.5 py-2 text-center shadow-[0_8px_18px_rgba(27,27,33,0.1)]">
                                <p className="text-[11px] font-medium text-slate-400">ต้นทุน</p>
                                <p className="mt-0.5 text-sm font-bold text-slate-700">{fmtMoneyCompact(totals.totalCost)}</p>
                              </div>
                              <div className="bg-white px-2.5 py-2 text-center shadow-[0_8px_18px_rgba(27,27,33,0.1)]">
                                <p className="text-[11px] font-medium text-slate-400">ยอดขาย</p>
                                <p className="mt-0.5 text-sm font-black text-[#003366]">{fmtMoneyCompact(totals.totalRevenue)}</p>
                              </div>
                              <div className={`rounded-md px-2.5 py-2 text-center ${totals.netProfit >= 0 ? "bg-emerald-600" : "bg-red-50"}`}>
                                <p className={`text-[11px] font-medium ${totals.netProfit >= 0 ? "text-emerald-100" : "text-slate-400"}`}>กำไร</p>
                                <p className={`mt-0.5 text-sm font-black ${totals.netProfit >= 0 ? "text-white" : "text-red-500"}`}>{fmtMoneyCompact(totals.netProfit)}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className={`hidden lg:block print:block ${styles.printDesktopSection}`}>
                        <div className={`sticky top-0 z-20 border-b border-[#003366]/12 bg-[#003366] px-4 py-2.5 sm:px-5 ${styles.printDayBar}`}>
                          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-white/85">
                            วันที่ {isoToDisplay(group.date)}
                          </p>
                        </div>
                        <div className={`sticky top-[41px] z-10 border-b border-[#003366]/12 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90 ${styles.printStickyHead}`}>
                          <div className="overflow-x-auto">
                            <table className={`min-w-[980px] w-full border-collapse text-left ${styles.printTable}`}>
                              <colgroup>
                                <col className="w-[140px]" />
                                <col />
                                <col className="w-[90px]" />
                                <col className="w-[90px]" />
                                <col className="w-[130px]" />
                                <col className="w-[130px]" />
                                <col className="w-[130px]" />
                                <col className="w-[110px]" />
                              </colgroup>
                              <thead>
                                <tr className="bg-[#003366]/[0.04]">
                                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.09em] text-slate-600 whitespace-nowrap">รหัสสินค้า</th>
                                  <th className="border-l border-[#003366]/12 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.09em] text-slate-600 whitespace-nowrap">สินค้า</th>
                                  <th className="border-l border-[#003366]/12 px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-[0.09em] text-slate-600 whitespace-nowrap">จำนวน</th>
                                  <th className="border-l border-[#003366]/12 px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-[0.09em] text-slate-600 whitespace-nowrap">หน่วย</th>
                                  <th className="border-l border-[#003366]/12 px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-[0.09em] text-slate-600 whitespace-nowrap">ต้นทุน</th>
                                  <th className="border-l border-[#003366]/12 px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-[0.09em] text-slate-600 whitespace-nowrap">ยอดขาย</th>
                                  <th className="border-l border-[#003366]/12 px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-[0.09em] text-slate-600 whitespace-nowrap">กำไร</th>
                                  <th className="border-l border-[#003366]/12 px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-[0.09em] text-slate-600 whitespace-nowrap">กำไร(%)</th>
                                </tr>
                              </thead>
                            </table>
                          </div>
                        </div>

                        <div className="overflow-x-auto">
                          <table className={`min-w-[980px] w-full border-collapse text-left ${styles.printTable}`}>
                            <colgroup>
                              <col className="w-[140px]" />
                              <col />
                              <col className="w-[90px]" />
                              <col className="w-[90px]" />
                              <col className="w-[130px]" />
                              <col className="w-[130px]" />
                              <col className="w-[130px]" />
                              <col className="w-[110px]" />
                            </colgroup>
                            <tbody className="divide-y divide-[#003366]/10 bg-white">
                              {group.items.map((row) => (
                                <DeliveryNoteRows key={row.id} row={row} />
                              ))}
                              <tr className="bg-[#003366]/[0.04]">
                                <td colSpan={4} className="px-4 py-2 text-right text-sm font-black tracking-[0.02em] text-slate-600">
                                  ยอดรวมของวันที่ — {isoToDisplay(group.date)}
                                </td>
                                <td className="border-l border-[#003366]/10 px-4 py-2 text-center text-sm font-bold text-slate-700">
                                  {fmtMoney(totals.totalCost)}
                                </td>
                                <td className="border-l border-[#003366]/10 px-4 py-2 text-center text-sm font-black text-[#003366]">
                                  {fmtMoney(totals.totalRevenue)}
                                </td>
                                <td className={`border-l border-[#003366]/10 px-4 py-2 text-center text-sm font-black ${totals.netProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                  {fmtMoney(totals.netProfit)}
                                </td>
                                <td className={`border-l border-[#003366]/10 px-4 py-2 text-center text-sm font-black ${totals.netProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                  {fmtPercent(totals.totalRevenue > 0 ? (totals.netProfit / totals.totalRevenue) * 100 : 0)}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </section>
                  );
                })}
                <div className={styles.printFooter}>พิมพ์จากระบบ T&amp;Y Noodle</div>
              </div>
            )}
          </section>

          <div className="mt-5 flex items-center justify-between gap-3">
            <p className="text-sm text-slate-400">
              แสดง {total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} จาก {fmt(total)} ใบจัดส่ง
            </p>
            <Pagination page={page} total={total} pageSize={PAGE_SIZE} baseUrl={paginationBase} />
          </div>
        </div>
      </div>
    </AppSidebarLayout>
  );
}


