"use client";

import { useState } from "react";
import { Printer, X } from "lucide-react";

export type DeliveredTodayRow = {
  customerId: string;
  customerName: string;
  customerCode: string;
  deliveryDate: string;
  deliveryNumbers: string[];
  deliveredAmount: number;
  itemCount: number;
  orderNumbers: string[];
  notes: string | null;
  lines: Array<{
    productId: string;
    productSku: string;
    productName: string;
    saleUnitLabel: string;
    orderedQuantity: number;
    deliveredQuantity: number;
    shortQuantity: number;
    orderedLineTotal: number;
    deliveredLineTotal: number;
    status: "complete" | "partial" | "unlinked";
  }>;
};

function formatThaiCurrency(value: number) {
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatThaiQty(value: number) {
  return value.toLocaleString("th-TH", {
    maximumFractionDigits: 3,
  });
}

function lineStatusLabel(status: DeliveredTodayRow["lines"][number]["status"], shortQuantity: number) {
  if (status === "unlinked") return "ยังไม่ผูกออเดอร์";
  if (shortQuantity > 0) return `ขาด ${formatThaiQty(shortQuantity)}`;
  return "ครบ";
}

export function DeliveredTodaySection({
  date,
  deliveredToday,
}: {
  date: string;
  deliveredToday: DeliveredTodayRow[];
}) {
  const [activeReferenceRow, setActiveReferenceRow] = useState<DeliveredTodayRow | null>(null);
  const [printingRowKey, setPrintingRowKey] = useState<string | null>(null);

  if (deliveredToday.length === 0) return null;

  function closeReferenceModal() {
    setActiveReferenceRow(null);
  }

  function handlePrint(href: string, rowKey: string) {
    setPrintingRowKey(rowKey);
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;";
    iframe.src = href;
    document.body.appendChild(iframe);

    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) return;
      win.addEventListener("afterprint", () => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        setPrintingRowKey((current) => (current === rowKey ? null : current));
      });
      setTimeout(() => win.print(), 300);
    };
  }

  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-emerald-200 bg-emerald-50 shadow-[0_12px_40px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-emerald-200 bg-emerald-100/60 px-5 py-3.5">
        <span className="text-sm font-bold text-emerald-800">
          ยืนยันใบส่งของแล้ว
        </span>
        <a
          href={`/delivery?from=${date}&to=${date}`}
          className="ml-auto rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
        >
          เปิดหน้าจัดส่ง
        </a>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[920px] w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-emerald-200 bg-white/70 text-xs font-semibold uppercase tracking-[0.06em] text-emerald-800">
              <th className="px-4 py-2.5 text-left">รหัสร้าน</th>
              <th className="px-4 py-2.5 text-left">ชื่อร้านค้า</th>
              <th className="px-4 py-2.5 text-left">เลขที่จัดส่ง</th>
              <th className="px-4 py-2.5 text-left">อ้างอิงออเดอร์</th>
              <th className="px-4 py-2.5 text-right">รายการ</th>
              <th className="px-4 py-2.5 text-right">ยอดจัดส่ง</th>
              <th className="px-4 py-2.5 text-right">พิมพ์</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-100">
            {deliveredToday.map((row) => {
              const rowKey = `${row.deliveryDate}:${row.customerId}`;
              const printHref = `/delivery/print?date=${row.deliveryDate}&customer=${row.customerId}`;
              const isPrinting = printingRowKey === rowKey;

              return (
                <tr key={rowKey} className="bg-white/50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.customerCode}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{row.customerName}</td>
                  <td className="px-4 py-3 text-slate-700">{row.deliveryNumbers.join(", ")}</td>
                  <td className="px-4 py-3 text-slate-700">
                    <button
                      type="button"
                      onClick={() => setActiveReferenceRow(row)}
                      className="inline-flex rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                    >
                      ดูเพิ่มเติม
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700">
                    {row.itemCount.toLocaleString("th-TH")}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900">
                    {formatThaiCurrency(row.deliveredAmount)} บาท
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handlePrint(printHref, rowKey)}
                      disabled={isPrinting}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                    >
                      <Printer className="h-3.5 w-3.5" strokeWidth={2.2} />
                      {isPrinting ? "กำลังเปิด..." : "พิมพ์ซ้ำ"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {activeReferenceRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6">
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[1.75rem] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.28)]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                  ออเดอร์อ้างอิง
                </p>
                <h3 className="mt-1 text-lg font-bold text-slate-900">
                  {activeReferenceRow.customerName}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  ใบส่งของ: {activeReferenceRow.deliveryNumbers.join(", ")}
                </p>
              </div>
              <button
                type="button"
                onClick={closeReferenceModal}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
                aria-label="ปิดหน้าต่างออเดอร์อ้างอิง"
              >
                <X className="h-5 w-5" strokeWidth={2.2} />
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-5">
              <div className="flex flex-wrap gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    รหัสร้าน
                  </p>
                  <p className="mt-1 font-mono text-sm font-semibold text-slate-800">
                    {activeReferenceRow.customerCode}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    ยอดจัดส่งรวม
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">
                    {formatThaiCurrency(activeReferenceRow.deliveredAmount)} บาท
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  เลขที่ออเดอร์
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {activeReferenceRow.orderNumbers.length > 0 ? (
                    activeReferenceRow.orderNumbers.map((orderNumber) => (
                      <span
                        key={orderNumber}
                        className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100"
                      >
                        {orderNumber}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500">ไม่พบเลขที่ออเดอร์อ้างอิง</span>
                  )}
                </div>
              </div>

              <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-[760px] w-full border-collapse text-sm">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">
                      <th className="px-3 py-2 text-left">สินค้า</th>
                      <th className="px-3 py-2 text-right">สั่ง</th>
                      <th className="px-3 py-2 text-right">ส่ง</th>
                      <th className="px-3 py-2 text-right">ขาด</th>
                      <th className="px-3 py-2 text-right">ยอดจอง</th>
                      <th className="px-3 py-2 text-right">ยอดส่ง</th>
                      <th className="px-3 py-2 text-right">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {activeReferenceRow.lines.map((line) => (
                      <tr key={`${line.productId}:${line.saleUnitLabel}`}>
                        <td className="px-3 py-2.5">
                          <p className="font-semibold text-slate-900">{line.productName}</p>
                          <p className="font-mono text-xs text-slate-400">{line.productSku}</p>
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium text-slate-700">
                          {formatThaiQty(line.orderedQuantity)} {line.saleUnitLabel}
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium text-slate-900">
                          {formatThaiQty(line.deliveredQuantity)} {line.saleUnitLabel}
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium text-red-700">
                          {formatThaiQty(line.shortQuantity)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium text-slate-700">
                          {formatThaiCurrency(line.orderedLineTotal)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-slate-900">
                          {formatThaiCurrency(line.deliveredLineTotal)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs font-semibold text-slate-700">
                          {lineStatusLabel(line.status, line.shortQuantity)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {activeReferenceRow.notes ? (
                <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  หมายเหตุ: {activeReferenceRow.notes}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
