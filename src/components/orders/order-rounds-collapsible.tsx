"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ClipboardList, Pencil, XCircle } from "lucide-react";
import type { OrderRoundSummary } from "@/lib/orders/admin";

function formatThaiDateTime(isoString: string) {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(date);
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
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm print:border-slate-300">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 bg-slate-50 px-5 py-3.5 transition hover:bg-slate-100 active:bg-slate-100 print:pointer-events-none"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#003366]/5 text-[#003366]">
          <ClipboardList className="h-4 w-4" strokeWidth={2.4} />
        </div>
        <div className="flex flex-col items-start leading-tight">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">รอบออเดอร์</span>
          <span className="text-sm font-bold text-slate-700">ทั้งหมด {rounds.length} รอบของวันนี้</span>
        </div>
        <ChevronDown
          className={`ml-auto h-5 w-5 text-slate-300 transition-transform duration-300 print:hidden ${open ? "rotate-180" : ""}`}
          strokeWidth={2.4}
        />
      </button>

      <div className={`overflow-hidden transition-all duration-300 ${open ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"}`}>
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {rounds.map((round, index) => {
            const isCancelled = round.status === "cancelled";
            const canManage = round.status !== "cancelled";

            return (
              <div
                key={round.id}
                className={`flex items-center gap-4 px-5 py-4 transition ${isCancelled ? "bg-slate-50 opacity-60" : "hover:bg-slate-50/50"}`}
              >
                <span className="w-5 shrink-0 text-center text-xs font-black text-slate-300">
                  {index + 1}
                </span>

                <Link href={`/orders/incoming?date=${date}&expanded=${round.id}`} className="min-w-0 flex-1 group">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-black text-[#003366] group-hover:underline">
                      {round.orderNumber}
                    </span>
                    {isCancelled ? (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-tighter text-rose-600">
                        ยกเลิก
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[11px] font-bold text-slate-400">
                    เวลา {formatThaiDateTime(round.createdAt)} · ยอด {formatThaiCurrency(round.totalAmount)} ฿
                  </p>
                </Link>

                {!isCancelled ? (
                  <div className="flex shrink-0 items-center gap-2 print:hidden">
                    <Link
                      href={`/orders/incoming?date=${date}&expanded=${round.id}`}
                      className={`flex h-10 w-10 items-center justify-center rounded-xl transition active:scale-90 ${
                        canManage ? "bg-[#003366]/5 text-[#003366] hover:bg-[#003366]/10" : "cursor-not-allowed bg-slate-100 text-slate-400"
                      }`}
                      title="แก้ไข/จัดการ"
                    >
                      <Pencil className="h-4 w-4" strokeWidth={2.5} />
                    </Link>
                    {canManage ? (
                      <Link
                        href={`/orders/incoming?date=${date}&expanded=${round.id}&delete=1`}
                        className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 transition hover:bg-rose-100 active:scale-90"
                        title="ลบออเดอร์"
                      >
                        <XCircle className="h-4 w-4" strokeWidth={2.5} />
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
