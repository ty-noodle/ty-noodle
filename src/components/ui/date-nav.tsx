"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";

// ─── Shared helpers ───────────────────────────────────────────────────────────

export function shiftDate(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function buildHref(basePath: string, params: Record<string, string>) {
  return `${basePath}?${new URLSearchParams(params).toString()}`;
}

const arrowCls =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50";

// ─── Single-date nav (used by /orders) ───────────────────────────────────────

type SingleProps = {
  mode: "single";
  date: string;
  basePath: string;
  extra?: Record<string, string>;
};

function SingleDateNav({ date, basePath, extra = {} }: Omit<SingleProps, "mode">) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-1.5">
      <Link href={buildHref(basePath, { date: shiftDate(date, -1), ...extra })} className={arrowCls} aria-label="วันก่อนหน้า">
        <ChevronLeft className="h-4 w-4" strokeWidth={2.4} />
      </Link>
      <ThaiDatePicker
        id={`${basePath.replace(/\W+/g, "-")}-single-date`}
        name="date"
        value={date}
        onChange={(nextDate) => {
          if (nextDate) router.push(buildHref(basePath, { date: nextDate, ...extra }));
        }}
      />
      <Link href={buildHref(basePath, { date: shiftDate(date, +1), ...extra })} className={arrowCls} aria-label="วันถัดไป">
        <ChevronRight className="h-4 w-4" strokeWidth={2.4} />
      </Link>
    </div>
  );
}

// ─── Range-date nav (used by /delivery) ──────────────────────────────────────

type RangeProps = {
  mode: "range";
  from: string;
  to: string;
  basePath: string;
  extra?: Record<string, string>;
};

function RangeDateNav({ from, to, basePath, extra = {} }: Omit<RangeProps, "mode">) {
  const router = useRouter();
  const spanDays = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000);

  function nav(newFrom: string, newTo: string) {
    router.push(buildHref(basePath, { from: newFrom, to: newTo, ...extra }));
  }

  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
      {/* Row 1 (mobile) / left side (desktop): back arrow + from date */}
      <div className="flex items-center gap-1.5">
        <Link
          href={buildHref(basePath, { from: shiftDate(from, -(spanDays + 1)), to: shiftDate(to, -(spanDays + 1)), ...extra })}
          className={arrowCls}
          aria-label="ช่วงก่อนหน้า"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2.4} />
        </Link>
        <ThaiDatePicker
          id={`${basePath.replace(/\W+/g, "-")}-from-date`}
          name="from"
          value={from}
          max={to}
          onChange={(nextFrom) => {
            if (nextFrom) nav(nextFrom, nextFrom > to ? nextFrom : to);
          }}
        />
      </div>

      {/* Row 2 (mobile) / right side (desktop): to date + forward arrow */}
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-xs text-slate-400">—</span>
        <ThaiDatePicker
          id={`${basePath.replace(/\W+/g, "-")}-to-date`}
          name="to"
          value={to}
          min={from}
          onChange={(nextTo) => {
            if (nextTo) nav(nextTo < from ? nextTo : from, nextTo);
          }}
        />
        <Link
          href={buildHref(basePath, { from: shiftDate(from, spanDays + 1), to: shiftDate(to, spanDays + 1), ...extra })}
          className={arrowCls}
          aria-label="ช่วงถัดไป"
        >
          <ChevronRight className="h-4 w-4" strokeWidth={2.4} />
        </Link>
      </div>
    </div>
  );
}

// ─── Unified export ───────────────────────────────────────────────────────────

export function DateNav(props: SingleProps | RangeProps) {
  if (props.mode === "range") {
    const { mode, ...rest } = props;
    void mode;
    return <RangeDateNav {...rest} />;
  }
  const { mode, ...rest } = props;
  void mode;
  return <SingleDateNav {...rest} />;
}
