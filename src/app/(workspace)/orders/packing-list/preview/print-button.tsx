"use client";

import { AlertTriangle, Download, Image as ImageIcon, Loader2, Printer, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type PreviewImage = {
  dataUrl: string;
  blob: Blob;
  name: string;
};

const FALLBACK_CAPTURE_WIDTH = 1123;
const FALLBACK_CAPTURE_HEIGHT = 794;

let cachedFontEmbedCSS: string | null = null;

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

function createFileName(base: string, page: number) {
  const safe = base.replace(/[^\w\u0E00-\u0E7F-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `${safe || "packing-list"}-หน้า${page}.png`;
}

export function PackingListPrintButton({
  unassignedStores = [],
  dateLabel = "",
  hidePrintOnMobile = false,
  hideSaveOnDesktop = false,
  documentTitle = "ใบจัดของ",
  printButtonText = "พิมพ์ใบจัดของ",
}: {
  unassignedStores?: string[];
  dateLabel?: string;
  hidePrintOnMobile?: boolean;
  hideSaveOnDesktop?: boolean;
  documentTitle?: string;
  printButtonText?: string;
}) {
  const [isPrinting, setIsPrinting] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewImages, setPreviewImages] = useState<PreviewImage[]>([]);
  const fallbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // Preload web fonts in the background to make PDF/image generation instant
    if (typeof window !== "undefined" && !cachedFontEmbedCSS) {
      const preloadFonts = async () => {
        try {
          await document.fonts.ready;
          const htmlToImage = await import("html-to-image");
          const css = await htmlToImage.getFontEmbedCSS(document.body);
          cachedFontEmbedCSS = css;
          console.log("[FontPreloader:PrintButton] Web fonts pre-loaded and cached successfully.");
        } catch (e) {
          console.warn("[FontPreloader:PrintButton] Failed to background-preload fonts:", e);
        }
      };
      const timer = setTimeout(preloadFonts, 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (!showPreview) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showPreview]);

  function confirmUnassigned(actionLabel: string) {
    if (unassignedStores.length === 0) return true;

    const storeList = unassignedStores.map((store) => `• ${store}`).join("\n");
    return window.confirm(
      `ร้านค้าต่อไปนี้ยังไม่ได้ผูกรถ (${unassignedStores.length} ร้าน)\n\n${storeList}\n\nต้องการ${actionLabel}ต่อหรือไม่?`,
    );
  }

  function finishPrintState() {
    if (fallbackTimerRef.current) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }

    setIsPrinting(false);
  }

  function handlePrintFromPreview() {
    if (isPrinting || isCapturing) return;

    setShowPreview(false);
    setIsPrinting(true);

    const done = () => {
      finishPrintState();
      window.removeEventListener("afterprint", done);
    };

    window.addEventListener("afterprint", done, { once: true });
    fallbackTimerRef.current = window.setTimeout(done, 1500);

    window.setTimeout(() => {
      window.print();
    }, 180);
  }

  async function handleOpenPreview(mode: "print" | "save") {
    if (isPrinting || isCapturing) return;

    const actionLabel = mode === "print" ? "เปิดตัวอย่างก่อนพิมพ์" : "บันทึกรูป";
    if (!confirmUnassigned(actionLabel)) return;

    setIsCapturing(true);
    setErrorMessage(null);
    setShowPreview(true);
    setPreviewImages([]);

    try {
      const htmlToImage = await import("html-to-image");
      const targets = Array.from(document.querySelectorAll<HTMLElement>(".packing-sheet"));

      if (targets.length === 0) {
        throw new Error("ไม่พบหน้าสำหรับสร้างตัวอย่างเอกสาร");
      }

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
          console.warn("Failed to embed fonts, continue without embedded fonts:", error);
        }
      }

      const captured: PreviewImage[] = [];

      for (let i = 0; i < targets.length; i += 1) {
        const target = targets[i];
        const datasetWidth = Number(target.dataset.captureWidth ?? "");
        const datasetHeight = Number(target.dataset.captureHeight ?? "");
        const captureWidth = datasetWidth || target.offsetWidth || FALLBACK_CAPTURE_WIDTH;
        const captureHeight = datasetHeight || target.offsetHeight || FALLBACK_CAPTURE_HEIGHT;

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
            display: "block",
            transform: "none",
            transformOrigin: "top left",
          },
        });

        captured.push({
          dataUrl,
          blob: dataUrlToBlob(dataUrl),
          name: createFileName(`${documentTitle}-${dateLabel || "export"}`, i + 1),
        });

        setPreviewImages([...captured]);
      }
    } catch (error) {
      console.error("Document image capture failed:", error);
      setErrorMessage(error instanceof Error ? error.message : "สร้างตัวอย่างเอกสารไม่สำเร็จ");
      setShowPreview(false);
    } finally {
      setIsCapturing(false);
    }
  }

  async function downloadAll() {
    if (previewImages.length === 0) return;

    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const files = previewImages.map((image) => new File([image.blob], image.name, { type: "image/png" }));

    if (isIOS && navigator.share && navigator.canShare && navigator.canShare({ files })) {
      try {
        await navigator.share({
          files,
          title: documentTitle,
        });
        setShowPreview(false);
        return;
      } catch (error) {
        console.error("[WebShare:PackingList]", error);
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
      }
    }

    previewImages.forEach((image, index) => {
      window.setTimeout(() => {
        const link = document.createElement("a");
        link.href = image.dataUrl;
        link.download = image.name;
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }, index * 600);
    });

    setShowPreview(false);
  }

  return (
    <div className="flex items-center gap-2">
      {errorMessage ? (
        <span className="mr-2 flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-500">
          <AlertTriangle className="h-3.5 w-3.5" />
          {errorMessage}
        </span>
      ) : null}

      <button
        type="button"
        onClick={() => handleOpenPreview("print")}
        disabled={isPrinting || isCapturing}
        className={`${hidePrintOnMobile ? "hidden md:flex" : "flex"} items-center gap-1.5 rounded-lg bg-[#1e3a5f] px-3.5 py-1.5 text-[13px] font-bold text-white shadow-sm transition hover:bg-[#152943] disabled:cursor-not-allowed disabled:opacity-70`}
        style={{ fontFamily: 'var(--font-sukhumvit), "Sukhumvit Set", "Noto Sans Thai", sans-serif' }}
      >
        {isCapturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
        {isCapturing ? "กำลังสร้างตัวอย่าง..." : printButtonText}
      </button>

      <button
        type="button"
        onClick={() => handleOpenPreview("save")}
        disabled={isPrinting || isCapturing}
        className={`${hideSaveOnDesktop ? "flex md:hidden" : "flex"} items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-[13px] font-bold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70`}
        style={{ fontFamily: 'var(--font-sukhumvit), "Sukhumvit Set", "Noto Sans Thai", sans-serif' }}
      >
        {isCapturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {isCapturing ? "กำลังสร้างภาพ..." : "บันทึกรูป"}
      </button>

      {showPreview &&
        createPortal(
          <div className="fixed inset-0 z-[500] flex flex-col bg-[#0a0c10] animate-in fade-in duration-300">
            <div className="sticky top-0 z-50 flex shrink-0 items-center justify-between border-b border-white/5 bg-[#12151c]/85 px-4 py-3 backdrop-blur-xl sm:px-8 sm:py-5">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#003366] text-white shadow-[0_0_20px_rgba(0,51,102,0.4)] sm:h-12 sm:w-12">
                  <ImageIcon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.5} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-black tracking-tight text-white sm:text-xl">{`ตัวอย่าง${documentTitle}`}</h3>
                  <p className="truncate text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 sm:text-xs">
                    {isCapturing ? `กำลังประมวลผล (${previewImages.length} หน้า)...` : `${previewImages.length} หน้า พร้อมพิมพ์หรือบันทึกรูป`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-4">
                {!isCapturing && previewImages.length > 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={handlePrintFromPreview}
                      className="hidden items-center gap-2.5 rounded-xl bg-[#1e3a5f] px-5 py-2.5 text-sm font-black text-white shadow-[0_8px_20px_rgba(30,58,95,0.3)] transition hover:bg-[#152943] active:scale-95 sm:flex"
                    >
                      <Printer className="h-4.5 w-4.5" strokeWidth={3} />
                      พิมพ์
                    </button>
                    <button
                      type="button"
                      onClick={downloadAll}
                      className={`${hideSaveOnDesktop ? "hidden" : "hidden items-center gap-2.5 rounded-xl bg-white px-5 py-2.5 text-sm font-black text-[#0a0c10] shadow-[0_8px_20px_rgba(255,255,255,0.15)] transition hover:bg-slate-100 active:scale-95 sm:flex"}`}
                    >
                      <Download className="h-4.5 w-4.5" strokeWidth={3} />
                      บันทึกทั้งหมด
                    </button>
                  </>
                ) : null}

                <button
                  type="button"
                  onClick={() => setShowPreview(false)}
                  className="group flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-white/50 transition hover:bg-rose-500/10 hover:text-rose-500 active:scale-95 sm:h-12 sm:w-12"
                >
                  <X className="h-6 w-6 transition group-hover:rotate-90" strokeWidth={2.5} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_center,rgba(0,51,102,0.05)_0%,transparent_70%)] p-4 sm:p-12">
              <div className="mx-auto flex w-full max-w-[960px] flex-col items-center gap-10 sm:gap-20">
                {isCapturing && previewImages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-8 py-20 text-slate-500">
                    <div className="relative">
                      <div className="h-28 w-24 rounded-2xl border-2 border-dashed border-slate-800 animate-[pulse_2s_infinite]" />
                      <Loader2 className="absolute inset-0 m-auto h-10 w-10 animate-spin text-[#003366]" strokeWidth={3} />
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-black text-white">{`กำลังสร้างไฟล์ภาพ${documentTitle}`}</p>
                      <p className="mt-2 text-sm font-bold text-slate-500">ระบบกำลังแปลงแต่ละหน้าให้พร้อมพิมพ์หรือบันทึกรูป</p>
                    </div>
                  </div>
                ) : null}

                {previewImages.map((image, index) => (
                  <div key={image.name} className="group relative flex w-full flex-col items-center">
                    <div className="mb-4 flex items-center gap-3 self-start sm:absolute sm:-left-20 sm:mb-0 sm:flex-col sm:self-auto">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1a1f26] text-sm font-black text-white ring-1 ring-white/10 shadow-2xl transition group-hover:bg-[#003366] group-hover:ring-[#003366]/50">
                        {index + 1}
                      </span>
                      <div className="h-px w-8 bg-white/10 sm:h-12 sm:w-px" />
                    </div>

                    <div className="relative w-full overflow-hidden rounded-sm bg-white shadow-[0_40px_100px_rgba(0,0,0,0.6)] ring-1 ring-white/5 transition duration-500 group-hover:scale-[1.02] group-hover:shadow-[0_50px_120px_rgba(0,0,0,0.8)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image.dataUrl} alt={`${documentTitle} หน้า ${index + 1}`} className="block h-auto w-full bg-white" />
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent opacity-0 transition-opacity duration-700 group-hover:opacity-100" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {!isCapturing && previewImages.length > 0 ? (
              <div className="border-t border-white/5 bg-[#12151c]/90 p-4 pb-safe-offset-4 backdrop-blur-xl sm:hidden">
                <button
                  type="button"
                  onClick={downloadAll}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-600 py-4 text-lg font-black text-white shadow-[0_15px_30px_rgba(255,255,255,0.1)] transition active:scale-95"
                >
                  <Download className="h-6 w-6 text-white" strokeWidth={3} />
                  บันทึกรูป
                </button>
              </div>
            ) : null}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function AutoPrint() {
  return null;
}
