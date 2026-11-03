"use client";

import Image from "next/image";
import { useState } from "react";
import { Loader2, Package, BarChart3, ClipboardList } from "lucide-react";
import type { ProductWithImage } from "@/app/order/customer/types";
import type { CustomerOrderRow } from "@/app/order/customer/order-client-types";
import { OrderSummaryView } from "@/app/order/customer/components/order-summary-view";
import { formatDisplayUnit } from "@/app/order/customer/unit-label";

type Tab = "history" | "summary";

type OrderHistoryViewProps = {
  customerId: string;
  formatOrderTimestamp: (value: string) => string;
  getOrderEditMeta: (orderDate: string, status: string | null | undefined) => { cutoffLabel: string; isEditable: boolean };
  highlightedHistoryOrderId: string | null;
  isOrderOpen: boolean;
  isPending: boolean;
  onOpenEditOrder: (order: CustomerOrderRow) => void;
  onReorder: (order: CustomerOrderRow) => void;
  onShowReceipt: (order: CustomerOrderRow) => void;
  orderHistory: CustomerOrderRow[];
  productsByLookupKey: Map<string, ProductWithImage>;
};

export function OrderHistoryView({
  customerId,
  formatOrderTimestamp,
  getOrderEditMeta,
  highlightedHistoryOrderId,
  isOrderOpen,
  isPending,
  onOpenEditOrder,
  onReorder,
  onShowReceipt,
  orderHistory,
  productsByLookupKey,
}: OrderHistoryViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>("history");
  const [summaryMounted, setSummaryMounted] = useState(false);

  function handleTabChange(tab: Tab) {
    setActiveTab(tab);
    if (tab === "summary") setSummaryMounted(true);
  }

  return (
    <div>
      {/* Segmented Control */}
      <div className="sticky top-0 z-10 will-change-transform px-4 pb-3 pt-4 backdrop-blur-sm" style={{ backgroundColor: "rgba(249,250,251,0.92)", transform: "translateZ(0)" }}>
        <div className="flex rounded-2xl bg-slate-100 p-1">
          <button
            onClick={() => handleTabChange("history")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold transition-colors ${
              activeTab === "history"
                ? "bg-white text-[#003366] shadow-sm"
                : "text-slate-500"
            }`}
          >
            <ClipboardList className="h-4 w-4 shrink-0" />
            ประวัติออเดอร์
          </button>
          <button
            onClick={() => handleTabChange("summary")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold transition-colors ${
              activeTab === "summary"
                ? "bg-white text-[#003366] shadow-sm"
                : "text-slate-500"
            }`}
          >
            <BarChart3 className="h-4 w-4 shrink-0" />
            สรุปสินค้า
          </button>
        </div>
      </div>

      {/* History tab */}
      <section className={`space-y-4 p-4 ${activeTab === "history" ? "" : "hidden"}`}>
        {isPending && orderHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Loader2 className="mb-3 h-8 w-8 animate-spin" />
            <p>กำลังโหลดประวัติ...</p>
          </div>
        ) : orderHistory.length === 0 ? (
          <div className="rounded-[2.5rem] border border-slate-50 bg-white py-10 text-center text-slate-500 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.04)]">
            <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto mb-3 h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            <p className="font-medium">ยังไม่มีประวัติการสั่งซื้อ</p>
          </div>
        ) : (
          orderHistory.map((order) => {
            const editMeta = getOrderEditMeta(order.order_date ?? "", order.status);
            const isHighlighted = highlightedHistoryOrderId === order.id;

            return (
              <article
                key={order.id}
                className={`-mx-4 rounded-none border p-5 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.04)] ${
                  isHighlighted ? "border-[#003366]/25 bg-[#f8fbff]" : "border-slate-50 bg-white"
                }`}
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      เลขออเดอร์
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-900">
                      {order.order_number || "-"}
                    </p>
                    {(order.created_at || order.order_date) && (
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        {order.created_at
                          ? formatOrderTimestamp(order.created_at)
                          : (() => {
                              const [y, m, d] = (order.order_date ?? "").split("-");
                              return `${d}/${m}/${parseInt(y, 10) + 543}`;
                            })()}
                      </p>
                    )}
                    <p className="mt-1 text-xs font-medium text-[#003366]/70">
                      รายการทั้งหมด {(order.order_items ?? []).length} รายการ
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => onShowReceipt(order)}
                      className="inline-flex items-center rounded-full bg-green-50 px-3 py-2 text-xs font-bold text-green-700 transition-all hover:bg-green-100 active:scale-[0.98]"
                    >
                      ดูใบสั่ง
                    </button>
                    <button
                      onClick={() => onReorder(order)}
                      disabled={!isOrderOpen}
                      className={`inline-flex items-center rounded-full px-3 py-2 text-xs font-bold transition-all active:scale-[0.98] ${
                        isOrderOpen
                          ? "bg-[#eef4fa] text-[#003366] hover:bg-[#e4eef8]"
                          : "cursor-not-allowed bg-slate-100 text-slate-400"
                      }`}
                    >
                      {isOrderOpen ? "สั่งอีกครั้ง" : "ปิดรับออเดอร์"}
                    </button>
                  </div>
                </div>
                <div className="mb-4">
                  {editMeta.isEditable ? (
                    <button
                      onClick={() => onOpenEditOrder(order)}
                      className="w-full rounded-2xl border border-[#003366]/15 bg-[#eef4fa] px-4 py-3 text-sm font-bold text-[#003366] transition-all hover:bg-[#e4eef8] active:scale-[0.98]"
                    >
                      แก้ไขคำสั่งซื้อนี้
                    </button>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">
                      หมดเวลาแก้ไขแล้ว
                    </div>
                  )}
                </div>

                <div className="divide-y divide-slate-300">
                  {(order.order_items ?? []).map((item, index) => {
                    const fallbackProduct = productsByLookupKey.get(
                      `${item.products?.id ?? ""}::${item.product_sale_unit_id ?? ""}`,
                    );
                    const imageUrl =
                      fallbackProduct?.product_images?.[0]?.public_url ??
                      "/placeholders/product-placeholder.svg";
                    const itemName = item.products?.name ?? fallbackProduct?.name ?? "-";
                    const itemUnit = formatDisplayUnit(
                      item.sale_unit_label ?? fallbackProduct?.sale_unit_label,
                    );

                    return (
                      <div
                        key={item.id ?? `${order.id ?? "order"}-${index}`}
                        className="flex items-center gap-3 px-3 py-3"
                      >
                        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                          <Image
                            src={imageUrl}
                            alt={itemName}
                            fill
                            sizes="64px"
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">{itemName}</p>
                          <p className="mt-1.5 flex items-center gap-1 text-xs font-bold text-[#003366]">
                            <Package className="h-3.5 w-3.5 shrink-0 opacity-70" />
                            {Number(item.quantity) || 0} {itemUnit}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })
        )}
      </section>

      {/* Summary tab — lazy mount on first open */}
      <div className={activeTab === "summary" ? "" : "hidden"}>
        {summaryMounted && <OrderSummaryView customerId={customerId} />}
      </div>
    </div>
  );
}
