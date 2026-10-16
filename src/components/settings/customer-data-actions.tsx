"use client";

import { useState, useTransition } from "react";
import { Loader2, Power, RotateCcw, Trash2, X } from "lucide-react";
import {
  deleteCustomerDataAction,
  toggleCustomerAvailabilityAction,
} from "@/app/(workspace)/settings/customer-data/actions";

type CustomerDataActionsProps = {
  customerCode: string;
  customerId: string | null;
  customerName: string;
  isActive: boolean;
  lineLinkId: string;
};

export function CustomerDataActions({
  customerCode,
  customerId,
  customerName,
  isActive,
  lineLinkId,
}: CustomerDataActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleToggle() {
    if (!customerId) return;
    setErrorMessage(null);
    startTransition(async () => {
      const result = await toggleCustomerAvailabilityAction(customerId, !isActive);
      if (result.error) {
        setErrorMessage(result.error);
      }
    });
  }

  function handleDelete() {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await deleteCustomerDataAction({ customerId, lineLinkId });
      if (result.error) {
        setErrorMessage(result.error);
        return;
      }

      setDeleteOpen(false);
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {customerId ? (
          <button
            type="button"
            onClick={handleToggle}
            disabled={isPending}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
              isActive
                ? "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.2} />
            ) : isActive ? (
              <Power className="h-3.5 w-3.5" strokeWidth={2.2} />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.2} />
            )}
            {isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => {
            setErrorMessage(null);
            setDeleteOpen(true);
          }}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
          ลบ
        </button>
      </div>

      {deleteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-rose-500">
                  จัดการสิทธิ์ลูกค้า
                </p>
                <h3 className="mt-1 text-lg font-bold text-slate-950">ลบข้อมูลลูกค้า</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {customerName} · {customerCode}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                disabled={isPending}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:bg-slate-50"
                aria-label="ปิด"
              >
                <X className="h-4 w-4" strokeWidth={2.2} />
              </button>
            </div>

            <div className="px-5 py-5">
              <p className="text-sm leading-6 text-slate-600">
                เมื่อลบแล้ว ระบบจะยกเลิกการเชื่อมต่อ LINE ของลูกค้ารายนี้ทันที หากลูกค้ากลับเข้ามาอีกครั้งจะต้องเริ่มขั้นตอนเลือกประเภทลูกค้าใหม่
              </p>

              {errorMessage ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                  {errorMessage}
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                disabled={isPending}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} />
                ) : (
                  <Trash2 className="h-4 w-4" strokeWidth={2.2} />
                )}
                ยืนยันลบ
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
