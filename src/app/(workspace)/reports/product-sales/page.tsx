import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { Filter, Package, ChevronLeft, ChevronRight, ShoppingCart, Wallet, BadgeDollarSign } from "lucide-react";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { AppSidebarLayout } from "@/components/app-sidebar";
import { PageLoader } from "@/components/page-loader";
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
import { ReportGetForm } from "@/components/report-get-form";

export const metadata = { title: "รายงานยอดขายตามอันดับสินค้า" };

// Constants
const DEFAULT_PAGE_SIZE = 20;

// Helpers
function firstOfMonth(iso: string) {
  return iso.slice(0, 7) + "-01";
}

function fmt(n: number) {
  return n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

function fmtMoney(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
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

// ─── Screen View Components ──────────────────────────────────────────────────

function ProductRowScreen({ row, globalRank }: { row: ProductSalesRow; globalRank: number }) {
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
        <div className="flex min-w-0 items-center gap-3">
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
          <p className="truncate text-base font-black text-slate-800">{row.name}</p>
        </div>
      </td>
      <td className="px-4 py-4 text-center text-base font-bold text-slate-800 tabular-nums whitespace-nowrap">
        {fmt(row.totalQty)}
      </td>
      <td className="px-4 py-4 text-center text-base font-bold text-slate-500 whitespace-nowrap">{row.unit}</td>
      <td className="px-4 py-4 text-center text-base font-bold text-slate-500 tabular-nums whitespace-nowrap">
        {fmtMoney(row.totalCost)}
      </td>
      <td className="px-4 py-4 text-center tabular-nums whitespace-nowrap" style={{ background: "rgba(0,6,102,0.03)" }}>
        <span className="whitespace-nowrap text-base font-bold text-[#003366]">{fmtMoney(row.totalRevenue)}</span>
      </td>
      <td className="px-5 py-4 text-center tabular-nums whitespace-nowrap">
        <span className={`inline-flex items-center justify-center whitespace-nowrap text-base font-bold ${profitColor}`}>{fmtMoney(netProfit)}</span>
      </td>
      <td className="px-5 py-4 text-center tabular-nums whitespace-nowrap">
        <span className={`inline-flex items-center justify-center whitespace-nowrap text-base font-bold ${profitColor}`}>{fmtPercent(margin)}</span>
      </td>
    </tr>
  );
}

// ─── Print View Components ───────────────────────────────────────────────────

function ProductRowPrint({ row, globalRank }: { row: ProductSalesRow; globalRank: number }) {
  const netProfit = row.totalRevenue - row.totalCost;
  const margin = row.totalRevenue > 0 ? (netProfit / row.totalRevenue) * 100 : 0;

  return (
    <tr>
      <td className="text-center font-bold text-slate-900 border-b border-slate-100">
        {globalRank}
      </td>
      <td className="text-center font-mono text-[9px] text-slate-400 border-b border-slate-100">{row.sku}</td>
      <td className="border-b border-slate-100">
        <div className={`flex min-w-0 items-center gap-2 ${styles.printProductCell}`}>
          <p className={`${styles.printProductName} font-black text-slate-800`}>{row.name}</p>
        </div>
      </td>
      <td className="text-center font-bold text-slate-800 tabular-nums whitespace-nowrap border-b border-slate-100">
        {fmt(row.totalQty)}
      </td>
      <td className="text-center font-bold text-slate-500 whitespace-nowrap border-b border-slate-100">{row.unit}</td>
      <td className="text-center font-bold text-slate-500 tabular-nums whitespace-nowrap border-b border-slate-100">
        {fmtMoney(row.totalCost)}
      </td>
      <td className="text-center tabular-nums whitespace-nowrap border-b border-slate-100" style={{ background: "rgba(0,6,102,0.03)" }}>
        <span className="whitespace-nowrap font-bold text-[#003366]">{fmtMoney(row.totalRevenue)}</span>
      </td>
      <td className="text-center tabular-nums whitespace-nowrap border-b border-slate-100">
        <span className={`inline-flex items-center justify-center whitespace-nowrap font-bold ${netProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmtMoney(netProfit)}</span>
      </td>
      <td className="text-center tabular-nums whitespace-nowrap border-b border-slate-100">
        <span className={`inline-flex items-center justify-center whitespace-nowrap font-bold ${netProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmtPercent(margin)}</span>
      </td>
    </tr>
  );
}

// ─── Mobile Card ──────────────────────────────────────────────────────────────

function InfoBlockReport({
  label,
  value,
  icon,
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-950">{label}</p>
      <div className="mt-1.5 flex items-center gap-2 text-[15px] font-semibold text-slate-950">
        {icon && <span className="shrink-0 text-slate-400">{icon}</span>}
        <span className="truncate">{value}</span>
      </div>
    </div>
  );
}

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
    <article className="border-b border-slate-400 bg-white px-5 py-5 shadow-[0_10px_26px_rgba(15,23,42,0.1)] last:border-b-0">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-50 ring-1 ring-slate-200">
          {row.imageUrl ? (
            <Image src={row.imageUrl} alt={row.name} width={48} height={48} className="h-full w-full object-cover" />
          ) : (
            <Package className="h-5 w-5 text-slate-300" strokeWidth={2.2} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[1.1rem] font-bold leading-tight text-slate-950">
            {row.name}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <p className="truncate font-mono text-[13px] font-semibold text-slate-500" translate="no">
              {row.sku}
            </p>
          </div>
        </div>

        <div className="shrink-0">
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-xl text-xs font-black text-white shadow-md ${rankBadgeStyle ? "" : "bg-[#003366]"}`}
            style={rankBadgeStyle}
          >
            {globalRank}
          </span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5">
        <InfoBlockReport
          label="จำนวนที่ขาย"
          icon={<ShoppingCart className="h-4 w-4" strokeWidth={2.2} />}
          value={`${fmt(row.totalQty)} ${row.unit}`}
        />
        <div className="min-w-0 border-l border-slate-300 pl-4">
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-950">ยอดขาย</p>
          <p className="mt-1.5 text-[1.05rem] font-bold leading-none text-[#003366]">
            {fmtMoney(row.totalRevenue)}
          </p>
        </div>

        <InfoBlockReport
          label="ต้นทุนรวม"
          icon={<Wallet className="h-4 w-4" strokeWidth={2.2} />}
          value={fmtMoney(row.totalCost)}
        />
        <div className="min-w-0 border-l border-slate-300 pl-4">
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-950">กำไรสุทธิ</p>
          <p className={`mt-1.5 text-[1.05rem] font-bold leading-none ${profitPositive ? "text-emerald-600" : "text-red-500"}`}>
            {fmtMoney(netProfit)}
          </p>
        </div>
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4 flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-950">กำไร (%)</p>
          <div className="mt-1.5 flex items-center gap-2">
            <BadgeDollarSign className={`h-4 w-4 shrink-0 ${profitPositive ? "text-emerald-500" : "text-red-400"}`} strokeWidth={2.2} />
            <span className={`text-[15px] font-bold ${profitPositive ? "text-emerald-600" : "text-red-500"}`}>
              {fmtPercent(margin)}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

// ─── Page Props & Entry ───────────────────────────────────────────────────────
function Pagination({ page, total, pageSize, baseUrl }: { page: number; total: number; pageSize: number; baseUrl: string }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  const pages: (number | "...")[] = [];
  const around = new Set([1, totalPages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= totalPages));
  const sorted = [...around].sort((a, b) => a - b);
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
          <Link key={p} href={`${baseUrl}&page=${p}`} className={`flex h-10 w-10 items-center justify-center rounded-xl text-base font-semibold transition ${p === page ? "bg-[#003366] text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>{p}</Link>
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

type PageProps = {
  searchParams: Promise<{
    q?: string;
    products?: string;
    stores?: string;
    from?: string;
    to?: string;
    page?: string;
    pageSize?: string;
  }>;
};

export default async function Page({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<PageLoader />}>
      <ProductSalesReportContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ProductSalesReportContent({ searchParams }: PageProps) {
  const session = await requireAppSession();
  const params = await searchParams;
  const today = getTodayInBangkok();
  const defaultFrom = firstOfMonth(today);
  const fromDate = params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from) ? params.from : defaultFrom;
  const toDate = params.to && /^\d{4}-\d{2}-\d{2}$/.test(params.to) ? params.to : today;
  const selectedProductIds = params.products ? params.products.split(",").filter(Boolean) : [];
  const selectedStoreIds = params.stores ? params.stores.split(",").filter(Boolean) : [];
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const pageSize = params.pageSize ? parseInt(params.pageSize, 10) : DEFAULT_PAGE_SIZE;

  const [{ rows, allRows, summary, total }, customers, products] = await Promise.all([
    getProductSalesRanking({
      organizationId: session.organizationId,
      fromDate,
      toDate,
      productIds: selectedProductIds,
      customerIds: selectedStoreIds,
      page,
      pageSize,
    }),
    getCustomersForFilter(session.organizationId),
    getProductsForFilter(session.organizationId),
  ]);

  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);
  const filterQs = new URLSearchParams({
    ...(selectedProductIds.length > 0 ? { products: selectedProductIds.join(",") } : {}),
    ...(selectedStoreIds.length > 0 ? { stores: selectedStoreIds.join(",") } : {}),
    from: fromDate,
    to: toDate,
    ...(params.pageSize ? { pageSize: params.pageSize } : {}),
  }).toString();
  const paginationBase = `/reports/product-sales?${filterQs}`;
  const printedAt = formatPrintedAt(new Date());
  const totalMarginPercent = summary.totalRevenue > 0 ? (summary.netProfit / summary.totalRevenue) * 100 : 0;

  return (
    <AppSidebarLayout>
      <div className="min-h-screen bg-slate-50/60">
        {/* ─── Screen View (Hidden on Print) ─── */}
        <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8 no-print">
          <header className="mb-6 sm:mb-8">
            <nav className="mb-2 flex items-center gap-1 text-sm font-medium text-slate-400">
              <span>Analytics</span>
              <span className="text-slate-300">›</span>
              <span className="font-semibold text-[#003366]">รายงานยอดขายตามอันดับสินค้า</span>
            </nav>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#003366] sm:text-3xl">รายงานยอดขายตามอันดับสินค้า</h1>
          </header>

          <MobileSearchDrawer title="ค้นหารายงานยอดขาย">
            <ReportGetForm action="/reports/product-sales" className="flex flex-col gap-4 pb-32">
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
                  <div className="min-w-0 flex-1"><ThaiDatePicker id="m-ps-from" name="from" defaultValue={fromDate} max={today} placeholder="วันเริ่มต้น" compact matchFieldHeight /></div>
                  <span className="shrink-0 text-slate-300">—</span>
                  <div className="min-w-0 flex-1"><ThaiDatePicker id="m-ps-to" name="to" defaultValue={toDate} max={today} placeholder="วันสิ้นสุด" compact matchFieldHeight /></div>
                </div>
              </div>
              <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#003366] py-3.5 text-base font-bold text-white transition hover:bg-[#1a237e]"><Filter className="h-4 w-4" strokeWidth={2} />ค้นหา</button>
            </ReportGetForm>
          </MobileSearchDrawer>

          {/* Desktop Filter Card */}
          <section className="hidden md:block bg-white shadow-[0_4px_20px_rgba(27,27,33,0.05)] rounded-2xl mb-6">
            <div className="px-5 py-4 sm:px-6 sm:py-5">
              <ReportGetForm action="/reports/product-sales" className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end lg:flex-nowrap">
                <div className="w-full sm:min-w-[200px] sm:flex-1 lg:min-w-[260px] lg:max-w-[340px] lg:flex-[1.05]">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">สินค้า</label>
                  <ProductFilter products={products} selectedIds={selectedProductIds} />
                </div>
                <div className="w-full sm:min-w-[200px] sm:flex-1">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">ร้านค้า</label>
                  <StoreFilter customers={customers} selectedIds={selectedStoreIds} />
                </div>
                <div className="w-full sm:min-w-[300px] sm:flex-1 lg:min-w-[420px] lg:flex-[1.15]">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">ช่วงวันที่</label>
                  <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                    <div className="min-w-0 flex-1"><ThaiDatePicker id="report-date-from" name="from" defaultValue={fromDate} max={today} placeholder="วันเริ่มต้น" compact matchFieldHeight /></div>
                    <span className="shrink-0 text-slate-300">—</span>
                    <div className="min-w-0 flex-1"><ThaiDatePicker id="report-date-to" name="to" defaultValue={toDate} max={today} placeholder="วันสิ้นสุด" compact matchFieldHeight /></div>
                  </div>
                </div>
                <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
                  <button type="submit" className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#003366] px-6 text-sm font-bold text-white transition hover:bg-[#1a237e] active:scale-95 sm:w-auto"><Filter className="h-4 w-4" strokeWidth={2.2} />ค้นหา</button>
                  <Link href={`${paginationBase}&pageSize=9999`} className="flex h-10 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-500 transition hover:border-[#003366] hover:text-[#003366] active:scale-95 sm:w-auto">แสดงทั้งหมด</Link>
                </div>
              </ReportGetForm>
            </div>
          </section>

          {/* Main Table Card */}
          <section className="overflow-hidden rounded-2xl bg-white shadow-[0_4px_20px_rgba(27,27,33,0.05)]">

            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6 sm:py-5">
              <div>
                <h3 className="text-lg font-bold text-[#003366] sm:text-xl">ยอดขายตามสินค้า</h3>
                <p className="mt-0.5 text-sm text-slate-400">{isoToDisplay(fromDate)} — {isoToDisplay(toDate)}{selectedStoreIds.length > 0 && ` · ${selectedStoreIds.length} ร้านค้า`}</p>
              </div>
              <PrintButton targetId="report-print-area" fileName="รายงานยอดขายตามสินค้า" />
            </div>

            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
                <Package className="h-12 w-12" strokeWidth={1.5} />
                <p className="text-base">ไม่พบข้อมูลในช่วงเวลาที่เลือก</p>
              </div>
            ) : (
              <>
                {/* ── Desktop View Table ── */}
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full table-fixed border-collapse text-left">
                    <colgroup>
                      <col style={{ width: "6%" }} /><col style={{ width: "9%" }} /><col style={{ width: "28%" }} /><col style={{ width: "8%" }} /><col style={{ width: "6%" }} /><col style={{ width: "12%" }} /><col style={{ width: "12%" }} /><col style={{ width: "9%" }} /><col style={{ width: "8%" }} />
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
                          <th key={label} className={`whitespace-nowrap px-4 py-4 text-xs font-black uppercase tracking-widest text-slate-400 ${align === "center" ? "text-center" : ""} ${label === "ลำดับ" ? "pl-5" : ""} ${label === "กำไร (%)" ? "pr-5" : ""} ${highlight ? styles.printRevenueCell : ""}`} style={highlight ? { background: "rgba(0,6,102,0.03)" } : undefined}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#003366]/24">
                      {rows.map((row, i) => <ProductRowScreen key={row.productId} row={row} globalRank={(page - 1) * pageSize + i + 1} />)}
                      <tr className="bg-slate-50/90">
                        <td colSpan={3} className="px-5 py-4 text-right text-base font-black tracking-[0.02em] text-slate-600 whitespace-nowrap">ยอดรวมทั้งหมด</td>
                        <td className="px-4 py-4 text-center text-base font-black text-slate-800 tabular-nums whitespace-nowrap">{fmt(summary.totalQty)}</td>
                        <td className="px-4 py-4 text-center text-base font-black text-slate-500 whitespace-nowrap">—</td>
                        <td className="px-4 py-4 text-center text-base font-black text-slate-700 tabular-nums whitespace-nowrap">{fmtMoney(summary.totalCost)}</td>
                        <td className="px-4 py-4 text-center tabular-nums whitespace-nowrap" style={{ background: "rgba(0,6,102,0.05)" }}><span className="whitespace-nowrap text-base font-black text-[#003366]">{fmtMoney(summary.totalRevenue)}</span></td>
                        <td className={`px-5 py-4 text-center tabular-nums whitespace-nowrap ${summary.netProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}><span className="inline-flex items-center justify-center whitespace-nowrap text-base font-black">{fmtMoney(summary.netProfit)}</span></td>
                        <td className={`px-5 py-4 text-center tabular-nums whitespace-nowrap ${summary.netProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}><span className="inline-flex items-center justify-center whitespace-nowrap text-base font-black">{fmtPercent(totalMarginPercent)}</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Mobile View Cards */}
                <div className="divide-y divide-[#003366]/20 px-2 sm:px-4 lg:hidden">
                  {rows.map((row, i) => <ProductCard key={row.productId} row={row} globalRank={(page - 1) * pageSize + i + 1} />)}
                </div>
              </>
            )}

            <div className="flex flex-col items-center gap-3 border-t border-slate-100 bg-slate-50/40 px-5 py-4 sm:flex-row sm:justify-between sm:px-6">
              <p className="text-base text-slate-500">{total === 0 ? "ไม่มีข้อมูล" : `แสดง ${startItem}–${endItem} จาก ${fmt(total)} รายการ`}</p>
              <Pagination page={page} total={total} pageSize={pageSize} baseUrl={paginationBase} />
            </div>
          </section>
        </div>

        {/* ─── Print View (Invisible on Screen, block on Print) ─── */}
        <div id="report-print-area" className="fixed -left-[9999px] top-0 opacity-0 pointer-events-none print:static print:opacity-100 print:pointer-events-auto print:block">
          {(() => {
            const PRINT_PAGE_SIZE = 35;
            const pages = [];
            for (let i = 0; i < allRows.length; i += PRINT_PAGE_SIZE) { pages.push(allRows.slice(i, i + PRINT_PAGE_SIZE)); }
            if (pages.length === 0) return null;
            return pages.map((pageRows, pageIdx) => (
              <div key={pageIdx} data-print-page="true" className={`${styles.printArea} ${styles.printPage}`}>
                <div className={styles.printHeader}>
                  <div className={styles.printHeaderTop}>
                    <div className={styles.printBrand}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/ty-noodles-logo-cropped.png" alt="T&Y Noodle" width="64" height="64" className={styles.printLogo} />
                      <div><p className={styles.printCompanyName}>T&amp;Y Noodle</p><p className={styles.printSubtitle}>สรุปยอดขาย ต้นทุน กำไร และอัตรากำไรของสินค้า</p></div>
                    </div>
                    <div className={styles.printMeta}><p>วันที่พิมพ์: {printedAt.datePart}</p><p>เวลาพิมพ์: {printedAt.timePart} น.</p><p>หน้า: {pageIdx + 1} / {pages.length}</p></div>
                  </div>
                  <div className={styles.printFilters}>
                    <div className={styles.printFilterItem}><span className={styles.printFilterLabel}>ช่วงวันที่:</span><span className={styles.printFilterValue}>{isoToDisplay(fromDate)} - {isoToDisplay(toDate)}</span></div>
                  </div>
                  <div className={styles.printReportTitleBlock}><h1 className={styles.printReportTitle}>รายงานยอดขายตามอันดับสินค้า</h1></div>
                  <div className={styles.printDivider} />
                </div>
                <table className="w-full table-fixed border-collapse text-left print:table-fixed">
                  <colgroup>
                    <col style={{ width: "6%" }} /><col style={{ width: "9%" }} /><col style={{ width: "28%" }} /><col style={{ width: "8%" }} /><col style={{ width: "6%" }} /><col style={{ width: "12%" }} /><col style={{ width: "12%" }} /><col style={{ width: "9%" }} /><col style={{ width: "8%" }} />
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
                        <th key={label} className={`whitespace-nowrap px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 ${align === "center" ? "text-center" : ""} ${highlight ? styles.printRevenueCell : ""}`} style={highlight ? { background: "rgba(0,6,102,0.03)" } : undefined}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#003366]/24">
                    {pageRows.map((row, i) => <ProductRowPrint key={row.productId} row={row} globalRank={pageIdx * PRINT_PAGE_SIZE + i + 1} />)}
                    {pageIdx === pages.length - 1 && (
                      <tr className="bg-slate-50/90">
                        <td colSpan={3} className="px-3 py-3 text-right text-[11px] font-bold tracking-[0.02em] text-slate-600 whitespace-nowrap border-b border-slate-100">ยอดรวมทั้งหมด</td>
                        <td className="px-2 py-3 text-center text-[11px] font-bold text-slate-700 tabular-nums whitespace-nowrap border-b border-slate-100">{fmt(summary.totalQty)}</td>
                        <td className="px-2 py-3 text-center text-[11px] font-bold text-slate-500 whitespace-nowrap border-b border-slate-100">—</td>
                        <td className="px-2 py-3 text-center text-[11px] font-bold text-slate-700 tabular-nums whitespace-nowrap border-b border-slate-100">{fmtMoney(summary.totalCost)}</td>
                        <td className="px-2 py-3 text-center tabular-nums whitespace-nowrap border-b border-slate-100" style={{ background: "rgba(0,6,102,0.05)" }}><span className="whitespace-nowrap text-[11px] font-bold text-[#003366]">{fmtMoney(summary.totalRevenue)}</span></td>
                        <td className={`px-3 py-3 text-center tabular-nums whitespace-nowrap border-b border-slate-100 ${summary.netProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}><span className="inline-flex items-center justify-center whitespace-nowrap text-[11px] font-bold">{fmtMoney(summary.netProfit)}</span></td>
                        <td className={`px-3 py-3 text-center tabular-nums whitespace-nowrap border-b border-slate-100 ${summary.netProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}><span className="inline-flex items-center justify-center whitespace-nowrap text-[11px] font-bold">{fmtPercent(totalMarginPercent)}</span></td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <div className={styles.printFooter}>พิมพ์จากระบบรายงานอัตโนมัติ (T&amp;Y Noodle) - หน้า {pageIdx + 1} / {pages.length}</div>
              </div>
            ));
          })()}
        </div>
      </div>
    </AppSidebarLayout>
  );
}
