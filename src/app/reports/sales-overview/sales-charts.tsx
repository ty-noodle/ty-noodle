"use client";

import { useState, Fragment } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  LineChart,
  Line,
  ReferenceLine,
} from "recharts";
import type { MonthlySalesRow, SalesOverviewSummary } from "@/lib/reports/sales-overview";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtMoneyShort(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}ล.`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return fmtMoney(n);
}

function fmtPercent(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}

// ─── Full month names (desktop) ──────────────────────────────────────────────

const MONTH_FULL_LABELS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน",
  "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม",
  "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

// ─── Color palette ────────────────────────────────────────────────────────────

const MONTH_COLORS = [
  "#0f2f56", "#1e4d8c", "#2563eb", "#3b82f6",
  "#60a5fa", "#93c5fd", "#0891b2", "#0e7490",
  "#0d9488", "#059669", "#16a34a", "#15803d",
];

const PROFIT_COLOR = "#10b981";
const LOSS_COLOR = "#ef4444";
const PREV_YEAR_COLOR = "#cbd5e1";

// ─── Custom Tooltip: Bar ──────────────────────────────────────────────────────

function BarTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number; name: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const revenue = payload.find((p) => p.name === "revenue")?.value ?? 0;
  const prevRevenue = payload.find((p) => p.name === "prev")?.value ?? 0;
  const diff = revenue - prevRevenue;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
      <p className="mb-2 text-sm font-bold text-slate-700">{label}</p>
      <p className="text-base font-black text-[#003366]">{fmtMoney(revenue)} บาท</p>
      {prevRevenue > 0 && (
        <p className={`mt-1 text-xs font-semibold ${diff >= 0 ? "text-emerald-600" : "text-red-500"}`}>
          {diff >= 0 ? "▲" : "▼"} {fmtMoney(Math.abs(diff))} จากปีที่แล้ว
        </p>
      )}
    </div>
  );
}

// ─── Custom Tooltip: Profit/Revenue Line ──────────────────────────────────────

function LineTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
      <p className="mb-2 text-sm font-bold text-slate-700">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-sm font-semibold" style={{ color: p.color }}>
          {p.name === "revenue" ? "ยอดขาย" : "กำไร"}: {fmtMoney(p.value)} บาท
        </p>
      ))}
    </div>
  );
}

// ─── Custom Pie Label ─────────────────────────────────────────────────────────

function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, monthLabel }: {
  cx: number; cy: number; midAngle: number;
  innerRadius: number; outerRadius: number;
  percent: number; monthLabel: string;
}) {
  if (percent < 0.04) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
      fontSize={11} fontWeight={700}>
      {monthLabel}
    </text>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function ChartSection({ title, subtitle, action, children }: {
  title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-[0_4px_20px_rgba(27,27,33,0.06)]">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
        <div>
          <h3 className="text-base font-bold text-[#003366] sm:text-lg">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-400 sm:text-sm">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="px-3 py-5 sm:px-5 sm:py-6">{children}</div>
    </div>
  );
}

// ─── Bar Chart: Monthly Revenue ───────────────────────────────────────────────

function MonthlyBarChart({
  rows,
  prevYearRevenue,
  peakMonth,
}: {
  rows: MonthlySalesRow[];
  prevYearRevenue: number[];
  peakMonth: MonthlySalesRow | null;
}) {
  const [showPrev, setShowPrev] = useState(true);

  const data = rows.map((r, i) => ({
    name: r.monthLabel,
    revenue: r.revenue,
    prev: prevYearRevenue[i] ?? 0,
    isPeak: r.month === peakMonth?.month,
  }));

  const hasPrev = prevYearRevenue.some((v) => v > 0);
  const showingPrev = hasPrev && showPrev;

  const toggle = hasPrev ? (
    <button
      type="button"
      onClick={() => setShowPrev((v) => !v)}
      className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
        showPrev
          ? "border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200"
          : "border-slate-200 bg-white text-slate-400 hover:border-slate-300"
      }`}
    >
      {showPrev ? "ซ่อนปีที่แล้ว" : "เทียบปีที่แล้ว"}
    </button>
  ) : undefined;

  return (
    <ChartSection
      title="ยอดขายรายเดือน"
      subtitle={showingPrev ? "แท่งสีเข้ม = ปีนี้ · สีจาง = ปีที่แล้ว" : "ยอดขายแต่ละเดือน (บาท)"}
      action={toggle}
    >
      {/* Scroll only on small screens; md+ fills full width */}
      <div className="overflow-x-auto md:overflow-x-visible">
        <div className="min-w-[560px] md:min-w-0">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="name"
                interval={0}
                tick={{ fontSize: 11, fill: "#94a3b8", fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={fmtMoneyShort}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip content={<BarTooltip />} cursor={{ fill: "rgba(15,47,86,0.04)" }} />
              {showingPrev && (
                <Bar dataKey="prev" name="prev" radius={[4, 4, 0, 0]} fill={PREV_YEAR_COLOR} maxBarSize={18} />
              )}
              <Bar dataKey="revenue" name="revenue" radius={[6, 6, 0, 0]} maxBarSize={showingPrev ? 18 : 32}>
                {data.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.isPeak ? "#f59e0b" : entry.revenue === 0 ? "#e2e8f0" : "#0f2f56"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 px-1">
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="inline-block h-2.5 w-5 rounded-full bg-[#0f2f56]" />
          ปีนี้
        </span>
        {showingPrev && (
          <span className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="inline-block h-2.5 w-5 rounded-full bg-slate-200" />
            ปีที่แล้ว
          </span>
        )}
        {peakMonth && peakMonth.revenue > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="inline-block h-2.5 w-5 rounded-full bg-amber-400" />
            เดือนสูงสุด ({peakMonth.monthLabel})
          </span>
        )}
      </div>
    </ChartSection>
  );
}

// ─── Donut Chart: Monthly Share ───────────────────────────────────────────────

function MonthlyDonutChart({ rows }: { rows: MonthlySalesRow[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const activeRows = rows.filter((r) => r.revenue > 0);

  const data = activeRows.map((r) => ({
    name: r.monthLabel,
    value: r.revenue,
    percent: r.revenuePercent,
    color: MONTH_COLORS[r.month - 1],
  }));

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const centerValue = activeIndex !== null ? data[activeIndex] : null;

  if (data.length === 0) {
    return (
      <ChartSection title="สัดส่วนยอดขายรายเดือน" subtitle="% ของยอดรวมทั้งปี">
        <div className="flex h-[300px] items-center justify-center text-slate-400 text-sm">
          ไม่มีข้อมูล
        </div>
      </ChartSection>
    );
  }

  return (
    <ChartSection title="สัดส่วนยอดขายรายเดือน" subtitle="% ของยอดรวมทั้งปี">
      <div className="relative">
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="52%"
              outerRadius="78%"
              paddingAngle={2}
              dataKey="value"
              labelLine={false}
              label={<PieLabel
                cx={0} cy={0} midAngle={0}
                innerRadius={0} outerRadius={0}
                percent={0} monthLabel=""
              />}
              onMouseEnter={(_, index) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              {data.map((entry, index) => (
                <Cell
                  key={index}
                  fill={entry.color}
                  opacity={activeIndex === null || activeIndex === index ? 1 : 0.45}
                  stroke="white"
                  strokeWidth={2}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => [`${fmtMoney(Number(value ?? 0))} บาท`, "ยอดขาย"]}
              contentStyle={{ borderRadius: 16, border: "1px solid #e2e8f0", boxShadow: "0 10px 30px rgba(0,0,0,0.1)" }}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* Center text */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centerValue ? (
            <>
              <p className="text-xs font-semibold text-slate-400">{centerValue.name}</p>
              <p className="text-lg font-black text-[#003366]">{fmtMoneyShort(centerValue.value)}</p>
              <p className="text-sm font-bold text-slate-500">{fmtPercent(centerValue.percent)}</p>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold text-slate-400">ยอดรวมทั้งปี</p>
              <p className="text-lg font-black text-[#003366]">{fmtMoneyShort(totalRevenue)}</p>
            </>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-1.5 sm:grid-cols-4">
        {data.map((entry, i) => (
          <div
            key={i}
            className="flex items-center gap-1.5"
            onMouseEnter={() => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(null)}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="truncate text-xs text-slate-600">
              {entry.name} <span className="font-semibold text-slate-800">{fmtPercent(entry.percent)}</span>
            </span>
          </div>
        ))}
      </div>
    </ChartSection>
  );
}

// ─── Line Chart: Revenue vs Profit ────────────────────────────────────────────

function RevenueProfitLineChart({ rows }: { rows: MonthlySalesRow[] }) {
  const data = rows.map((r) => ({
    name: r.monthLabel,
    revenue: r.revenue,
    profit: r.profit,
  }));

  return (
    <ChartSection
      title="ยอดขาย vs กำไรสุทธิ"
      subtitle="เปรียบเทียบทุกเดือนในปีเดียวกัน"
    >
      <div className="overflow-x-auto md:overflow-x-visible">
      <div className="min-w-[560px] md:min-w-0">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="name"
            interval={0}
            tick={{ fontSize: 11, fill: "#94a3b8", fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={fmtMoneyShort}
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip content={<LineTooltip />} />
          <ReferenceLine y={0} stroke="#e2e8f0" strokeWidth={1.5} />
          <Line
            type="monotone"
            dataKey="revenue"
            name="revenue"
            stroke="#0f2f56"
            strokeWidth={2.5}
            dot={{ r: 4, fill: "#0f2f56", strokeWidth: 0 }}
            activeDot={{ r: 6, fill: "#0f2f56" }}
          />
          <Line
            type="monotone"
            dataKey="profit"
            name="profit"
            stroke={PROFIT_COLOR}
            strokeWidth={2.5}
            strokeDasharray="5 3"
            dot={(props) => {
              const { cx, cy, payload } = props as { cx?: number; cy?: number; payload: { profit: number } };
              if (cx == null || cy == null) return <></>;
              return (
                <circle
                  key={`${cx}-${cy}`}
                  cx={cx}
                  cy={cy}
                  r={4}
                  fill={(payload.profit ?? 0) >= 0 ? PROFIT_COLOR : LOSS_COLOR}
                  stroke="none"
                />
              );
            }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
      </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 px-1">
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="inline-block h-0.5 w-6 rounded bg-[#0f2f56]" />
          ยอดขาย
        </span>
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="inline-block h-0.5 w-6 rounded border-t-2 border-dashed border-emerald-500 bg-transparent" />
          กำไรสุทธิ
        </span>
      </div>
    </ChartSection>
  );
}

// ─── Monthly Table ────────────────────────────────────────────────────────────

function MonthlyTable({
  rows,
  summary,
  prevYearRows,
  year,
}: {
  rows: MonthlySalesRow[];
  summary: SalesOverviewSummary;
  prevYearRows: MonthlySalesRow[];
  year: number;
}) {
  const [showPrev, setShowPrev] = useState(true);

  const hasPrev = prevYearRows.some((r) => r.revenue > 0);
  const isShowingPrev = hasPrev && showPrev;
  const currentBY = year + 543;
  const prevBY = year + 542;

  // Columns (DOM): เดือน | ปี | ยอดขาย | ต้นทุน(hidden mobile) | กำไร | ออเดอร์(hidden mobile) | เปลี่ยนแปลง(if showPrev)

  const toggleBtn = hasPrev ? (
    <button
      type="button"
      onClick={() => setShowPrev((v) => !v)}
      className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
        showPrev
          ? "border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200"
          : "border-slate-200 bg-white text-slate-400 hover:border-slate-300"
      }`}
    >
      {showPrev ? "ซ่อนปีที่แล้ว" : "เทียบปีที่แล้ว"}
    </button>
  ) : undefined;

  return (
    <ChartSection
      title="ตารางสรุปรายเดือน"
      subtitle={
        isShowingPrev
          ? `เปรียบเทียบปี พ.ศ. ${currentBY} กับ ${prevBY}`
          : "ยอดขาย ต้นทุน และกำไรแต่ละเดือน"
      }
      action={toggleBtn}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-sm">

          {/* ── Header ── */}
          <thead>
            <tr className="border-b-2 border-slate-300 bg-slate-50">
              <th className="w-14 px-3 py-2.5 text-left text-xs font-bold uppercase tracking-widest text-slate-400 sm:w-32">
                เดือน
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-bold uppercase tracking-widest text-slate-400">
                ปี
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-bold uppercase tracking-widest text-slate-400">
                ยอดขาย (บาท)
              </th>
              <th className="hidden px-3 py-2.5 text-right text-xs font-bold uppercase tracking-widest text-slate-400 sm:table-cell">
                ต้นทุน (บาท)
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-bold uppercase tracking-widest text-slate-400">
                กำไร (บาท)
              </th>
              <th className="hidden px-3 py-2.5 text-center text-xs font-bold uppercase tracking-widest text-slate-400 sm:table-cell">
                ออเดอร์
              </th>
              <th className="hidden px-3 py-2.5 text-left text-xs font-bold uppercase tracking-widest text-slate-400 sm:table-cell">
                สัดส่วน (%)
              </th>
              {isShowingPrev && (
                <th className="px-3 py-2.5 text-center text-xs font-bold uppercase tracking-widest text-slate-400">
                  เปลี่ยนแปลง (ยอดขาย)
                </th>
              )}
            </tr>
          </thead>

          {/* ── Body ── */}
          <tbody>
            {rows.map((r) => {
              const isPeak = r.month === summary.peakMonth?.month;
              const prev = prevYearRows[r.month - 1];
              const hasPrevData = (prev?.revenue ?? 0) > 0;
              const revDiff = r.revenue - (prev?.revenue ?? 0);
              const revDiffPct = hasPrevData && prev.revenue > 0
                ? (revDiff / prev.revenue) * 100
                : null;
              const up = revDiff >= 0;
              const rowSpan = isShowingPrev ? 2 : 1;

              return (
                <Fragment key={r.month}>

                  {/* ── Current year row (month cell spans 2 rows when comparing) ── */}
                  <tr className={`border-t-2 border-slate-400 ${r.revenue === 0 ? "opacity-50" : ""}`}>

                    {/* Month cell — rowspan covers prev year row */}
                    <td
                      rowSpan={rowSpan}
                      className={`w-14 border-r-2 border-slate-300 px-3 py-3 text-center align-middle sm:w-32 ${
                        isPeak ? "bg-amber-50" : "bg-slate-50"
                      }`}
                    >
                      {/* Mobile: abbreviated */}
                      <span className={`block text-sm font-extrabold leading-tight sm:hidden ${
                        isPeak ? "text-amber-700" : "text-slate-700"
                      }`}>
                        {r.monthLabel}
                      </span>
                      {/* Desktop: full name */}
                      <span className={`hidden text-sm font-extrabold leading-tight sm:block ${
                        isPeak ? "text-amber-700" : "text-slate-700"
                      }`}>
                        {MONTH_FULL_LABELS[r.month - 1]}
                      </span>
                      {isPeak && (
                        <span className="mt-1 block rounded-full bg-amber-200 px-1 py-0.5 text-[9px] font-bold leading-tight text-amber-800">
                          สูงสุด
                        </span>
                      )}
                    </td>

                    {/* ปี pill */}
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#0f2f56] px-2 py-0.5 text-xs font-bold text-white">
                        <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
                        {currentBY}
                      </span>
                    </td>

                    {/* ยอดขาย */}
                    <td className="px-3 py-2.5 text-right font-bold tabular-nums text-[#003366]">
                      {r.revenue > 0 ? fmtMoney(r.revenue) : <span className="text-slate-300">—</span>}
                    </td>

                    {/* ต้นทุน */}
                    <td className="hidden px-3 py-2.5 text-right tabular-nums text-slate-500 sm:table-cell">
                      {r.cost > 0 ? fmtMoney(r.cost) : <span className="text-slate-300">—</span>}
                    </td>

                    {/* กำไร */}
                    <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${
                      r.revenue === 0 ? "text-slate-300"
                        : r.profit >= 0 ? "text-emerald-600"
                        : "text-red-500"
                    }`}>
                      {r.revenue > 0 ? fmtMoney(r.profit) : "—"}
                    </td>

                    {/* ออเดอร์ */}
                    <td className="hidden px-3 py-2.5 text-center tabular-nums text-slate-500 sm:table-cell">
                      {r.orderCount > 0 ? r.orderCount : <span className="text-slate-300">—</span>}
                    </td>

                    {/* สัดส่วน */}
                    <td className="hidden px-3 py-2.5 sm:table-cell">
                      {r.revenue > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-[#003366]"
                              style={{ width: `${Math.min(r.revenuePercent, 100)}%` }}
                            />
                          </div>
                          <span className="w-9 text-right text-xs font-semibold tabular-nums text-slate-500">
                            {r.revenuePercent.toFixed(1)}%
                          </span>
                        </div>
                      ) : <span className="text-slate-300">—</span>}
                    </td>

                    {/* เปลี่ยนแปลง — single line, rowspan covers prev year row */}
                    {isShowingPrev && (
                      <td className="px-3 py-2.5 text-center" rowSpan={rowSpan}>
                        {r.revenue > 0 && hasPrevData ? (
                          <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-xl px-2.5 py-1 text-xs font-bold ${
                            up ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                          }`}>
                            {up ? "▲" : "▼"}
                            <span>{up ? "+" : "-"}{fmtMoney(Math.abs(revDiff))} บาท</span>
                            {revDiffPct !== null && (
                              <span className="opacity-75">({up ? "+" : ""}{revDiffPct.toFixed(1)}%)</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                    )}
                  </tr>

                  {/* ── Prev year row ── */}
                  {isShowingPrev && (
                    <tr className={`border-t-2 border-slate-200 ${!hasPrevData ? "opacity-30" : ""}`}>
                      {/* month cell already spanned above */}

                      {/* ปี pill — muted */}
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-500">
                          {prevBY}
                        </span>
                      </td>

                      {/* ยอดขาย */}
                      <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                        {hasPrevData ? fmtMoney(prev.revenue) : <span className="text-slate-300">—</span>}
                      </td>

                      {/* ต้นทุน */}
                      <td className="hidden px-3 py-2 text-right tabular-nums text-slate-400 sm:table-cell">
                        {hasPrevData && prev.cost > 0 ? fmtMoney(prev.cost) : <span className="text-slate-300">—</span>}
                      </td>

                      {/* กำไร */}
                      <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                        {hasPrevData ? fmtMoney(prev.profit) : <span className="text-slate-300">—</span>}
                      </td>

                      {/* ออเดอร์ */}
                      <td className="hidden px-3 py-2 text-center tabular-nums text-slate-400 sm:table-cell">
                        {hasPrevData && prev.orderCount > 0 ? prev.orderCount : <span className="text-slate-300">—</span>}
                      </td>

                      {/* สัดส่วน */}
                      <td className="hidden px-3 py-2 sm:table-cell">
                        {hasPrevData && prev.revenue > 0 ? (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-slate-300"
                                style={{ width: `${Math.min(prev.revenuePercent, 100)}%` }}
                              />
                            </div>
                            <span className="w-9 text-right text-xs tabular-nums text-slate-400">
                              {prev.revenuePercent.toFixed(1)}%
                            </span>
                          </div>
                        ) : <span className="text-slate-300">—</span>}
                      </td>

                      {/* เปลี่ยนแปลง — already rowspan'd from current year row */}
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>

          {/* ── Footer ── */}
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-50">
              <td
                colSpan={2}
                className="px-3 py-3 text-sm font-black text-slate-700"
              >
                รวมทั้งปี
              </td>
              <td className="px-3 py-3 text-right font-black tabular-nums text-[#003366]">
                {fmtMoney(summary.totalRevenue)}
              </td>
              <td className="hidden px-3 py-3 text-right font-black tabular-nums text-slate-600 sm:table-cell">
                {fmtMoney(summary.totalCost)}
              </td>
              <td className={`px-3 py-3 text-right font-black tabular-nums ${
                summary.totalProfit >= 0 ? "text-emerald-600" : "text-red-500"
              }`}>
                {fmtMoney(summary.totalProfit)}
              </td>
              <td className="hidden px-3 py-3 text-center font-black tabular-nums text-slate-600 sm:table-cell">
                {summary.totalOrders}
              </td>
              <td className="hidden px-3 py-3 text-left text-xs font-semibold text-slate-400 sm:table-cell">
                100%
              </td>
              {isShowingPrev && (
                <td className="px-3 py-3 text-center">
                  {(() => {
                    const prevTotal = prevYearRows.reduce((s, r) => s + r.revenue, 0);
                    if (prevTotal === 0) return null;
                    const diff = summary.totalRevenue - prevTotal;
                    const pct = (diff / prevTotal) * 100;
                    const up = diff >= 0;
                    return (
                      <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-xl px-2.5 py-1 text-xs font-bold ${
                        up ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                      }`}>
                        {up ? "▲" : "▼"}
                        <span>{up ? "+" : "-"}{fmtMoney(Math.abs(diff))} บาท</span>
                        <span className="opacity-75">({up ? "+" : ""}{pct.toFixed(1)}%)</span>
                      </span>
                    );
                  })()}
                </td>
              )}
            </tr>
          </tfoot>
        </table>
      </div>
    </ChartSection>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function SalesCharts({
  rows,
  summary,
  prevYearRevenue,
  prevYearRows,
  year,
}: {
  rows: MonthlySalesRow[];
  summary: SalesOverviewSummary;
  prevYearRevenue: number[];
  prevYearRows: MonthlySalesRow[];
  year: number;
}) {
  return (
    <div className="space-y-5">
      {/* Bar + Donut: stack on mobile, side by side on lg+ */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <MonthlyBarChart rows={rows} prevYearRevenue={prevYearRevenue} peakMonth={summary.peakMonth} />
        <MonthlyDonutChart rows={rows} />
      </div>

      {/* Revenue vs Profit line — full width */}
      <RevenueProfitLineChart rows={rows} />

      {/* Monthly comparison table — full width */}
      <MonthlyTable rows={rows} summary={summary} prevYearRows={prevYearRows} year={year} />
    </div>
  );
}
