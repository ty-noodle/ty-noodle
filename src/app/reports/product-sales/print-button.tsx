"use client";

import { Printer, Image as ImageIcon, X, Loader2, Download } from "lucide-react";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";

type PreviewImage = {
  dataUrl: string;
  blob: Blob;
  name: string;
};

let cachedFontEmbedCSS: string | null = null;

export function PrintButton({
  targetId = "report-print-area",
  fileName = "report",
  hidePrintOnMobile = false,
}: {
  targetId?: string;
  fileName?: string;
  hidePrintOnMobile?: boolean;
}) {
  const [isPrinting, setIsPrinting] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewImages, setPreviewImages] = useState<PreviewImage[]>([]);
  const fallbackTimerRef = useRef<number | null>(null);

  function handlePrint() {
    if (isPrinting || isCapturing) return;

    setIsPrinting(true);
    const done = () => {
      if (fallbackTimerRef.current) {
        window.clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      setIsPrinting(false);
      window.removeEventListener("afterprint", done);
    };

    window.addEventListener("afterprint", done, { once: true });
    fallbackTimerRef.current = window.setTimeout(done, 1000);
    window.print();
  }

  // Helper to convert dataURL to Blob consistently
  function dataURLToBlob(dataURL: string): Blob {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  async function handleStartCapture() {
    if (isPrinting || isCapturing) return;

    const targetElement = document.getElementById(targetId);
    if (!targetElement) {
      alert("ไม่พบพื้นที่สำหรับบันทึกรูปภาพ");
      return;
    }

    setIsCapturing(true);
    setShowPreview(true);
    setPreviewImages([]);

    try {
      const htmlToImage = await import("html-to-image");
      // Find original pages
      const originalPages = targetElement.querySelectorAll('[data-print-page="true"]');
      const pageCount = originalPages.length > 0 ? originalPages.length : 1;

      // Standard A4 dimensions
      const CAPTURE_WIDTH_PX = 794; 
      const CAPTURE_HEIGHT_PX = 1123;
      
      const captured: PreviewImage[] = [];

      // Pre-embed fonts once for the whole session
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

      for (let i = 0; i < pageCount; i++) {
        // Create an ISOLATED container
        const tempContainer = document.createElement("div");
        tempContainer.style.position = "fixed";
        tempContainer.style.left = "-10000px";
        tempContainer.style.top = "0";
        tempContainer.style.width = `${CAPTURE_WIDTH_PX}px`;
        tempContainer.style.backgroundColor = "#ffffff";
        tempContainer.style.zIndex = "-1000";
        document.body.appendChild(tempContainer);

        // CLONE the target element
        const fullClone = targetElement.cloneNode(true) as HTMLElement;
        fullClone.style.display = "block";
        fullClone.style.visibility = "visible";
        fullClone.style.opacity = "1";
        
        tempContainer.appendChild(fullClone);

        // Filter pages in the clone
        const clonedPages = fullClone.querySelectorAll('[data-print-page="true"]');
        let targetNode: HTMLElement;

        if (clonedPages.length > 0) {
          clonedPages.forEach((p, idx) => {
            if (idx === i) {
              const originalPage = originalPages[idx] as HTMLElement | undefined;
              const originalDisplay =
                originalPage != null ? window.getComputedStyle(originalPage).display : "block";
              (p as HTMLElement).style.display =
                originalDisplay && originalDisplay !== "none" ? originalDisplay : "block";
              (p as HTMLElement).style.visibility = "visible";
              (p as HTMLElement).style.opacity = "1";
              targetNode = p as HTMLElement;
            } else {
              (p as HTMLElement).style.display = "none";
            }
          });
          targetNode = clonedPages[i] as HTMLElement;
        } else {
          targetNode = fullClone;
        }

        // Apply strict styles
        targetNode.style.width = `${CAPTURE_WIDTH_PX}px`;
        targetNode.style.height = `${CAPTURE_HEIGHT_PX}px`;
        targetNode.style.minHeight = `${CAPTURE_HEIGHT_PX}px`;
        targetNode.style.fontFamily = '"SukhumvitSet-SemiBold", var(--font-sukhumvit), sans-serif';
        targetNode.classList.add("capturing");

        // Give Safari significant time to layout this specific page
        await new Promise(r => setTimeout(r, 1000));

        const options = {
          quality: 1,
          backgroundColor: "#ffffff",
          pixelRatio: 2,
          fontEmbedCSS,
          width: CAPTURE_WIDTH_PX,
          height: CAPTURE_HEIGHT_PX,
          cacheBust: true,
        };

        // Capture sequentially to prevent race conditions in html-to-image internal canvas
        const dataUrl = await htmlToImage.toPng(targetNode, options);
        const blob = dataURLToBlob(dataUrl);

        const timestamp = new Date().getTime();
        captured.push({
          dataUrl,
          blob,
          name: `${fileName}_หน้า${i + 1}_${timestamp}.png`
        });

        // Update progress
        setPreviewImages([...captured]);
        
        // Cleanup
        document.body.removeChild(tempContainer);
        
        // Brief rest for browser main thread
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (error) {
      console.error("Capture error:", error);
      alert("เกิดข้อผิดพลาดในการบันทึกรูปภาพ กรุณาลองใหม่อีกครั้ง");
      setShowPreview(false);
    } finally {
      setIsCapturing(false);
    }
  }

  async function downloadAll() {
    if (previewImages.length === 0) return;

    // Check if iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    const files = previewImages.map(img => new File([img.blob], img.name, { type: "image/png" }));

    if (isIOS && navigator.share && navigator.canShare && navigator.canShare({ files })) {
      try {
        await navigator.share({
          files: files,
          title: "รายงาน",
        });
        setShowPreview(false);
        return;
      } catch (err) {
        console.error("[WebShare:Reports]", err);
        if (err instanceof Error && err.name === "AbortError") {
          return; // Stay on the page if cancelled!
        }
        // Fallback to normal download if failed
      }
    }

    // Fallback or non-iOS behavior
    previewImages.forEach((img, idx) => {
      setTimeout(() => {
        const link = document.createElement("a");
        link.href = img.dataUrl;
        link.download = img.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }, idx * 600);
    });

    setShowPreview(false);
  }

  return (
    <div className="flex items-center gap-2 print:hidden">
      <button
        type="button"
        onClick={handleStartCapture}
        disabled={isPrinting || isCapturing}
        className="flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-slate-600 transition hover:bg-slate-50 hover:border-slate-300 active:scale-95 disabled:opacity-50"
        title="บันทึกเป็นรูปภาพ"
      >
        <ImageIcon className="h-4.5 w-4.5 shrink-0" strokeWidth={2} />
        <span className="hidden text-sm font-bold sm:inline">บันทึกรูป</span>
      </button>

      <button
        type="button"
        onClick={handlePrint}
        disabled={isPrinting || isCapturing}
        className={`${hidePrintOnMobile ? "hidden md:flex" : "flex"} h-10 items-center justify-center gap-2 rounded-xl bg-[#003366] px-3 text-white transition hover:bg-[#002244] active:scale-95 disabled:opacity-50`}
        aria-label="พิมพ์รายงาน"
      >
        <Printer className="h-4.5 w-4.5 shrink-0" strokeWidth={2} />
        <span className="hidden text-sm font-bold sm:inline">
          {isPrinting ? "กำลังพิมพ์..." : "พิมพ์"}
        </span>
      </button>

      {showPreview && createPortal(
        <div className="fixed inset-0 z-[500] flex flex-col bg-[#0a0c10] animate-in fade-in duration-300">
          {/* ─── Premium Glassmorphism Header ─── */}
          <div className="sticky top-0 z-50 flex shrink-0 items-center justify-between border-b border-white/5 bg-[#12151c]/80 px-4 py-3 backdrop-blur-xl sm:px-8 sm:py-5">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#003366] text-white shadow-[0_0_20px_rgba(0,51,102,0.4)] sm:h-12 sm:w-12">
                <ImageIcon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.5} />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-black tracking-tight text-white sm:text-xl">ตัวอย่างรายงานดิจิทัล</h3>
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <p className="truncate text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 sm:text-xs">
                    {isCapturing ? `กำลังประมวลผล (${previewImages.length} หน้า)...` : `พร้อมบันทึก ${previewImages.length} หน้า (มาตรฐาน A4)`}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-4">
              {!isCapturing && previewImages.length > 0 && (
                <button
                  onClick={downloadAll}
                  className="hidden items-center gap-2.5 rounded-xl bg-white px-5 py-2.5 text-sm font-black text-[#0a0c10] shadow-[0_8px_20px_rgba(255,255,255,0.15)] transition hover:bg-slate-100 active:scale-95 sm:flex"
                >
                  <Download className="h-4.5 w-4.5" strokeWidth={3} />
                  บันทึกทั้งหมด
                </button>
              )}
              <button
                onClick={() => setShowPreview(false)}
                className="group flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-white/50 transition hover:bg-rose-500/10 hover:text-rose-500 active:scale-95 sm:h-12 sm:w-12"
              >
                <X className="h-6 w-6 transition group-hover:rotate-90" strokeWidth={2.5} />
              </button>
            </div>
          </div>

          {/* ─── Scrollable Preview Body ─── */}
          <div className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_center,rgba(0,51,102,0.05)_0%,transparent_70%)] p-6 sm:p-12">
            <div className="mx-auto flex flex-col items-center gap-12 sm:gap-20">
              {isCapturing && previewImages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-8">
                  <div className="relative">
                    <div className="h-28 w-24 rounded-2xl border-2 border-dashed border-slate-800 animate-[pulse_2s_infinite]" />
                    <Loader2 className="absolute inset-0 m-auto h-10 w-10 animate-spin text-[#003366]" strokeWidth={3} />
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-black text-white">กำลังสร้างไฟล์รายงานคุณภาพสูง</p>
                    <p className="mt-2 text-sm font-bold text-slate-500">ระบบกำลังจัดเรียงข้อมูลให้พอดีกับขนาด A4...</p>
                  </div>
                </div>
              )}

              {previewImages.map((img, idx) => (
                <div key={idx} className="group relative flex flex-col items-center">
                  {/* Page Indicator Tag */}
                  <div className="mb-4 flex items-center gap-3 self-start sm:absolute sm:-left-20 sm:mb-0 sm:flex-col sm:self-auto">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1a1f26] text-sm font-black text-white ring-1 ring-white/10 shadow-2xl transition group-hover:bg-[#003366] group-hover:ring-[#003366]/50">
                      {idx + 1}
                    </span>
                    <div className="h-px w-8 bg-white/10 sm:h-12 sm:w-px" />
                  </div>

                  {/* Document Container */}
                  <div className="relative overflow-hidden rounded-sm bg-white shadow-[0_40px_100px_rgba(0,0,0,0.6)] ring-1 ring-white/5 transition duration-500 group-hover:scale-[1.02] group-hover:shadow-[0_50px_120px_rgba(0,0,0,0.8)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.dataUrl} alt={`Page ${idx + 1}`} className="h-auto w-full max-w-[210mm] bg-white sm:w-[800px]" />
                    
                    {/* Glossy Overlay effect */}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent opacity-0 transition-opacity duration-700 group-hover:opacity-100" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ─── Modern Mobile Navigation ─── */}
          {!isCapturing && previewImages.length > 0 && (
            <div className="border-t border-white/5 bg-[#12151c]/90 p-4 pb-safe-offset-4 backdrop-blur-xl sm:hidden">
              <button
                onClick={downloadAll}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-600 py-4 text-lg font-black text-white shadow-[0_15px_30px_rgba(255,255,255,0.1)] active:scale-95 transition"
              >
                <Download className="h-6 w-6 text-white" strokeWidth={3} />
                บันทึกลงเครื่อง
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
