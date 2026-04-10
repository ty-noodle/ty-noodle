import { redirect } from "next/navigation";
import Image from "next/image";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Package,
  Store,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppSidebarLayout } from "@/components/app-sidebar";
import { requireAppSession, roleHomePage } from "@/lib/auth/authorization";
import { getDashboardOverview, type RecentOrder, type WeeklyBar } from "@/lib/dashboard/overview";
import { getTodayInBangkok } from "@/lib/orders/date";

export const metadata = { title: "ภาพรวม" };

function fmtNumber(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtMoney(n: number) {
  if (n >= 1_000_000) {
    return `฿${(n / 1_000_000).toLocaleString("th-TH", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    })}M`;
  }
  return `฿${fmtNumber(n)}`;
}

function fmtMoneyNoSymbol(n: number) {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toLocaleString("th-TH", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    })}M`;
  }
  return fmtNumber(n);
}

function fmtThaiDateLong(iso: string) {
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(new Date(`${iso}T00:00:00+07:00`));
}

function fmtThaiShortDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year + 543}`;
}

function fmtThaiWeekdayShort(iso: string) {
  return new Intl.DateTimeFormat("th-TH", {
    weekday: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(`${iso}T00:00:00+07:00`));
}

function fmtChangePercent(value: number | null) {
  if (value === null || Number.isNaN(value) || !Number.isFinite(value)) return "-";
  const rounded = Math.abs(value) < 0.05 ? 0 : Math.round(value * 10) / 10;
  if (rounded > 0) return `+${rounded.toLocaleString("th-TH", { maximumFractionDigits: 1 })}%`;
  if (rounded < 0) return `${rounded.toLocaleString("th-TH", { maximumFractionDigits: 1 })}%`;
  return "0%";
}

function buildCurve(points: Array<{ x: number; y: number }>) {
  if (points.length < 2) {
    return points.length === 1 ? `M ${points[0].x} ${points[0].y}` : "";
  }
  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const handleX = (b.x - a.x) * 0.42;
    path += ` C ${(a.x + handleX).toFixed(2)} ${a.y.toFixed(2)} ${(b.x - handleX).toFixed(2)} ${b.y.toFixed(2)} ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
  }
  return path;
}

function TrendChart({ bars }: { bars: WeeklyBar[] }) {
  const width = 620;
  const height = 178;
  const padding = { top: 44, right: 22, bottom: 30, left: 12 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...bars.map((bar) => bar.amount), 1);
  const points = bars.map((bar, index) => ({
    x: padding.left + (bars.length <= 1 ? plotWidth / 2 : (index / (bars.length - 1)) * plotWidth),
    y: padding.top + (1 - bar.amount / maxValue) * plotHeight,
  }));
  const linePath = buildCurve(points);
  const areaPath =
    points.length > 1
      ? `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${padding.top + plotHeight} L ${points[0].x.toFixed(2)} ${padding.top + plotHeight} Z`
      : "";

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" aria-label="แนวโน้มยอดขาย 7 วันล่าสุด">
      <defs>
        <linearGradient id="dashboardTrendArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a237e" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#1a237e" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {areaPath && <path d={areaPath} fill="url(#dashboardTrendArea)" />}
      {linePath && (
        <path
          d={linePath}
          fill="none"
          stroke="#000666"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {points.map((point, index) => (
        <g key={bars[index].date}>
          <circle cx={point.x} cy={point.y} r={index === points.length - 1 ? 4.5 : 3.3} fill="#000666" />
          {(() => {
            const levelOffset = index % 3 === 0 ? 0 : index % 3 === 1 ? 20 : 40;
            const labelY = Math.max(16, point.y - 24 - levelOffset);
            const isZero = bars[index].amount <= 0;
            return (
              <>
                <line
                  className="sm:hidden"
                  x1={point.x}
                  y1={point.y - 4}
                  x2={point.x}
                  y2={labelY + 4}
                  stroke={isZero ? "#cbd5e1" : "#94a3b8"}
                  strokeWidth="1.2"
                />
                <text
                  className="sm:hidden"
                  x={point.x}
                  y={labelY}
                  textAnchor="middle"
                  fontSize="14.5"
                  fill={isZero ? "#64748b" : "#000666"}
                  fontWeight="800"
                >
                  {fmtMoneyNoSymbol(bars[index].amount)}
                </text>
              </>
            );
          })()}
          <text
            x={point.x}
            y={height - 8}
            textAnchor="middle"
            fontSize="12"
            fill={index === points.length - 1 ? "#000666" : "#6b7280"}
            fontWeight={index === points.length - 1 ? "700" : "500"}
          >
            {bars[index].label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function statusBadge(status: RecentOrder["status"]) {
  if (status === "submitted") {
    return { label: "รอยืนยัน", className: "bg-amber-100 text-amber-700" };
  }
  if (status === "confirmed") {
    return { label: "ยืนยันแล้ว", className: "bg-sky-100 text-sky-700" };
  }
  if (status === "cancelled") {
    return { label: "ยกเลิก", className: "bg-rose-100 text-rose-700" };
  }
  return { label: "ฉบับร่าง", className: "bg-slate-100 text-slate-600" };
}

function KpiCard({
  title,
  value,
  subtitle,
  icon,
  tone = "primary",
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: ReactNode;
  tone?: "primary" | "success";
}) {
  const iconBg = tone === "success" ? "bg-emerald-100 text-emerald-700" : "bg-[#e9ecff] text-[#000666]";
  const valueColor = tone === "success" ? "text-emerald-700" : "text-[#000666]";

  return (
    <article className="rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(27,27,33,0.04),0_12px_40px_rgba(27,27,33,0.08)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-semibold text-[#454652]">{title}</p>
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${iconBg}`}>{icon}</span>
      </div>
      <p className={`mt-3 text-3xl font-black leading-none tabular-nums sm:text-[2rem] ${valueColor}`}>{value}</p>
      <p className="mt-1.5 text-[12px] font-medium text-[#454652]">{subtitle}</p>
    </article>
  );
}

function ActionCard({
  href,
  title,
  detail,
  icon,
  badge,
}: {
  href: string;
  title: string;
  detail: string;
  icon: ReactNode;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(27,27,33,0.04),0_12px_40px_rgba(27,27,33,0.08)] transition hover:-translate-y-0.5"
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eef1ff] text-[#000666]">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-bold text-[#1b1b21]">{title}</p>
            {badge ? (
              <span className="rounded-full bg-[#000666] px-2 py-0.5 text-xs font-bold text-white">{badge}</span>
            ) : null}
          </div>
          <p className="mt-1 text-xs font-medium text-[#454652]">{detail}</p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-[#8f94a3] transition group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function TopCustomersBarBlock({
  items,
}: {
  items: Array<{ id: string; label: string; amount: number }>;
}) {
  const maxAmount = items.length > 0 ? Math.max(...items.map((item) => item.amount), 1) : 1;

  return (
    <section className="rounded-2xl bg-white p-5 shadow-[0_4px_20px_rgba(27,27,33,0.04),0_12px_40px_rgba(27,27,33,0.08)] sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#eef1ff] text-[#000666]">
          <Store className="h-4.5 w-4.5" strokeWidth={2.2} />
        </span>
        <h3 className="text-base font-bold text-[#1b1b21]">ร้านค้ายอดขายสูงสุด 5 อันดับ</h3>
      </div>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm font-medium text-[#7b8091]">ยังไม่มีข้อมูลในช่วงนี้</p>
      ) : (
        <div className="pb-1">
          <div
            className="grid items-end gap-2 sm:gap-3"
            style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.min(items.length, 5))}, minmax(0, 1fr))` }}
          >
            {items.map((item, index) => {
              const heightPct = Math.max(10, (item.amount / maxAmount) * 100);
              return (
                <div key={item.id} className="min-w-0">
                  <p className="truncate text-center text-[10px] font-bold tabular-nums text-[#000666] sm:text-[11px]">
                    {fmtMoney(item.amount)}
                  </p>
                  <div className="mt-2 flex h-32 items-end justify-center sm:h-40">
                    <div
                      className="w-6 rounded-md sm:w-10 sm:rounded-lg"
                      style={{
                        height: `${heightPct}%`,
                        backgroundColor: CUSTOMER_BAR_COLORS[index % CUSTOMER_BAR_COLORS.length],
                      }}
                    />
                  </div>
                  <div className="mt-2 text-center">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#e9ecff] text-[10px] font-bold text-[#000666]">
                      {index + 1}
                    </span>
                    <p className="mt-1.5 line-clamp-2 text-[10px] font-semibold leading-3.5 text-[#1b1b21] sm:text-xs sm:leading-4">
                      {item.label}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

const CUSTOMER_BAR_COLORS = ["#000666", "#D8CDBA", "#F59E0B", "#9CA3AF", "#8B5E3C"];

function TopProductsListBlock({
  items,
}: {
  items: Array<{ id: string; label: string; amount: number; imageUrl: string | null }>;
}) {
  const maxAmount = items.length > 0 ? Math.max(...items.map((item) => item.amount), 1) : 1;

  return (
    <section className="rounded-2xl bg-white p-5 shadow-[0_4px_20px_rgba(27,27,33,0.04),0_12px_40px_rgba(27,27,33,0.08)] sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#eef1ff] text-[#000666]">
          <Package className="h-4.5 w-4.5" strokeWidth={2.2} />
        </span>
        <h3 className="text-base font-bold text-[#1b1b21]">สินค้าขายดี 5 อันดับแรก</h3>
      </div>

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm font-medium text-[#7b8091]">ยังไม่มีข้อมูลในช่วงนี้</p>
      ) : (
        <ul className="divide-y divide-[#e4e8f1]">
          {items.map((item, index) => {
            const progress = Math.max(8, (item.amount / maxAmount) * 100);
            return (
              <li key={item.id} className="py-3">
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                  <div className="relative h-12 w-12 overflow-hidden rounded-lg bg-white">
                    <Image
                      src={item.imageUrl || "/placeholders/product-placeholder.svg"}
                      alt={item.label}
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                    <span className="absolute left-1 top-1 inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-[#000666] px-1 text-[9px] font-bold text-white">
                      {index + 1}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#1b1b21]">{item.label}</p>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#e5e7ef]">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(135deg,#000666,#1a237e)]"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  <p className="shrink-0 text-sm font-bold tabular-nums text-[#000666]">{fmtMoney(item.amount)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default async function DashboardPage() {
  const session = await requireAppSession();
  if (session.role === "warehouse") redirect(roleHomePage("warehouse"));

  const today = getTodayInBangkok();
  const { kpi, recentOrders, topCustomers, topProducts, weeklyTrend } = await getDashboardOverview(
    session.organizationId,
  );

  const weeklyTotal = weeklyTrend.reduce((sum, item) => sum + item.amount, 0);
  const weeklyCount = weeklyTrend.reduce((sum, item) => sum + item.count, 0);
  const weeklyRows = weeklyTrend.map((row, index) => {
    const prev = index > 0 ? weeklyTrend[index - 1].amount : null;
    const changePct = prev !== null && prev > 0 ? ((row.amount - prev) / prev) * 100 : null;
    return {
      ...row,
      changePct,
    };
  });
  const weeklyAvgAmount = weeklyTrend.length > 0 ? weeklyTotal / weeklyTrend.length : 0;
  const topCustomerRows = topCustomers.map((row) => ({
    id: row.customerId,
    label: row.customerName,
    amount: row.totalAmount,
  }));
  const topProductRows = topProducts.map((row) => ({
    id: row.productId,
    label: row.productName,
    amount: row.totalAmount,
    imageUrl: row.imageUrl,
  }));

  return (
    <AppSidebarLayout>
      <div className="min-h-screen bg-[#fbf8ff] text-[#1b1b21]">
        <div className="mx-auto max-w-6xl px-4 pb-8 pt-5 sm:px-6 sm:pt-7 lg:px-8">
          <header className="rounded-2xl bg-[#f5f2fb] p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#5f6270]">T&Y Noodle</p>
                <h1 className="mt-1 text-2xl font-black leading-tight text-[#000666] sm:text-[2rem]">แดชบอร์ดภาพรวมรายวัน</h1>
                <p className="mt-1.5 text-sm font-medium text-[#454652]">สวัสดี {session.displayName} · {fmtThaiDateLong(today)}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Link
                  href="/orders/incoming"
                  className="inline-flex items-center justify-center rounded-xl bg-[linear-gradient(135deg,#000666,#1a237e)] px-4 py-2.5 text-sm font-bold text-white"
                >
                  รับออเดอร์
                </Link>
                <Link
                  href="/delivery"
                  className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#000666]"
                >
                  ใบจัดส่ง
                </Link>
              </div>
            </div>
          </header>

          <main className="mt-6 space-y-8 sm:mt-8 sm:space-y-10">
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
              <KpiCard
                title="ออเดอร์วันนี้"
                value={fmtNumber(kpi.todayOrderCount)}
                subtitle="รายการ"
                icon={<ClipboardList className="h-4.5 w-4.5" strokeWidth={2.2} />}
              />
              <KpiCard
                title="ยอดขายวันนี้"
                value={fmtMoney(kpi.todayOrderAmount)}
                subtitle="บาท"
                icon={<TrendingUp className="h-4.5 w-4.5" strokeWidth={2.2} />}
                tone="success"
              />
              <KpiCard
                title="รอยืนยันออเดอร์"
                value={fmtNumber(kpi.submittedOrderCount)}
                subtitle="รายการ"
                icon={<ClipboardCheck className="h-4.5 w-4.5" strokeWidth={2.2} />}
              />
              <KpiCard
                title="ยอดส่งสำเร็จเดือนนี้"
                value={fmtMoney(kpi.monthDeliveredAmount)}
                subtitle="ยอดสะสม"
                icon={<TrendingUp className="h-4.5 w-4.5" strokeWidth={2.2} />}
                tone="success"
              />
            </section>

            <section>
              <div className="mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-4.5 w-4.5 text-[#000666]" />
                <h2 className="text-base font-bold text-[#1b1b21]">งานที่ต้องทำตอนนี้</h2>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <ActionCard
                  href="/orders/incoming"
                  title="รอยืนยันออเดอร์"
                  detail="ตรวจและยืนยันคำสั่งซื้อใหม่"
                  icon={<ClipboardCheck className="h-5 w-5" strokeWidth={2.2} />}
                  badge={`${fmtNumber(kpi.submittedOrderCount)}`}
                />
                <ActionCard
                  href="/delivery"
                  title="รอจัดส่ง"
                  detail={kpi.pendingDeliveryAmount > 0 ? `มูลค่า ${fmtMoney(kpi.pendingDeliveryAmount)} บาท` : "ตรวจสอบรายการก่อนออกรถ"}
                  icon={<Truck className="h-5 w-5" strokeWidth={2.2} />}
                  badge={`${fmtNumber(kpi.pendingDeliveryCount)}`}
                />
                <ActionCard
                  href="/stock"
                  title="จัดการสต็อก"
                  detail="ตรวจรับเข้า / ดูความเคลื่อนไหว"
                  icon={<Boxes className="h-5 w-5" strokeWidth={2.2} />}
                />
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
              <div className="rounded-2xl bg-white p-5 shadow-[0_4px_20px_rgba(27,27,33,0.04),0_12px_40px_rgba(27,27,33,0.08)] sm:p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4.5 w-4.5 text-[#000666]" strokeWidth={2.2} />
                      <h3 className="text-base font-bold text-[#1b1b21]">แนวโน้มยอดขาย 7 วันล่าสุด</h3>
                    </div>
                    <p className="mt-1 text-xs font-medium text-[#454652]">ยอดรวม {fmtMoneyNoSymbol(weeklyTotal)} บาท · ทั้งหมด {fmtNumber(weeklyCount)} รายการ</p>
                  </div>
                </div>
                <div className="h-[208px] w-full sm:h-[176px]">
                  <TrendChart bars={weeklyTrend} />
                </div>
                <div className="mt-4">
                  <div className="hidden items-center gap-2 md:flex">
                    <ClipboardList className="h-4 w-4 text-[#000666]" strokeWidth={2.2} />
                    <h4 className="text-sm font-bold text-[#1b1b21]">สรุป 7 วันล่าสุด</h4>
                  </div>

                  <div className="mt-3 hidden overflow-hidden rounded-lg bg-white md:block">
                    <table className="w-full table-fixed text-sm">
                      <thead className="bg-[#eef1ff] text-[#000666]">
                        <tr>
                          <th className="px-3 py-1.5 text-left text-xs font-bold">วัน</th>
                          <th className="px-3 py-1.5 text-right text-xs font-bold">ออเดอร์</th>
                          <th className="px-3 py-1.5 text-right text-xs font-bold">ยอดขาย</th>
                          <th className="px-3 py-1.5 text-right text-xs font-bold">เทียบวันก่อน</th>
                        </tr>
                      </thead>
                      <tbody>
                        {weeklyRows.map((row) => (
                          <tr key={`table-${row.date}`} className="border-t border-[#eef1f6]">
                            <td className="px-3 py-1.5 text-xs font-bold text-[#1b1b21]">
                              {fmtThaiWeekdayShort(row.date)} {fmtThaiShortDate(row.date)}
                            </td>
                            <td className="px-3 py-1.5 text-right text-xs font-semibold tabular-nums text-[#1b1b21]">
                              {fmtNumber(row.count)}
                            </td>
                            <td className="px-3 py-1.5 text-right text-xs font-bold tabular-nums text-[#000666]">
                              {fmtMoneyNoSymbol(row.amount)}
                            </td>
                            <td
                              className={`px-3 py-1.5 text-right text-xs font-bold tabular-nums ${
                                row.changePct === null
                                  ? "text-[#7b8091]"
                                  : row.changePct >= 0
                                    ? "text-emerald-700"
                                    : "text-rose-700"
                              }`}
                            >
                              {fmtChangePercent(row.changePct)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t-2 border-[#dbe0ee] bg-[#f8f9ff]">
                        <tr>
                          <td className="px-3 py-1.5 text-xs font-bold text-[#1b1b21]">รวม 7 วัน</td>
                          <td className="px-3 py-1.5 text-right text-xs font-bold tabular-nums text-[#1b1b21]">{fmtNumber(weeklyCount)}</td>
                          <td className="px-3 py-1.5 text-right text-xs font-extrabold tabular-nums text-[#000666]">{fmtMoneyNoSymbol(weeklyTotal)}</td>
                          <td className="px-3 py-1.5 text-right text-[11px] font-semibold text-[#5f6270]">
                            เฉลี่ย {fmtMoneyNoSymbol(weeklyAvgAmount)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                </div>
              </div>

              <div className="rounded-2xl bg-white p-5 shadow-[0_4px_20px_rgba(27,27,33,0.04),0_12px_40px_rgba(27,27,33,0.08)] sm:p-6">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4.5 w-4.5 text-[#000666]" strokeWidth={2.2} />
                    <h3 className="text-base font-bold text-[#1b1b21]">รายการล่าสุด</h3>
                  </div>
                  <Link href="/orders" className="text-xs font-bold text-[#000666]">
                    ดูทั้งหมด
                  </Link>
                </div>
                {recentOrders.length === 0 ? (
                  <p className="py-8 text-center text-sm font-medium text-[#7b8091]">ยังไม่มีรายการในช่วงนี้</p>
                ) : (
                  <ul className="space-y-2.5">
                    {recentOrders.map((order) => {
                      const badge = statusBadge(order.status);
                      return (
                        <li
                          key={order.id}
                          className="rounded-xl bg-white p-3 shadow-[0_4px_18px_rgba(27,27,33,0.05),0_10px_28px_rgba(27,27,33,0.08)]"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-[#1b1b21]">{order.customerName}</p>
                              <p className="mt-0.5 text-xs font-medium text-[#5f6270]">
                                {order.orderNumber} · {fmtThaiShortDate(order.orderDate)}
                              </p>
                            </div>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>
                              {badge.label}
                            </span>
                          </div>
                          <p className="mt-2 text-right text-sm font-extrabold tabular-nums text-[#000666]">
                            {fmtMoney(order.totalAmount)} บาท
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <TopCustomersBarBlock items={topCustomerRows} />
              <TopProductsListBlock items={topProductRows} />
            </section>

            <section>
              <div className="mb-3 flex items-center gap-2">
                <Boxes className="h-4.5 w-4.5 text-[#000666]" strokeWidth={2.2} />
                <h2 className="text-base font-bold text-[#1b1b21]">ทางลัดระบบ</h2>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  { href: "/orders/incoming", icon: ClipboardCheck, label: "รับออเดอร์" },
                  { href: "/orders", icon: ClipboardList, label: "สรุปออเดอร์" },
                  { href: "/delivery", icon: Truck, label: "ใบจัดส่ง" },
                  { href: "/billing", icon: FileText, label: "ใบวางบิล" },
                  { href: "/stock", icon: Boxes, label: "สต็อก" },
                  { href: "/settings/customers", icon: Users, label: "ร้านค้า" },
                ].map(({ href, icon: Icon, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className="rounded-2xl bg-white p-4 text-center shadow-[0_4px_20px_rgba(27,27,33,0.04),0_12px_40px_rgba(27,27,33,0.08)] transition hover:-translate-y-0.5"
                  >
                    <span className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#eef1ff] text-[#000666]">
                      <Icon className="h-5 w-5" strokeWidth={2.2} />
                    </span>
                    <p className="mt-2 text-[13px] font-bold text-[#1b1b21]">{label}</p>
                  </Link>
                ))}
              </div>
            </section>
          </main>
        </div>
      </div>
    </AppSidebarLayout>
  );
}
