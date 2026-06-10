"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileText, Loader2, X } from "lucide-react";
import { createPortal } from "react-dom";
import * as htmlToImage from "html-to-image";
import {
  HALF_SHEET_HEIGHT_MM,
  PRINT_ORGANIZATION_NAME,
  PrintCustomerRow,
  PrintDocHeader,
  PrintTotalRow,
  SHEET_WIDTH_MM,
  chunkItems,
  fmt,
  formatDateShort,
} from "@/components/print/print-shared";

let cachedFontEmbedCSS: string | null = null;
const DOTTED_LINE = "2px dotted black";

function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(",");
  const mime = parts[0]?.match(/:(.*?);/)?.[1] ?? "image/png";
  const binary = atob(parts[1] ?? "");
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: mime });
}

type DeliveryItem = {
  number: string;
  date: string;
  amount: number;
};

type BillingPreviewButtonProps = {
  customerName: string;
  customerCode: string;
  fromDate: string;
  toDate: string;
  deliveries: DeliveryItem[];
  totalAmount: number;
};

export function BillingPreviewButton({
  customerName,
  customerCode,
  fromDate,
  toDate,
  deliveries,
  totalAmount,
}: BillingPreviewButtonProps) {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [touchStartDist, setTouchStartDist] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const chunks = chunkItems(deliveries, 10);
  const pages = chunks.length > 0 ? chunks : [[]];
  const totalPages = pages.length;

  useEffect(() => {
    setMounted(true);

    if (typeof window !== "undefined" && !cachedFontEmbedCSS) {
      const preloadFonts = async () => {
        try {
          await document.fonts.ready;
          const css = await htmlToImage.getFontEmbedCSS(document.body);
          cachedFontEmbedCSS = css;
        } catch (error) {
          console.warn("[FontPreloader:Billing] Failed to preload fonts:", error);
        }
      };
      const timer = setTimeout(preloadFonts, 1000);
      return () => clearTimeout(timer);
    }

    return undefined;
  }, []);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const updateScale = () => {
      const container = containerRef.current;
      if (!container) return;

      const containerWidth = container.offsetWidth;
      const dummy = document.createElement("div");
      dummy.style.width = `${SHEET_WIDTH_MM}mm`;
      dummy.style.position = "absolute";
      dummy.style.visibility = "hidden";
      document.body.appendChild(dummy);
      const sheetWidth = dummy.offsetWidth;
      document.body.removeChild(dummy);

      setScale(containerWidth < sheetWidth && sheetWidth > 0 ? containerWidth / sheetWidth : 1);
    };

    const timer = setTimeout(updateScale, 100);
    window.addEventListener("resize", updateScale);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updateScale);
    };
  }, [isOpen]);

  const handleTouchStart = (event: React.TouchEvent) => {
    if (event.touches.length === 2) {
      const dist = Math.hypot(
        event.touches[0].pageX - event.touches[1].pageX,
        event.touches[0].pageY - event.touches[1].pageY,
      );
      setTouchStartDist(dist);
    }
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    if (event.touches.length === 2 && touchStartDist > 0) {
      const dist = Math.hypot(
        event.touches[0].pageX - event.touches[1].pageX,
        event.touches[0].pageY - event.touches[1].pageY,
      );
      const factor = dist / touchStartDist;

      setZoom((prev) => Math.min(Math.max(prev * factor, 1), 3));
      setTouchStartDist(dist);
    }
  };

  const handleTouchEnd = () => setTouchStartDist(0);

  const saveAsImage = async () => {
    const targets = document.querySelectorAll(".billing-preview-card-element");
    if (targets.length === 0 || isSaving) return;

    setIsSaving(true);
    try {
      let fontEmbedCSS: string | undefined;
      if (cachedFontEmbedCSS) {
        fontEmbedCSS = cachedFontEmbedCSS;
      } else {
        try {
          await Promise.race([
            document.fonts.ready,
            new Promise((_, reject) => setTimeout(() => reject(new Error("Font load timeout")), 2000)),
          ]);
          fontEmbedCSS = await Promise.race([
            htmlToImage.getFontEmbedCSS(document.body),
            new Promise<string>((_, reject) => setTimeout(() => reject(new Error("Font CSS embed timeout")), 2000)),
          ]);
          cachedFontEmbedCSS = fontEmbedCSS;
        } catch (error) {
          console.warn("Failed to embed fonts, proceeding without embedded fonts:", error);
        }
      }

      const captured: { dataUrl: string; blob: Blob; name: string }[] = [];

      for (let i = 0; i < targets.length; i += 1) {
        const target = targets[i] as HTMLElement;
        const captureWidth = target.offsetWidth;
        const captureHeight = target.offsetHeight;

        const dataUrl = await htmlToImage.toPng(target, {
          backgroundColor: "#ffffff",
          cacheBust: true,
          fontEmbedCSS,
          pixelRatio: 2,
          width: captureWidth,
          height: captureHeight,
          style: {
            width: `${captureWidth}px`,
            height: `${captureHeight}px`,
            maxWidth: "none",
            maxHeight: "none",
            margin: "0",
            boxShadow: "none",
            transform: "none",
            transformOrigin: "top left",
          },
        });

        const blob = dataUrlToBlob(dataUrl);
        const fileName =
          targets.length > 1
            ? `billing-${customerCode}-${fromDate}-to-${toDate}-page-${i + 1}.png`
            : `billing-${customerCode}-${fromDate}-to-${toDate}.png`;

        captured.push({ dataUrl, blob, name: fileName });
      }

      const isIOS =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

      if (isIOS && navigator.share && navigator.canShare) {
        const files = captured.map((item) => new File([item.blob], item.name, { type: "image/png" }));
        if (navigator.canShare({ files })) {
          try {
            await navigator.share({
              files,
              title: "ใบวางบิล",
            });
            setIsOpen(false);
            return;
          } catch (error) {
            console.error("[WebShare:Billing]", error);
            if (error instanceof Error && error.name === "AbortError") return;
          }
        }
      }

      captured.forEach((item, index) => {
        setTimeout(() => {
          const link = document.createElement("a");
          link.href = item.dataUrl;
          link.download = item.name;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }, index * 600);
      });
    } catch (error) {
      console.error("Save image error:", error);
      setErrorMessage("ไม่สามารถบันทึกรูปภาพได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSaving(false);
    }
  };

  const today = new Date().toISOString().split("T")[0];
  const finalScale = scale * zoom;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          setZoom(1);
        }}
        className="inline-flex items-center gap-1.5 rounded-full bg-[#003366] px-4 py-2 text-xs font-black text-white transition hover:bg-[#002244] active:scale-95"
      >
        <FileText className="h-3.5 w-3.5" />
        ดูใบวางบิล
      </button>

      {mounted && isOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[500] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
              onClick={(event) => {
                if (event.target === event.currentTarget) setIsOpen(false);
              }}
            >
              <div
                className="relative w-full md:max-w-[900px] animate-in zoom-in-95 duration-300"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  onClick={() => setIsOpen(false)}
                  className="absolute -top-10 right-0 z-[510] flex items-center gap-2.5 py-2 text-white transition-opacity hover:opacity-80"
                >
                  <X className="h-5 w-5 md:h-6 md:w-6" strokeWidth={3} />
                  <span className="text-[14px] font-black tracking-tight md:text-[15px]">ปิดหน้าต่าง</span>
                </button>

                <div
                  className="scrollbar-hide flex max-h-[80vh] w-full flex-col items-center overflow-auto"
                  ref={containerRef}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                >
                  <div className="flex flex-col items-center gap-6 py-4">
                    <style dangerouslySetInnerHTML={{ __html: `
                      .billing-preview-card-element, .billing-preview-card-element * {
                        font-family: Tahoma, 'Sarabun', sans-serif !important;
                        color: #000000 !important;
                      }
                      .billing-preview-card-element .monospace-font {
                        font-family: monospace !important;
                      }
                    ` }} />
                    {pages.map((pageDeliveries, pageIdx) => {
                      const isLastPage = pageIdx === totalPages - 1;
                      return (
                        <div
                          key={`page-${pageIdx}`}
                          style={{
                            width: `${SHEET_WIDTH_MM * finalScale}mm`,
                            height: `${HALF_SHEET_HEIGHT_MM * finalScale}mm`,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              boxSizing: "border-box",
                              width: `${SHEET_WIDTH_MM}mm`,
                              height: `${HALF_SHEET_HEIGHT_MM}mm`,
                              padding: "6mm 8mm",
                              overflow: "hidden",
                              display: "flex",
                              flexDirection: "column",
                              background: "white",
                              transform: `scale(${finalScale})`,
                              transformOrigin: "top left",
                              boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
                            }}
                            className="billing-preview-card-element"
                          >
                            <PrintDocHeader
                              orgName={PRINT_ORGANIZATION_NAME}
                              orgAddress="-"
                              orgPhone="-"
                              title="ใบวางบิล"
                              docDate={today}
                              pageLabel={totalPages > 1 ? `หน้า ${pageIdx + 1}/${totalPages}` : undefined}
                              dividerStyle="none"
                              docMetaFontSize="11.8pt"
                              hideOrgDetails={true}
                            />

                            <PrintCustomerRow customer={{ code: customerCode, name: customerName, address: "-" }} />

                            <table
                              style={{
                                width: "100%",
                                tableLayout: "fixed",
                                borderCollapse: "collapse",
                                fontSize: "11.8pt",
                                marginBottom: "1mm",
                              }}
                            >
                              <thead>
                                <tr>
                                  <th
                                    style={{
                                      padding: "1mm 2mm",
                                      color: "black",
                                      borderTop: DOTTED_LINE,
                                      borderBottom: DOTTED_LINE,
                                      width: "6%",
                                      textAlign: "center",
                                    }}
                                  >
                                    ลำดับ
                                  </th>
                                  <th
                                    style={{
                                      padding: "1mm 2mm",
                                      color: "black",
                                      borderTop: DOTTED_LINE,
                                      borderBottom: DOTTED_LINE,
                                      width: "34%",
                                      textAlign: "center",
                                    }}
                                  >
                                    เลขที่ใบจัดส่ง
                                  </th>
                                  <th
                                    style={{
                                      padding: "1mm 2mm",
                                      color: "black",
                                      borderTop: DOTTED_LINE,
                                      borderBottom: DOTTED_LINE,
                                      width: "20%",
                                      textAlign: "center",
                                    }}
                                  >
                                    วันที่
                                  </th>
                                  <th
                                    style={{
                                      padding: "1mm 26mm 1mm 2mm",
                                      color: "black",
                                      borderTop: DOTTED_LINE,
                                      borderBottom: DOTTED_LINE,
                                      width: "40%",
                                      textAlign: "right",
                                    }}
                                  >
                                    ยอดรวม
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {pageDeliveries.map((item, index) => (
                                  <tr key={item.number}>
                                    <td style={{ padding: "0.8mm 2mm", textAlign: "center", color: "black" }}>
                                      {pageIdx * 10 + index + 1}
                                    </td>
                                    <td
                                      className="monospace-font"
                                      style={{
                                        padding: "0.8mm 2mm",
                                        textAlign: "center",
                                        fontFamily: "monospace",
                                        fontSize: "11.8pt",
                                        fontWeight: 700,
                                        color: "black",
                                      }}
                                    >
                                      {item.number}
                                    </td>
                                    <td style={{ padding: "0.8mm 2mm", textAlign: "center", color: "black" }}>
                                      <span style={{ display: "inline-block", minWidth: "20mm", textAlign: "left" }}>
                                        {formatDateShort(item.date)}
                                      </span>
                                    </td>
                                    <td
                                      style={{
                                        padding: "0.8mm 26mm 0.8mm 2mm",
                                        textAlign: "right",
                                        fontWeight: 700,
                                        color: "black",
                                      }}
                                    >
                                      {fmt(item.amount)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>

                            <div style={{ flex: 1 }} />

                            {isLastPage ? (
                              <PrintTotalRow totalAmount={totalAmount} dividerStyle="dotted" showBottomBorder={false} />
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 flex flex-col items-center gap-2">
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={saveAsImage}
                      disabled={isSaving}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#0051d5] px-6 py-2.5 text-sm font-bold text-white shadow-lg transition hover:bg-[#003d99] disabled:opacity-60"
                    >
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      {isSaving ? "กำลังบันทึก..." : totalPages > 1 ? "บันทึกรูปทั้งหมด" : "บันทึกรูป"}
                    </button>
                  </div>
                  <span className="text-xs text-white/60">สามารถใช้นิ้วซูมเข้า-ออกได้</span>
                </div>

                {errorMessage ? (
                  <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm font-semibold text-rose-700">
                    {errorMessage}
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
