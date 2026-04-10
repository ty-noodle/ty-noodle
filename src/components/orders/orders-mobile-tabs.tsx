"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, ScanText } from "lucide-react";

export function OrdersMobileTabs() {
  const pathname = usePathname();
  const onSummary = pathname === "/orders";
  const onIncoming = pathname.startsWith("/orders/incoming");

  if (!onSummary && !onIncoming) return null;

  return (
    <div className="fixed inset-x-0 top-[68px] z-30 border-b border-slate-200 bg-white shadow-sm md:hidden">
      <div className="flex">
        <Link
          href="/orders/incoming"
          className={`flex flex-1 items-center justify-center gap-2 border-b-2 py-3 text-sm font-semibold transition-colors ${
            onIncoming
              ? "border-[#003366] text-[#003366]"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <ScanText className="h-4 w-4 shrink-0" strokeWidth={2.2} />
          รายการออเดอร์
        </Link>
        <Link
          href="/orders"
          className={`flex flex-1 items-center justify-center gap-2 border-b-2 py-3 text-sm font-semibold transition-colors ${
            onSummary
              ? "border-[#003366] text-[#003366]"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <ClipboardList className="h-4 w-4 shrink-0" strokeWidth={2.2} />
          สรุปออเดอร์
        </Link>
      </div>
    </div>
  );
}
