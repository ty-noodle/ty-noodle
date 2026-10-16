"use client";

import { useState } from "react";
import { Receipt, History, Search, Loader2 } from "lucide-react";
import type { BillingCandidate, BillingRecord } from "@/lib/billing/billing-statement";
import { getBillingHistoryAction } from "@/lib/billing/actions";
import { BillingForm } from "./billing-form";
import { HistorySearchForm } from "./history-search-form";
import { HistoryTable } from "./history-table";
import { fmt } from "@/components/print/print-shared";

type Props = {
  candidates: BillingCandidate[];
  allCustomers: { id: string; name: string; customer_code: string }[];
  initialFrom: string;
  initialTo: string;
};

function fmtBaht(amount: number) {
  return `${fmt(amount)} บาท`;
}

function EmptyHistory() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-slate-50 text-slate-200">
        <History className="h-10 w-10" />
      </div>
      <h3 className="text-xl font-black text-slate-800">ไม่พบประวัติการวางบิล</h3>
      <p className="mt-2 text-sm font-medium text-slate-500">
        เลือกวันที่และร้านค้าเพื่อค้นหาประวัติการวางบิล
      </p>
    </div>
  );
}

export function BillingDashboardClient({
  candidates,
  allCustomers,
  initialFrom,
  initialTo,
}: Props) {
  const [currentTab, setCurrentTab] = useState<"create" | "history">("create");
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [history, setHistory] = useState<BillingRecord[]>([]);

  // Filter states to keep form selections populated
  const [hFrom, setHFrom] = useState("");
  const [hTo, setHTo] = useState("");
  const [hQ, setHQ] = useState("");
  const [hCustomers, setHCustomers] = useState<string[]>([]);

  const totalBilled = history.reduce((sum: number, record: BillingRecord) => sum + record.total_amount, 0);

  async function handleHistorySearch(filters: {
    from: string;
    to: string;
    query: string;
    customerIds: string[];
  }) {
    setHFrom(filters.from);
    setHTo(filters.to);
    setHQ(filters.query);
    setHCustomers(filters.customerIds);

    setIsLoadingHistory(true);
    setIsSearching(true);

    try {
      const result = await getBillingHistoryAction({
        from: filters.from,
        to: filters.to,
        query: filters.query,
        customerIds: filters.customerIds,
      });

      if (result.success && result.history) {
        setHistory(result.history);
      } else {
        alert(result.error ?? "เกิดข้อผิดพลาดในการโหลดประวัติ");
      }
    } catch (error) {
      console.error(error);
      alert("เกิดข้อผิดพลาดในระบบส่งคำขอ");
    } finally {
      setIsLoadingHistory(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-0 md:px-4 py-6 sm:px-8 sm:py-10">
      <header className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 md:px-0">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center bg-[#003366] text-white shadow-xl shadow-[#003366]/20">
            <Receipt className="h-7 w-7" strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">จัดการใบวางบิล</h1>
            <p className="text-slate-500 font-medium">จัดการการออกใบวางบิลและเรียกดูประวัติ</p>
          </div>
        </div>
      </header>

      {/* Tab Navigation (0ms instant browser transitions!) */}
      <div className="mb-8 flex border-b border-slate-200 md:px-0">
        <button
          onClick={() => setCurrentTab("create")}
          className={`flex-1 text-center px-2 md:px-8 py-4 text-sm md:text-base font-bold transition-all border-b-4 ${
            currentTab === "create"
              ? "border-[#003366] text-[#003366]"
              : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          ออกใบวางบิลใหม่
        </button>
        <button
          onClick={() => setCurrentTab("history")}
          className={`flex-1 text-center px-2 md:px-8 py-4 text-sm md:text-base font-bold transition-all border-b-4 ${
            currentTab === "history"
              ? "border-[#003366] text-[#003366]"
              : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          ประวัติการวางบิล
        </button>
      </div>

      <div className="animate-in fade-in duration-300">
        {currentTab === "create" ? (
          <section>
            <div className="border-y md:border border-slate-200 bg-white p-4 md:p-8 shadow-none md:shadow-md">
              <BillingForm
                initialFromDate={initialFrom}
                initialToDate={initialTo}
                candidates={candidates}
                allCustomers={allCustomers}
              />
            </div>
          </section>
        ) : (
          <section className="space-y-8">
            <div className="flex flex-wrap items-end justify-between gap-6 px-4 md:px-0">
              <div className="flex items-center gap-3">
                <div className="h-8 w-1.5 rounded-full bg-[#003366]" />
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900">ค้นหาประวัติ</h2>
                </div>
              </div>
              {isSearching && history.length > 0 && !isLoadingHistory && (
                <div className="border border-emerald-100 bg-emerald-50/50 px-5 py-3 text-right">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-emerald-600">
                    รวมรายการที่ค้นพบ {history.length} ฉบับ
                  </p>
                  <p className="font-mono text-xl font-extrabold tabular-nums text-[#003366]">
                    {fmtBaht(totalBilled)}
                  </p>
                </div>
              )}
            </div>

            <div className="px-4 md:px-0">
              <HistorySearchForm
                initialFrom={hFrom || initialFrom}
                initialTo={hTo || initialTo}
                initialQuery={hQ}
                initialCustomers={hCustomers}
                allCustomers={allCustomers}
                onSearch={handleHistorySearch}
                isPending={isLoadingHistory}
              />
            </div>

            <div className="min-h-[300px] px-4 md:px-0">
              {isLoadingHistory ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <Loader2 className="h-10 w-10 animate-spin text-[#003366]" />
                  <p className="mt-4 text-sm font-semibold text-slate-500">
                    กำลังดึงข้อมูลประวัติการวางบิลย้อนหลังแบบเรียลไทม์...
                  </p>
                </div>
              ) : !isSearching ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-slate-50 text-slate-300">
                    <Search className="h-10 w-10" />
                  </div>
                  <h3 className="text-xl font-black text-slate-800">ยินดีต้อนรับสู่ระบบค้นหาประวัติ</h3>
                  <p className="mt-2 text-sm font-medium text-slate-500 max-w-sm">
                    กรุณาเลือกช่วงเวลา หรือระบุชื่อร้านค้าที่ต้องการ <br />เพื่อเรียกดูรายการใบวางบิลย้อนหลัง
                  </p>
                </div>
              ) : history.length === 0 ? (
                <EmptyHistory />
              ) : (
                <HistoryTable history={history} />
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
