"use client";

import Image from "next/image";
import { useState, useMemo } from "react";
import {
  X,
  Boxes,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Plus,
  Search,
  FileText
} from "lucide-react";
import type { StockMovementRow } from "@/lib/stock/admin";
import { fmtDateTH } from "@/lib/utils/date";
import { loadMoreStockMovementsAction } from "@/app/(workspace)/stock/pagination-actions";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";
import { useMobileSearch } from "@/components/mobile-search/mobile-search-context";

type StockMovementTableProps = {
  initialMovementRows: StockMovementRow[];
};

function formatQuantity(value: number) {
  return value.toLocaleString("th-TH", {
    maximumFractionDigits: 2,
  });
}

function formatMovementTime(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function getMovementBadgeStyle(movementType: string) {
  const type = movementType.toLowerCase();
  if (type === "receipt") return "bg-[#0f766e] text-white border-[#0f766e]";
  if (type === "issue") return "bg-[#be123c] text-white border-[#be123c]";
  if (type === "adjustment") return "bg-[#0f172a] text-white border-[#0f172a]";
  return "bg-slate-500 text-white border-slate-500";
}

function getMovementLabel(movementType: string) {
  const type = movementType.toLowerCase();
  if (type === "receipt") return "รับเข้า";
  if (type === "issue") return "เบิกออก";
  if (type === "adjustment") return "ปรับปรุง";
  return "ปรับสต็อก";
}

function getMovementIcon(movementType: string) {
  const type = movementType.toLowerCase();
  if (type === "receipt") return <ArrowUpRight className="h-4 w-4 text-white" strokeWidth={3} />;
  if (type === "issue") return <ArrowDownRight className="h-4 w-4 text-white" strokeWidth={3} />;
  return <RefreshCw className="h-4 w-4 text-white" strokeWidth={3} />;
}

const LIMIT = 50;

export function StockMovementTable({ initialMovementRows }: StockMovementTableProps) {
  const [allMovements, setAllMovements] = useState<StockMovementRow[]>(initialMovementRows);
  const [hasMore, setHasMore] = useState(initialMovementRows.length === LIMIT);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  
  // Filtering states
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const { close: closeSearch } = useMobileSearch();

  async function handleLoadMore() {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const nextBatch = await loadMoreStockMovementsAction(allMovements.length, LIMIT);
      if (nextBatch.length > 0) {
        setAllMovements((prev) => [...prev, ...nextBatch]);
        if (nextBatch.length < LIMIT) {
          setHasMore(false);
        }
      } else {
        setHasMore(false);
      }
    } catch (e) {
      console.error("Failed to load more movements", e);
    } finally {
      setIsLoadingMore(false);
    }
  }

  const filteredMovements = useMemo(() => {
    let result = allMovements;
    if (typeFilter !== "all") {
      result = result.filter(m => m.movementType.toLowerCase() === typeFilter);
    }
    const q = searchTerm.toLowerCase().trim();
    if (q) {
      result = result.filter(m => 
        m.productName.toLowerCase().includes(q) || 
        m.sku.toLowerCase().includes(q) ||
        (m.referenceNumber && m.referenceNumber.toLowerCase().includes(q))
      );
    }
    return result;
  }, [allMovements, searchTerm, typeFilter]);

  const groupedMovements = useMemo(() => {
    const groups = new Map<string, StockMovementRow[]>();
    for (const row of filteredMovements) {
      const date = row.createdAt.split('T')[0];
      const bucket = groups.get(date) ?? [];
      bucket.push(row);
      groups.set(date, bucket);
    }
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredMovements]);

  return (
    <>
       {/* Mobile Slide-down Search */}
      <MobileSearchDrawer title="ค้นหาการเคลื่อนไหว">
        <div className="flex flex-col gap-5 pb-80">
          <div className="space-y-1.5">
            <label className="text-[12px] font-black uppercase tracking-widest text-slate-500 ml-1">คำค้นหา</label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="รหัสสินค้า, ชื่อสินค้า, หรือเลขที่บิล..."
                className="w-full h-14 rounded-2xl bg-slate-100 border-none pl-12 pr-4 text-base font-bold text-[#0f172a] outline-none focus:ring-2 focus:ring-[#0f172a] transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-black uppercase tracking-widest text-slate-500 ml-1">ประเภทธุรกรรม</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "ทั้งหมด", value: "all" },
                { label: "รับเข้า", value: "receipt" },
                { label: "เบิกออก", value: "issue" },
                { label: "ปรับปรุง", value: "adjustment" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTypeFilter(opt.value)}
                  className={`h-12 rounded-xl text-sm font-black transition-all border-2 ${
                    typeFilter === opt.value
                      ? "bg-[#0f172a] border-[#0f172a] text-white"
                      : "bg-white border-slate-200 text-slate-600"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={closeSearch}
            className="mt-4 w-full h-14 rounded-2xl bg-[#0f172a] text-white font-black text-lg shadow-lg active:scale-95 transition-all"
          >
            แสดง {filteredMovements.length} รายการ
          </button>
        </div>
      </MobileSearchDrawer>

      {/* Desktop Search & Filter Bar (Hidden on Mobile) */}
      <div className="mb-6 hidden sm:flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-2">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-slate-400" strokeWidth={3} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ค้นหา รหัสสินค้า, เลขที่บิล..."
              className="w-full h-[36px] rounded bg-slate-50 border-2 border-slate-200 pl-9 pr-4 text-[13px] font-black text-[#0f172a] outline-none focus:ring-1 focus:ring-[#0f172a] focus:border-[#0f172a] transition-all placeholder:font-bold placeholder:text-slate-400"
            />
          </div>
          
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-[36px] rounded bg-white border-2 border-slate-200 px-3 text-[13px] font-black text-[#0f172a] outline-none focus:ring-1 focus:ring-[#0f172a] cursor-pointer appearance-none pr-8 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAyNCAyNCIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMyI+PHBhdGggc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBkPSJNMTkgOWwtNyA3LTctNyIvPjwvc3ZnPg==')] bg-[length:14px] bg-[right_10px_center] bg-no-repeat"
          >
            <option value="all">ธุรกรรม: ทั้งหมด</option>
            <option value="receipt">รับเข้า (Receipt)</option>
            <option value="issue">เบิกออก (Issue)</option>
            <option value="adjustment">ปรับปรุง (Adjustment)</option>
          </select>
        </div>
        
        <div className="text-[11px] font-black uppercase tracking-widest text-slate-500 bg-slate-100 px-3 py-1 rounded whitespace-nowrap border border-slate-200">
          พบ {filteredMovements.length} รายการ
        </div>
      </div>

      {/* MOBILE VIEW: Cards */}
      <div className="lg:hidden space-y-4 mb-8 font-[family-name:var(--font-sukhumvit)]">
        {groupedMovements.length > 0 ? (
          groupedMovements.map(([date, items]) => (
            <div key={date} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <div className="h-[2px] flex-1 bg-slate-300" />
                <span className="text-[11px] font-black uppercase tracking-widest text-[#0f172a] bg-white border-2 border-slate-300 px-3 py-1 rounded shadow-sm whitespace-nowrap">
                  {fmtDateTH(date)}
                </span>
                <div className="h-[2px] flex-1 bg-slate-300" />
              </div>

              <div className="space-y-2">
                {items.map((m) => (
                  <div key={m.id} className="bg-white rounded-lg border-2 border-slate-300 p-3 shadow-sm active:bg-slate-50 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`p-1 rounded border-2 ${getMovementBadgeStyle(m.movementType)}`}>
                          {getMovementIcon(m.movementType)}
                        </div>
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-wider whitespace-nowrap">
                            {getMovementLabel(m.movementType)}
                          </span>
                          <p className="text-[11px] font-bold text-slate-500 tabular-nums leading-none">
                            {formatMovementTime(m.createdAt)} น.
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-[16px] font-black tabular-nums leading-none ${m.quantityDelta > 0 ? "text-[#0f766e]" : "text-[#be123c]"}`}>
                          {m.quantityDelta > 0 ? "+" : ""}{formatQuantity(m.quantityDelta)}
                        </p>
                        <p className="text-[10px] font-black text-slate-400 mt-1 uppercase whitespace-nowrap">คงเหลือ: {formatQuantity(m.stockAfter)}</p>
                      </div>
                    </div>

                    <div className="mb-2">
                      <h4 className="text-[14px] font-black text-[#0f172a] leading-tight tracking-tight">
                        <span className="font-mono text-slate-500 mr-1.5">{m.sku}</span>
                        <span>- {m.productName}</span>
                      </h4>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t-2 border-slate-100">
                      <div className="min-w-0 flex items-center gap-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0 whitespace-nowrap">REF:</span>
                        <span className="text-[12px] font-black text-blue-600 underline decoration-2 decoration-blue-50 truncate">
                          {m.referenceNumber || m.notes || "-"}
                        </span>
                      </div>
                      {m.receiptUrl && (
                        <button 
                          onClick={() => {
                            setIsImageLoading(true);
                            setPreviewUrl(m.receiptUrl);
                          }}
                          className="flex items-center gap-1 text-slate-400 hover:text-[#0f172a] transition-all active:scale-95 whitespace-nowrap"
                        >
                          <FileText className="h-4 w-4" strokeWidth={3} />
                          <span className="text-[10px] font-black uppercase underline decoration-slate-200">ดูไฟล์</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="py-20 text-center bg-white rounded-xl border-2 border-dashed border-slate-300">
             <Boxes className="mx-auto h-12 w-12 text-slate-200 mb-3" strokeWidth={1.5} />
             <p className="text-base font-black text-slate-400">ไม่พบข้อมูลการเคลื่อนไหว</p>
          </div>
        )}
      </div>

      {/* DESKTOP VIEW: Table */}
      <div className="hidden lg:block overflow-hidden rounded border-2 border-slate-300 bg-white shadow-sm mb-6 font-[family-name:var(--font-sukhumvit)]">
        <div className="w-full">
          <table className="w-full text-left border-collapse table-fixed">
            <thead>
              <tr className="bg-slate-50 border-y-2 border-slate-300">
                <th className="py-3 px-6 text-[11px] font-black uppercase tracking-widest text-slate-600 whitespace-nowrap w-[15%]">เวลา / วันที่</th>
                <th className="py-3 px-4 text-[11px] font-black uppercase tracking-widest text-slate-600 whitespace-nowrap w-[25%]">สินค้า / SKU</th>
                <th className="py-3 px-4 text-[11px] font-black uppercase tracking-widest text-slate-600 text-center whitespace-nowrap w-[10%]">ประเภท</th>
                <th className="py-3 px-4 text-[11px] font-black uppercase tracking-widest text-slate-600 text-right whitespace-nowrap w-[12%]">จำนวนปรับ</th>
                <th className="py-3 px-4 text-[11px] font-black uppercase tracking-widest text-slate-600 text-right whitespace-nowrap w-[12%]">ยอดคงเหลือ</th>
                <th className="py-3 px-4 text-[11px] font-black uppercase tracking-widest text-slate-600 whitespace-nowrap w-[16%]">อ้างอิงบิล</th>
                <th className="py-3 px-6 text-[11px] font-black uppercase tracking-widest text-slate-600 text-right whitespace-nowrap w-[10%]">หลักฐาน</th>
              </tr>
            </thead>
            <tbody className="text-[14px] divide-y-2 divide-slate-200">
              {filteredMovements.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="py-3 px-6">
                    <div className="font-black text-[#0f172a] text-[14px] whitespace-nowrap">{new Date(m.createdAt).toLocaleDateString('th-TH')}</div>
                    <div className="text-[11px] text-slate-400 font-bold leading-none mt-0.5 whitespace-nowrap">{formatMovementTime(m.createdAt)}</div>
                  </td>
                  <td className="py-3 px-4 border-l border-slate-100">
                    <div className="font-black text-[#0f172a] text-[15px] group-hover:text-blue-700 transition-colors leading-tight">
                      <span className="font-mono text-slate-500 mr-2 uppercase tracking-tight whitespace-nowrap">{m.sku}</span>
                      <span className="whitespace-normal break-words">- {m.productName}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center border-l border-slate-100">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border-2 whitespace-nowrap ${getMovementBadgeStyle(m.movementType)}`}>
                      {getMovementLabel(m.movementType)}
                    </span>
                  </td>
                  <td className={`py-3 px-4 text-right font-black tabular-nums text-[16px] whitespace-nowrap border-l border-slate-100 ${m.quantityDelta > 0 ? "text-[#0f766e]" : "text-[#be123c]"}`}>
                    {m.quantityDelta > 0 ? "+" : ""}{formatQuantity(m.quantityDelta)}
                  </td>
                  <td className="py-3 px-4 text-right font-black tabular-nums text-slate-800 text-[16px] whitespace-nowrap border-l border-slate-100">
                    {formatQuantity(m.stockAfter)}
                  </td>
                  <td className="py-3 px-4 border-l border-slate-100">
                    <span className="text-blue-600 hover:text-blue-800 font-black cursor-default underline decoration-2 decoration-blue-50 transition-colors whitespace-normal break-all line-clamp-2">
                      {m.referenceNumber || m.notes || "-"}
                    </span>
                  </td>
                  <td className="py-3 px-6 text-right border-l border-slate-100">
                      {m.receiptUrl ? (
                        <button 
                          onClick={() => {
                            setIsImageLoading(true);
                            setPreviewUrl(m.receiptUrl);
                          }}
                          className="text-slate-400 hover:text-[#0f172a] flex items-center gap-1 justify-end ml-auto transition-all active:scale-95 whitespace-nowrap"
                        >
                          <FileText className="h-4 w-4" strokeWidth={3} />
                          <span className="text-[11px] font-black underline decoration-slate-100">ดูไฟล์</span>
                        </button>
                      ) : (
                        <span className="text-slate-200 font-black text-[12px] whitespace-nowrap">—</span>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredMovements.length === 0 && (
            <div className="py-20 text-center bg-white">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 text-slate-200">
                 <Boxes className="h-8 w-8" strokeWidth={2} />
              </div>
              <h3 className="text-lg font-black text-[#0f172a]">ไม่พบข้อมูลการเคลื่อนไหว</h3>
              <p className="mt-1 text-sm font-bold text-slate-400">ลองปรับการกรองข้อมูลหรือล้างช่องค้นหา</p>
            </div>
          )}
        </div>
      </div>

      {/* Load More Section */}
      {hasMore && filteredMovements.length > 0 && searchTerm === "" && typeFilter === "all" && (
        <div className="mt-6 text-center pb-10">
          <button 
            onClick={handleLoadMore}
            disabled={isLoadingMore}
            className="flex items-center gap-2 border-2 border-[#0f172a] bg-[#0f172a] text-white px-10 py-2.5 text-[14px] font-black rounded hover:bg-[#1e293b] transition-all mx-auto shadow disabled:opacity-50 active:scale-95 whitespace-nowrap"
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                กำลังโหลด...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" strokeWidth={4} />
                โหลดข้อมูลเพิ่มเติม
              </>
            )}
          </button>
        </div>
      )}
      
      {!hasMore && allMovements.length > 0 && searchTerm === "" && typeFilter === "all" && (
        <div className="mt-8 text-center pb-8 text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] py-3 border-t-2 border-slate-300 whitespace-nowrap bg-slate-50/50">
          — สิ้นสุดรายการ —
        </div>
      )}

      {/* Image Preview Modal */}
      {previewUrl && (
        <div 
          className="fixed inset-0 z-[600] flex items-center justify-center bg-[#0f172a]/95 backdrop-blur-md p-4 animate-in fade-in duration-300"
          onClick={() => { setPreviewUrl(null); setIsImageLoading(false); }}
        >
          <div 
            className="relative max-h-[96dvh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-[0_0_100px_rgba(0,0,0,0.5)] border-4 border-white animate-in zoom-in-95 duration-400"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => { setPreviewUrl(null); setIsImageLoading(false); }}
              className="absolute right-6 top-6 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-rose-600 text-white transition-all hover:bg-rose-700 active:scale-90 shadow-xl border-4 border-white"
            >
              <X className="h-5 w-5" strokeWidth={4} />
            </button>

            <div className="relative aspect-[3/4] w-full bg-slate-100 flex items-center justify-center">
              {isImageLoading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/60 backdrop-blur-[2px]">
                  <Loader2 className="h-10 w-10 animate-spin text-[#0f172a]" strokeWidth={3} />
                  <p className="mt-4 text-[12px] font-black text-[#0f172a] uppercase tracking-widest animate-pulse">กำลังโหลดรูปภาพ...</p>
                </div>
              )}
              <Image 
                src={previewUrl} 
                alt="Receipt Preview" 
                fill 
                className={`object-contain transition-opacity duration-500 ${isImageLoading ? 'opacity-0' : 'opacity-100'}`}
                onLoad={() => setIsImageLoading(false)}
                unoptimized
                priority
              />
            </div>

            <div className="bg-white px-8 py-5 flex items-center justify-between border-t-4 border-slate-50">
              <div className="min-w-0">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none mb-1">STOCK VERIFICATION</p>
                <p className="text-[18px] font-black text-[#0f172a] truncate tracking-tight">หลักฐานการเคลื่อนไหวสต็อก</p>
              </div>
              <a 
                href={previewUrl} 
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center px-6 rounded bg-slate-900 text-[12px] font-black text-white transition hover:bg-black active:scale-95 shadow-lg whitespace-nowrap"
              >
                เปิดขนาดจริง
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
