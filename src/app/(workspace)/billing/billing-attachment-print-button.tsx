"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Loader2 } from "lucide-react";

export function BillingAttachmentPrintButton({ href, compact = false }: { href?: string; compact?: boolean }) {
  const [isPrinting, setIsPrinting] = useState(false);
  const [error, setError] = useState("");
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupRef.current?.(), []);

  function print() {
    if (!href || cleanupRef.current) return;
    setError("");
    setIsPrinting(true);
    const iframe = document.createElement("iframe");
    iframe.title = "ใบแนบส่งของสำหรับพิมพ์";
    iframe.setAttribute("aria-hidden", "true");
    iframe.tabIndex = -1;
    iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:297mm;height:210mm;border:0;opacity:0;pointer-events:none;";

    const cleanup = () => {
      clearTimeout(timeout);
      window.removeEventListener("message", receive);
      iframe.remove();
      cleanupRef.current = null;
      setIsPrinting(false);
    };
    const fail = (message: string) => { cleanup(); setError(message); };
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== iframe.contentWindow || event.data?.type !== "billing-attachment-print") return;
      if (event.data.status === "ready") clearTimeout(timeout);
      if (event.data.status === "done") cleanup();
      if (event.data.status === "error") fail(event.data.message || "เตรียมใบแนบไม่สำเร็จ กรุณาลองใหม่");
    };
    const timeout = setTimeout(() => fail("โหลดใบแนบไม่สำเร็จ กรุณาลองใหม่"), 60000);
    cleanupRef.current = cleanup;
    window.addEventListener("message", receive);
    iframe.onload = () => {
      const win = iframe.contentWindow;
      const loadError = iframe.contentDocument?.querySelector("[data-attachment-error]");
      if (loadError) fail(loadError.textContent || "โหลดใบแนบไม่สำเร็จ");
      else if (win && win.location.pathname !== "/billing/attachments") fail("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่ก่อนพิมพ์");
    };
    iframe.onerror = () => fail("โหลดใบแนบไม่สำเร็จ กรุณาลองใหม่");
    const url = new URL(href, window.location.origin);
    url.searchParams.set("autoprint", "1");
    iframe.src = url.toString();
    document.body.appendChild(iframe);
  }

  return <div className="flex flex-col gap-1">
    <button type="button" onClick={print} disabled={!href || isPrinting}
      className={`flex min-h-11 w-full items-center justify-center gap-2 border border-slate-300 bg-white px-3 py-2 text-[#003366] transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 ${compact ? "text-xs" : "text-sm"}`}>
      {isPrinting ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" /> : <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />}
      <span className="text-center"><span className="block font-bold">{isPrinting ? "กำลังเตรียมพิมพ์…" : "พิมพ์ใบแนบส่งของ"}</span><span className="block text-[10px] font-medium text-slate-500">เครื่อง A4 · แนวนอน</span></span>
    </button>
    {error && <p role="alert" className="max-w-xs text-xs text-red-700">{error}</p>}
  </div>;
}
