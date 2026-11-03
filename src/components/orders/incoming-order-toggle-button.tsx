"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";

type IncomingOrderToggleButtonProps = {
  href: string;
  expanded: boolean;
  orderNumber: string;
  iconOnly?: boolean;
};

export function IncomingOrderToggleButton({
  href,
  expanded,
  orderNumber,
  iconOnly = false,
}: IncomingOrderToggleButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function toggle() {
    if (isPending) return;
    startTransition(() => {
      router.push(href, { scroll: false });
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      aria-busy={isPending}
      aria-label={expanded ? "ซ่อนรายละเอียดออเดอร์" : "แสดงรายละเอียดออเดอร์"}
      title={expanded ? "ซ่อนรายละเอียดออเดอร์" : "แสดงรายละเอียดออเดอร์"}
      className={[
        "inline-flex items-center justify-center border border-slate-200 bg-white text-slate-900 shadow-sm transition hover:border-[#003366]/30 hover:bg-slate-50 hover:text-[#003366] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003366]/20 disabled:opacity-85",
        iconOnly ? "size-10 shrink-0 rounded-full p-0 leading-none" : "min-h-9 w-full gap-2 rounded-lg px-3 py-2 text-xs font-semibold",
      ].join(" ")}
    >
      {isPending ? (
        <Loader2 className="h-4.5 w-4.5 animate-spin" strokeWidth={2.2} />
      ) : expanded ? (
        <ChevronUp className="h-4.5 w-4.5" strokeWidth={2.2} />
      ) : (
        <ChevronDown className="h-4.5 w-4.5" strokeWidth={2.2} />
      )}
      {iconOnly ? <span className="sr-only">{orderNumber}</span> : <span className="font-mono leading-none" translate="no">{orderNumber}</span>}
    </button>
  );
}
