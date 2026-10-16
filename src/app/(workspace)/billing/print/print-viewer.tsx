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
  autoprint,
}: {
  initialData: BillingStatementData | BillingStatementData[];
  organizationId: string;
  shouldSave: boolean;
  fromDate: string;
  toDate: string;
  autoprint?: boolean;
}) {
  void fromDate;
  void toDate;

  const [data, setData] = useState(initialData);
  const dataList = Array.isArray(data) ? data : [data];

  const itemsToRecord = dataList.map((item) => ({
    customerId: item.customer.id,
    billingDate: item.billingDate,
    fromDate: item.fromDate,
    toDate: item.toDate,
    totalAmount: item.grandTotal,
    snapshotRows: item.rows,
  }));

  const label = Array.isArray(data)
    ? `ทั้งหมด ${data.length} ร้านค้า`
    : `${data.customer.code} ${data.customer.name}`;

  const allAlreadySaved = dataList.every((item) => item.billingNumber !== null);

  function handleSaved(results: { customerId: string; billingNumber: string }[]) {
    setData((current) => {
      const list = Array.isArray(current) ? [...current] : [{ ...current }];
      const updated = list.map((item) => {
        const found = results.find((result) => result.customerId === item.customer.id);
        return found ? { ...item, billingNumber: found.billingNumber, isLocked: true } : item;
      });
      return Array.isArray(current) ? updated : updated[0];
    });
  }

  return (
    <>
      <div className="no-print mb-6 flex flex-wrap items-center gap-3 px-4 pt-4">
        <PrintButton
          organizationId={organizationId}
          items={itemsToRecord}
          shouldSave={shouldSave && !allAlreadySaved}
          billingNumbers={dataList
            .map((item) => item.billingNumber)
            .filter((value): value is string => value !== null)}
          onSaved={handleSaved}
          autoprint={autoprint}
        />
        <span className="text-sm font-semibold text-slate-700">
          {label}
          {allAlreadySaved ? (
            <span className="ml-2 text-xs font-normal text-emerald-600">
              (ออกใบวางบิลแล้ว · ยอดล็อก)
            </span>
          ) : null}
          {!allAlreadySaved && shouldSave ? (
            <span className="ml-2 text-xs font-normal text-slate-400">
              (จะบันทึกเมื่อกดพิมพ์)
            </span>
          ) : null}
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
