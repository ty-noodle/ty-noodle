"use client";

import { useState } from "react";
import { LayoutList, Layers, FileText, X } from "lucide-react";
import { createPortal } from "react-dom";

type PrintPackingListCombinedButtonProps = {
  date: string;
  endDate?: string;
  label?: string;
};

export function PrintPackingListCombinedButton({
  date,
  endDate,
  label = "พิมพ์ใบจัดของ",
}: PrintPackingListCombinedButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loadingType, setLoadingType] = useState<"standard" | "transposed" | null>(null);

  const getUrl = (layout: "standard" | "transposed") => {
    return `/orders/packing-list?date=${date}${endDate ? `&endDate=${endDate}` : ""}${
      layout !== "standard" ? `&layout=${layout}` : ""
    }`;
  };

  const handlePrint = (layout: "standard" | "transposed") => {
    setLoadingType(layout);
    const url = getUrl(layout);
    window.location.assign(url);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#003366]/20 bg-white px-3 py-1.5 text-[13px] font-bold text-[#003366] shadow-sm transition hover:bg-[#003366]/5 hover:shadow-md active:scale-[0.98] md:gap-2 md:px-6 md:py-2.5 md:text-sm"
      >
        <LayoutList className="h-3.5 w-3.5 md:h-4.5 md:w-4.5" strokeWidth={2.5} />
        {label}
      </button>

      {/* Choice Dialog Modal */}
      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[600] flex items-center justify-center bg-black/45 backdrop-blur-sm animate-in fade-in duration-200"
              onClick={() => setIsOpen(false)}
            >
              <div
                className="relative w-full max-w-md bg-white rounded-[24px] shadow-2xl p-6 m-4 animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Title */}
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">เลือกรูปแบบใบจัดของ</h3>
                    <p className="text-xs font-semibold text-slate-400 mt-1">เลือกการจัดวางตารางพิมพ์เอกสารตามที่สะดวก</p>
                  </div>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="rounded-full bg-slate-100 p-1.5 text-slate-500 transition hover:bg-slate-200 active:scale-95"
                  >
                    <X className="h-4.5 w-4.5" strokeWidth={2.5} />
                  </button>
                </div>

                {/* Options List */}
                <div className="space-y-3.5">
                  {/* Option 1: Standard Table */}
                  <button
                    type="button"
                    onClick={() => handlePrint("standard")}
                    disabled={loadingType !== null}
                    className="flex w-full items-start gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 text-left transition-all hover:bg-slate-50 hover:border-[#003366]/20 active:scale-[0.99] disabled:opacity-50"
                  >
                    <div className="flex shrink-0 items-center justify-center rounded-xl bg-blue-50 p-3 text-[#003366]">
                      <FileText className="h-6 w-6" strokeWidth={2.2} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-black text-slate-900">ตารางมาตรฐาน (ดั้งเดิม)</span>
                        {loadingType === "standard" && (
                          <span className="text-[10px] bg-[#003366] text-white px-2 py-0.5 rounded-md font-bold animate-pulse">กำลังเปิด...</span>
                        )}
                      </div>
                      <p className="text-[11px] font-semibold text-slate-500 mt-0.5 leading-relaxed">
                        ตารางสินค้าแยกตามรายการออเดอร์แนวนอนทั่วไป เช็คง่ายสำหรับการจัดแยกชุดแบบเรียงตามร้าน
                      </p>
                    </div>
                  </button>

                  {/* Option 2: Transposed Table */}
                  <button
                    type="button"
                    onClick={() => handlePrint("transposed")}
                    disabled={loadingType !== null}
                    className="flex w-full items-start gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 text-left transition-all hover:bg-slate-50 hover:border-[#003366]/20 active:scale-[0.99] disabled:opacity-50"
                  >
                    <div className="flex shrink-0 items-center justify-center rounded-xl bg-violet-50 p-3 text-violet-600">
                      <Layers className="h-6 w-6" strokeWidth={2.2} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-black text-slate-900">ตารางสลับแนวแกน (สลับตาราง)</span>
                        {loadingType === "transposed" && (
                          <span className="text-[10px] bg-violet-600 text-white px-2 py-0.5 rounded-md font-bold animate-pulse">กำลังเปิด...</span>
                        )}
                      </div>
                      <p className="text-[11px] font-semibold text-slate-500 mt-0.5 leading-relaxed">
                        สลับมุมมองตารางเพื่อรวมร้านค้าไว้ฝั่งเดียวกัน ช่วยประหยัดพื้นที่กระดาษเมื่อร้านค้าจำนวนมาก
                      </p>
                    </div>
                  </button>
                </div>

                {/* Cancel Button */}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="mt-5 w-full rounded-2xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98]"
                >
                  ยกเลิก
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
