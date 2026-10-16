"use client";

import { useState } from "react";
import { Loader2, Printer } from "lucide-react";

export function ReprintButton({
  url,
  title = "พิมพ์อีกครั้ง",
}: {
  url: string;
  title?: string;
}) {
  const [isPrinting, setIsPrinting] = useState(false);

  const handleReprint = () => {
    setIsPrinting(true);

    const iframe = document.createElement("iframe");
    iframe.style.cssText =
      "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;";
    iframe.src = url;
    document.body.appendChild(iframe);

    const cleanup = () => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
      setIsPrinting(false);
    };

    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) {
        cleanup();
        return;
      }

      setTimeout(() => {
        try {
          win.focus();
          win.print();
        } finally {
          setTimeout(cleanup, 1500);
        }
      }, 250);
    };

    iframe.onerror = () => {
      alert("โหลดหน้าพิมพ์ไม่สำเร็จ");
      cleanup();
    };

    setTimeout(cleanup, 30000);
  };

  return (
    <button
      type="button"
      onClick={handleReprint}
      disabled={isPrinting}
      className="flex h-10 w-10 items-center justify-center border border-slate-200 bg-white text-slate-600 shadow-sm transition-all hover:border-[#003366] hover:bg-slate-50 hover:text-[#003366] disabled:opacity-50"
      title={title}
    >
      {isPrinting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-5 w-5" />}
    </button>
  );
}
