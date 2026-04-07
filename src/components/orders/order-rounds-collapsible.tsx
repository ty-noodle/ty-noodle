"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ClipboardList } from "lucide-react";
import type { OrderRoundSummary } from "@/lib/orders/admin";

function formatThaiDateTime(isoString: string) {
  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(new Date(isoString));
}

function formatThaiCurrency(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  date: string;
  rounds: OrderRoundSummary[];
};

export function OrderRoundsCollapsible({ date, rounds }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 print:border-slate-300">
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 bg-slate-50 px-4 py-2.5 transition hover:bg-slate-100 active:bg-slate-100 print:pointer-events-none"
      >
        <ClipboardList className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={2.4} />
        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">
          รอบออเดอร์
        </span>
        <span className="ml-auto inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600">
          {rounds.length} รอบ
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 print:hidden ${open ? "rotate-180" : ""}`}
          strokeWidth={2.4}
        />
      </button>

      {/* Collapsible rows */}
      <div
        className={`overflow-hidden transition-all duration-200 ${open ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"}`}
      >
        <div className="max-h-52 divide-y divide-slate-50 overflow-y-auto border-t border-slate-100 print:max-h-none">
          {rounds.map((round, idx) => (
            <Link
              key={round.id}
              href={`/orders/incoming?date=${date}&expanded=${round.id}`}
              className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-slate-50/80 print:pointer-events-none"
            >
              <span className="w-5 shrink-0 text-center text-xs font-bold text-slate-300">
                {idx + 1}
              </span>
              <span className="font-mono text-xs font-semibold text-[#003366]">
                {round.orderNumber}
              </span>
              <span className="text-xs text-slate-400">
                {formatThaiDateTime(round.createdAt)}
              </span>
              <span className="ml-auto shrink-0 text-sm font-bold text-slate-800">
                {formatThaiCurrency(round.totalAmount)} บาท
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
