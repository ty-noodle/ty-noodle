"use client";

import { useState } from "react";
import { FileText, X, Calendar, Receipt, ChevronRight, History } from "lucide-react";
import type { BillingRecord } from "@/lib/billing/billing-statement";
import { fmtDateTH } from "@/lib/utils/date";
import { fmt } from "@/components/print/print-shared";
import { ReprintButton } from "./reprint-button";

type Props = {
  history: BillingRecord[];
};

export function HistoryTable({ history }: Props) {
  const [selectedRecord, setSelectedRecord] = useState<BillingRecord | null>(null);

  const closeModal = () => setSelectedRecord(null);

  function buildReprintUrl(record: BillingRecord) {
    const params = new URLSearchParams({
      customers: record.customer_id,
      from: record.from_date,
      to: record.to_date,
      save: "false",
    });

    const deliveries = record.snapshot_rows
      .map((row) => row.deliveryNumber)
      .filter(Boolean)
      .join(",");

    if (deliveries) {
      params.set("deliveries", deliveries);
    }

    return `/billing/print?${params.toString()}`;
  }

  return (
    <>
      {/* Desktop View */}
      <div className="hidden md:block overflow-hidden border border-slate-200 bg-white shadow-md">
        <table className="w-full border-collapse text-left">
          <thead className="bg-[#003366]">
            <tr>
              <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-white border-r border-white/10">เลขที่ใบวางบิล</th>
              <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-white border-r border-white/10">ร้านค้า</th>
              <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-white border-r border-white/10">วันที่วางบิล</th>
              <th className="px-6 py-3 text-right text-[11px] font-black uppercase tracking-widest text-white border-r border-white/10">ยอดรวม</th>
              <th className="px-6 py-3 text-center text-[11px] font-black uppercase tracking-widest text-white">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {history.map((record) => (
              <tr 
                key={record.id} 
                onClick={() => setSelectedRecord(record)}
                className="group cursor-pointer hover:bg-slate-50 transition-colors"
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center bg-slate-50 text-[#003366] transition-colors group-hover:bg-[#003366] group-hover:text-white">
                      <FileText className="h-5 w-5" />
                    </div>
                    <span className="font-mono text-base font-black text-[#003366]">{record.billing_number}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-black text-slate-900">{record.customer_name}</span>
                    <span className="font-mono text-[11px] font-bold text-slate-400 uppercase tracking-tight">{record.customer_code}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                    <Calendar className="h-4 w-4 text-slate-300" />
                    {fmtDateTH(record.billing_date)}
                  </div>
                  <div className="mt-1 text-[10px] font-bold text-slate-400">
                    ช่วงวันที่: {fmtDateTH(record.from_date)} - {fmtDateTH(record.to_date)}
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex flex-col items-end">
                    <p className="font-mono text-xl font-black text-slate-900">{fmt(record.total_amount)}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">บาท</p>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-center gap-2">
                    <div onClick={(e) => e.stopPropagation()}>
                      <ReprintButton 
                        url={buildReprintUrl(record)} 
                        title="พิมพ์ใบวางบิลนี้อีกครั้ง"
                      />
                    </div>
                    <ChevronRight className="h-5 w-5 text-slate-300 transition-transform group-hover:translate-x-1" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile View */}
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {history.map((record) => (
          <button
            key={record.id}
            onClick={() => setSelectedRecord(record)}
            className="flex flex-col overflow-hidden border border-slate-200 bg-white text-left transition-all active:scale-[0.98]"
          >
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#003366]" />
                <span className="font-mono text-sm font-black text-[#003366]">{record.billing_number}</span>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-300" />
            </div>
            <div className="p-4">
              <div className="mb-4">
                <h4 className="text-[15px] font-black text-slate-900">{record.customer_name}</h4>
                <p className="font-mono text-xs font-bold text-slate-400">{record.customer_code}</p>
              </div>
              <div className="flex items-end justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                    <Calendar className="h-3.5 w-3.5" />
                    {fmtDateTH(record.billing_date)}
                  </div>
                  <p className="text-[10px] font-bold text-slate-400">
                    {fmtDateTH(record.from_date)} - {fmtDateTH(record.to_date)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">ยอดรวม</p>
                  <p className="font-mono text-xl font-black text-slate-900">{fmt(record.total_amount)}</p>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Details Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={closeModal} />
          
          <div className="relative w-full max-w-3xl max-h-[90vh] overflow-hidden bg-white shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between bg-[#003366] p-4 text-white sm:px-8 sm:py-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center bg-white/10">
                  <Receipt className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black tracking-tight leading-tight text-white">รายละเอียดใบวางบิล</h3>
                  <p className="font-mono text-sm opacity-60 text-white">{selectedRecord.billing_number}</p>
                </div>
              </div>
              <button 
                onClick={closeModal}
                className="flex h-10 w-10 items-center justify-center bg-white/10 transition-colors hover:bg-white/20"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="overflow-y-auto p-4 sm:p-8 flex-1">
              <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-6 border-b border-slate-100 pb-8">
                <div className="space-y-1">
                  <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">ชื่อร้านค้า / ลูกค้า</span>
                  <h4 className="text-2xl font-black text-slate-900">{selectedRecord.customer_name}</h4>
                  <p className="font-mono text-base font-bold text-slate-400">{selectedRecord.customer_code}</p>
                </div>
                <div className="flex items-center gap-3">
                   <ReprintButton 
                    url={buildReprintUrl(selectedRecord)} 
                    title="พิมพ์ใบวางบิลนี้อีกครั้ง"
                   />
                   <div className="bg-slate-50 px-6 py-3 text-right border border-slate-100">
                     <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">ยอดรวมทั้งสิ้น</p>
                     <p className="font-mono text-2xl font-black text-[#003366]">{fmt(selectedRecord.total_amount)} <span className="text-sm">บาท</span></p>
                   </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-1 bg-[#003366]" />
                  <h5 className="text-[13px] font-black uppercase tracking-widest text-slate-800">รายการใบจัดส่งที่รวมในใบนี้</h5>
                </div>
                
                {/* Responsive List/Table for Snapshot Rows */}
                <div className="overflow-hidden border border-slate-200">
                  {/* Desktop Table */}
                  <table className="hidden sm:table w-full border-collapse text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">ลำดับ</th>
                        <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">เลขใบจัดส่ง</th>
                        <th className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">วันที่</th>
                        <th className="px-4 py-2 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">จำนวนเงิน</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedRecord.snapshot_rows.map((row) => (
                        <tr key={row.deliveryNumber} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-2 font-mono text-xs text-slate-400">{row.lineNumber}</td>
                          <td className="px-4 py-2 font-mono font-bold text-[#003366]">{row.deliveryNumber}</td>
                          <td className="px-4 py-2 text-xs font-bold text-slate-600">{fmtDateTH(row.deliveryDate)}</td>
                          <td className="px-4 py-2 text-right font-mono font-black text-slate-900">{fmt(row.totalAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Mobile Simple List */}
                  <div className="sm:hidden divide-y divide-slate-100">
                    {selectedRecord.snapshot_rows.map((row) => (
                      <div key={row.deliveryNumber} className="flex items-center justify-between p-4">
                        <div className="flex flex-col">
                          <span className="font-mono text-sm font-bold text-[#003366]">{row.deliveryNumber}</span>
                          <span className="text-[10px] font-bold text-slate-400">{fmtDateTH(row.deliveryDate)}</span>
                        </div>
                        <span className="font-mono font-black text-slate-900">{fmt(row.totalAmount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="mt-8 bg-slate-50 p-6 flex items-start gap-4 border border-slate-100">
                <History className="h-6 w-6 text-slate-300 shrink-0 mt-1" />
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-1">ช่วงเวลาที่สรุปยอด</p>
                  <p className="text-sm font-bold text-slate-700 leading-relaxed">
                    ใบวางบิลฉบับนี้สรุปรายการตั้งแต่วันที่ <span className="text-[#003366]">{fmtDateTH(selectedRecord.from_date)}</span> ถึง <span className="text-[#003366]">{fmtDateTH(selectedRecord.to_date)}</span>
                  </p>
                </div>
              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="bg-slate-50 p-4 sm:px-8 flex justify-end border-t border-slate-100">
              <button
                onClick={closeModal}
                className="px-8 py-3 bg-white border border-slate-200 text-sm font-black text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 active:scale-95"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
