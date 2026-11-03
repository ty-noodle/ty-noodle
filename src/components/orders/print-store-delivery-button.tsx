"use client";

import { Printer } from "lucide-react";
import { useState } from "react";

export function PrintStoreDeliveryButton({
  date,
  customerId,
  label = "พิมพ์ใบส่งของ",
  iconOnly = false,
}: {
  date: string;
  customerId: string;
  label?: string;
  iconOnly?: boolean;
}) {
  const [loading, setLoading] = useState(false);

  function handlePrint() {
    setLoading(true);
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;";
    iframe.src = `/delivery/print?date=${date}&customer=${customerId}&autoprint=1`;
    document.body.appendChild(iframe);

    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) return;
      win.addEventListener("afterprint", () => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        setLoading(false);
      });
    };
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      disabled={loading}
      aria-label={label}
      title={label}
      className={[
        "inline-flex items-center justify-center border border-[#003366] bg-[#003366] text-white transition hover:bg-[#002952] active:scale-95 disabled:opacity-50",
        iconOnly ? "size-10 shrink-0 rounded-full p-0 leading-none" : "min-h-9 w-full gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold",
      ].join(" ")}
    >
      <Printer className="h-4.5 w-4.5" strokeWidth={2.2} />
      {iconOnly ? null : loading ? "กำลังโหลด..." : label}
    </button>
  );
}
