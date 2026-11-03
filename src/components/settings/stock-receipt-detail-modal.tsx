"use client";

import { X, Camera, Edit3 } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import type { StockReceiptDetail } from "@/lib/stock/admin";
import { fmtDateTimeTH, fmtDateTH } from "@/lib/utils/date";

type Props = {
  detail: StockReceiptDetail;
  onClose: () => void;
  onEdit: () => void;
};

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

export function StockReceiptDetailModal({ detail, onClose, onEdit }: Props) {
  const [showImage, setShowImage] = useState(false);

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/40 p-4 md:p-8 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[480px] lg:max-w-[900px] animate-in zoom-in-95 duration-300"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Universal Close Button - Positioned outside and above the content */}
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 flex items-center gap-2.5 text-white hover:opacity-80 transition-opacity z-[510] py-2"
        >
          <X className="h-5 w-5 md:h-6 md:w-6" strokeWidth={3} />
          <span className="text-[14px] md:text-[15px] font-black tracking-tight">ปิดหน้าต่าง</span>
        </button>

        {/* Content Wrapper with Scroll - This prevents clipping the close button */}
        <div className="max-h-[85vh] overflow-y-auto scrollbar-hide rounded-none">
          {/* MOBILE VIEW (Order Confirmation Style) */}
          <div className="block lg:hidden bg-white text-black shadow-2xl font-[family-name:var(--font-sukhumvit)]">
            <div className="px-6 py-6">
              <div className="flex justify-end mb-2">
                <Image src="/ty-noodles-logo.png" alt="T&Y Noodle" width={48} height={48} className="object-contain" />
              </div>

              <div className="text-center mb-4">
                <div className="text-[11px] leading-relaxed text-slate-500">T&Y Noodle - ใบรับสินค้าเข้า</div>
                <div className="text-[14px] font-[800] leading-tight mt-0.5">เลขที่ออเดอร์: {detail.receiptNumber}</div>
                <div className="text-[12px] leading-relaxed text-slate-500 mt-1">{fmtDateTimeTH(detail.receivedAt)}</div>
              </div>

              <div className="flex justify-center mb-6">
                 <button 
                   onClick={onEdit}
                   className="inline-flex items-center gap-2 px-6 py-2 rounded-full bg-slate-900 text-white text-[13px] font-black shadow-lg active:scale-95 transition-all"
                 >
                   <Edit3 className="h-4 w-4" />
                   แก้ไขรายการนี้
                 </button>
              </div>

              <div className="h-[2px] bg-black mb-4" />

              <div className="mb-3">
                <span className="font-[700] text-[12px]">ร้านค้า:</span>
                <span className="text-[12px]"> {detail.supplierName}</span>
              </div>

              <div className="grid grid-cols-[1fr_45px_40px_65px] gap-2 py-2 border-b border-[#cccccc]">
                <span className="text-[12px] font-[800] text-left">สินค้า</span>
                <span className="text-[12px] font-[800] text-center">จำนวน</span>
                <span className="text-[12px] font-[800] text-center">หน่วย</span>
                <span className="text-[12px] font-[800] text-right">รวม</span>
              </div>

              <div className="divide-y divide-[#cccccc]">
                {detail.items.map((item, index) => (
                  <div key={index} className="grid grid-cols-[1fr_45px_40px_65px] gap-2 py-3 items-center">
                    <div className="text-[11px] leading-[1.4] line-clamp-2">{item.productName}</div>
                    <div className="text-[12px] text-center font-medium">{formatQuantity(item.quantityReceived)}</div>
                    <div className="text-[12px] text-center text-slate-500">{item.unit}</div>
                    <div className="text-[12px] text-right font-bold">{formatCurrency(item.lineTotal)}</div>
                  </div>
                ))}
              </div>

              <div className="h-[1px] bg-[#cccccc] mt-4 mb-4" />

              <div className="flex items-center justify-between mb-6 px-1">
                 <span className="text-[13px] font-[800]">ยอดรวมทั้งหมด:</span>
                 <span className="text-[16px] font-[800] text-[#0051d5] underline decoration-double decoration-slate-300 underline-offset-4">
                    {formatCurrency(detail.totalAmount)}
                 </span>
              </div>

              {detail.receiptUrl && (
                <div className="mt-6 border-t border-dashed border-slate-300 pt-5 flex flex-col items-center">
                   <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2.5 flex items-center gap-2">
                      <Camera className="h-3 w-3" /> รูปภาพบิลต้นฉบับ
                   </div>
                   <div 
                      className="relative aspect-[3/4] w-[120px] overflow-hidden rounded-none border border-slate-200 cursor-pointer group"
                      onClick={() => setShowImage(true)}
                   >
                      <Image src={detail.receiptUrl} alt="Bill Photo" fill className="object-cover" unoptimized />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-100">
                         <span className="text-[10px] font-bold text-white bg-black/40 px-2 py-1 backdrop-blur-sm">แตะเพื่อดูบิล</span>
                      </div>
                   </div>
                </div>
              )}

              <div className="pt-8 pb-4 text-center">
                <div className="text-[12px] font-[800] leading-[1.6]">เส้นรังนก T&Y Noodle</div>
              </div>
            </div>
          </div>

          {/* DESKTOP VIEW (Stitch Bill Style) */}
          <div className="hidden lg:flex relative flex-col bg-white p-8 shadow-[0_10px_25px_rgba(0,0,0,0.1)] overflow-hidden aspect-[210/148] min-h-[600px]">
            {/* Watermark */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-45 whitespace-nowrap text-[60px] font-black uppercase text-black/[0.03] md:text-[80px]">
              STOCK SYSTEM
            </div>

            {/* Bill Header */}
            <div className="relative z-10 mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div className="flex gap-4">
                <div className="relative h-16 w-16 shrink-0">
                  <Image
                    src="/brand/512x512.png"
                    alt="T&Y Noodle Logo"
                    fill
                    className="object-contain"
                  />
                </div>
                <div>
                  <h1 className="text-[20px] font-black leading-tight text-black">T&Y NOODLES</h1>
                </div>
              </div>
                <div className="text-left sm:text-right">
                 <h2 className="text-[18px] font-black text-[#0051d5] md:text-[20px]">ใบรับสินค้าเข้า</h2>
                 <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#45464d]">Goods Receipt Voucher</p>
                 <button 
                   onClick={onEdit}
                   className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-lg border border-[#c6c6cd] hover:bg-slate-50 text-[11px] font-black transition-all active:scale-95"
                 >
                   <Edit3 className="h-3.5 w-3.5 text-slate-500" />
                   แก้ไขข้อมูล
                 </button>
              </div>
            </div>

            {/* Document Meta */}
            <div className="relative z-10 mb-4 grid grid-cols-1 gap-3 border-y border-[#c6c6cd] py-3 sm:grid-cols-2 sm:gap-6">
              <div className="space-y-1">
                <div className="flex justify-between items-baseline gap-2">
                  <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-[#45464d]">ผู้จำหน่าย / Supplier:</span>
                  <span className="text-[13px] font-black text-black text-right">{detail.supplierName}</span>
                </div>
                <div className="flex justify-between items-baseline gap-2 border-t border-dashed border-[#c6c6cd] pt-1">
                  <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-[#45464d]">ที่อยู่ / Address:</span>
                  <span className="text-[11px] font-medium text-right text-[#45464d] leading-snug">
                    {detail.supplierAddress || "-"}
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between items-baseline gap-2">
                  <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-[#45464d]">เลขที่เอกสาร / No:</span>
                  <span className="font-mono text-[13px] font-black text-black">
                    {detail.receiptNumber}
                  </span>
                </div>
                <div className="flex justify-between items-baseline gap-2 border-t border-dashed border-[#c6c6cd] pt-1">
                  <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-[#45464d]">วันที่รับเข้า / Date:</span>
                  <span className="text-[13px] font-medium text-black">{fmtDateTH(detail.receivedAt)}</span>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="relative z-10 flex-1 overflow-x-auto min-h-[300px]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#e6e8ea]">
                    <th className="w-10 border-r border-white px-2 py-1.5 text-center text-[10px] font-black uppercase tracking-wider text-[#45464d]">ลำดับ</th>
                    <th className="border-r border-white px-2 py-1.5 text-[10px] font-black uppercase tracking-wider text-[#45464d]">รหัสสินค้า / SKU</th>
                    <th className="border-r border-white px-2 py-1.5 text-[10px] font-black uppercase tracking-wider text-[#45464d]">รายการ / Description</th>
                    <th className="w-16 border-r border-white px-2 py-1.5 text-right text-[10px] font-black uppercase tracking-wider text-[#45464d]">จำนวน</th>
                    <th className="w-12 border-r border-white px-2 py-1.5 text-center text-[10px] font-black uppercase tracking-wider text-[#45464d]">หน่วย</th>
                    <th className="border-r border-white px-2 py-1.5 text-right text-[10px] font-black uppercase tracking-wider text-[#45464d]">หน่วยละ</th>
                    <th className="px-2 py-1.5 text-right text-[10px] font-black uppercase tracking-wider text-[#45464d]">จำนวนเงิน</th>
                  </tr>
                </thead>
                <tbody className="text-[13px] divide-y divide-[#c6c6cd]/50">
                  {detail.items.map((item, index) => (
                    <tr key={index}>
                      <td className="px-2 py-2 text-center text-[#45464d]">{index + 1}</td>
                      <td className="px-2 py-2 font-mono text-[11px] text-[#45464d]">{item.sku}</td>
                      <td className="px-2 py-2 font-bold text-black">{item.productName}</td>
                      <td className="px-2 py-2 text-right font-medium">{formatQuantity(item.quantityReceived)}</td>
                      <td className="px-2 py-2 text-center">{item.unit}</td>
                      <td className="px-2 py-2 text-right text-[#45464d]">{formatCurrency(item.unitCost)}</td>
                      <td className="px-2 py-2 text-right font-black text-black">{formatCurrency(item.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer Summary */}
            <div className="relative z-10 mt-6 flex justify-between items-end pr-4">
              <div className="flex-1 max-w-[400px]">
                {detail.notes && (
                  <div className="text-[11px] text-[#45464d] leading-relaxed italic">
                    <span className="font-black uppercase tracking-widest not-italic block mb-0.5">หมายเหตุ / Notes:</span>
                    {detail.notes}
                  </div>
                )}
                {detail.receiptUrl && (
                  <button 
                    onClick={() => setShowImage(true)}
                    className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-black hover:bg-slate-200 transition-all active:scale-95"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    ดูรูปภาพบิลต้นฉบับ
                  </button>
                )}
              </div>
              <div className="flex items-baseline gap-6">
                <span className="text-[16px] font-black text-black">รวมทั้งสิ้น / Total:</span>
                <div className="text-right">
                  <p className="text-[28px] font-black text-[#0051d5] leading-none mb-1">
                    {formatCurrency(detail.totalAmount)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Inner Image Modal */}
        {showImage && detail.receiptUrl && (
          <div 
            className="absolute inset-0 z-[600] bg-black/90 p-4 flex flex-col animate-in fade-in duration-300 md:rounded-[2rem]"
            onClick={() => setShowImage(false)}
          >
            <div className="flex justify-end p-2">
              <button className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center text-white">
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="flex-1 relative">
              <Image 
                src={detail.receiptUrl}
                alt="Receipt"
                fill
                className="object-contain"
                unoptimized
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
