"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2, Settings, X } from "lucide-react";
import { updateIncomingOrderDateAction } from "@/app/(workspace)/orders/incoming/actions";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";

type IncomingOrderDateButtonProps = {
  currentListDate: string;
  orderDate: string;
  orderId: string;
  orderNumber: string;
  searchTerm?: string;
  selectedCustomerIds?: string[];
};

export function IncomingOrderDateButton({
  currentListDate,
  orderDate,
  orderId,
  orderNumber,
  searchTerm = "",
  selectedCustomerIds = [],
}: IncomingOrderDateButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [nextOrderDate, setNextOrderDate] = useState(orderDate);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openModal() {
    setNextOrderDate(orderDate);
    setError(null);
    setIsOpen(true);
  }

  function closeModal() {
    if (isPending) return;
    setIsOpen(false);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("orderId", orderId);
      formData.set("orderDate", nextOrderDate);
      const result = await updateIncomingOrderDateAction(formData);

      if ("error" in result) {
        setError(result.error);
        return;
      }

      const targetDate = result.orderDate ?? nextOrderDate;
      const params = new URLSearchParams();
      params.set("date", targetDate);
      if (searchTerm.trim()) {
        params.set("q", searchTerm.trim());
      }
      if (selectedCustomerIds.length > 0) {
        params.set("customers", selectedCustomerIds.join(","));
      }

      setIsOpen(false);
      if (targetDate === currentListDate) {
        router.refresh();
        return;
      }

      router.push(`/orders/incoming?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-900 shadow-sm transition hover:border-[#003366]/30 hover:bg-slate-50 hover:text-[#003366] active:scale-95"
        aria-label="แก้ไขวันที่ออเดอร์"
        title="แก้ไขวันที่ออเดอร์"
      >
        <Settings className="h-4.5 w-4.5" strokeWidth={2.2} />
      </button>

      {isOpen ? createPortal(
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-950/45 px-4 font-[family:var(--font-sarabun)]">
          <div className="w-full max-w-sm rounded-[1.6rem] bg-white p-5 shadow-[0_24px_54px_rgba(15,23,42,0.24)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-bold text-slate-950">แก้ไขวันที่ออเดอร์</p>
                <p className="mt-1 font-mono text-sm font-semibold text-[#003366]" translate="no">
                  {orderNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
                aria-label="ปิด"
              >
                <X className="h-4.5 w-4.5" strokeWidth={2.4} />
              </button>
            </div>

            <div className="mt-4 space-y-2">
              <label className="text-sm font-semibold text-slate-950">วันที่ออเดอร์ใหม่</label>
              <ThaiDatePicker
                id={`incoming-order-date-${orderId}`}
                name="orderDate"
                value={nextOrderDate}
                onChange={setNextOrderDate}
              />
              <p className="text-xs font-medium text-slate-600">
                เมื่อบันทึกแล้ว ออเดอร์จะย้ายไปอยู่ในวันที่ที่เลือกทันที
              </p>
            </div>

            {error ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                {error}
              </div>
            ) : null}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={closeModal}
                disabled={isPending}
                className="flex-1 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 transition active:scale-[0.98] disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#003366] py-3 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.4} />
                    กำลังบันทึก...
                  </>
                ) : (
                  "บันทึกวันที่"
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}
