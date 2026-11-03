"use client";

import type { RefObject } from "react";
import { Download, History, Loader2 } from "lucide-react";
import { OrderReceiptCard } from "@/app/order/customer/components/order-receipt-card";
import type { LastOrderMeta } from "@/app/order/customer/order-client-types";

type OrderSuccessViewProps = {
  highlightedHistoryOrderId: string | null;
  isSavingImage: boolean;
  lastOrderMeta: LastOrderMeta | null;
  linkedCustomerName: string;
  onBackToCatalog: () => void;
  onOpenOrderHistory: (highlightOrderId?: string | null) => void;
  onSaveReceiptAsImage: () => void;
  receiptCardRef: RefObject<HTMLDivElement | null>;
};

export function OrderSuccessView({
  highlightedHistoryOrderId,
  isSavingImage,
  lastOrderMeta,
  linkedCustomerName,
  onBackToCatalog,
  onOpenOrderHistory,
  onSaveReceiptAsImage,
  receiptCardRef,
}: OrderSuccessViewProps) {
  return (
    <>
      <section className="mb-6 mt-8 flex flex-col items-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-green-500">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
        <h2 className="mb-1 whitespace-nowrap text-[17px] font-bold tracking-tight text-slate-900 sm:text-xl">
          เราได้รับคำสั่งซื้อของคุณเรียบร้อยแล้ว
        </h2>
        <p className="text-sm text-slate-500">สามารถบันทึกใบยืนยันคำสั่งซื้อไว้ใช้อ้างอิงได้</p>
      </section>

      {lastOrderMeta && (
        <>
          <button
            onClick={onSaveReceiptAsImage}
            disabled={isSavingImage}
            className="mb-4 w-full rounded-2xl border border-[#003366] bg-[#003366] px-4 py-3.5 text-left text-white shadow-[0_12px_24px_rgba(0,51,102,0.2)] transition-all hover:border-[#0a437d] hover:bg-[#0a437d] active:scale-[0.98] disabled:opacity-60"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 shadow-sm">
                {isSavingImage ? (
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                ) : (
                  <Download className="h-5 w-5 text-white" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-extrabold">
                  {isSavingImage ? "กำลังบันทึกรูป..." : "บันทึกรูป"}
                </div>
                <div className="mt-0.5 text-xs font-medium text-white/80">
                  เก็บใบยืนยันคำสั่งซื้อไว้ในเครื่องของคุณ
                </div>
              </div>
            </div>
          </button>

          <div className="mb-4 flex w-full justify-center">
            <OrderReceiptCard
              receiptRef={receiptCardRef}
              orderNumber={lastOrderMeta.orderNumber}
              orderDate={lastOrderMeta.capturedAt}
              storeName={linkedCustomerName}
              items={lastOrderMeta.receiptItems}
              totalAmount={lastOrderMeta.totalAmount}
            />
          </div>

          <button
            onClick={() => onOpenOrderHistory(highlightedHistoryOrderId)}
            className="mb-3 w-full rounded-2xl border border-[#003366]/15 bg-white px-4 py-3.5 text-left text-[#003366] shadow-sm transition-all hover:border-[#003366]/25 hover:bg-[#f8fbff] active:scale-[0.98]"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold">ดูและแก้ไขคำสั่งซื้อ</div>
                <div className="mt-0.5 text-xs font-medium text-slate-500">
                  หากต้องการปรับจำนวนสินค้า ให้เข้าไปที่ประวัติการสั่งซื้อ
                </div>
              </div>
              <History className="h-5 w-5 shrink-0" />
            </div>
          </button>
        </>
      )}

      <button
        onClick={onBackToCatalog}
        className="mb-8 flex w-full items-center justify-center gap-2 rounded-2xl border border-[#003366]/15 bg-[#eef4fa] px-6 py-4 text-base font-semibold text-[#003366] transition-all hover:bg-[#e4eef8] active:scale-[0.98]"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
          />
        </svg>
        กลับไปหน้าหลัก
      </button>
    </>
  );
}
