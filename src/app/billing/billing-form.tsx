"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import type { BillingCustomer } from "@/lib/billing/billing-statement";

function todayISO() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
}

function daysAgoISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
}

export function BillingForm({ customers }: { customers: BillingCustomer[] }) {
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "all");
  const [fromDate, setFromDate] = useState(daysAgoISO(6));
  const [toDate, setToDate] = useState(todayISO());

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId || !fromDate || !toDate) return;

    const params = new URLSearchParams({
      from: fromDate,
      to: toDate,
      save: "true",
    });

    if (customerId === "all") {
      params.set("batch", "true");
    } else {
      params.set("customer", customerId);
    }

    window.open(`/billing/print?${params.toString()}`, "_blank");
  }

  const isAll = customerId === "all";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">

      {/* ร้านค้า */}
      <div className="flex flex-col gap-2">
        <label htmlFor="customer" className="text-base font-semibold text-slate-700">
          ร้านค้า
        </label>
        <select
          id="customer"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          required
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 shadow-sm focus:border-[#003366] focus:outline-none focus:ring-2 focus:ring-[#003366]/20"
        >
          <option value="all">ทุกร้านที่มีรายการในช่วงนี้</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* ช่วงวันที่ */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor="fromDate" className="text-base font-semibold text-slate-700">
            ตั้งแต่วันที่
          </label>
          <ThaiDatePicker
            id="fromDate"
            name="fromDate"
            value={fromDate}
            max={toDate}
            onChange={setFromDate}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="toDate" className="text-base font-semibold text-slate-700">
            ถึงวันที่
          </label>
          <ThaiDatePicker
            id="toDate"
            name="toDate"
            value={toDate}
            min={fromDate}
            onChange={setToDate}
          />
        </div>
      </div>

      {/* ปุ่ม */}
      <button
        type="submit"
        disabled={!customerId || !fromDate || !toDate}
        className="flex items-center justify-center gap-2.5 rounded-xl bg-[#003366] px-6 py-4 text-base font-bold text-white shadow-md shadow-[#003366]/20 hover:bg-[#002244] disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
      >
        <FileText className="h-5 w-5" strokeWidth={2.2} />
        {isAll ? "ดูและพิมพ์ใบวางบิลทุกร้าน" : "ดูและพิมพ์ใบวางบิล"}
      </button>

      <p className="text-center text-sm text-slate-400">
        จะเปิดหน้าพิมพ์ในแท็บใหม่ · แสดงเฉพาะใบส่งของที่ยืนยันแล้วในช่วงวันที่เลือก
      </p>
    </form>
  );
}
