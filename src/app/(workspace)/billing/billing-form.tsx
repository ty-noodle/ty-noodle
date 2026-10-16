"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { 
  FileText, 
  Loader2, 
  Printer, 
  Search, 
  ChevronDown,
  X,
  User,
  Check,
  Calendar
} from "lucide-react";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";
import { useMobileSearch } from "@/components/mobile-search/mobile-search-context";
import type { BillingCandidate } from "@/lib/billing/billing-statement";
import { fmtDateTH } from "@/lib/utils/date";
import { BillingPreviewButton } from "./billing-preview-button";

type BillingFormProps = {
  initialFromDate: string;
  initialToDate: string;
  candidates: BillingCandidate[];
  allCustomers: { id: string; name: string; customer_code: string }[];
};

export function BillingForm({
  initialFromDate,
  initialToDate,
  candidates,
  allCustomers,
}: BillingFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fromDate, setFromDate] = useState(initialFromDate);
  const [toDate, setTodayDate] = useState(initialToDate);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "billed" | "unbilled">("all");
  const { close: closeSearchDrawer } = useMobileSearch();


  const handleDateChange = (type: "from" | "to", value: string) => {
    const newFrom = type === "from" ? value : fromDate;
    const newTo = type === "to" ? value : toDate;
    
    if (type === "from") setFromDate(value);
    else setTodayDate(value);

    startTransition(() => {
      const params = new URLSearchParams(window.location.search);
      params.set("from", newFrom);
      params.set("to", newTo);
      router.replace(`/billing?${params.toString()}`, { scroll: false });
    });
  };


  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return allCustomers;
    return allCustomers.filter(c => 
      c.name.toLowerCase().includes(q) || 
      c.customer_code.toLowerCase().includes(q)
    );
  }, [allCustomers, customerSearch]);

  const toggleCustomer = (id: string) => {
    setSelectedCustomerIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAllFiltered = () => {
    const idsToAdd = filteredCustomers.map(c => c.id);
    setSelectedCustomerIds(prev => Array.from(new Set([...prev, ...idsToAdd])));
  };

  const clearSelection = () => setSelectedCustomerIds([]);

  const visibleCandidates = useMemo(() => {
    if (selectedCustomerIds.length === 0) return [];
    
    return candidates
      .filter(c => selectedCustomerIds.includes(c.customerId))
      .map(c => ({
        ...c,
        deliveries: c.deliveries
          .filter(d => {
            if (statusFilter === "billed") return d.isAlreadyBilled;
            if (statusFilter === "unbilled") return !d.isAlreadyBilled;
            return true;
          })
          .sort((a, b) => a.date.localeCompare(b.date))
      }))
      .filter(c => c.deliveries.length > 0);
  }, [candidates, selectedCustomerIds, statusFilter]);

  const totalAmount = useMemo(() => {
    return visibleCandidates.reduce((sum, c) => {
      return sum + c.deliveries.reduce((s, d) => s + d.amount, 0);
    }, 0);
  }, [visibleCandidates]);

  const handlePrint = () => {
    if (isPending || isPrinting || visibleCandidates.length === 0) return;

    const selectedByCustomer = visibleCandidates.map(c => ({
      customerId: c.customerId,
      deliveryNumbers: c.deliveries.map(d => d.number)
    })).filter(c => c.deliveryNumbers.length > 0);
    const deliveryNumbers = selectedByCustomer.flatMap((customer) => customer.deliveryNumbers);

    if (deliveryNumbers.length === 0) {
      alert("ไม่พบรายการที่เลือกสำหรับพิมพ์");
      return;
    }

    setIsPrinting(true);
    const params = new URLSearchParams({
      customers: selectedByCustomer.map(c => c.customerId).join(","),
      deliveries: deliveryNumbers.join(","),
      from: fromDate,
      to: toDate,
      save: "true",
      autoprint: "1",
    });
    
    const printUrl = `/billing/print?${params.toString()}`;
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;";
    iframe.src = printUrl;
    document.body.appendChild(iframe);

    const done = () => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      setIsPrinting(false);
      startTransition(() => {
        router.refresh();
      });
    };

    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) return done();
      win.addEventListener("afterprint", done, { once: true });
    };

    iframe.onerror = () => {
      alert("เกิดข้อผิดพลาดในการโหลดหน้าพิมพ์");
      done();
    };

    setTimeout(done, 120000);
  };


  return (
    <div className="flex flex-col gap-8">
      {/* Mobile Search Drawer */}
      <MobileSearchDrawer title="กรองข้อมูลใบวางบิล">
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2.5">
              <label className="text-[13px] font-bold uppercase tracking-wider text-slate-400 pl-1 text-[11px]">จากวันที่</label>
              <div className="w-full h-14 rounded-lg border border-slate-200 bg-slate-50/50 overflow-hidden flex items-center">
                <ThaiDatePicker
                  id="m-from-date"
                  name="from-date"
                  value={fromDate}
                  onChange={(v) => handleDateChange("from", v)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2.5">
              <label className="text-[13px] font-bold uppercase tracking-wider text-slate-400 pl-1 text-[11px]">ถึงวันที่</label>
              <div className="w-full h-14 rounded-lg border border-slate-200 bg-slate-50/50 overflow-hidden flex items-center">
                <ThaiDatePicker
                  id="m-to-date"
                  name="to-date"
                  value={toDate}
                  onChange={(v) => handleDateChange("to", v)}
                  min={fromDate}
                />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            <label className="text-[13px] font-bold uppercase tracking-wider text-slate-400 pl-1">สถานะการวางบิล</label>
            <div className="flex h-14 w-full rounded-lg border border-slate-200 bg-slate-50/50 p-1">
              {(["all", "unbilled", "billed"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`flex-1 rounded-md text-sm font-black transition-all ${
                    statusFilter === s 
                      ? "bg-white text-[#003366] shadow-sm" 
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {s === "all" ? "ทั้งหมด" : s === "unbilled" ? "ยังไม่วางบิล" : "วางบิลแล้ว"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            <label className="text-[13px] font-bold uppercase tracking-wider text-slate-400 pl-1">เลือกร้านค้า</label>
            <button
              onClick={() => setIsCustomerDialogOpen(true)}
              className="flex h-14 w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 px-4 text-sm font-bold text-slate-700 transition active:scale-[0.98]"
            >
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-slate-400" />
                {selectedCustomerIds.length > 0 
                  ? `เลือกแล้ว ${selectedCustomerIds.length} ร้าน`
                  : "เลือกร้านค้า..."
                }
              </div>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>
          </div>
          <div className="pt-4">
            <button
              onClick={() => closeSearchDrawer()}
              className="w-full h-14 rounded-xl bg-[#003366] text-white font-black shadow-lg shadow-[#003366]/20 active:scale-95 transition-transform"
            >
              ดูผลลัพธ์
            </button>
          </div>
        </div>
      </MobileSearchDrawer>

      {/* Desktop Filters Section */}
      <div className="hidden lg:grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-2.5">
          <label className="text-[13px] font-bold uppercase tracking-wider text-slate-400 pl-1">จากวันที่</label>
          <div className="w-full h-14 rounded-lg border border-slate-200 bg-slate-50/50 overflow-hidden flex items-center">
            <ThaiDatePicker
              id="from-date"
              name="from-date"
              value={fromDate}
              onChange={(v) => handleDateChange("from", v)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          <label className="text-[13px] font-bold uppercase tracking-wider text-slate-400 pl-1">ถึงวันที่</label>
          <div className="w-full h-14 rounded-lg border border-slate-200 bg-slate-50/50 overflow-hidden flex items-center">
            <ThaiDatePicker
              id="to-date"
              name="to-date"
              value={toDate}
              onChange={(v) => handleDateChange("to", v)}
              min={fromDate}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <label className="text-[13px] font-bold uppercase tracking-wider text-slate-400 pl-1">สถานะการวางบิล</label>
          <div className="flex h-14 w-full rounded-lg border border-slate-200 bg-slate-50/50 p-1">
            {(["all", "unbilled", "billed"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`flex-1 rounded-md text-sm font-black transition-all ${
                  statusFilter === s 
                    ? "bg-white text-[#003366] shadow-sm" 
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                {s === "all" ? "ทั้งหมด" : s === "unbilled" ? "ยังไม่วางบิล" : "วางบิลแล้ว"}
              </button>
            ))}
          </div>
        </div>

        {/* Customer Multi-select Dropdown (Desktop) -> Now a Modal */}
        <div className="flex flex-col gap-2.5 hidden lg:flex">
          <label className="text-[13px] font-bold uppercase tracking-wider text-slate-400 pl-1">เลือกร้านค้า / ลูกค้า</label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsCustomerDialogOpen(true)}
              className="flex h-14 w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 px-5 text-left transition-all hover:bg-white hover:border-[#003366]"
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <User className="h-5 w-5 shrink-0 text-slate-400" />
                <span className="truncate text-lg font-bold text-slate-800">
                  {selectedCustomerIds.length === 0 
                    ? "เลือกทั้งหมด หรือบางร้าน..." 
                    : `เลือกแล้ว ${selectedCustomerIds.length} ร้าน`}
                </span>
              </div>
              <ChevronDown className="h-5 w-5 text-slate-400" />
            </button>
          </div>
        </div>
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
                <p className="text-xs font-bold text-slate-400">เลือกแล้ว {selectedCustomerIds.length} ร้าน</p>
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

            {/* Select All / Clear Row */}
            <div className="flex items-center justify-between border-b border-slate-50 px-6 py-2">
               <button
                onClick={selectAllFiltered}
                className="text-[11px] font-black uppercase tracking-widest text-[#003366]"
              >
                เลือกที่พบทั้งหมด
              </button>
              <button
                onClick={clearSelection}
                className="text-[11px] font-black uppercase tracking-widest text-slate-400"
              >
                ล้างทั้งหมด
              </button>
            </div>

            {/* Customer List */}
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
              {filteredCustomers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <User className="h-10 w-10 text-slate-200 mb-3" />
                  <p className="text-sm font-bold text-slate-400 italic">ไม่พบข้อมูลร้านค้าที่ระบุ</p>
                </div>
              ) : (
                filteredCustomers.map(c => {
                  const isSelected = selectedCustomerIds.includes(c.id);
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

            {/* Drawer Footer */}
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

      {/* Main Content Area */}
      <div className="relative min-h-[400px]">
        {isPending && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/80 backdrop-blur-[2px]">
            <Loader2 className="h-10 w-10 animate-spin text-[#003366]" />
            <p className="mt-4 text-base font-black text-[#003366]">กำลังอัปเดตข้อมูล...</p>
          </div>
        )}

        {selectedCustomerIds.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center px-4">
            <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-slate-50 text-slate-200">
              <User className="h-12 w-12" />
            </div>
            <h3 className="text-2xl font-black text-slate-800">กรุณาเลือกร้านค้าที่ต้องการ</h3>
            <p className="mt-3 max-w-sm text-base font-medium text-slate-500 leading-relaxed">
              ใช้ช่อง Dropdown ด้านบนเพื่อเลือกร้านค้าที่ต้องการออกใบวางบิลในช่วงวันที่ {fmtDateTH(fromDate)} ถึง {fmtDateTH(toDate)}
            </p>
          </div>
        ) : visibleCandidates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center px-4">
            <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-orange-50 text-orange-200">
              <FileText className="h-12 w-12" />
            </div>
            <h3 className="text-2xl font-black text-slate-800">ไม่พบรายการใบจัดส่ง</h3>
            <p className="mt-3 max-w-sm text-base font-medium text-slate-500 leading-relaxed">
              ไม่มีใบจัดส่งที่ยืนยันแล้วในช่วงวันที่เลือกสำหรับร้านค้าที่ระบุ
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {visibleCandidates.map((candidate) => (
                <div key={candidate.customerId} className="overflow-hidden border-y border-slate-200 bg-white shadow-sm md:border md:shadow-md">
                  {/* Table Header / Customer Info */}
                  <div className="flex items-center gap-4 bg-[#003366] py-2 md:py-2 px-4 md:px-6 text-white">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-white/10">
                    <User className="h-4 w-4 text-white" />
                  </div>
                  <h4 className="text-lg font-black tracking-tight leading-tight text-white">
                    <span className="font-mono text-base opacity-80">{candidate.customerCode}</span>
                    <span className="mx-2 opacity-40">—</span>
                    <span>{candidate.customerName}</span>
                  </h4>
                </div>

                {/* Table Body */}
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-2.5 text-center text-[11px] font-black uppercase tracking-widest text-slate-500 border-r border-slate-200">เลขที่ใบจัดส่ง</th>
                        <th className="px-6 py-2.5 text-center text-[11px] font-black uppercase tracking-widest text-slate-500 border-r border-slate-200">วันที่จัดส่ง</th>
                        <th className="px-6 py-2.5 text-center text-[11px] font-black uppercase tracking-widest text-slate-500 border-r border-slate-200">ยอดรวม</th>
                        <th className="px-6 py-2.5 text-center text-[11px] font-black uppercase tracking-widest text-slate-500 border-r border-slate-200">ค้างชำระ</th>
                        <th className="px-6 py-2.5 text-center text-[11px] font-black uppercase tracking-widest text-slate-500">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {candidate.deliveries.map((d) => (
                        <tr key={d.number} className="group hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-2">
                            <span className="font-mono text-sm font-black text-[#003366]">{d.number}</span>
                          </td>
                          <td className="px-6 py-2 text-center">
                            <div className="inline-flex items-center gap-2 text-xs font-bold text-slate-600">
                              <Calendar className="h-3.5 w-3.5 text-slate-300" />
                              {fmtDateTH(d.date)}
                            </div>
                          </td>
                          <td className="px-6 py-2 text-right font-mono text-sm font-black text-slate-800">
                            {d.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-6 py-2 text-right font-mono text-sm font-black text-slate-800">
                            {d.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-6 py-2">
                            <div className="flex justify-center">
                              {d.isAlreadyBilled ? (
                                <div className="flex items-center gap-2 bg-[#059669] px-4 py-1 shadow-sm">
                                  <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                                  <span className="text-[11px] font-black uppercase tracking-tight text-white">วางบิลแล้ว {d.billingNumber}</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 bg-slate-50 px-3 py-1 ring-1 ring-slate-200">
                                  <div className="h-1 w-1 rounded-full bg-slate-400" />
                                  <span className="text-[11px] font-black text-slate-500">รอดำเนินการ</span>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden divide-y divide-slate-100">
                  {candidate.deliveries.map((d) => (
                    <div key={d.number} className="p-3 space-y-2 bg-white active:bg-slate-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-[#003366]" />
                          <span className="font-mono text-[15px] font-black text-[#003366]">{d.number}</span>
                        </div>
                        {d.isAlreadyBilled ? (
                          <div className="flex items-center gap-1.5 bg-[#059669] px-2.5 py-1 shadow-sm">
                            <div className="h-1 w-1 rounded-full bg-white animate-pulse" />
                            <span className="text-[10px] font-black uppercase tracking-tight text-white">วางบิลแล้ว</span>
                          </div>
                        ) : (
                          <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-black text-slate-400 ring-1 ring-slate-200">
                            รอดำเนินการ
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">วันที่จัดส่ง</p>
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                            <Calendar className="h-3.5 w-3.5 text-slate-300" />
                            {fmtDateTH(d.date)}
                          </div>
                        </div>
                        <div className="text-right space-y-1">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">ยอดรวม</p>
                          <p className="font-mono text-sm font-black text-slate-900">
                            ฿{d.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>

                        {d.isAlreadyBilled && (
                          <div className="mt-1.5 flex items-center justify-between rounded-lg bg-[#059669] px-3 py-1 shadow-sm">
                          <span className="text-[10px] font-black text-white/80 uppercase tracking-wider">อ้างอิงใบวางบิล</span>
                          <span className="font-mono text-[12px] font-black text-white">{d.billingNumber}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {/* Unified Customer Footer (Summary) */}
                <div className="bg-slate-50/50 border-t border-slate-200 px-4 md:px-6 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-1.5 md:gap-3">
                  <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-400">
                    รวมยอดร้านนี้ ({candidate.deliveries.length} ใบจัดส่ง)
                  </span>
                  <div className="flex items-center gap-4">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-mono text-lg md:text-xl font-black leading-none text-[#003366]">
                        {candidate.deliveries.reduce((sum, d) => sum + d.amount, 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-tight">บาท</span>
                    </div>
                    <BillingPreviewButton
                      customerName={candidate.customerName}
                      customerCode={candidate.customerCode}
                      fromDate={fromDate}
                      toDate={toDate}
                      deliveries={candidate.deliveries}
                      totalAmount={candidate.deliveries.reduce((sum, d) => sum + d.amount, 0)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sticky Bottom Summary Bar */}
      {selectedCustomerIds.length > 0 && (
        <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom)+12px)] left-3 right-3 z-40 sm:sticky sm:bottom-4 sm:left-0 sm:right-0 flex flex-row items-center justify-between gap-3 border border-slate-200 bg-white/95 p-2.5 px-4 sm:py-3 sm:px-6 shadow-[0_-8px_30px_rgb(0,0,0,0.12)] sm:shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-8 duration-500 rounded-2xl sm:rounded-none">
          <div className="flex items-center gap-4 sm:gap-8">
            <div className="flex flex-col">
              <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">เลือกแล้ว</span>
              <div className="flex items-baseline gap-0.5">
                <span className="text-lg sm:text-2xl font-black text-[#003366]">{selectedCustomerIds.length}</span>
                <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase">ร้าน</span>
              </div>
            </div>
            <div className="h-8 w-px bg-slate-200 sm:h-10" />
            <div className="flex flex-col">
              <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">รวมเงิน</span>
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-base sm:text-2xl font-black text-slate-900">
                  {totalAmount.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase">บ.</span>
              </div>
            </div>
          </div>

          <button
            onClick={handlePrint}
            disabled={isPending || isPrinting || visibleCandidates.length === 0}
            className="group relative hidden md:flex h-11 sm:h-12 min-w-[120px] sm:w-[240px] items-center justify-center gap-2 bg-[#003366] px-4 sm:px-6 text-sm sm:text-base font-black tracking-wide text-white transition-all hover:bg-[#0a2340] active:scale-95 disabled:opacity-50 disabled:grayscale disabled:pointer-events-none rounded-xl sm:rounded-none"
          >
            {isPrinting ? (
              <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
            ) : (
              <>
                <Printer className="h-4 w-4 sm:h-5 sm:w-5 transition-transform group-hover:-translate-y-0.5" />
                <span className="sm:inline">{isPrinting ? "กำลังพิมพ์" : "พิมพ์ใบ"}</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Printing Overlay */}
      {isPrinting && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="flex flex-col items-center bg-white p-16 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="relative mb-10">
              <div className="h-24 w-24 animate-spin rounded-full border-4 border-slate-100 border-t-[#003366]"></div>
              <Printer className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-[#003366]" />
            </div>
            <h3 className="mb-4 text-3xl font-black text-slate-900 text-center">กำลังเตรียมข้อมูลพิมพ์</h3>
            <p className="max-w-[320px] text-center text-lg font-bold text-slate-500 leading-relaxed">
              ระบบกำลังบันทึกข้อมูลและเตรียมไฟล์ PDF กรุณารอสักครู่ครับ
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

