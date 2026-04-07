"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { ChevronRight, X, Package, Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { fetchStoreProductSalesAction } from "./actions";
import type { StoreProductRow } from "@/lib/reports/store-sales";

function fmt(n: number) {
  return n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

function fmtMoney(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " บาท";
}

function RankBadge({ rank }: { rank: number }) {
  const base =
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black text-white shadow";
  if (rank === 1)
    return (
      <span className={base} style={{ background: "linear-gradient(135deg,#FFD700 0%,#B8860B 100%)" }}>
        1
      </span>
    );
  if (rank === 2)
    return (
      <span className={base} style={{ background: "linear-gradient(135deg,#C0C0C0 0%,#708090 100%)" }}>
        2
      </span>
    );
  if (rank === 3)
    return (
      <span className={base} style={{ background: "linear-gradient(135deg,#CD7F32 0%,#8B4513 100%)" }}>
        3
      </span>
    );
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-black text-slate-500">
      {rank}
    </span>
  );
}

export function StoreDetailButton({
  customerId,
  customerName,
  customerCode,
  fromDate,
  toDate,
}: {
  customerId: string;
  customerName: string;
  customerCode: string;
  fromDate: string;
  toDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<StoreProductRow[] | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpen() {
    setOpen(true);
    if (rows === null) {
      startTransition(async () => {
        const data = await fetchStoreProductSalesAction({ customerId, fromDate, toDate });
        setRows(data);
      });
    }
  }

  function handleClose() {
    setOpen(false);
  }

  const totalRevenue = rows?.reduce((s, r) => s + r.totalRevenue, 0) ?? 0;
  const totalCost = rows?.reduce((s, r) => s + r.totalCost, 0) ?? 0;
  const netProfit = totalRevenue - totalCost;
  const profitPositive = netProfit >= 0;

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-[#003366] hover:text-[#003366] active:scale-95"
      >
        ดูเพิ่มเติม
        <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
          style={{ background: "rgba(15,23,42,0.55)", backdropFilter: "blur(3px)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <div className="flex h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:h-auto sm:max-h-[85dvh] sm:max-w-2xl sm:rounded-2xl">

            {/* Header */}
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-slate-400">{customerCode}</span>
                </div>
                <h2 className="mt-0.5 truncate text-base font-bold text-[#003366]">{customerName}</h2>
                <p className="mt-0.5 text-xs text-slate-400">สินค้าที่ขายได้ เรียงตามยอดขาย</p>
              </div>
              <button
                onClick={handleClose}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {isPending ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
                  <Loader2 className="h-8 w-8 animate-spin text-[#003366]" strokeWidth={2} />
                  <p className="text-sm">กำลังโหลดข้อมูลสินค้า...</p>
                </div>
              ) : rows && rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
                  <Package className="h-10 w-10" strokeWidth={1.5} />
                  <p className="text-sm">ไม่พบข้อมูลสินค้าในช่วงเวลานี้</p>
                </div>
              ) : rows ? (
                <div className="divide-y divide-slate-100">
                  {rows.map((row, i) => {
                    const profit = row.totalRevenue - row.totalCost;
                    const margin = row.totalRevenue > 0 ? (profit / row.totalRevenue) * 100 : 0;
                    const profitUp = profit >= 0;
                    return (
                      <div key={row.productId} className="flex items-center gap-3 px-5 py-3.5">
                        {/* Rank */}
                        <RankBadge rank={i + 1} />

                        {/* Image */}
                        {row.imageUrl ? (
                          <Image
                            src={row.imageUrl}
                            alt={row.name}
                            width={44}
                            height={44}
                            className="h-11 w-11 shrink-0 rounded-xl object-cover"
                          />
                        ) : (
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100">
                            <Package className="h-5 w-5 text-slate-300" strokeWidth={1.5} />
                          </div>
                        )}

                        {/* Name + SKU */}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-800">{row.name}</p>
                          <p className="font-mono text-xs text-slate-400">{row.sku}</p>
                        </div>

                        {/* Stats */}
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-black text-[#003366] tabular-nums">
                            {fmtMoney(row.totalRevenue)}
                          </p>
                          <div className="mt-0.5 flex items-center justify-end gap-1">
                            {profitUp ? (
                              <TrendingUp className="h-3 w-3 text-emerald-500" strokeWidth={2} />
                            ) : (
                              <TrendingDown className="h-3 w-3 text-red-400" strokeWidth={2} />
                            )}
                            <span
                              className={`text-xs font-semibold tabular-nums ${profitUp ? "text-emerald-600" : "text-red-500"}`}
                            >
                              {margin.toFixed(1)}%
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-slate-400 tabular-nums">
                            {fmt(row.totalQty)} {row.unit}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {/* Footer summary */}
            {rows && rows.length > 0 && (
              <div className="shrink-0 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-500">
                    {rows.length} สินค้า · ยอดขายรวม
                  </span>
                  <div className="text-right">
                    <span className="font-black text-[#003366]">{fmtMoney(totalRevenue)}</span>
                    <span
                      className={`ml-3 font-bold ${profitPositive ? "text-emerald-600" : "text-red-500"}`}
                    >
                      กำไร {fmtMoney(netProfit)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
