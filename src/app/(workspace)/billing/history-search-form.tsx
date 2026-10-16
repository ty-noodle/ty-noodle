"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, User, ChevronDown, Check, X, Loader2 } from "lucide-react";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";
import { useMobileSearch } from "@/components/mobile-search/mobile-search-context";

type Props = {
  initialFrom: string;
  initialTo: string;
  initialQuery: string;
  initialCustomers: string[];
  allCustomers: { id: string; name: string; customer_code: string }[];
  onSearch?: (filters: { from: string; to: string; query: string; customerIds: string[] }) => void;
  isPending?: boolean;
};

export function HistorySearchForm({
  initialFrom,
  initialTo,
  initialQuery,
  initialCustomers,
  allCustomers,
  onSearch,
  isPending,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPendingTransition, startTransition] = useTransition();
  const activePending = isPending !== undefined ? isPending : isPendingTransition;

  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [query, setQuery] = useState(initialQuery);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialCustomers);

  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const { close: closeSearchDrawer } = useMobileSearch();


  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return allCustomers;
    return allCustomers.filter(c => 
      c.name.toLowerCase().includes(q) || 
      c.customer_code.toLowerCase().includes(q)
    );
  }, [allCustomers, customerSearch]);

  const toggleCustomer = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

    const handleSearch = () => {
    if (onSearch) {
      onSearch({ from, to, query, customerIds: selectedIds });
      return;
    }
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (from) params.set("h_from", from); else params.delete("h_from");
      if (to) params.set("h_to", to); else params.delete("h_to");
      if (query) params.set("h_q", query); else params.delete("h_q");
      if (selectedIds.length > 0) params.set("h_customers", selectedIds.join(",")); else params.delete("h_customers");
      params.set("h_show", "1");
      router.push(`/billing?${params.toString()}`);
    });
  };

  return (
    <div className="border border-slate-200 bg-white p-6 shadow-md md:p-8">
      {/* Mobile Search Drawer */}
      <MobileSearchDrawer title="ค้นหาประวัติใบวางบิล">
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">จากวันที่</label>
              <div className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50/50 overflow-hidden flex items-center">
                <ThaiDatePicker
                  id="m-h-from"
                  name="h-from"
                  value={from}
                  onChange={setFrom}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">ถึงวันที่</label>
              <div className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50/50 overflow-hidden flex items-center">
                <ThaiDatePicker
                  id="m-h-to"
                  name="h-to"
                  value={to}
                  onChange={setTo}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">เลือกร้านค้า</label>
            <button
              type="button"
              onClick={() => setIsCustomerDialogOpen(true)}
              className="flex h-12 w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 px-4 text-sm font-bold text-slate-700 transition active:scale-95"
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <User className="h-4 w-4 text-slate-400" />
                <span className="truncate">
                  {selectedIds.length === 0 ? "เลือกทั้งหมด..." : `เลือกแล้ว ${selectedIds.length} ร้าน`}
                </span>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">ค้นหาเลขที่บิล</label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ระบุเลขใบวางบิล..."
                className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50/50 pl-10 pr-4 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-[#003366]/10 focus:border-[#003366]/40"
              />
            </div>
          </div>

          <div className="pt-4">
            <button
              onClick={() => {
                handleSearch();
                closeSearchDrawer();
              }}
              className="w-full h-14 rounded-xl bg-[#003366] text-white font-black shadow-lg shadow-[#003366]/20 active:scale-95 transition-transform"
            >
              ค้นหาประวัติ
            </button>
          </div>
        </div>
      </MobileSearchDrawer>

      <div className="hidden lg:grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Dates */}
        <div className="grid grid-cols-2 gap-3 md:gap-4 lg:col-span-2">
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">จากวันที่</label>
            <ThaiDatePicker
              id="h-from"
              name="h-from"
              value={from}
              onChange={setFrom}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">ถึงวันที่</label>
            <ThaiDatePicker
              id="h-to"
              name="h-to"
              value={to}
              onChange={setTo}
            />
          </div>
        </div>

        {/* Customer Selection Modal Trigger (Desktop) */}
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">เลือกร้านค้า</label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsCustomerDialogOpen(true)}
              className="flex h-12 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-4 text-left transition-all hover:bg-slate-50 hover:border-[#003366]"
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <User className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="truncate text-sm font-bold text-slate-700">
                  {selectedIds.length === 0 
                    ? "เลือกทั้งหมด..." 
                    : `เลือกแล้ว ${selectedIds.length} ร้าน`}
                </span>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Search Query */}
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">ค้นหาเลขที่บิล</label>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="เลขใบวางบิล..."
              className="h-12 w-full border border-slate-200 bg-white pl-10 pr-4 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-[#003366]/10 focus:border-[#003366]/40"
            />
          </div>
        </div>
      </div>

      {/* Desktop Action Button */}
      <div className="mt-8 hidden lg:flex justify-end">
        <button
          onClick={handleSearch}
          disabled={activePending}
          className="flex h-14 w-full items-center justify-center gap-3 bg-[#003366] px-10 text-base font-black text-white shadow-lg shadow-[#003366]/20 transition-all hover:bg-[#002244] disabled:opacity-50 active:scale-95 md:w-auto"
        >
          {activePending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
          ค้นหาประวัติ
        </button>
      </div>

      {/* Customer Selection Dialog (Drawer on Mobile, Modal on Desktop) */}
      {isCustomerDialogOpen && (
        <div data-drawer="true" className="fixed inset-0 z-[100] flex flex-col items-center justify-end md:justify-center bg-slate-950/40 backdrop-blur-[2px] animate-in fade-in duration-300">
          <div className="absolute inset-0" onClick={() => setIsCustomerDialogOpen(false)} />
          <div className="relative flex h-[80vh] md:h-[70vh] w-full md:max-w-2xl flex-col rounded-t-[2.5rem] md:rounded-[2.5rem] bg-white shadow-2xl animate-in slide-in-from-bottom duration-500">
            {/* Handle for mobile */}
            <div className="flex justify-center py-3 md:hidden">
              <div className="h-1.5 w-12 rounded-full bg-slate-200" />
            </div>

            {/* Drawer Header */}
            <div className="flex items-center justify-between px-6 pb-4">
              <div>
                <h3 className="text-xl font-black text-slate-900">เลือกร้านค้า</h3>
                <p className="text-xs font-bold text-slate-400">เลือกแล้ว {selectedIds.length} ร้าน</p>
              </div>
              <button 
                onClick={() => setIsCustomerDialogOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 active:scale-95"
              >
                <X className="h-5 w-5" strokeWidth={2.5} />
              </button>
            </div>

            {/* Search Box */}
            <div className="px-6 pb-4">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="ค้นหาชื่อร้านหรือรหัส..."
                  className="w-full rounded-2xl border-none bg-slate-100 py-4 pl-12 pr-4 text-base font-bold text-slate-900 focus:ring-2 focus:ring-[#003366]/20 outline-none"
                />
              </div>
            </div>

            {/* Selection Options */}
            <div className="flex items-center justify-between border-b border-slate-50 px-6 py-2">
               <button
                onClick={() => {
                  const ids = filteredCustomers.map(c => c.id);
                  setSelectedIds(prev => Array.from(new Set([...prev, ...ids])));
                }}
                className="text-[11px] font-black uppercase tracking-widest text-[#003366]"
              >
                เลือกที่พบทั้งหมด
              </button>
              <button
                onClick={() => setSelectedIds([])}
                className="text-[11px] font-black uppercase tracking-widest text-slate-400"
              >
                ล้างทั้งหมด
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
              {filteredCustomers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <User className="h-10 w-10 text-slate-200 mb-3" />
                  <p className="text-sm font-bold text-slate-400 italic">ไม่พบข้อมูลร้านค้าที่ระบุ</p>
                </div>
              ) : (
                filteredCustomers.map(c => {
                  const isSelected = selectedIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleCustomer(c.id)}
                      className={`flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left transition-colors active:bg-slate-100 ${
                        isSelected ? "bg-[#003366]/5" : ""
                      }`}
                    >
                      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-all ${
                        isSelected 
                          ? "bg-[#003366] border-[#003366] text-white" 
                          : "border-slate-200 bg-white"
                      }`}>
                        {isSelected ? <Check className="h-4 w-4" strokeWidth={4} /> : null}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="truncate text-[15px] font-black text-slate-800">{c.name}</span>
                        <span className="font-mono text-xs font-bold text-slate-400 uppercase tracking-tight">{c.customer_code}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-slate-100 p-6">
              <button
                onClick={() => setIsCustomerDialogOpen(false)}
                className="w-full rounded-2xl bg-[#003366] py-4 text-lg font-black text-white shadow-lg shadow-[#003366]/20 active:scale-[0.98]"
              >
                เสร็จสิ้น
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

