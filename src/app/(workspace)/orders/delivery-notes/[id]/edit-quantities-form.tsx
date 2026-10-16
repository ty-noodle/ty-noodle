"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X, Save } from "lucide-react";
import type { DeliveryNotePrintData } from "@/lib/delivery/print";
import { adjustDeliveryNoteItemAction } from "./actions";

type Item = DeliveryNotePrintData["items"][0];

function fmtQty(n: number) {
  return n.toLocaleString("th-TH", { maximumFractionDigits: 3 });
}

export function EditQuantitiesForm({
  deliveryNoteId,
  items,
}: {
  deliveryNoteId: string;
  items: Item[];
}) {
  const [editing, setEditing] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>(
    Object.fromEntries(items.map((item) => [item.id, String(item.quantityDelivered)])),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleCancel() {
    setQuantities(Object.fromEntries(items.map((item) => [item.id, String(item.quantityDelivered)])));
    setError(null);
    setEditing(false);
  }

  function handleSave() {
    setError(null);

    // Validate
    for (const item of items) {
      const val = parseFloat(quantities[item.id] ?? "");
      if (!Number.isFinite(val) || val <= 0) {
        setError(`จำนวนของ "${item.productName}" ต้องมากกว่า 0`);
        return;
      }
      if (val > item.quantityDelivered) {
        setError(`ไม่สามารถเพิ่มจำนวนของ "${item.productName}" ได้`);
        return;
      }
    }

    // Find changed items only
    const changed = items.filter((item) => {
      const newQty = parseFloat(quantities[item.id] ?? "");
      return Math.abs(newQty - item.quantityDelivered) > 0.0001;
    });

    if (changed.length === 0) {
      setEditing(false);
      return;
    }

    startTransition(async () => {
      for (const item of changed) {
        const newQty = parseFloat(quantities[item.id]!);
        const result = await adjustDeliveryNoteItemAction(deliveryNoteId, item.id, newQty);
        if (result.error) {
          setError(result.error);
          return;
        }
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="no-print mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <p className="text-sm font-semibold text-slate-700">แก้ไขจำนวนที่ส่งจริง</p>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:border-[#003366] hover:text-[#003366] transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
            แก้ไข
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
              ยกเลิก
            </button>
            <button
              onClick={handleSave}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#003366] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#002244] disabled:opacity-50 transition-colors"
            >
              <Save className="h-3.5 w-3.5" strokeWidth={2} />
              {isPending ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        )}
      </div>

      {/* Items */}
      <div className="divide-y divide-slate-100">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">{item.productName}</p>
              <p className="text-xs text-slate-400">{item.saleUnitLabel}</p>
            </div>
            {editing ? (
              <input
                type="number"
                min="0.001"
                step="0.001"
                value={quantities[item.id] ?? ""}
                onChange={(e) => setQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))}
                className="w-24 rounded-lg border border-slate-300 px-2.5 py-1.5 text-right text-sm font-semibold text-slate-800 focus:border-[#003366] focus:outline-none"
              />
            ) : (
              <p className="text-sm font-bold text-slate-800">{fmtQty(item.quantityDelivered)}</p>
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="border-t border-red-100 bg-red-50 px-4 py-2.5">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
    </div>
  );
}

