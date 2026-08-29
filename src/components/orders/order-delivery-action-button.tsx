"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, ReceiptText, X } from "lucide-react";
import { createPortal } from "react-dom";
import { fetchIncomingOrderDetailAction } from "@/app/orders/incoming/actions";
import { formatDisplayUnit } from "@/app/order/customer/unit-label";
import { PrintStoreDeliveryButton } from "@/components/orders/print-store-delivery-button";
import type { OrderDetailData } from "@/lib/orders/detail";
import { fmtDateTH } from "@/lib/utils/date";

let cachedFontEmbedCSS: string | null = null;

function formatCurrency(value: number) {
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatQuantity(value: number) {
  return value.toLocaleString("th-TH", {
    maximumFractionDigits: 2,
  });
}

function formatLineTotal(unitPrice: number, lineTotal: number) {
  return unitPrice > 0 ? formatCurrency(lineTotal) : "-";
}

type OrderDeliveryActionButtonProps = {
  customerId: string;
  customerName?: string;
  date: string;
  iconOnly?: boolean;
  label?: string;
  orderId?: string;
};

export function OrderDeliveryActionButton({
  customerId,
  customerName,
  date,
  iconOnly = false,
  label = "ดูใบยืนยัน",
  orderId,
}: OrderDeliveryActionButtonProps) {
  const [isMobilePhone, setIsMobilePhone] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [detail, setDetail] = useState<OrderDetailData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const receiptCardRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;

    const mobileQuery = window.matchMedia("(max-width: 767px)");
    const updateMobile = () => setIsMobilePhone(mobileQuery.matches);
    updateMobile();
    mobileQuery.addEventListener("change", updateMobile);

    return () => {
      mobileQuery.removeEventListener("change", updateMobile);
    };
  }, []);

  const receiptItems = useMemo(
    () =>
      (detail?.items ?? []).map((item) => ({
        lineTotal: item.lineTotal,
        name: item.productName,
        quantity: item.quantity,
        saleUnitLabel: formatDisplayUnit(item.unit),
        unitPrice: item.unitPrice,
      })),
    [detail],
  );

  async function openReceipt() {
    if (isLoading || !orderId || !customerName) return;

    setErrorMessage(null);
    setIsLoading(true);
    try {
      const result = await fetchIncomingOrderDetailAction(orderId);
      if (result.error || !result.detail) {
        setErrorMessage(result.error ?? "โหลดใบยืนยันคำสั่งซื้อไม่สำเร็จ");
        return;
      }
      setDetail(result.detail);
      setIsOpen(true);
    } catch {
      setErrorMessage("โหลดใบยืนยันคำสั่งซื้อไม่สำเร็จ");
    } finally {
      setIsLoading(false);
    }
  }

  async function saveReceiptAsImage() {
    if (!receiptCardRef.current || isSaving) return;

    setIsSaving(true);
    try {
      const htmlToImage = await import("html-to-image");
      let fontEmbedCSS: string | undefined = undefined;
      if (cachedFontEmbedCSS) {
        fontEmbedCSS = cachedFontEmbedCSS;
      } else {
        try {
          await Promise.race([
            document.fonts.ready,
            new Promise((_, reject) => setTimeout(() => reject(new Error("Font load timeout")), 2000))
          ]);
          fontEmbedCSS = await Promise.race([
            htmlToImage.getFontEmbedCSS(document.body),
            new Promise<string>((_, reject) => setTimeout(() => reject(new Error("Font CSS embed timeout")), 2000))
          ]);
          cachedFontEmbedCSS = fontEmbedCSS;
        } catch (e) {
          console.warn("Failed to embed fonts (timed out or error), proceeding without embedded fonts:", e);
        }
      }

      // Capture DIRECTLY from the visible element!
      const dataUrl = await htmlToImage.toPng(receiptCardRef.current, {
        backgroundColor: "#ffffff",
        cacheBust: true,
        fontEmbedCSS,
        pixelRatio: 2,
      });

      const fileName = `TYNoodle-${detail?.orderNumber ?? "order"}.png`;

      // Check if iOS
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

      if (isIOS && navigator.share && navigator.canShare) {
        try {
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          const file = new File([blob], fileName, { type: "image/png" });

          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: "ใบยืนยันคำสั่งซื้อ",
            });
            return;
          }
        } catch (err) {
          console.error("[WebShare:IncomingOrder]", err);
          if (err instanceof Error && err.name === "AbortError") {
            return; // Stay on the page if cancelled!
          }
          // Fallback to normal download if WebShare fails
        }
      }

      const downloadLink = document.createElement("a");
      downloadLink.href = dataUrl;
      downloadLink.download = fileName;
      downloadLink.rel = "noopener";
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } catch (error) {
      console.error("Save image error:", error);
      setErrorMessage("บันทึกรูปใบยืนยันไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  }

  const showDocumentButton = Boolean(orderId && customerName);
  const showPrintButton = !isMobilePhone;

  return (
    <>
      {showDocumentButton && (
        <button
          type="button"
          onClick={openReceipt}
          disabled={isLoading}
          aria-label={label}
          title={label}
          className={[
            "inline-flex items-center justify-center border border-[#003366] bg-[#003366] text-white transition hover:bg-[#002952] active:scale-95 disabled:opacity-50",
            iconOnly ? "size-10 shrink-0 rounded-full p-0 leading-none" : "min-h-9 w-full gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold",
          ].join(" ")}
        >
          {isLoading ? (
            <Loader2 className="h-4.5 w-4.5 animate-spin" strokeWidth={2.2} />
          ) : (
            <ReceiptText className="h-4.5 w-4.5" strokeWidth={2.2} />
          )}
          {iconOnly ? null : isLoading ? "กำลังโหลด..." : label}
        </button>
      )}

      {showPrintButton && (
        <PrintStoreDeliveryButton
          date={date}
          customerId={customerId}
          label="พิมพ์ใบส่งของ"
          iconOnly={iconOnly}
        />
      )}

      {mounted && isOpen && detail
        ? createPortal(
            <div
              className="fixed inset-0 z-[500] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-in fade-in duration-200"
              onClick={(event) => {
                if (event.target === event.currentTarget) setIsOpen(false);
              }}
            >
              {/* Floating Close Button inside viewport for perfect mobile visibility */}
              <button
                onClick={() => setIsOpen(false)}
                className="fixed top-4 right-4 z-[550] flex items-center gap-1.5 rounded-full bg-black/70 px-4 py-2 text-white shadow-lg backdrop-blur-md transition active:scale-95 hover:bg-black/80"
              >
                <X className="h-5 w-5" strokeWidth={3} />
                <span className="text-sm font-bold tracking-tight">ปิดหน้าต่างนี้</span>
              </button>

              <div
                className="relative w-full max-w-[480px] animate-in zoom-in-95 duration-300"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex justify-start mb-4">
                  <button
                    type="button"
                    onClick={saveReceiptAsImage}
                    disabled={isSaving}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#0051d5] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#003d99] disabled:opacity-60 shadow-md"
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    บันทึกรูป
                  </button>
                </div>

                <div className="scrollbar-hide max-h-[85vh] overflow-y-auto">
                  <div className="bg-white text-black shadow-2xl" ref={receiptCardRef}>
                    <div className="px-6 py-6">
                      <div className="mb-2 flex justify-end pr-3 pt-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/ty-noodles-logo.png"
                          alt="T&Y Noodle"
                          style={{
                            width: "48px",
                            height: "48px",
                            objectFit: "contain",
                          }}
                        />
                      </div>

                      <div className="mb-4 text-center">
                        <div className="text-[11px] leading-relaxed text-slate-500">
                          T&Y Noodle - ใบยืนยันคำสั่งซื้อ
                        </div>
                        <div className="mt-0.5 text-[14px] font-black leading-tight">
                          เลขที่ออเดอร์: {detail.orderNumber}
                        </div>
                        <div className="mt-1 text-[12px] leading-relaxed text-slate-500">
                          {fmtDateTH(detail.createdAt)}
                        </div>
                      </div>

                      <div className="mb-4 h-[2px] bg-black" />

                      <div className="mb-3">
                        <span className="text-[12px] font-bold">ชื่อลูกค้า:</span>
                        <span className="text-[12px]"> {customerName}</span>
                      </div>

                      <div className="grid grid-cols-[1fr_88px_78px] gap-2 border-b border-[#cccccc] py-2">
                        <span className="text-left text-[12px] font-black">สินค้า</span>
                        <span className="text-right text-[12px] font-black">จำนวน</span>
                        <span className="text-right text-[12px] font-black">รวม</span>
                      </div>

                      <div className="divide-y divide-[#cccccc]">
                        {receiptItems.map((item, index) => (
                          <div
                            key={index}
                            className="grid grid-cols-[1fr_88px_78px] items-center gap-2 py-3"
                          >
                            <div className="text-[11px] leading-[1.4] break-words whitespace-normal overflow-visible">{item.name}</div>
                            <div className="text-right text-[12px] font-medium">
                              {formatQuantity(item.quantity)} {item.saleUnitLabel}
                            </div>
                            <div className="text-right text-[12px] font-bold">
                              {formatLineTotal(item.unitPrice, item.lineTotal)}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mb-4 mt-4 h-[1px] bg-[#cccccc]" />

                      <div className="mb-6 flex items-center justify-between px-1">
                        <span className="text-[13px] font-black">ยอดรวมทั้งหมด:</span>
                        <span className="text-[16px] font-black text-[#0051d5] underline decoration-double decoration-slate-300 underline-offset-4">
                          {formatCurrency(detail.totalAmount)}
                        </span>
                      </div>

                      {/* Button moved to top */}

                      {errorMessage ? (
                        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                          {errorMessage}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
