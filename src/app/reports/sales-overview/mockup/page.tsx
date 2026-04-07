import { BarChart2, TrendingUp, CalendarDays, ShoppingCart, Wallet } from "lucide-react";
import { AppSidebarLayout } from "@/components/app-sidebar";
import { SalesCharts } from "../sales-charts";
import type { MonthlySalesRow, SalesOverviewSummary } from "@/lib/reports/sales-overview";

// ─── Mock year ────────────────────────────────────────────────────────────────

const YEAR = 2026; // CE → พ.ศ. 2569
const PREV_YEAR = 2025; // CE → พ.ศ. 2568

// ─── Mock data ────────────────────────────────────────────────────────────────

const MONTH_LABELS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

// ปี 2569 — ยอดขายรายเดือน (revenue, cost)
const RAW_2569: [number, number][] = [
  [145_000, 93_500],   // ม.ค.
  [132_000, 85_800],   // ก.พ.
  [158_000, 101_200],  // มี.ค.
  [168_000, 108_200],  // เม.ย.
  [142_000, 91_500],   // พ.ค.
  [125_000, 81_250],   // มิ.ย.
  [138_000, 89_700],   // ก.ค.
  [155_000, 100_000],  // ส.ค.
  [148_000, 95_700],   // ก.ย.
  [162_000, 104_000],  // ต.ค.
  [175_000, 112_700],  // พ.ย.
  [188_000, 120_500],  // ธ.ค.
];

// ปี 2568 — ยอดขายรายเดือน (revenue, cost)
const RAW_2568: [number, number][] = [
  [128_000, 84_480],   // ม.ค.
  [115_000, 75_900],   // ก.พ.
  [142_000, 93_720],   // มี.ค.
  [138_000, 91_080],   // เม.ย.
  [125_000, 82_500],   // พ.ค.
  [110_000, 72_600],   // มิ.ย.
  [135_000, 89_100],   // ก.ค.
  [148_000, 97_680],   // ส.ค.
  [122_000, 80_520],   // ก.ย.
  [155_000, 102_300],  // ต.ค.
  [168_000, 110_880],  // พ.ย.
  [175_000, 115_500],  // ธ.ค.
];

function buildRows(raw: [number, number][]): MonthlySalesRow[] {
  const totalRevenue = raw.reduce((s, [r]) => s + r, 0);
  return raw.map(([revenue, cost], i) => ({
    month: i + 1,
    monthLabel: MONTH_LABELS[i],
    revenue,
    cost,
    profit: revenue - cost,
    orderCount: Math.round(revenue / 4_200), // สมมุติออเดอร์เฉลี่ย 4,200 บาท
    revenuePercent: totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0,
  }));
}

const rows2569 = buildRows(RAW_2569);
const rows2568 = buildRows(RAW_2568);

const prevYearRevenue = rows2568.map((r) => r.revenue);

const totalRevenue = rows2569.reduce((s, r) => s + r.revenue, 0);
const activeRows = rows2569.filter((r) => r.revenue > 0);
const peakMonth = activeRows.reduce((best, r) => (r.revenue > best.revenue ? r : best));

const summary: SalesOverviewSummary = {
  totalRevenue,
  totalCost: rows2569.reduce((s, r) => s + r.cost, 0),
  totalProfit: rows2569.reduce((s, r) => s + r.profit, 0),
  totalOrders: rows2569.reduce((s, r) => s + r.orderCount, 0),
  peakMonth,
  avgMonthlyRevenue: totalRevenue / 12,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtMoneyShort(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} ล.`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return fmtMoney(n);
}
function toBuddhistYear(ce: number) { return ce + 543; }

const profitPositive = summary.totalProfit >= 0;
const marginPercent = (summary.totalProfit / summary.totalRevenue) * 100;

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, accent,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; accent?: "emerald" | "amber" | "blue";
}) {
  const accentMap = {
    emerald: "text-emerald-600 bg-emerald-50",
    amber: "text-amber-600 bg-amber-50",
    blue: "text-[#003366] bg-blue-50",
  };
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(27,27,33,0.05)] sm:p-5">
      <div className="flex items-center gap-2.5">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${accentMap[accent ?? "blue"]}`}>
          <Icon className="h-4.5 w-4.5" strokeWidth={2} />
        </div>
        <p className="text-sm font-semibold text-slate-500">{label}</p>
      </div>
      <div>
        <p className="text-2xl font-black tracking-tight text-[#003366] sm:text-3xl">{value}</p>
        {sub && <p className="mt-1 text-xs font-medium text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SalesOverviewMockupPage() {
  return (
    <AppSidebarLayout>
      <div className="min-h-screen bg-slate-50/60">
        <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8">

          {/* Header */}
          <header className="mb-6 sm:mb-8">
            <nav className="mb-2 flex items-center gap-1 text-sm font-medium text-slate-400">
              <span>Analytics</span>
              <span className="text-slate-300">›</span>
              <span className="font-semibold text-[#003366]">สรุปยอดขายรายปี</span>
              <span className="text-slate-300">›</span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">Mockup</span>
            </nav>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#0f2f56] text-white shadow-md">
                    <BarChart2 className="h-5 w-5" strokeWidth={2} />
                  </div>
                  <h1 className="text-2xl font-extrabold tracking-tight text-[#003366] sm:text-3xl">
                    สรุปยอดขายรายปี
                  </h1>
                </div>
                <p className="mt-1.5 pl-[52px] text-sm text-slate-400">
                  ภาพรวมยอดขาย กำไร และแนวโน้มรายเดือน · ปี พ.ศ. {toBuddhistYear(YEAR)}
                  {" "}
                  <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                    ข้อมูลจำลอง
                  </span>
                </p>
              </div>
            </div>
          </header>

          {/* Year selector (static display) */}
          <div className="mb-6 sm:mb-8">
            <p className="mb-2.5 text-xs font-bold uppercase tracking-widest text-slate-400">เลือกปี</p>
            <div className="flex flex-wrap items-center gap-2">
              {[PREV_YEAR, YEAR].map((y) => (
                <span
                  key={y}
                  className={`rounded-xl px-4 py-2 text-sm font-bold ${
                    y === YEAR
                      ? "bg-[#0f2f56] text-white shadow-md"
                      : "border border-slate-200 bg-white text-slate-400"
                  }`}
                >
                  {toBuddhistYear(y)}
                </span>
              ))}
            </div>
          </div>

          {/* KPI Cards */}
          <section className="mb-6 grid grid-cols-2 gap-3 sm:mb-8 sm:gap-4 lg:grid-cols-4">
            <KpiCard
              label="ยอดขายรวมทั้งปี"
              value={fmtMoneyShort(summary.totalRevenue)}
              sub={`${fmtMoney(summary.totalRevenue)} บาท`}
              icon={Wallet}
              accent="blue"
            />
            <KpiCard
              label="กำไรสุทธิ"
              value={fmtMoneyShort(summary.totalProfit)}
              sub={`อัตรากำไร ${marginPercent.toFixed(1)}%`}
              icon={profitPositive ? TrendingUp : TrendingUp}
              accent="emerald"
            />
            <KpiCard
              label="เดือนยอดดีที่สุด"
              value={peakMonth.monthLabel}
              sub={`${fmtMoney(peakMonth.revenue)} บาท`}
              icon={CalendarDays}
              accent="amber"
            />
            <KpiCard
              label="เฉลี่ย / เดือน"
              value={fmtMoneyShort(summary.avgMonthlyRevenue)}
              sub={`รวม ${summary.totalOrders} ออเดอร์ทั้งปี`}
              icon={ShoppingCart}
              accent="blue"
            />
          </section>

          {/* Charts + Table */}
          <SalesCharts
            rows={rows2569}
            summary={summary}
            prevYearRevenue={prevYearRevenue}
            prevYearRows={rows2568}
            year={YEAR}
          />

          {/* Profit trend badge */}
          <div className="mt-5 flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-4">
            <TrendingUp className="h-5 w-5 shrink-0 text-emerald-600" strokeWidth={2} />
            <p className="text-sm font-semibold text-emerald-700">
              ปี {toBuddhistYear(YEAR)} มีกำไรสุทธิ{" "}
              <span className="font-black">{fmtMoney(summary.totalProfit)} บาท</span>
              {" "}คิดเป็น{" "}
              <span className="font-black">{marginPercent.toFixed(1)}%</span>
              {" "}ของยอดขายรวม{" "}
              <span className="font-black">{fmtMoney(summary.totalRevenue)} บาท</span>
            </p>
          </div>

        </div>
      </div>
    </AppSidebarLayout>
  );
}
