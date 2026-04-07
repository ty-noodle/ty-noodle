"use client";

import { useState, useTransition } from "react";
import { History, X, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { fetchProductCostHistory, type ProductCostHistoryRow } from "@/app/dashboard/settings/actions";

function fmtCost(n: number | null) {
  if (n === null) return "—";
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateTimeTH(iso: string) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(new Date(iso));
}

function CostChangeRow({ row }: { row: ProductCostHistoryRow }) {
  const before = row.cost_before;
  const after = row.cost_after;
  const increased = before !== null && after > before;
  const decreased = before !== null && after < before;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <span className="inline-flex items-center rounded-full bg-[#003366]/10 px-3 py-1 text-sm font-bold text-[#003366]">
            {row.unit_label}
          </span>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">{fmtDateTimeTH(row.changed_at)}</p>
          {row.changed_by_name && (
            <p className="mt-0.5 text-xs font-medium text-slate-500">{row.changed_by_name}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* ก่อน */}
        <div className="flex-1 rounded-lg bg-slate-50 px-3 py-2.5 text-center">
          <p className="text-xs font-medium text-slate-400">ก่อน</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-600">
            {fmtCost(before)} <span className="text-sm font-normal">บาท</span>
          </p>
        </div>

        {/* ลูกศร */}
        <div className="shrink-0">
          {increased && <TrendingUp className="h-6 w-6 text-rose-500" strokeWidth={2} />}
          {decreased && <TrendingDown className="h-6 w-6 text-emerald-600" strokeWidth={2} />}
          {!increased && !decreased && <Minus className="h-6 w-6 text-slate-300" strokeWidth={2} />}
        </div>

        {/* หลัง */}
        <div className={`flex-1 rounded-lg px-3 py-2.5 text-center ${increased ? "bg-rose-50" : decreased ? "bg-emerald-50" : "bg-slate-50"}`}>
          <p className={`text-xs font-medium ${increased ? "text-rose-400" : decreased ? "text-emerald-500" : "text-slate-400"}`}>หลัง</p>
          <p className={`mt-0.5 text-lg font-bold tabular-nums ${increased ? "text-rose-600" : decreased ? "text-emerald-700" : "text-slate-600"}`}>
            {fmtCost(after)} <span className="text-sm font-normal">บาท</span>
          </p>
        </div>
      </div>
    </div>
  );
}

export function ProductCostHistoryButton({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ProductCostHistoryRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleOpen() {
    setOpen(true);
    if (!loaded) {
      startTransition(async () => {
        const data = await fetchProductCostHistory(productId);
        setRows(data);
        setLoaded(true);
      });
    }
  }

  function handleClose() {
    setOpen(false);
  }

  return (
    <>
      {/* ปุ่ม ประวัติ */}
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
      >
        <History className="h-3.5 w-3.5" strokeWidth={2} />
        ประวัติ
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <div className="flex w-full max-w-md flex-col rounded-t-2xl bg-slate-50 shadow-2xl sm:rounded-2xl"
            style={{ maxHeight: "85dvh" }}>

            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-4 sm:rounded-t-2xl">
              <div>
                <div className="flex items-center gap-2">
                  <History className="h-5 w-5 text-[#003366]" strokeWidth={2} />
                  <h2 className="text-base font-bold text-slate-900">ประวัติต้นทุน</h2>
                </div>
                <p className="mt-0.5 text-sm text-slate-500">{productName}</p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {isPending && (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-[#003366]" />
                </div>
              )}

              {!isPending && loaded && rows.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                  <History className="h-10 w-10 text-slate-200" strokeWidth={1.5} />
                  <p className="text-base font-semibold text-slate-400">ยังไม่มีประวัติการเปลี่ยนแปลง</p>
                  <p className="text-sm text-slate-400">ประวัติจะถูกบันทึกหลังจากแก้ไขต้นทุน</p>
                </div>
              )}

              {!isPending && rows.map((row) => (
                <CostChangeRow key={row.id} row={row} />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
