"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-slate-500 transition hover:bg-slate-100 print:hidden"
      aria-label="พิมพ์รายงาน"
    >
      <Printer className="h-5 w-5 shrink-0" strokeWidth={2} />
      <span className="hidden text-sm font-semibold sm:inline">พิมพ์</span>
    </button>
  );
}
