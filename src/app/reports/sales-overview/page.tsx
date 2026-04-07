import { BarChart2, TrendingUp, TrendingDown, CalendarDays, ShoppingCart, Wallet } from "lucide-react";
import { AppSidebarLayout } from "@/components/app-sidebar";
import { requireAppSession } from "@/lib/auth/authorization";
import { getTodayInBangkok } from "@/lib/orders/date";
import { getSalesOverviewData, getAvailableYears } from "@/lib/reports/sales-overview";
import { SalesCharts } from "./sales-charts";

export const metadata = { title: "สรุปยอดขายรายปี" };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtMoneyShort(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} ล.`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return fmtMoney(n);
}

function toBuddhistYear(ce: number) {
  return ce + 543;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  accent?: "emerald" | "red" | "amber" | "blue";
}) {
  const accentMap = {
    emerald: "text-emerald-600 bg-emerald-50",
    red: "text-red-500 bg-red-50",
    amber: "text-amber-600 bg-amber-50",
    blue: "text-[#003366] bg-blue-50",
  };
  const iconClass = accentMap[accent ?? "blue"];

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(27,27,33,0.05)] sm:p-5">
      <div className="flex items-center gap-2.5">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
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

// ─── Year selector ────────────────────────────────────────────────────────────

function YearSelector({ years, selected }: { years: number[]; selected: number }) {
  return (
    <form method="GET" action="/reports/sales-overview">
      <div className="flex flex-wrap items-center gap-2">
        {years.map((y) => (
          <button
            key={y}
            name="year"
            value={String(y)}
            type="submit"
            className={`rounded-xl px-4 py-2 text-sm font-bold transition active:scale-95 ${
              y === selected
                ? "bg-[#0f2f56] text-white shadow-md"
                : "border border-slate-200 bg-white text-slate-600 hover:border-[#003366] hover:text-[#003366]"
            }`}
          >
            {toBuddhistYear(y)}
          </button>
        ))}
      </div>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type PageProps = { searchParams: Promise<{ year?: string }> };

export default async function SalesOverviewPage({ searchParams }: PageProps) {
  const session = await requireAppSession();
  const params = await searchParams;

  const today = getTodayInBangkok();
  const currentYear = parseInt(today.slice(0, 4), 10);
  const rawYear = parseInt(params.year ?? "", 10);
  const year = Number.isFinite(rawYear) && rawYear >= 2000 && rawYear <= currentYear
    ? rawYear
    : currentYear;

  const [data, availableYears] = await Promise.all([
    getSalesOverviewData(session.organizationId, year),
    getAvailableYears(session.organizationId),
  ]);

  const { summary, rows, prevYearRevenue, prevYearRows } = data;
  const profitPositive = summary.totalProfit >= 0;
  const marginPercent = summary.totalRevenue > 0
    ? (summary.totalProfit / summary.totalRevenue) * 100
    : 0;

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
                  ภาพรวมยอดขาย กำไร และแนวโน้มรายเดือน · ปี พ.ศ. {toBuddhistYear(year)}
                </p>
              </div>
            </div>
          </header>

          {/* Year selector */}
          <div className="mb-6 sm:mb-8">
            <p className="mb-2.5 text-xs font-bold uppercase tracking-widest text-slate-400">เลือกปี</p>
            <YearSelector years={availableYears} selected={year} />
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
              icon={profitPositive ? TrendingUp : TrendingDown}
              accent={profitPositive ? "emerald" : "red"}
            />
            <KpiCard
              label="เดือนยอดดีที่สุด"
              value={summary.peakMonth ? summary.peakMonth.monthLabel : "—"}
              sub={summary.peakMonth ? `${fmtMoney(summary.peakMonth.revenue)} บาท` : "ยังไม่มีข้อมูล"}
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

          {/* Charts */}
          {summary.totalRevenue === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-slate-200 bg-white py-24 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
                <BarChart2 className="h-8 w-8 text-slate-300" strokeWidth={1.5} />
              </div>
              <div>
                <p className="font-semibold text-slate-500">ไม่มีข้อมูลยอดขายในปี พ.ศ. {toBuddhistYear(year)}</p>
                <p className="mt-1 text-sm text-slate-400">ลองเลือกปีอื่น หรือรอจนกว่าจะมีการจัดส่งสินค้า</p>
              </div>
            </div>
          ) : (
            <SalesCharts
              rows={rows}
              summary={summary}
              prevYearRevenue={prevYearRevenue}
              prevYearRows={prevYearRows}
              year={year}
            />
          )}

          {/* Profit trend badge */}
          {summary.totalRevenue > 0 && (
            <div className={`mt-5 flex items-center gap-3 rounded-2xl border px-5 py-4 ${
              profitPositive
                ? "border-emerald-100 bg-emerald-50"
                : "border-red-100 bg-red-50"
            }`}>
              {profitPositive
                ? <TrendingUp className="h-5 w-5 shrink-0 text-emerald-600" strokeWidth={2} />
                : <TrendingDown className="h-5 w-5 shrink-0 text-red-500" strokeWidth={2} />
              }
              <p className={`text-sm font-semibold ${profitPositive ? "text-emerald-700" : "text-red-600"}`}>
                ปี {toBuddhistYear(year)} มีกำไรสุทธิ{" "}
                <span className="font-black">{fmtMoney(summary.totalProfit)} บาท</span>
                {" "}คิดเป็น{" "}
                <span className="font-black">{marginPercent.toFixed(1)}%</span>
                {" "}ของยอดขายรวม{" "}
                <span className="font-black">{fmtMoney(summary.totalRevenue)} บาท</span>
              </p>
            </div>
          )}

        </div>
      </div>
    </AppSidebarLayout>
  );
}
