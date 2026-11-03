"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2 } from "lucide-react";

type OrderDailyMobileCardProps = {
  href: string;
  isExpanded: boolean;
  orderDate: string;
  customerName: string;
  customerCode: string;
  orderRounds: number;
  totalAmountText: string;
};

function formatDateShort(isoDate: string) {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${Number.parseInt(year, 10) + 543}`;
}

export function OrderDailyMobileCard({
  href,
  orderDate,
  customerName,
  customerCode,
  orderRounds,
  totalAmountText,
}: OrderDailyMobileCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function openDetail() {
    if (isPending) return;
    startTransition(() => {
      router.push(href, { scroll: false });
    });
  }

  return (
    <button
      type="button"
      onClick={openDetail}
      disabled={isPending}
      aria-busy={isPending}
      className="group relative block w-full bg-white p-4 text-left transition active:bg-slate-50 disabled:opacity-90"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-500">
              {formatDateShort(orderDate)}
            </span>
            <span className="shrink-0 rounded bg-[#003366]/10 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#003366]">
              {customerCode}
            </span>
          </div>

          <h3 className="text-base font-bold text-slate-900 transition-colors group-active:text-[#003366]">
            {customerName}
          </h3>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
              {orderRounds} รอบออเดอร์
            </span>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-lg font-black tracking-tight text-slate-950">
            {totalAmountText}
            <span className="ml-0.5 text-xs font-bold text-slate-400">บาท</span>
          </p>
          <div className="mt-2 flex justify-end">
            {isPending ? (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-[#003366]/5 px-3 py-1 text-[11px] font-bold text-[#003366]">
                <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.5} />
                กำลังโหลด...
              </div>
            ) : (
              <div className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-500 transition-all group-hover:bg-[#003366]/10 group-hover:text-[#003366]">
                ดูรายละเอียด
                <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} />
              </div>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
