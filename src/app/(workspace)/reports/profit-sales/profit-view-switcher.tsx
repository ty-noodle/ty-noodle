"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

type ProfitView = "daily" | "monthly";

export function ProfitViewSwitcher({
  fromDate,
  toDate,
  view,
}: {
  fromDate: string;
  toDate: string;
  view: ProfitView;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function changeView(nextView: ProfitView) {
    if (nextView === view || isPending) return;

    const params = new URLSearchParams({
      from: fromDate,
      to: toDate,
      view: nextView,
    });

    startTransition(() => {
      router.push(`/reports/profit-sales?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="relative flex w-full border-y border-[#003366] bg-white text-base font-bold shadow-sm sm:w-auto sm:overflow-hidden sm:rounded-md sm:border sm:text-xs">
      {isPending ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 text-[#003366] backdrop-blur-[1px]">
          <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.4} />
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => changeView("daily")}
        disabled={isPending}
        className={`flex min-h-11 flex-1 items-center justify-center px-4 py-2.5 text-center transition sm:min-h-0 sm:flex-initial sm:py-2 ${
          view === "daily" ? "bg-[#003366] text-white" : "text-[#003366] hover:bg-slate-50"
        }`}
      >
        รายวัน
      </button>
      <button
        type="button"
        onClick={() => changeView("monthly")}
        disabled={isPending}
        className={`flex min-h-11 flex-1 items-center justify-center border-l border-[#003366] px-4 py-2.5 text-center transition sm:min-h-0 sm:flex-initial sm:py-2 ${
          view === "monthly" ? "bg-[#003366] text-white" : "text-[#003366] hover:bg-slate-50"
        }`}
      >
        รายเดือน
      </button>
    </div>
  );
}
