import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Package, Filter, ChevronLeft, ChevronRight, Wallet, Boxes, Landmark, BadgeDollarSign } from "lucide-react";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { AppSidebarLayout } from "@/components/app-sidebar";
import { requireAppSession } from "@/lib/auth/authorization";
import { getTodayInBangkok } from "@/lib/orders/date";
import {
  getProductSalesRanking,
  getCustomersForFilter,
  getProductsForFilter,
  type ProductSalesRow,
} from "@/lib/reports/product-sales";
import styles from "./print.module.css";
import { ProductFilter } from "./product-filter";
import { PrintButton } from "./print-button";
import { StoreFilter } from "./store-filter";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";

export const metadata = { title: "รายงานยอดขายตามอันดับสินค้า" };

// Constants

const PAGE_SIZE = 25;

// Helpers

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
  return `${d}/${m}/${parseInt(y) + 543}`;
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

// Sub-components

function RankBadge({ rank }: { rank: number }) {
  const base = "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black text-white shadow-md";
  if (rank === 1)
    return <span className={base} style={{ background: "linear-gradient(135deg,#FFD700 0%,#B8860B 100%)" }}>1</span>;
  if (rank === 2)
    return <span className={base} style={{ background: "linear-gradient(135deg,#C0C0C0 0%,#708090 100%)" }}>2</span>;
  if (rank === 3)
    return <span className={base} style={{ background: "linear-gradient(135deg,#CD7F32 0%,#8B4513 100%)" }}>3</span>;
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-black text-slate-500">
      {rank}
    </span>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  badge,
  badgeStyle,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  badge?: string;
  badgeStyle?: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(27,27,33,0.05)] transition-shadow hover:shadow-[0_12px_40px_rgba(27,27,33,0.09)] sm:p-5">
      <div className="mb-3 flex flex-col items-center justify-center gap-2 text-center">
        <div className="flex items-center justify-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[#003366] sm:h-9 sm:w-9">
            <Icon className="h-4.5 w-4.5" strokeWidth={2} />
          </div>
          <p className="text-sm font-semibold text-slate-500 sm:text-base">{label}</p>
        </div>
        {badge && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold sm:px-2.5 sm:text-sm ${badgeStyle}`}>
            {badge}
          </span>
        )}
      </div>
      <p className="text-center text-2xl font-black tracking-tight text-[#003366] sm:text-3xl">{value}</p>
    </div>
  );
}

// Desktop table row

function ProductRow({ row, globalRank }: { row: ProductSalesRow; globalRank: number }) {
  const netProfit = row.totalRevenue - row.totalCost;
  const profitColor = netProfit >= 0 ? "text-emerald-600" : "text-red-500";
  const margin = row.totalRevenue > 0 ? (netProfit / row.totalRevenue) * 100 : 0;

  return (
    <tr className="transition-colors hover:bg-slate-50/60">
      <td className="px-5 py-4 text-center">
        <RankBadge rank={globalRank} />
      </td>
      <td className="px-4 py-4 text-center font-mono text-sm text-slate-400">{row.sku}</td>
      <td className="px-4 py-4">
        <div className={`flex min-w-0 items-center gap-3 ${styles.printProductCell}`}>
          {row.imageUrl ? (
            <Image
              src={row.imageUrl}
              alt={row.name}
              width={44}
              height={44}
              className="h-11 w-11 shrink-0 rounded-xl object-cover"
            />
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100">
              <Package className="h-5 w-5 text-slate-400" strokeWidth={1.5} />
            </div>
          )}
          <p className={`${styles.printProductName} truncate text-base font-bold text-slate-800`}>{row.name}</p>
        </div>
      </td>
      <td className="px-4 py-4 text-center text-base font-semibold text-slate-800 tabular-nums whitespace-nowrap">
        {fmt(row.totalQty)}
      </td>
      <td className="px-4 py-4 text-center text-base text-slate-500 whitespace-nowrap">{row.unit}</td>
      <td className="px-4 py-4 text-center text-base text-slate-500 tabular-nums whitespace-nowrap">
        {fmtMoney(row.totalCost)}
      </td>
      <td className="px-4 py-4 text-center tabular-nums whitespace-nowrap" style={{ background: "rgba(0,6,102,0.03)" }}>
        <span className="whitespace-nowrap text-base font-black text-[#003366]">{fmtMoney(row.totalRevenue)}</span>
      </td>
      <td className="px-5 py-4 text-center tabular-nums whitespace-nowrap">
        <span className={`inline-flex items-center justify-center whitespace-nowrap text-base font-black ${profitColor}`}>{fmtMoney(netProfit)}</span>
      </td>
      <td className="px-5 py-4 text-center tabular-nums whitespace-nowrap">
        <span className={`inline-flex items-center justify-center whitespace-nowrap text-base font-black ${profitColor}`}>{fmtPercent(margin)}</span>
      </td>
    </tr>
  );
}

// Mobile card

function ProductCard({ row, globalRank }: { row: ProductSalesRow; globalRank: number }) {
  const netProfit = row.totalRevenue - row.totalCost;
  const profitPositive = netProfit >= 0;
  const margin = row.totalRevenue > 0 ? (netProfit / row.totalRevenue) * 100 : 0;
  const rankBadgeStyle =
    globalRank === 1
      ? { background: "linear-gradient(135deg,#FFD700 0%,#B8860B 100%)" }
      : globalRank === 2
        ? { background: "linear-gradient(135deg,#C0C0C0 0%,#708090 100%)" }
        : globalRank === 3
          ? { background: "linear-gradient(135deg,#CD7F32 0%,#8B4513 100%)" }
          : undefined;

  return (
    <div className="bg-white px-3 py-4 sm:px-4">
      {/* Header row: image + rank badge + sku */}
      <div className="-ml-1 flex items-start gap-2.5">
        <div className="relative shrink-0">
          <span
            className={`absolute -left-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black text-white shadow-[0_6px_14px_rgba(27,27,33,0.22)] ${rankBadgeStyle ? "" : "bg-[#003366]"}`}
            style={rankBadgeStyle}
          >
            {globalRank}
          </span>
          {row.imageUrl ? (
            <Image
              src={row.imageUrl}
              alt={row.name}
              width={52}
              height={52}
              className="h-12 w-12 rounded-xl object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
              <Package className="h-5 w-5 text-slate-400" strokeWidth={1.5} />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate font-mono text-sm text-slate-400">{row.sku}</p>
          <p
            className="mt-1 overflow-hidden text-base font-bold leading-5 text-slate-800"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {row.name}
          </p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <div className="bg-white px-4 py-2.5 text-center shadow-[0_8px_18px_rgba(27,27,33,0.1)]">
          <p className="text-sm text-slate-400">จำนวน</p>
          <p className="mt-0.5 text-base font-bold text-slate-800 tabular-nums">
            {fmt(row.totalQty)} <span className="text-sm font-normal text-slate-400">{row.unit}</span>
          </p>
        </div>
        <div className="bg-white px-4 py-2.5 text-center shadow-[0_8px_18px_rgba(27,27,33,0.1)]">
          <p className="text-sm text-slate-400">ต้นทุน</p>
          <p className="mt-0.5 text-base font-bold text-slate-800 tabular-nums">{fmtMoneyCompact(row.totalCost)}</p>
        </div>
      </div>

      {/* Revenue + Profit footer */}
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <div className="bg-white px-4 py-2.5 text-center shadow-[0_8px_18px_rgba(27,27,33,0.1)]">
          <p className="text-sm text-slate-500">จำนวนเงิน</p>
          <p className="mt-0.5 text-base font-black text-[#003366] tabular-nums">{fmtMoneyCompact(row.totalRevenue)}</p>
        </div>
        <div
          className={`px-4 py-2.5 text-center shadow-[0_8px_18px_rgba(27,27,33,0.1)] ${profitPositive ? "bg-emerald-600" : "bg-red-50"}`}
        >
          <p className={`text-sm ${profitPositive ? "text-emerald-100" : "text-slate-500"}`}>กำไรสุทธิ</p>
          <p className={`mt-0.5 text-base font-black leading-tight tracking-tight tabular-nums ${profitPositive ? "text-white" : "text-red-500"}`}>{fmtMoneyCompact(netProfit)}</p>
        </div>
      </div>
      <div className="mt-3">
        <div className={`px-4 py-2.5 text-center shadow-[0_8px_18px_rgba(27,27,33,0.1)] ${profitPositive ? "bg-emerald-50" : "bg-red-50"}`}>
          <p className={`text-sm ${profitPositive ? "text-emerald-700" : "text-slate-500"}`}>กำไร (%)</p>
          <p className={`mt-0.5 text-base font-black leading-tight tabular-nums ${profitPositive ? "text-emerald-700" : "text-red-500"}`}>{fmtPercent(margin)}</p>
        </div>
      </div>
    </div>
  );
}

// Pagination

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
          <span key={`e-${i}`} className="px-1 text-base text-slate-400">...</span>
        ) : (
          <Link
            key={p}
            href={`${baseUrl}&page=${p}`}
            className={`flex h-10 w-10 items-center justify-center rounded-xl text-base font-semibold transition ${p === page
              ? "bg-[#003366] text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100"
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

// Page

type PageProps = {
  searchParams: Promise<{
    q?: string;
    products?: string;
    stores?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
};

export default async function ProductSalesReportPage({ searchParams }: PageProps) {
  const session = await requireAppSession();
  const params = await searchParams;

  const today = getTodayInBangkok();
  const defaultFrom = firstOfMonth(today);

  const fromDate =
    params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from) ? params.from : defaultFrom;
  const toDate =
    params.to && /^\d{4}-\d{2}-\d{2}$/.test(params.to) ? params.to : today;
  const selectedProductIds = params.products ? params.products.split(",").filter(Boolean) : [];
  const selectedStoreIds = params.stores ? params.stores.split(",").filter(Boolean) : [];
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const [{ rows, summary, total }, customers, products] = await Promise.all([
    getProductSalesRanking({
      organizationId: session.organizationId,
      fromDate,
      toDate,
      productIds: selectedProductIds,
      customerIds: selectedStoreIds,
      page,
      pageSize: PAGE_SIZE,
    }),
    getCustomersForFilter(session.organizationId),
    getProductsForFilter(session.organizationId),
  ]);

  const startItem = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(page * PAGE_SIZE, total);

  const filterQs = new URLSearchParams({
    ...(selectedProductIds.length > 0 ? { products: selectedProductIds.join(",") } : {}),
    ...(selectedStoreIds.length > 0 ? { stores: selectedStoreIds.join(",") } : {}),
    from: fromDate,
    to: toDate,
  }).toString();
  const paginationBase = `/reports/product-sales?${filterQs}`;
  const printedAt = formatPrintedAt(new Date());
  const selectedStoreLabel = summarizeSelection(customers, selectedStoreIds, "ทุกร้านค้า");
  const selectedProductLabel = summarizeSelection(products, selectedProductIds, "ทั้งหมด");
  const totalMarginPercent = summary.totalRevenue > 0 ? (summary.netProfit / summary.totalRevenue) * 100 : 0;

  return (
    <AppSidebarLayout>
      <div className="min-h-screen bg-slate-50/60">
        <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8">

          {/* Header */}
          <header className="mb-6 sm:mb-8">
            <nav className="mb-2 flex items-center gap-1 text-sm font-medium text-slate-400">
              <span>Analytics</span>
              <span className="text-slate-300">›</span>
              <span className="font-semibold text-[#003366]">รายงานยอดขายตามอันดับสินค้า</span>
            </nav>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#003366] sm:text-3xl">
              รายงานยอดขายตามอันดับสินค้า
            </h1>
          </header>

          {/* KPI cards */}
          <section className="mb-6 grid grid-cols-2 gap-3 sm:mb-8 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            <KpiCard
              label="ยอดขายรวม"
              value={fmtMoney(summary.totalRevenue)}
              icon={Wallet}
            />
            <KpiCard
              label="จำนวน"
              value={`${fmt(summary.totalQty)} ชิ้น`}
              icon={Boxes}
            />
            <KpiCard
              label="ต้นทุนรวม"
              value={fmtMoney(summary.totalCost)}
              icon={Landmark}
            />
            <KpiCard
              label="กำไรสุทธิ"
              value={fmtMoney(summary.netProfit)}
              icon={BadgeDollarSign}
              badge={summary.netProfit < 0 ? "ขาดทุน" : undefined}
              badgeStyle="bg-red-50 text-red-600"
            />
          </section>

          {/* Table / card section */}
          {/* Mobile search drawer */}
          <MobileSearchDrawer title="ค้นหารายงานยอดขาย">
            <form method="GET" action="/reports/product-sales" className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">สินค้า</label>
                <ProductFilter products={products} selectedIds={selectedProductIds} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">ร้านค้า</label>
                <StoreFilter customers={customers} selectedIds={selectedStoreIds} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">ช่วงวันที่</label>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <ThaiDatePicker id="m-ps-from" name="from" defaultValue={fromDate} max={today} placeholder="วันเริ่มต้น" compact matchFieldHeight />
                  </div>
                  <span className="shrink-0 text-slate-300">—</span>
                  <div className="min-w-0 flex-1">
                    <ThaiDatePicker id="m-ps-to" name="to" defaultValue={toDate} max={today} placeholder="วันสิ้นสุด" compact matchFieldHeight />
                  </div>
                </div>
              </div>
              <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#003366] py-3.5 text-base font-bold text-white transition hover:bg-[#1a237e]">
                <Filter className="h-4 w-4" strokeWidth={2} />
                ค้นหา
              </button>
            </form>
          </MobileSearchDrawer>

          <section className="overflow-hidden rounded-2xl bg-white shadow-[0_4px_20px_rgba(27,27,33,0.05)]">
            <div className="hidden border-b border-slate-100 px-5 py-4 md:block sm:px-6 sm:py-5">
              <form method="GET" action="/reports/product-sales" className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end lg:flex-nowrap">

                {/* Product search */}
                <div className="w-full sm:min-w-[200px] sm:flex-1 lg:min-w-[260px] lg:max-w-[340px] lg:flex-[1.05]">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">
                    สินค้า
                  </label>
                  <ProductFilter products={products} selectedIds={selectedProductIds} />
                </div>

                {/* Store multi-select */}
                <div className="w-full sm:min-w-[200px] sm:flex-1">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">
                    ร้านค้า
                  </label>
                  <StoreFilter customers={customers} selectedIds={selectedStoreIds} />
                </div>

                {/* Date range */}
                <div className="w-full sm:min-w-[300px] sm:flex-1 lg:min-w-[420px] lg:flex-[1.15]">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">
                    ช่วงวันที่
                  </label>
                  <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                    <div className="min-w-0 flex-1">
                      <ThaiDatePicker
                        id="report-date-from"
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
                        id="report-date-to"
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

                {/* Submit */}
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

            {/* Section header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6 sm:py-5">
              <div>
                <h3 className="text-lg font-bold text-[#003366] sm:text-xl">
                  ยอดขายตามสินค้า
                </h3>
                <p className="mt-0.5 text-sm text-slate-400">
                  {isoToDisplay(fromDate)} — {isoToDisplay(toDate)}
                  {selectedStoreIds.length > 0 && ` · ${selectedStoreIds.length} ร้านค้า`}
                </p>
              </div>
              <PrintButton />
            </div>

            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
                <Package className="h-12 w-12" strokeWidth={1.5} />
                <p className="text-base">ไม่พบข้อมูลในช่วงเวลาที่เลือก</p>
              </div>
            ) : (
              <>
                {/* Desktop: table (hidden on mobile) */}
                <div className={`${styles.printArea} hidden overflow-x-auto lg:block print:block print:overflow-visible`}>
                  <div className={styles.printHeader}>
                    <div className={styles.printHeaderTop}>
                      <div className={styles.printBrand}>
                        <Image
                          src="/ty-noodles-logo-cropped.png"
                          alt="T&Y Noodle"
                          width={64}
                          height={64}
                          priority
                          className={styles.printLogo}
                        />
                        <div>
                          <p className={styles.printCompanyName}>T&amp;Y Noodle</p>
                          <p className={styles.printSubtitle}>สรุปยอดขาย ต้นทุน กำไร และอัตรากำไรของสินค้า</p>
                        </div>
                      </div>
                      <div className={styles.printMeta}>
                        <p>วันที่พิมพ์: {printedAt.datePart}</p>
                        <p>เวลาพิมพ์: {printedAt.timePart} น.</p>
                      </div>
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
                        <span className={styles.printFilterLabel}>สินค้า:</span>
                        <span className={styles.printFilterValue}>{selectedProductLabel}</span>
                      </div>
                    </div>
                    <div className={styles.printReportTitleBlock}>
                      <h1 className={styles.printReportTitle}>รายงานยอดขายตามอันดับสินค้า</h1>
                    </div>
                    <div className={styles.printDivider} />
                  </div>
                  <table className="w-full table-fixed border-collapse text-left print:table-fixed">
                    <colgroup>
                      <col style={{ width: "7%" }} />
                      <col style={{ width: "10%" }} />
                      <col style={{ width: "28%" }} />
                      <col style={{ width: "8%" }} />
                      <col style={{ width: "6%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "9%" }} />
                      <col style={{ width: "8%" }} />
                    </colgroup>
                    <thead>
                      <tr className="bg-slate-50/80">
                        {[
                          { label: "ลำดับ", align: "center" },
                          { label: "รหัสสินค้า", align: "center" },
                          { label: "สินค้า", align: "left" },
                          { label: "จำนวน", align: "center" },
                          { label: "หน่วย", align: "center" },
                          { label: "ต้นทุน", align: "center" },
                          { label: "จำนวนเงิน", align: "center", highlight: true },
                          { label: "กำไรสุทธิ", align: "center" },
                          { label: "กำไร (%)", align: "center" },
                        ].map(({ label, align, highlight }) => (
                          <th
                            key={label}
                            className={`whitespace-nowrap px-4 py-4 text-xs font-black uppercase tracking-widest text-slate-400 ${align === "center" ? "text-center" : ""} ${label === "No." ? "pl-5" : ""} ${label === "กำไรสุทธิ" ? "pr-5" : ""}`}
                            style={highlight ? { background: "rgba(0,6,102,0.03)" } : undefined}
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#003366]/24">
                      {rows.map((row, i) => (
                        <ProductRow
                          key={row.productId}
                          row={row}
                          globalRank={(page - 1) * PAGE_SIZE + i + 1}
                        />
                      ))}
                      <tr className="bg-slate-50/90">
                        <td colSpan={5} className="px-5 py-3 text-right text-sm font-bold tracking-[0.02em] text-slate-600 whitespace-nowrap">
                          ยอดรวมทั้งหมด
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-bold text-slate-700 tabular-nums whitespace-nowrap">
                          {fmtMoney(summary.totalCost)}
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums whitespace-nowrap" style={{ background: "rgba(0,6,102,0.05)" }}>
                          <span className="whitespace-nowrap text-sm font-bold text-[#003366]">{fmtMoney(summary.totalRevenue)}</span>
                        </td>
                        <td className={`px-5 py-3 text-center tabular-nums whitespace-nowrap ${summary.netProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                          <span className="inline-flex items-center justify-center whitespace-nowrap text-sm font-bold">{fmtMoney(summary.netProfit)}</span>
                        </td>
                        <td className={`px-5 py-3 text-center tabular-nums whitespace-nowrap ${summary.netProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                          <span className="inline-flex items-center justify-center whitespace-nowrap text-sm font-bold">{fmtPercent(totalMarginPercent)}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <div className={styles.printFooter}>พิมพ์จากระบบ T&amp;Y Noodle</div>
                </div>

                {/* Mobile: cards (hidden on desktop) */}
                <div className="divide-y divide-[#003366]/20 px-2 sm:px-4 lg:hidden">
                  {rows.map((row, i) => (
                    <ProductCard
                      key={row.productId}
                      row={row}
                      globalRank={(page - 1) * PAGE_SIZE + i + 1}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Pagination footer */}
            <div className="flex flex-col items-center gap-3 border-t border-slate-100 bg-slate-50/40 px-5 py-4 sm:flex-row sm:justify-between sm:px-6">
              <p className="text-base text-slate-500">
                {total === 0
                  ? "ไม่มีข้อมูล"
                  : `แสดง ${startItem}–${endItem} จาก ${fmt(total)} รายการ`}
              </p>
              <Pagination
                page={page}
                total={total}
                pageSize={PAGE_SIZE}
                baseUrl={paginationBase}
              />
            </div>
          </section>

        </div>
      </div>
    </AppSidebarLayout>
  );
}



