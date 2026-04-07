"use client";

import { useEffect, useRef, useState } from "react";
import { recordBillingHistoryAction } from "@/lib/billing/actions";
import { AlertTriangle, Loader2, Printer, X } from "lucide-react";
import type { SnapshotRow } from "@/lib/billing/billing-statement";

type Item = {
  customerId: string;
  billingDate: string;
  fromDate: string;
  toDate: string;
  totalAmount: number;
  snapshotRows: SnapshotRow[];
};

// ─── Reprint confirmation dialog ─────────────────────────────────────────────

function ReprintConfirmDialog({
  billingNumbers,
  onConfirm,
  onClose,
}: {
  billingNumbers: string[];
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [word1, setWord1] = useState("");
  const [word2, setWord2] = useState("");
  const input1Ref = useRef<HTMLInputElement>(null);

  const valid = word1.trim() === "ปริ้น" && word2.trim() === "ยืนยัน";

  useEffect(() => {
    input1Ref.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.55)", backdropFilter: "blur(3px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100">
              <AlertTriangle className="h-6 w-6 text-amber-600" strokeWidth={2.2} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">พิมพ์ซ้ำใบวางบิล</h2>
              <p className="mt-0.5 text-sm text-slate-500">ใบนี้เคยพิมพ์และล็อกยอดไปแล้ว</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>

        {/* Billing numbers */}
        <div className="border-b border-slate-100 bg-amber-50 px-6 py-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-700">
            เลขที่ใบวางบิล
          </p>
          <div className="flex flex-wrap gap-2">
            {billingNumbers.map((n) => (
              <span
                key={n}
                className="rounded-lg border border-amber-200 bg-white px-3 py-1 font-mono text-sm font-bold text-slate-800"
              >
                {n}
              </span>
            ))}
          </div>
        </div>

        {/* Form */}
        <div className="space-y-5 px-6 py-6">
          <p className="text-sm leading-relaxed text-slate-600">
            เพื่อยืนยันการพิมพ์ซ้ำ กรุณากรอกข้อความด้านล่างให้ครบ
          </p>

          {/* Field 1 */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">
              กรอกคำว่า{" "}
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[#003366]">
                ปริ้น
              </span>
            </label>
            <input
              ref={input1Ref}
              type="text"
              value={word1}
              onChange={(e) => setWord1(e.target.value)}
              placeholder="พิมพ์ที่นี่..."
              autoComplete="off"
              className={`w-full rounded-xl border px-4 py-3 text-base font-medium outline-none transition focus:ring-2 ${
                word1 && word1.trim() !== "ปริ้น"
                  ? "border-red-300 bg-red-50 text-red-700 focus:border-red-400 focus:ring-red-100"
                  : word1.trim() === "ปริ้น"
                  ? "border-emerald-400 bg-emerald-50 text-emerald-800 focus:ring-emerald-100"
                  : "border-slate-200 bg-white text-slate-900 focus:border-[#003366] focus:ring-[#003366]/10"
              }`}
            />
            {word1.trim() === "ปริ้น" && (
              <p className="mt-1 text-xs font-medium text-emerald-600">✓ ถูกต้อง</p>
            )}
          </div>

          {/* Field 2 */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">
              กรอกคำว่า{" "}
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[#003366]">
                ยืนยัน
              </span>
            </label>
            <input
              type="text"
              value={word2}
              onChange={(e) => setWord2(e.target.value)}
              placeholder="พิมพ์ที่นี่..."
              autoComplete="off"
              className={`w-full rounded-xl border px-4 py-3 text-base font-medium outline-none transition focus:ring-2 ${
                word2 && word2.trim() !== "ยืนยัน"
                  ? "border-red-300 bg-red-50 text-red-700 focus:border-red-400 focus:ring-red-100"
                  : word2.trim() === "ยืนยัน"
                  ? "border-emerald-400 bg-emerald-50 text-emerald-800 focus:ring-emerald-100"
                  : "border-slate-200 bg-white text-slate-900 focus:border-[#003366] focus:ring-[#003366]/10"
              }`}
            />
            {word2.trim() === "ยืนยัน" && (
              <p className="mt-1 text-xs font-medium text-emerald-600">✓ ถูกต้อง</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-slate-100 px-6 py-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            ยกเลิก
          </button>
          <button
            onClick={() => { if (valid) { onClose(); onConfirm(); } }}
            disabled={!valid}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition ${
              valid
                ? "bg-[#003366] text-white shadow-sm hover:bg-[#002244]"
                : "cursor-not-allowed bg-slate-100 text-slate-400"
            }`}
          >
            <Printer className="h-4 w-4" strokeWidth={2} />
            พิมพ์อีกครั้ง
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main print button ────────────────────────────────────────────────────────

export function PrintButton({
  organizationId,
  items,
  shouldSave,
  billingNumbers = [],
  onSaved,
}: {
  organizationId: string;
  items: Item[];
  shouldSave: boolean;
  billingNumbers?: string[];
  onSaved?: (results: { customerId: string; billingNumber: string }[]) => void;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showReprintDialog, setShowReprintDialog] = useState(false);

  const isReprint = (!shouldSave || isSaved) && billingNumbers.length > 0;

  async function executePrint() {
    if (shouldSave && !isSaved) {
      setIsSaving(true);
      try {
        const res = await recordBillingHistoryAction({ organizationId, items });
        if (res.success) {
          setIsSaved(true);
          if (onSaved) onSaved(res.results);
          setTimeout(() => window.print(), 500);
        } else {
          alert("ไม่สามารถบันทึกประวัติได้ กรุณาลองใหม่");
        }
      } catch (err) {
        console.error(err);
        alert("เกิดข้อผิดพลาดในการบันทึก");
      } finally {
        setIsSaving(false);
      }
    } else {
      window.print();
    }
  }

  function handleClick() {
    if (isReprint) {
      setShowReprintDialog(true);
    } else {
      executePrint();
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={isSaving}
        className="flex items-center gap-2 rounded-xl bg-[#003366] px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-[#002244] disabled:opacity-70"
      >
        {isSaving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            กำลังบันทึกและเตรียมพิมพ์...
          </>
        ) : (
          <>
            <Printer className="h-4 w-4" />
            {shouldSave && !isSaved ? "บันทึกและพิมพ์ใบวางบิล" : "พิมพ์อีกครั้ง"}
          </>
        )}
      </button>

      {showReprintDialog && (
        <ReprintConfirmDialog
          billingNumbers={billingNumbers}
          onConfirm={executePrint}
          onClose={() => setShowReprintDialog(false)}
        />
      )}
    </>
  );
}
