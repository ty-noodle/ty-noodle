"use client";

import { LayoutList } from "lucide-react";
import { useState } from "react";

export function PrintPackingListButton({ date }: { date: string }) {
  const [loading, setLoading] = useState(false);

  function handlePrint() {
    setLoading(true);
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;";
    iframe.src = `/orders/packing-list?date=${date}`;
    document.body.appendChild(iframe);

    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) return;
      win.addEventListener("afterprint", () => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        setLoading(false);
      });
      setTimeout(() => win.print(), 500);
    };
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 print:hidden"
    >
      <LayoutList className="h-4 w-4" strokeWidth={2.2} />
      {loading ? "กำลังโหลด..." : "พิมพ์ใบจัดของ"}
    </button>
  );
}
