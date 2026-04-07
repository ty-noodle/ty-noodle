"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Minus,
  Package2,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react";
import type { OrderDetailData } from "@/lib/orders/detail";
import {
  cancelOrderAction,
  removeOrderItemAction,
  updateOrderItemQtyAction,
} from "@/app/orders/incoming/actions";

function formatCurrency(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = { detail: OrderDetailData; date: string; searchTerm: string };

export function DesktopOrderDetail({ detail, date, searchTerm }: Props) {
  const router = useRouter();
  const [editMode, setEditMode] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelPending, startCancelTransition] = useTransition();
  const [savePending, startSaveTransition] = useTransition();
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(detail.items.map((i) => [i.id, i.quantity])),
  );
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const canEdit = detail.status === "submitted";
  const activeItems = detail.items.filter((i) => !removed.has(i.id));

  function handleQty(itemId: string, delta: number) {
    setQuantities((prev) => ({ ...prev, [itemId]: Math.max(1, (prev[itemId] ?? 1) + delta) }));
  }

  function cancelEdit() {
    setEditMode(false);
    setRemoved(new Set());
    setQuantities(Object.fromEntries(detail.items.map((i) => [i.id, i.quantity])));
  }

  function handleCancelOrder() {
    startCancelTransition(async () => {
      const fd = new FormData();
      fd.set("orderId", detail.id);
      await cancelOrderAction(fd);
      const p = new URLSearchParams();
      p.set("date", date);
      if (searchTerm) p.set("q", searchTerm);
      router.push(`/orders/incoming?${p.toString()}`);
    });
  }

  function handleSave() {
    startSaveTransition(async () => {
      for (const itemId of removed) {
        const fd = new FormData();
        fd.set("itemId", itemId);
        await removeOrderItemAction(fd);
      }
      for (const item of detail.items.filter((i) => !removed.has(i.id))) {
        const newQty = quantities[item.id] ?? item.quantity;
        if (newQty !== item.quantity) {
          const fd = new FormData();
          fd.set("itemId", item.id);
          fd.set("quantity", String(newQty));
          await updateOrderItemQtyAction(fd);
        }
      }
      setEditMode(false);
    });
  }

  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#003366]">
            {detail.customer.code}
          </p>
          <h3 className="mt-2 text-xl font-semibold text-slate-950">{detail.customer.name}</h3>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
            <span>ช่องทาง: {detail.channelLabel}</span>
            <span>หมายเหตุ: {detail.notes ?? "-"}</span>
            <span>จำนวนรวม {detail.totalQuantity}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canEdit && !editMode && (
            <>
              <button
                type="button"
                onClick={() => { setConfirmCancel(false); setEditMode(true); }}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#003366] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#002244] active:scale-[0.98]"
              >
                <Plus className="h-4 w-4" strokeWidth={2.4} />
                แก้ไขรายการ
              </button>
              <button
                type="button"
                onClick={() => setConfirmCancel((v) => !v)}
                className="inline-flex items-center gap-2 rounded-2xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-rose-800 active:scale-[0.98]"
              >
                <XCircle className="h-4 w-4" strokeWidth={2.2} />
                ยกเลิกออเดอร์
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Cancel confirmation ── */}
      {confirmCancel && (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="font-semibold text-rose-700">
            แน่ใจว่าจะยกเลิกออเดอร์ {detail.orderNumber}?
          </p>
          <p className="mt-1 text-sm text-rose-600">สต็อกที่จองไว้จะถูกคืนทั้งหมด</p>
          <div className="mt-3 flex gap-3">
            <button
              onClick={() => setConfirmCancel(false)}
              className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              ไม่ใช่
            </button>
            <button
              onClick={handleCancelOrder}
              disabled={cancelPending}
              className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
            >
              {cancelPending ? "กำลังยกเลิก…" : "ยืนยันยกเลิก"}
            </button>
          </div>
        </div>
      )}

      {/* ── Edit mode ── */}
      {editMode ? (
        <div className="mt-5">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
            แก้ไขรายการสินค้า
          </p>

          {activeItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 py-8 text-center">
              <p className="text-sm text-slate-400">ไม่มีรายการสินค้า</p>
              <p className="mt-1 text-xs text-slate-400">บันทึกเพื่อยกเลิกออเดอร์โดยอัตโนมัติ</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={item.productName}
                        fill
                        sizes="44px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Package2 className="h-5 w-5 text-slate-300" strokeWidth={1.8} />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">{item.productName}</p>
                    <p className="text-xs text-slate-400">
                      {item.unit} · {formatCurrency(item.unitPrice)} ฿/หน่วย
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleQty(item.id, -1)}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 active:scale-95"
                    >
                      <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </button>
                    <span className="w-10 text-center text-base font-bold text-slate-900 tabular-nums">
                      {quantities[item.id] ?? item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleQty(item.id, +1)}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 active:scale-95"
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setRemoved((p) => new Set([...p, item.id]))}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-rose-400 transition hover:bg-rose-50 hover:text-rose-600 active:scale-95"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={cancelEdit}
              disabled={savePending}
              className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              ยกเลิกการแก้ไข
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={savePending}
              className="flex-1 rounded-2xl bg-[#003366] py-3 text-sm font-semibold text-white transition hover:bg-[#002244] disabled:opacity-50"
            >
              {savePending ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </div>
        </div>
      ) : (
        /* ── View mode table ── */
        <div className="mt-5 overflow-x-auto rounded-[1.25rem] border border-slate-300">
          <table className="min-w-full border-collapse text-left">
            <thead>
              <tr style={{ backgroundColor: "#003366" }}>
                {(["รหัสสินค้า", "รายการสินค้า", "จำนวน", "หน่วย", "ราคา/หน่วย", "รวม"] as const).map(
                  (col, i, arr) => (
                    <th
                      key={col}
                      style={{ color: "white" }}
                      className={`px-5 py-4 text-center text-sm font-bold uppercase tracking-[0.12em] ${i < arr.length - 1 ? "border-r border-white/20" : ""}`}
                    >
                      {col}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {detail.items.map((item) => (
                <tr key={item.id} className="align-middle hover:bg-slate-50">
                  {/* รหัสสินค้า */}
                  <td className="border-r border-slate-300 px-5 py-4 text-center">
                    <span className="font-mono text-sm font-semibold text-slate-700">{item.sku}</span>
                  </td>

                  {/* รายการสินค้า */}
                  <td className="border-r border-slate-300 px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                        {item.imageUrl ? (
                          <Image
                            src={item.imageUrl}
                            alt={item.productName}
                            fill
                            sizes="44px"
                            className="object-contain bg-white p-1"
                          />
                        ) : (
                          <Package2 className="h-5 w-5 text-slate-400" strokeWidth={2} />
                        )}
                      </div>
                      <p className="font-medium text-slate-900">{item.productName}</p>
                    </div>
                  </td>

                  {/* จำนวน */}
                  <td className="border-r border-slate-300 px-5 py-4 text-center">
                    <span className="text-base font-bold text-slate-900 tabular-nums">
                      {item.quantity.toLocaleString("th-TH")}
                    </span>
                  </td>

                  {/* หน่วย */}
                  <td className="border-r border-slate-300 px-5 py-4 text-center text-sm text-slate-600">
                    {item.unit}
                  </td>

                  {/* ราคา/หน่วย */}
                  <td className="border-r border-slate-300 px-5 py-4 text-center tabular-nums text-slate-700">
                    {formatCurrency(item.unitPrice)}
                  </td>

                  {/* รวม */}
                  <td className="px-5 py-4 text-center font-bold tabular-nums text-slate-950">
                    {formatCurrency(item.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>

            {/* ── Total row ── */}
            <tfoot>
              <tr style={{ backgroundColor: "#f8fafc" }}>
                <td
                  colSpan={5}
                  className="border-r border-t border-slate-300 px-5 py-4 text-right text-sm font-semibold text-slate-600"
                >
                  รวมเงินทั้งหมด
                </td>
                <td className="border-t border-slate-300 px-5 py-4 text-center text-lg font-bold tabular-nums text-[#003366]">
                  {formatCurrency(detail.items.reduce((s, i) => s + i.lineTotal, 0))} บาท
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
