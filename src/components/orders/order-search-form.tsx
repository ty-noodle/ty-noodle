"use client";

import Link from "next/link";

type Props = {
  date: string;
  expanded: string[];
  q: string;
};

function buildClearHref(date: string, expanded: string[]) {
  const params = new URLSearchParams();
  params.set("date", date);
  if (expanded.length > 0) params.set("expanded", expanded.join(","));
  return `/orders?${params.toString()}`;
}

export function OrderSearchForm({ date, expanded, q }: Props) {
  return (
    <form action="/orders" method="get" className="flex items-center gap-2">
      <input type="hidden" name="date" value={date} />
      {expanded.length > 0 && (
        <input type="hidden" name="expanded" value={expanded.join(",")} />
      )}
      <input
        type="search"
        name="q"
        defaultValue={q}
        placeholder="ค้นหาร้านค้า…"
        className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-[#003366]/50 focus:ring-2 focus:ring-[#003366]/10"
      />
      <button
        type="submit"
        className="shrink-0 rounded-xl bg-[#003366] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#002244]"
      >
        ค้นหา
      </button>
      {q && (
        <Link
          href={buildClearHref(date, expanded)}
          className="shrink-0 text-sm text-slate-400 transition hover:text-slate-600"
        >
          ล้าง
        </Link>
      )}
    </form>
  );
}
