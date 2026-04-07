"use client";

import { useState, useTransition } from "react";
import { Trash2, X, AlertTriangle } from "lucide-react";
import { deleteCustomerAction } from "@/app/settings/customers/actions";

type Props = {
  customerId: string;
  customerName: string;
  customerCode: string;
};

export function CustomerDeleteButton({ customerId, customerName, customerCode }: Props) {
  const [open, setOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    setErrorMsg(null);
    startTransition(async () => {
      const result = await deleteCustomerAction(customerId);
      if (result.error) {
        setErrorMsg(result.error);
      } else {
        setOpen(false);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setErrorMsg(null); setOpen(true); }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100 active:scale-95"
        aria-label={`ลบ ${customerName}`}
      >
        <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100">
                  <AlertTriangle className="h-4.5 w-4.5 text-red-600" strokeWidth={2.2} />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">ยืนยันการลบร้านค้า</p>
                  <p className="font-mono text-xs text-slate-400">{customerCode}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:bg-slate-50"
              >
                <X className="h-4 w-4" strokeWidth={2.2} />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4">
              <p className="text-sm leading-6 text-slate-600">
                ต้องการลบ{" "}
                <span className="font-semibold text-slate-900">{customerName}</span>{" "}
                ออกจากระบบใช่ไหม?
              </p>
              <p className="mt-1 text-xs text-slate-400">
                ประวัติออเดอร์และข้อมูลเดิมยังคงอยู่ในระบบ แต่ร้านค้านี้จะไม่แสดงในรายการอีกต่อไป
              </p>

              {errorMsg && (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  {errorMsg}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
                {isPending ? "กำลังลบ..." : "ยืนยันลบ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
