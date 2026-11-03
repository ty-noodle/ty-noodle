"use client";

import Image from "next/image";
import type { RefObject } from "react";
import { Download, Loader2, X } from "lucide-react";
import { OrderReceiptCard } from "@/app/order/customer/components/order-receipt-card";
import type { CustomerOrderRow } from "@/app/order/customer/order-client-types";
import { formatDisplayUnit } from "@/app/order/customer/unit-label";

type OrderReceiptModalsProps = {
  isSavingImage: boolean;
  linkedCustomerName: string;
  onCloseReceipt: () => void;
  onCloseReceiptImage: () => void;
  onSaveReceiptAsImage: () => void;
  receiptCardRef: RefObject<HTMLDivElement | null>;
  receiptImageUrl: string | null;
  receiptOrder: CustomerOrderRow | null;
};

export function OrderReceiptModals({
  isSavingImage,
  linkedCustomerName,
  onCloseReceipt,
  onCloseReceiptImage,
  onSaveReceiptAsImage,
  receiptCardRef,
  receiptImageUrl,
  receiptOrder,
}: OrderReceiptModalsProps) {
  return (
    <>
      {receiptOrder && (
        <div
          className="fixed inset-0 z-[150] flex flex-col bg-black/70 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              onCloseReceipt();
            }
          }}
        >
          <div className="flex items-center justify-between bg-black/30 px-4 py-3">
            <button
              onClick={onCloseReceipt}
              className="p-2 text-white/80 transition-colors hover:text-white"
            >
              <X className="h-6 w-6" />
            </button>
            <span className="text-base font-bold text-white">ใบสั่งซื้อ</span>
            <button
              onClick={onSaveReceiptAsImage}
              disabled={isSavingImage}
              className="flex items-center gap-1.5 rounded-full bg-white/20 px-4 py-2 text-sm font-bold text-white transition-all hover:bg-white/30 active:scale-95 disabled:opacity-60"
            >
              {isSavingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              บันทึก
            </button>
          </div>
          <div className="flex flex-1 items-start justify-center overflow-y-auto px-4 py-4 sm:px-6 md:px-8">
            <OrderReceiptCard
              receiptRef={receiptCardRef}
              orderNumber={receiptOrder.order_number ?? "-"}
              orderDate={receiptOrder.created_at ?? new Date().toISOString()}
              storeName={linkedCustomerName}
              items={(receiptOrder.order_items ?? []).map((item) => ({
                name: item.products?.name ?? "-",
                saleUnitLabel: formatDisplayUnit(item.sale_unit_label),
                quantity: Number(item.quantity) || 0,
                unitPrice: Number(item.unit_price) || 0,
                lineTotal: Number(item.line_total) || 0,
              }))}
              totalAmount={Number(receiptOrder.total_amount) || 0}
            />
          </div>
        </div>
      )}

      {receiptImageUrl && (
        <div
          className="fixed inset-0 z-[160] flex flex-col bg-black/80 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) onCloseReceiptImage();
          }}
        >
          <div className="flex items-center justify-between bg-black/30 px-4 py-3">
            <button
              onClick={onCloseReceiptImage}
              className="p-2 text-white/80 transition-colors hover:text-white"
            >
              <X className="h-6 w-6" />
            </button>
            <span className="text-base font-bold text-white">บันทึกรูปภาพ</span>
            <a
              href={receiptImageUrl}
              download={`TYNoodle-${receiptOrder?.order_number ?? "order"}.png`}
              className="flex items-center gap-1.5 rounded-full bg-white/20 px-4 py-2 text-sm font-bold text-white hover:bg-white/30"
            >
              <Download className="h-4 w-4" />
              ดาวน์โหลด
            </a>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto p-5">
            <Image
              src={receiptImageUrl}
              width={340}
              height={480}
              sizes="(max-width: 640px) 100vw, 340px"
              alt="ใบสั่งซื้อ"
              style={{ maxWidth: "340px", width: "100%", borderRadius: "16px" }}
              className="shadow-2xl"
            />
            <p className="text-center text-sm text-white/70">
              กดค้างที่รูปเพื่อบันทึกลงเครื่อง
            </p>
          </div>
        </div>
      )}
    </>
  );
}
