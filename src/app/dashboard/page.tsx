import { redirect } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Package,
  Store,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { AppSidebarLayout } from "@/components/app-sidebar";
import { requireAppSession, roleHomePage } from "@/lib/auth/authorization";
import { getDashboardOverview, type WeeklyBar } from "@/lib/dashboard/overview";
import { getTodayInBangkok } from "@/lib/orders/date";

export const metadata = { title: "ภาพรวม" };

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtMoney(n: number) {
  if (n >= 1_000_000) return `฿${(n / 1_000_000).toLocaleString("th-TH", { maximumFractionDigits: 1 })}M`;
  if (n >= 10_000) return `฿${(n / 1_000).toLocaleString("th-TH", { maximumFractionDigits: 1 })}K`;
  return `฿${fmt(n)}`;
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(new Date(iso + "T00:00:00+07:00"));
}

// ─── SVG Area Chart ───────────────────────────────────────────────────────────

function buildCurve(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return pts.length === 1 ? `M ${pts[0].x} ${pts[0].y}` : "";
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const cx = (b.x - a.x) * 0.42;
    d += ` C ${(a.x + cx).toFixed(2)} ${a.y.toFixed(2)} ${(b.x - cx).toFixed(2)} ${b.y.toFixed(2)} ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
  }
  return d;
}

function AreaChart({ bars }: { bars: WeeklyBar[] }) {
  const W = 600;
  const H = 160;
  const p = { t: 28, r: 60, b: 28, l: 8 };
  const pw = W - p.l - p.r;
  const ph = H - p.t - p.b;
  const n = bars.length;
  const maxVal = Math.max(...bars.map((b) => b.amount), 1);
  const baseY = p.t + ph;

  const pts = bars.map((b, i) => ({
    x: p.l + (n <= 1 ? pw / 2 : (i / (n - 1)) * pw),
    y: p.t + (1 - b.amount / maxVal) * ph,
  }));

  const curve = buildCurve(pts);
  const area = pts.length >= 2
    ? `${curve} L ${pts[n - 1].x.toFixed(2)} ${baseY} L ${pts[0].x.toFixed(2)} ${baseY} Z`
    : "";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" aria-label="กราฟยอดขาย 7 วัน">
      <defs>
        <linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#003366" stopOpacity="0.13" />
          <stop offset="100%" stopColor="#003366" stopOpacity="0" />
        </linearGradient>
      </defs>

      {[0.5, 1.0].map((r, i) => (
        <g key={i}>
          <line
            x1={p.l} y1={p.t + ph * (1 - r)}
            x2={W - p.r} y2={p.t + ph * (1 - r)}
            stroke="#eef0f4" strokeWidth="1"
          />
          <text x={W - p.r + 8} y={p.t + ph * (1 - r) + 4}
            fontSize="9.5" fill="#c0c8d4" textAnchor="start">
            {fmtMoney(maxVal * r)}
          </text>
        </g>
      ))}

      <line x1={p.l} y1={baseY} x2={W - p.r} y2={baseY} stroke="#e8ecf2" strokeWidth="1" />

      {area && <path d={area} fill="url(#aGrad)" />}
      {curve && <path d={curve} fill="none" stroke="#003366" strokeWidth="2.2"
        strokeLinecap="round" strokeLinejoin="round" />}

      {pts.map((pt, i) => {
        const isToday = i === n - 1;
        const bar = bars[i];
        return (
          <g key={bar.date}>
            {isToday && <circle cx={pt.x} cy={pt.y} r="11" fill="#003366" fillOpacity="0.08" />}
            <circle cx={pt.x} cy={pt.y} r={isToday ? 5 : 3}
              fill={isToday ? "#003366" : "white"}
              stroke={isToday ? "none" : "#003366"}
              strokeWidth={isToday ? 0 : 1.5}
              strokeOpacity={0.35}
            />
            {isToday && bar.amount > 0 && (
              <text x={pt.x} y={pt.y - 16} textAnchor="middle"
                fontSize="10.5" fill="#003366" fontWeight="700">
                {fmtMoney(bar.amount)}
              </text>
            )}
            <text x={pt.x} y={H - 5} textAnchor="middle" fontSize="10"
              fill={isToday ? "#003366" : "#b8c2d0"}
              fontWeight={isToday ? "700" : "400"}>
              {bar.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Ranked List ──────────────────────────────────────────────────────────────

function RankedList({
  items,
  barColor,
  emptyText,
}: {
  items: { id: string; label: string; amount: number }[];
  barColor: string;
  emptyText: string;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-black/20">
        <Package className="h-6 w-6" strokeWidth={1.5} />
        <p className="text-xs">{emptyText}</p>
      </div>
    );
  }

  const maxAmt = items[0].amount;
  const medalBg = ["bg-amber-400", "bg-black/[0.12]", "bg-amber-700/25", "bg-black/[0.07]", "bg-black/[0.07]"];
  const medalText = ["text-white", "text-black/50", "text-amber-800/70", "text-black/30", "text-black/30"];

  return (
    <ul className="space-y-3">
      {items.map((item, i) => {
        const pct = maxAmt > 0 ? (item.amount / maxAmt) * 100 : 0;
        return (
          <li key={item.id}>
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold tabular-nums ${medalBg[i]} ${medalText[i]}`}>
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.label}</span>
              <span className="shrink-0 text-sm font-bold tabular-nums">{fmtMoney(item.amount)}</span>
            </div>
            <div className="ml-7 mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-black/[0.06]">
              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const session = await requireAppSession();
  if (session.role === "warehouse") redirect(roleHomePage("warehouse"));
  const today = getTodayInBangkok();
  const { kpi, weeklyTrend, topCustomers, topProducts } = await getDashboardOverview(
    session.organizationId,
  );

  const weeklyTotal = weeklyTrend.reduce((s, b) => s + b.amount, 0);
  const weeklyCount = weeklyTrend.reduce((s, b) => s + b.count, 0);
  const weeklyAvg = weeklyCount > 0 ? weeklyTotal / 7 : 0;
  const countDiff = (weeklyTrend[6]?.count ?? 0) - (weeklyTrend[5]?.count ?? 0);
  const hasActionItems = kpi.submittedOrderCount > 0 || kpi.pendingDeliveryCount > 0;

  const customerItems = topCustomers.map((c) => ({
    id: c.customerId, label: c.customerName, amount: c.totalAmount,
  }));
  const productItems = topProducts.map((p) => ({
    id: p.productId, label: p.productName, amount: p.totalAmount,
  }));

  return (
    <AppSidebarLayout>
      <div className="min-h-screen bg-[#f4f7fb]">

        {/* ── Page header ─────────────────────────────────────────────── */}
        <div className="border-b border-black/[0.06] bg-white">
          <div className="h-[3px] bg-gradient-to-r from-[#003366] via-[#1a5fa8] to-[#003366]" />
          <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-black/25">
                  T&amp;Y Noodle · ภาพรวม
                </p>
                <h1 className="mt-1 text-xl font-bold sm:text-2xl">สวัสดี, {session.displayName}</h1>
                <p className="mt-0.5 text-xs text-black/40">{fmtDate(today)}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2 pt-0.5">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  ออนไลน์
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-5xl space-y-4 px-4 py-4 sm:px-6 sm:py-5">

          {/* ── 1. ACTION STATUS ────────────────────────────────────────
               สิ่งที่ต้องดำเนินการ — แสดงเสมอ เพื่อให้เห็นสถานะระบบ  */}
          <section>
            {hasActionItems ? (
              <div className="overflow-hidden rounded-2xl border border-orange-200/80 bg-orange-50/60">
                <div className="flex items-center gap-2 border-b border-orange-200/60 px-4 py-3">
                  <AlertCircle className="h-4 w-4 text-orange-500" strokeWidth={2.2} />
                  <span className="text-xs font-bold uppercase tracking-widest text-orange-600">
                    ต้องดำเนินการ
                  </span>
                </div>
                <div className="divide-y divide-orange-100/80">
                  {kpi.submittedOrderCount > 0 && (
                    <Link href="/orders/incoming"
                      className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-orange-50/80 active:bg-orange-100/60">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                        <ClipboardCheck className="h-4.5 w-4.5 text-orange-500" strokeWidth={2} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">รอยืนยันออเดอร์</p>
                        <p className="text-xs text-black/40">
                          {kpi.submittedOrderCount} รายการยังไม่ได้ยืนยัน
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full bg-orange-500 px-2.5 py-0.5 text-xs font-bold text-white">
                          {kpi.submittedOrderCount}
                        </span>
                        <ChevronRight className="h-4 w-4 text-black/25" strokeWidth={2} />
                      </div>
                    </Link>
                  )}
                  {kpi.pendingDeliveryCount > 0 && (
                    <Link href="/delivery"
                      className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-orange-50/80 active:bg-orange-100/60">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                        <Truck className="h-4.5 w-4.5 text-amber-500" strokeWidth={2} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">รอจัดส่ง</p>
                        <p className="text-xs text-black/40">
                          {kpi.pendingDeliveryCount} รายการรอออกรถ
                          {kpi.pendingDeliveryAmount > 0 && ` · ${fmtMoney(kpi.pendingDeliveryAmount)}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full bg-amber-400 px-2.5 py-0.5 text-xs font-bold text-white">
                          {kpi.pendingDeliveryCount}
                        </span>
                        <ChevronRight className="h-4 w-4 text-black/25" strokeWidth={2} />
                      </div>
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-200/70 bg-emerald-50/60 px-4 py-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" strokeWidth={2.2} />
                <p className="text-xs font-semibold text-emerald-700">
                  ทุกอย่างเรียบร้อย — ไม่มีรายการรอดำเนินการ
                </p>
              </div>
            )}
          </section>

          {/* ── 2. KPI CARDS ────────────────────────────────────────────
               4 ตัวเลขหลักที่เจ้าของกิจการต้องดูทุกวัน              */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">

            {/* ออเดอร์วันนี้ */}
            <div className="relative overflow-hidden rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm sm:p-5">
              <div className="absolute left-0 top-0 h-[3px] w-full bg-[#003366]" />
              <div className="flex items-start justify-between gap-1">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#eef3f9]">
                  <ClipboardList className="h-4 w-4 text-[#003366]" strokeWidth={2.2} />
                </div>
                {countDiff !== 0 && (
                  <span className={`mt-0.5 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    countDiff > 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"
                  }`}>
                    {countDiff > 0
                      ? <TrendingUp className="h-2.5 w-2.5" strokeWidth={2.5} />
                      : <TrendingDown className="h-2.5 w-2.5" strokeWidth={2.5} />}
                    {Math.abs(countDiff)}
                  </span>
                )}
              </div>
              <p className="mt-4 text-3xl font-black tabular-nums leading-none text-[#003366] sm:text-4xl">
                {fmt(kpi.todayOrderCount)}
              </p>
              <p className="mt-1.5 text-sm font-bold tabular-nums text-blue-600">
                {kpi.todayOrderAmount > 0 ? fmtMoney(kpi.todayOrderAmount) : "—"}
              </p>
              <p className="mt-1 text-[11px] text-black/35">ออเดอร์วันนี้</p>
            </div>

            {/* รอยืนยัน — action card */}
            <Link href="/orders/incoming"
              className={`group relative overflow-hidden rounded-2xl border p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-5 ${
                kpi.submittedOrderCount > 0
                  ? "border-orange-200/80 bg-orange-50/50"
                  : "border-black/[0.06] bg-white"
              }`}>
              <div className={`absolute left-0 top-0 h-[3px] w-full ${
                kpi.submittedOrderCount > 0 ? "bg-orange-400" : "bg-black/10"
              }`} />
              <div className="flex items-start justify-between gap-1">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                  kpi.submittedOrderCount > 0 ? "bg-orange-100" : "bg-black/[0.05]"
                }`}>
                  <ClipboardCheck className={`h-4 w-4 ${
                    kpi.submittedOrderCount > 0 ? "text-orange-500" : "text-black/30"
                  }`} strokeWidth={2.2} />
                </div>
                <ArrowRight className="mt-0.5 h-3.5 w-3.5 text-black/20 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
              </div>
              <p className={`mt-4 text-3xl font-black tabular-nums leading-none sm:text-4xl ${
                kpi.submittedOrderCount > 0 ? "text-orange-500" : "text-black/20"
              }`}>
                {fmt(kpi.submittedOrderCount)}
              </p>
              <p className="mt-1.5 text-sm font-bold tabular-nums text-transparent select-none">—</p>
              <p className="mt-1 text-[11px] text-black/35">รอยืนยัน</p>
            </Link>

            {/* รอจัดส่ง — action card */}
            <Link href="/delivery"
              className={`group relative overflow-hidden rounded-2xl border p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-5 ${
                kpi.pendingDeliveryCount > 0
                  ? "border-amber-200/80 bg-amber-50/50"
                  : "border-black/[0.06] bg-white"
              }`}>
              <div className={`absolute left-0 top-0 h-[3px] w-full ${
                kpi.pendingDeliveryCount > 0 ? "bg-amber-400" : "bg-black/10"
              }`} />
              <div className="flex items-start justify-between gap-1">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                  kpi.pendingDeliveryCount > 0 ? "bg-amber-100" : "bg-black/[0.05]"
                }`}>
                  <Truck className={`h-4 w-4 ${
                    kpi.pendingDeliveryCount > 0 ? "text-amber-500" : "text-black/30"
                  }`} strokeWidth={2.2} />
                </div>
                <ArrowRight className="mt-0.5 h-3.5 w-3.5 text-black/20 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
              </div>
              <p className={`mt-4 text-3xl font-black tabular-nums leading-none sm:text-4xl ${
                kpi.pendingDeliveryCount > 0 ? "text-amber-500" : "text-black/20"
              }`}>
                {fmt(kpi.pendingDeliveryCount)}
              </p>
              <p className="mt-1.5 text-sm font-bold tabular-nums text-amber-500">
                {kpi.pendingDeliveryAmount > 0 ? fmtMoney(kpi.pendingDeliveryAmount) : "—"}
              </p>
              <p className="mt-1 text-[11px] text-black/35">รอจัดส่ง</p>
            </Link>

            {/* ยอดเดือนนี้ */}
            <div className="relative overflow-hidden rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm sm:p-5">
              <div className="absolute left-0 top-0 h-[3px] w-full bg-emerald-400" />
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
                <TrendingUp className="h-4 w-4 text-emerald-600" strokeWidth={2.2} />
              </div>
              <p className="mt-4 text-3xl font-black tabular-nums leading-none text-emerald-600 sm:text-4xl">
                {fmtMoney(kpi.monthDeliveredAmount)}
              </p>
              <p className="mt-1.5 text-sm font-bold tabular-nums text-transparent select-none">—</p>
              <p className="mt-1 text-[11px] text-black/35">ยอดเดือนนี้</p>
            </div>

          </section>

          {/* ── 3. TREND CHART ──────────────────────────────────────────
               กราฟยอดขาย 7 วัน + สถิติสนับสนุน                       */}
          <section className="rounded-2xl border border-black/[0.06] bg-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/[0.05] px-5 py-4 sm:px-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-black/25">
                  ยอดขาย 7 วันล่าสุด
                </p>
                <p className="mt-1 text-2xl font-black tabular-nums sm:text-3xl">
                  {fmtMoney(weeklyTotal)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-0.5">
                <div className="text-right">
                  <p className="text-[11px] text-black/30">เฉลี่ย/วัน</p>
                  <p className="text-sm font-bold tabular-nums">{fmtMoney(weeklyAvg)}</p>
                </div>
                <div className="h-8 w-px bg-black/[0.06]" />
                <div className="text-right">
                  <p className="text-[11px] text-black/30">ร้านค้าที่ใช้งาน</p>
                  <p className="text-sm font-bold tabular-nums">{fmt(kpi.activeCustomerCount)} ร้าน</p>
                </div>
                <div className="h-8 w-px bg-black/[0.06]" />
                <span className="rounded-full border border-black/[0.06] bg-black/[0.03] px-2.5 py-1 text-[11px] font-semibold text-black/35">
                  {fmt(weeklyCount)} รายการ
                </span>
              </div>
            </div>
            <div className="px-2 py-3 sm:px-3" style={{ height: "160px" }}>
              <AreaChart bars={weeklyTrend} />
            </div>
          </section>

          {/* ── 4. RANKINGS ─────────────────────────────────────────────
               ร้านค้าและสินค้าที่มียอดสูงสุดเดือนนี้                  */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">

            <div className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#003366]">
                  <Store className="h-4 w-4 text-white" strokeWidth={2} />
                </div>
                <div>
                  <p className="text-sm font-bold">ร้านค้าสั่งมากที่สุด</p>
                  <p className="text-[11px] text-black/35">เดือนนี้ · Top 5</p>
                </div>
              </div>
              <RankedList items={customerItems} barColor="bg-[#003366]/60" emptyText="ยังไม่มีข้อมูลเดือนนี้" />
            </div>

            <div className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500">
                  <Package className="h-4 w-4 text-white" strokeWidth={2} />
                </div>
                <div>
                  <p className="text-sm font-bold">สินค้าขายดีที่สุด</p>
                  <p className="text-[11px] text-black/35">เดือนนี้ · Top 5</p>
                </div>
              </div>
              <RankedList items={productItems} barColor="bg-emerald-400" emptyText="ยังไม่มีข้อมูลเดือนนี้" />
            </div>

          </section>

          {/* ── 5. QUICK LINKS ──────────────────────────────────────────
               ทางลัดไปยังงานประจำวัน                                  */}
          <section>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-black/25">
              ทางลัด
            </p>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
              {[
                { href: "/orders", icon: ClipboardList, label: "สรุปออเดอร์", iconColor: "text-[#003366]", iconBg: "bg-[#eef3f9]" },
                { href: "/orders/incoming", icon: ClipboardCheck, label: "รับออเดอร์", iconColor: "text-orange-600", iconBg: "bg-orange-50" },
                { href: "/delivery", icon: Truck, label: "จัดส่ง", iconColor: "text-amber-600", iconBg: "bg-amber-50" },
                { href: "/billing", icon: FileText, label: "วางบิล", iconColor: "text-violet-600", iconBg: "bg-violet-50" },
                { href: "/stock", icon: Boxes, label: "สต็อก", iconColor: "text-emerald-600", iconBg: "bg-emerald-50" },
                { href: "/settings/customers", icon: Users, label: "ร้านค้า", iconColor: "text-sky-600", iconBg: "bg-sky-50" },
              ].map(({ href, icon: Icon, label, iconColor, iconBg }) => (
                <Link key={href} href={href}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-black/[0.06] bg-white px-2 py-4 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.97]">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}>
                    <Icon className={`h-5 w-5 ${iconColor}`} strokeWidth={2} />
                  </div>
                  <span className="text-xs font-semibold leading-tight">{label}</span>
                </Link>
              ))}
            </div>
          </section>

          {/* ── Footer ── */}
          <div className="border-t border-black/[0.05] pb-6 pt-4">
            <p className="text-[11px] text-black/20">
              T&amp;YNoodle · {session.role === "admin" ? "ผู้ดูแลระบบ" : "สมาชิก"}
            </p>
          </div>

        </div>
      </div>
    </AppSidebarLayout>
  );
}
