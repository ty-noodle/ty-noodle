import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Store,
  Wallet,
  BadgeDollarSign,
  ShoppingCart,
  Trophy,
  Filter,
  ChevronLeft,
  ChevronRight,
  Package,
} from "lucide-react";
import { AppSidebarLayout } from "@/components/app-sidebar";
import { requireAppSession } from "@/lib/auth/authorization";
import { getTodayInBangkok } from "@/lib/orders/date";
import { getStoreSalesRanking, type StoreSalesRow } from "@/lib/reports/store-sales";
import { getCustomersForFilter } from "@/lib/reports/product-sales";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { StoreFilter } from "../product-sales/store-filter";
import { StoreDetailButton } from "./store-detail-button";
import { PrintButton } from "./print-button";
import styles from "./print.module.css";

export const metadata = { title: "รายงานยอดขายตามร้านค้า" };

const PAGE_SIZE = 25;

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
  return n.toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
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

function summarizeSelection(
  items: { id: string; name: string }[],
  selectedIds: string[],
  fallback: string,
) {
  if (selectedIds.length === 0) return fallback;
  const names = items.filter((i) => selectedIds.includes(i.id)).map((i) => i.name);
  return names.length <= 3 ? names.join(", ") : `${names.length} ร้านค้า`;
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
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
      </div>
      <p className="text-center text-2xl font-black tracking-tight text-[#003366] sm:text-3xl">{value}</p>
      {sub && <p className="mt-1 text-center text-xs font-medium text-slate-400">{sub}</p>}
    </div>
  );
}

// ─── Rank badge ───────────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  const base = "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black text-white shadow-md";
  if (rank === 1)
    return <span className={base} style={{ background: "linear-gradient(135deg,#FFD700 0%,#B8860B 100%)" }}>{rank}</span>;
  if (rank === 2)
    return <span className={base} style={{ background: "linear-gradient(135deg,#C0C0C0 0%,#708090 100%)" }}>{rank}</span>;
  if (rank === 3)
    return <span className={base} style={{ background: "linear-gradient(135deg,#CD7F32 0%,#8B4513 100%)" }}>{rank}</span>;
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-black text-slate-500">
      {rank}
    </span>
  );
}

// ─── Desktop table row ────────────────────────────────────────────────────────

function StoreRow({
  row,
  rank,
  fromDate,
  toDate,
}: {
  row: StoreSalesRow;
  rank: number;
  fromDate: string;
  toDate: string;
}) {
  const netProfit = row.totalRevenue - row.totalCost;
  const profitColor = netProfit >= 0 ? "text-emerald-600" : "text-red-500";
  const margin = row.totalRevenue > 0 ? (netProfit / row.totalRevenue) * 100 : 0;

  return (
    <tr className="transition-colors hover:bg-slate-50/60">
      <td className="whitespace-nowrap px-5 py-4 text-center">
        <RankBadge rank={rank} />
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-center font-mono text-sm text-slate-400">{row.customerCode}</td>
      <td className="px-4 py-4">
        <p className="truncate text-base font-bold text-slate-800">{row.customerName}</p>
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-center text-base font-semibold text-slate-700 tabular-nums">
        {fmt(row.totalOrders)}
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-center tabular-nums" style={{ background: "rgba(0,6,102,0.03)" }}>
        <span className="text-base font-black text-[#003366]">{fmtMoney(row.totalRevenue)}</span>
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-center text-base text-slate-500 tabular-nums">
        {fmtMoney(row.totalCost)}
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-center tabular-nums">
        <span className={`text-base font-black ${profitColor}`}>{fmtMoney(netProfit)}</span>
      </td>
      <td className="whitespace-nowrap px-5 py-4 text-center tabular-nums">
        <span className={`text-base font-black ${profitColor}`}>{fmtPercent(margin)}</span>
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-center print:hidden">
        <StoreDetailButton
          customerId={row.customerId}
          customerName={row.customerName}
          customerCode={row.customerCode}
          fromDate={fromDate}
          toDate={toDate}
        />
      </td>
    </tr>
  );
}

// ─── Mobile card — matching product-sales ProductCard design ──────────────────

function StoreCard({
  row,
  rank,
  fromDate,
  toDate,
}: {
  row: StoreSalesRow;
  rank: number;
  fromDate: string;
  toDate: string;
}) {
  const netProfit = row.totalRevenue - row.totalCost;
  const profitPositive = netProfit >= 0;
  const margin = row.totalRevenue > 0 ? (netProfit / row.totalRevenue) * 100 : 0;
  const rankBadgeStyle =
    rank === 1
      ? { background: "linear-gradient(135deg,#FFD700 0%,#B8860B 100%)" }
      : rank === 2
        ? { background: "linear-gradient(135deg,#C0C0C0 0%,#708090 100%)" }
        : rank === 3
          ? { background: "linear-gradient(135deg,#CD7F32 0%,#8B4513 100%)" }
          : undefined;

  return (
    <div className="bg-white px-3 py-4 sm:px-4">
      {/* Header row: icon + rank badge + code + name + button */}
      <div className="-ml-1 flex items-start gap-2.5">
        <div className="relative shrink-0">
          <span
            className={`absolute -left-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black text-white shadow-[0_6px_14px_rgba(27,27,33,0.22)] ${rankBadgeStyle ? "" : "bg-[#003366]"}`}
            style={rankBadgeStyle}
          >
            {rank}
          </span>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
            <Package className="h-5 w-5 text-slate-400" strokeWidth={1.5} />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm text-slate-400">{row.customerCode}</p>
          <p
            className="mt-1 overflow-hidden text-base font-bold leading-5 text-slate-800"
            style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}
          >
            {row.customerName}
          </p>
        </div>
        <div className="shrink-0 pl-1 pt-0.5">
          <StoreDetailButton
            customerId={row.customerId}
            customerName={row.customerName}
            customerCode={row.customerCode}
            fromDate={fromDate}
            toDate={toDate}
          />
        </div>
      </div>

      {/* Stats row 1 */}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <div className="bg-white px-4 py-2.5 text-center shadow-[0_8px_18px_rgba(27,27,33,0.1)]">
          <p className="text-sm text-slate-400">จำนวนออเดอร์</p>
          <p className="mt-0.5 text-base font-bold text-slate-800 tabular-nums">{fmt(row.totalOrders)} ออเดอร์</p>
        </div>
        <div className="bg-white px-4 py-2.5 text-center shadow-[0_8px_18px_rgba(27,27,33,0.1)]">
          <p className="text-sm text-slate-400">ต้นทุน</p>
          <p className="mt-0.5 text-base font-bold text-slate-800 tabular-nums">{fmtMoneyCompact(row.totalCost)}</p>
        </div>
      </div>

      {/* Stats row 2 */}
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <div className="bg-white px-4 py-2.5 text-center shadow-[0_8px_18px_rgba(27,27,33,0.1)]">
          <p className="text-sm text-slate-500">ยอดขาย</p>
          <p className="mt-0.5 text-base font-black text-[#003366] tabular-nums">{fmtMoneyCompact(row.totalRevenue)}</p>
        </div>
        <div className={`px-4 py-2.5 text-center shadow-[0_8px_18px_rgba(27,27,33,0.1)] ${profitPositive ? "bg-emerald-600" : "bg-red-50"}`}>
          <p className={`text-sm ${profitPositive ? "text-emerald-100" : "text-slate-500"}`}>กำไรสุทธิ</p>
          <p className={`mt-0.5 text-base font-black leading-tight tracking-tight tabular-nums ${profitPositive ? "text-white" : "text-red-500"}`}>
            {fmtMoneyCompact(netProfit)}
          </p>
        </div>
      </div>

      {/* Stats row 3 */}
      <div className="mt-3">
        <div className={`px-4 py-2.5 text-center shadow-[0_8px_18px_rgba(27,27,33,0.1)] ${profitPositive ? "bg-emerald-50" : "bg-red-50"}`}>
          <p className={`text-sm ${profitPositive ? "text-emerald-700" : "text-slate-500"}`}>กำไร (%)</p>
          <p className={`mt-0.5 text-base font-black leading-tight tabular-nums ${profitPositive ? "text-emerald-700" : "text-red-500"}`}>
            {fmtPercent(margin)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

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

  const around = new Set(
    [1, totalPages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= totalPages),
  );
  const sorted = [...around].sort((a, b) => a - b);
  const pages: (number | "...")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) pages.push("...");
    pages.push(sorted[i]);
  }

  return (
    <div className="flex items-center gap-1.5">
      {page > 1 && (
        <Link href={`${baseUrl}&page=${page - 1}`} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 active:scale-95">
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
            className={`flex h-10 w-10 items-center justify-center rounded-xl text-base font-semibold transition ${
              p === page ? "bg-[#003366] text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {p}
          </Link>
        ),
      )}
      {page < totalPages && (
        <Link href={`${baseUrl}&page=${page + 1}`} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 active:scale-95">
          <ChevronRight className="h-5 w-5" strokeWidth={2.2} />
        </Link>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type PageProps = {
  searchParams: Promise<{
    stores?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
};

export default async function StoreSalesReportPage({ searchParams }: PageProps) {
  const session = await requireAppSession();
  const params = await searchParams;

  const today = getTodayInBangkok();
  const defaultFrom = firstOfMonth(today);

  const fromDate =
    params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from) ? params.from : defaultFrom;
  const toDate =
    params.to && /^\d{4}-\d{2}-\d{2}$/.test(params.to) ? params.to : today;
  const selectedStoreIds = params.stores ? params.stores.split(",").filter(Boolean) : [];
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const [{ rows, summary, total }, customers] = await Promise.all([
    getStoreSalesRanking({
      organizationId: session.organizationId,
      fromDate,
      toDate,
      customerIds: selectedStoreIds,
      page,
      pageSize: PAGE_SIZE,
    }),
    getCustomersForFilter(session.organizationId),
  ]);

  const startItem = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(page * PAGE_SIZE, total);

  const filterQs = new URLSearchParams({
    ...(selectedStoreIds.length > 0 ? { stores: selectedStoreIds.join(",") } : {}),
    from: fromDate,
    to: toDate,
  }).toString();
  const paginationBase = `/reports/store-sales?${filterQs}`;
  const printedAt = formatPrintedAt(new Date());

  const netProfitTotal = summary.totalRevenue - summary.totalCost;
  const profitPositive = netProfitTotal >= 0;
  const topStore = rows.length > 0 && page === 1 ? rows[0] : null;
  const selectedStoreLabel = summarizeSelection(customers, selectedStoreIds, "ทุกร้านค้า");
  const marginPercent = summary.totalRevenue > 0 ? (netProfitTotal / summary.totalRevenue) * 100 : 0;

  return (
    <AppSidebarLayout>
      <div className="min-h-screen bg-slate-50/60">
        <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8">

          {/* Header */}
          <header className="mb-6 sm:mb-8">
            <nav className="mb-2 flex items-center gap-1 text-sm font-medium text-slate-400">
              <span>Analytics</span>
              <span className="text-slate-300">›</span>
              <span className="font-semibold text-[#003366]">รายงานยอดขายตามร้านค้า</span>
            </nav>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#003366] sm:text-3xl">
              รายงานยอดขายตามร้านค้า
            </h1>
          </header>

          {/* KPI cards */}
          <section className="mb-6 grid grid-cols-2 gap-3 sm:mb-8 sm:gap-4 lg:grid-cols-4">
            <KpiCard
              label="ยอดขายรวม"
              value={fmtMoney(summary.totalRevenue)}
              sub={`${fmt(summary.totalOrders)} ออเดอร์`}
              icon={Wallet}
            />
            <KpiCard
              label="จำนวนร้านค้า"
              value={`${fmt(summary.totalStores)} ร้าน`}
              icon={Store}
            />
            <KpiCard
              label="กำไรสุทธิ"
              value={fmtMoney(netProfitTotal)}
              sub={summary.totalRevenue > 0 ? `อัตรากำไร ${fmtPercent(marginPercent)}` : undefined}
              icon={profitPositive ? BadgeDollarSign : ShoppingCart}
            />
            <KpiCard
              label="ร้านค้ายอดดีที่สุด"
              value={topStore ? topStore.customerName : "—"}
              sub={topStore ? fmtMoney(topStore.totalRevenue) : undefined}
              icon={Trophy}
            />
          </section>

          {/* Table section */}
          <section className="overflow-hidden rounded-2xl bg-white shadow-[0_4px_20px_rgba(27,27,33,0.05)]">

            {/* Filters */}
            <div className="border-b border-slate-100 px-5 py-4 sm:px-6 sm:py-5">
              <form method="GET" action="/reports/store-sales" className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end lg:flex-nowrap">
                {/* Store filter */}
                <div className="w-full sm:min-w-[200px] sm:flex-1">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">ร้านค้า</label>
                  <StoreFilter customers={customers} selectedIds={selectedStoreIds} />
                </div>

                {/* Date range */}
                <div className="w-full sm:min-w-[300px] sm:flex-1 lg:min-w-[420px] lg:flex-[1.15]">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">ช่วงวันที่</label>
                  <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                    <div className="min-w-0 flex-1">
                      <ThaiDatePicker id="ss-from" name="from" defaultValue={fromDate} max={today} placeholder="วันเริ่มต้น" compact matchFieldHeight />
                    </div>
                    <span className="shrink-0 text-slate-300">—</span>
                    <div className="min-w-0 flex-1">
                      <ThaiDatePicker id="ss-to" name="to" defaultValue={toDate} max={today} placeholder="วันสิ้นสุด" compact matchFieldHeight />
                    </div>
                  </div>
                </div>

                {/* Submit */}
                <div className="w-full shrink-0 sm:w-auto">
                  <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#003366] px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#1a237e] active:scale-95 sm:w-auto">
                    <Filter className="h-4 w-4" strokeWidth={2} />
                    ค้นหา
                  </button>
                </div>
              </form>
            </div>

            {/* Section header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6 sm:py-5">
              <div>
                <h3 className="text-lg font-bold text-[#003366] sm:text-xl">ยอดขายตามร้านค้า</h3>
                <p className="mt-0.5 text-sm text-slate-400">
                  {isoToDisplay(fromDate)} — {isoToDisplay(toDate)}
                  {selectedStoreIds.length > 0 && ` · ${selectedStoreLabel}`}
                </p>
              </div>
              <PrintButton />
            </div>

            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
                <Store className="h-12 w-12" strokeWidth={1.5} />
                <p className="text-base">ไม่พบข้อมูลในช่วงเวลาที่เลือก</p>
              </div>
            ) : (
              <>
                {/* Desktop table — same as product-sales: overflow-x-auto lg:block */}
                <div className={`${styles.printArea} hidden overflow-x-auto lg:block print:block print:overflow-visible`}>
                  {/* Print-only header */}
                  <div className={styles.printHeader}>
                    <div className={styles.printHeaderTop}>
                      <div className={styles.printBrand}>
                        <Image src="/ty-noodles-logo-cropped.png" alt="T&Y Noodle" width={64} height={64} priority className={styles.printLogo} />
                        <div>
                          <p className={styles.printCompanyName}>T&amp;Y Noodle</p>
                          <p className={styles.printSubtitle}>รายงานยอดขาย กำไร และอันดับร้านค้า</p>
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
                        <span className={styles.printFilterLabel}>ยอดขายรวม:</span>
                        <span className={styles.printFilterValue}>{fmtMoney(summary.totalRevenue)}</span>
                      </div>
                    </div>
                    <div className={styles.printReportTitleBlock}>
                      <h1 className={styles.printReportTitle}>รายงานยอดขายตามร้านค้า</h1>
                    </div>
                    <div className={styles.printDivider} />
                  </div>

                  <table className="w-full table-fixed border-collapse text-left print:table-fixed">
                    <colgroup>
                      <col style={{ width: "5%" }} />
                      <col style={{ width: "9%" }} />
                      <col style={{ width: "20%" }} />
                      <col style={{ width: "7%" }} />
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "9%" }} />
                      <col style={{ width: "12%" }} />
                    </colgroup>
                    <thead>
                      <tr className="bg-slate-50/80">
                        {[
                          { label: "ลำดับ", align: "center" },
                          { label: "รหัสร้าน", align: "center" },
                          { label: "ชื่อร้านค้า", align: "left" },
                          { label: "ออเดอร์", align: "center" },
                          { label: "ยอดขาย", align: "center", highlight: true },
                          { label: "ต้นทุน", align: "center" },
                          { label: "กำไรสุทธิ", align: "center" },
                          { label: "กำไร %", align: "center" },
                          { label: "", align: "center" },
                        ].map(({ label, align, highlight }, idx) => (
                          <th
                            key={idx}
                            className={`whitespace-nowrap px-4 py-4 text-xs font-black uppercase tracking-widest text-slate-400 ${align === "center" ? "text-center" : ""} ${idx === 0 ? "pl-5" : ""} ${idx === 7 ? "pr-5" : ""}`}
                            style={highlight ? { background: "rgba(0,6,102,0.03)" } : undefined}
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#003366]/24">
                      {rows.map((row, i) => (
                        <StoreRow
                          key={row.customerId}
                          row={row}
                          rank={(page - 1) * PAGE_SIZE + i + 1}
                          fromDate={fromDate}
                          toDate={toDate}
                        />
                      ))}
                      {/* Summary row */}
                      <tr className="bg-slate-50/90">
                        <td />
                        <td />
                        <td className="px-4 py-3 text-right text-sm font-bold tracking-[0.02em] text-slate-600 whitespace-nowrap">
                          ยอดรวมทั้งหมด
                        </td>
                        <td />
                        <td className="px-4 py-3 text-center tabular-nums whitespace-nowrap" style={{ background: "rgba(0,6,102,0.05)" }}>
                          <span className="text-sm font-bold text-[#003366]">{fmtMoney(summary.totalRevenue)}</span>
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-bold text-slate-700 tabular-nums whitespace-nowrap">
                          {fmtMoney(summary.totalCost)}
                        </td>
                        <td className={`px-4 py-3 text-center tabular-nums whitespace-nowrap ${profitPositive ? "text-emerald-600" : "text-red-500"}`}>
                          <span className="text-sm font-bold">{fmtMoney(netProfitTotal)}</span>
                        </td>
                        <td className={`px-5 py-3 text-center tabular-nums whitespace-nowrap ${profitPositive ? "text-emerald-600" : "text-red-500"}`}>
                          <span className="text-sm font-bold">{summary.totalRevenue > 0 ? fmtPercent(marginPercent) : "—"}</span>
                        </td>
                        <td className="print:hidden" />
                      </tr>
                    </tbody>
                  </table>
                  <div className={styles.printFooter}>พิมพ์จากระบบ T&amp;Y Noodle</div>
                </div>

                {/* Mobile cards — same design as product-sales */}
                <div className="divide-y divide-[#003366]/20 px-2 sm:px-4 lg:hidden">
                  {rows.map((row, i) => (
                    <StoreCard
                      key={row.customerId}
                      row={row}
                      rank={(page - 1) * PAGE_SIZE + i + 1}
                      fromDate={fromDate}
                      toDate={toDate}
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
                  : `แสดง ${startItem}–${endItem} จาก ${fmt(total)} ร้านค้า`}
              </p>
              <Pagination page={page} total={total} pageSize={PAGE_SIZE} baseUrl={paginationBase} />
            </div>
          </section>

        </div>
      </div>
    </AppSidebarLayout>
  );
}
