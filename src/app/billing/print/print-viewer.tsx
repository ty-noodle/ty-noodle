"use client";

import { useState } from "react";
import { BillingStatementLayout } from "@/components/print/billing-statement-layout";
import { PrintButton } from "./print-button";
import type { BillingStatementData } from "@/lib/billing/billing-statement";

export function PrintViewer({
  initialData,
  organizationId,
  shouldSave,
  fromDate,
  toDate,
}: {
  initialData: BillingStatementData | BillingStatementData[];
  organizationId: string;
  shouldSave: boolean;
  fromDate: string;
  toDate: string;
}) {
  void fromDate;
  void toDate;
  const [data, setData] = useState(initialData);

  const dataList = Array.isArray(data) ? data : [data];

  const itemsToRecord = dataList.map((d) => ({
    customerId: d.customer.id,
    billingDate: d.billingDate,
    fromDate: d.fromDate,
    toDate: d.toDate,
    totalAmount: d.grandTotal,
    snapshotRows: d.rows, // ส่ง rows ไป save เป็น snapshot
  }));

  const label = Array.isArray(data)
    ? `ทั้งหมด ${data.length} ร้านค้า`
    : `${data.customer.code} ${data.customer.name}`;

  // ถ้าทุกร้านมีเลขวางบิลแล้ว (ออกไปแล้ว) ไม่ต้อง save ซ้ำ
  const allAlreadySaved = dataList.every((d) => d.billingNumber !== null);

  function handleSaved(results: { customerId: string; billingNumber: string }[]) {
    setData((prev) => {
      const list = Array.isArray(prev) ? [...prev] : [{ ...prev }];
      const updated = list.map((d) => {
        const found = results.find((r) => r.customerId === d.customer.id);
        if (found) return { ...d, billingNumber: found.billingNumber, isLocked: true };
        return d;
      });
      return Array.isArray(prev) ? updated : updated[0];
    });
  }

  return (
    <>
      <div className="no-print mb-6 flex flex-wrap items-center gap-3 px-4 pt-4">
        <PrintButton
          organizationId={organizationId}
          items={itemsToRecord}
          shouldSave={shouldSave && !allAlreadySaved}
          billingNumbers={dataList.map((d) => d.billingNumber).filter((n): n is string => n !== null)}
          onSaved={handleSaved}
        />
        <span className="text-sm font-semibold text-slate-700">
          {label}
          {allAlreadySaved && (
            <span className="ml-2 text-xs font-normal text-emerald-600">
              (ออกใบวางบิลแล้ว · ยอดล็อก)
            </span>
          )}
          {!allAlreadySaved && shouldSave && (
            <span className="ml-2 text-xs font-normal text-slate-400">
              (จะบันทึกเมื่อกดพิมพ์)
            </span>
          )}
        </span>
        <a
          href="/billing"
          className="ml-auto rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          กลับ
        </a>
      </div>

      <BillingStatementLayout data={data} />
    </>
  );
}
