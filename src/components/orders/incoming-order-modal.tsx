"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Minus,
  Package2,
  Plus,
  Store,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import type { OrderDetailData, IncomingOrderListItem } from "@/lib/orders/detail";
import {
  cancelOrderAction,
  removeOrderItemAction,
  updateOrderItemQtyAction,
} from "@/app/orders/incoming/actions";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_MAP = {
  cancelled: { cls: "bg-rose-100 text-rose-700", label: "ยกเลิกแล้ว" },
  confirmed: { cls: "bg-emerald-100 text-emerald-700", label: "ยืนยันแล้ว" },
  draft:     { cls: "bg-slate-100 text-slate-600",   label: "ฉบับร่าง" },
  submitted: { cls: "bg-sky-100 text-sky-700",       label: "รับออเดอร์แล้ว" },
};

function formatTHB(v: number) {
  return v.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Items view list ──────────────────────────────────────────────────────────

function ItemsViewList({ detail }: { detail: OrderDetailData }) {
  return (
    <div className="space-y-3">
      {detail.items.map((item) => (
        <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-100">
            {item.imageUrl ? (
              <Image src={item.imageUrl} alt={item.productName} fill sizes="48px" className="object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Package2 className="h-5 w-5 text-slate-300" strokeWidth={1.8} />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{item.productName}</p>
            <p className="mt-0.5 text-xs text-slate-400">{item.sku}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-bold text-slate-900 tabular-nums">
              {item.quantity.toLocaleString("th-TH")} {item.unit}
            </p>
            <p className="text-xs text-slate-400 tabular-nums">{formatTHB(item.lineTotal)} ฿</p>
            {item.shortQuantity > 0 && (
              <span className="mt-0.5 inline-flex items-center gap-0.5 text-xs font-semibold text-amber-600">
                <AlertTriangle className="h-3 w-3" strokeWidth={2.4} />
                ขาด {item.shortQuantity}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Edit items panel ─────────────────────────────────────────────────────────

function EditItemsPanel({ detail, onDone }: { detail: OrderDetailData; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(detail.items.map((i) => [i.id, i.quantity])),
  );
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const activeItems = detail.items.filter((i) => !removed.has(i.id));

  function handleQty(itemId: string, delta: number) {
    setQuantities((prev) => ({ ...prev, [itemId]: Math.max(1, (prev[itemId] ?? 1) + delta) }));
  }

  function handleSave() {
    startTransition(async () => {
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
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {activeItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center">
          <p className="text-sm text-slate-400">ไม่มีรายการสินค้า</p>
          <p className="mt-1 text-xs text-slate-400">บันทึกเพื่อยกเลิกออเดอร์อัตโนมัติ</p>
        </div>
      ) : (
        activeItems.map((item) => (
          <div key={item.id} className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
            {/* Row 1 */}
            <div className="flex items-center gap-2.5">
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                {item.imageUrl ? (
                  <Image src={item.imageUrl} alt={item.productName} fill sizes="40px" className="object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Package2 className="h-5 w-5 text-slate-300" strokeWidth={1.8} />
                  </div>
                )}
              </div>
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
                {item.productName}
              </p>
              <button
                type="button"
                onClick={() => setRemoved((p) => new Set([...p, item.id]))}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-rose-400 transition hover:bg-rose-50 hover:text-rose-600 active:scale-95"
                aria-label="ลบ"
              >
                <Trash2 className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
            {/* Row 2 */}
            <div className="mt-2.5 flex items-center justify-between pl-[52px]">
              <p className="text-xs text-slate-400">
                {item.unit} · <span className="font-medium text-slate-600">{formatTHB(item.unitPrice)} ฿</span>
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleQty(item.id, -1)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[#003366] text-white shadow-sm active:scale-95 active:bg-[#002244]"
                  aria-label="ลด"
                >
                  <Minus className="h-4 w-4" strokeWidth={2.5} />
                </button>
                <span className="w-8 text-center text-base font-bold text-slate-900 tabular-nums">
                  {quantities[item.id] ?? item.quantity}
                </span>
                <button
                  type="button"
                  onClick={() => handleQty(item.id, +1)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[#003366] text-white shadow-sm active:scale-95 active:bg-[#002244]"
                  aria-label="เพิ่ม"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.5} />
                </button>
              </div>
            </div>
          </div>
        ))
      )}

      {/* Edit actions */}
      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="flex-1 rounded-2xl border border-slate-200 bg-white py-3.5 text-sm font-semibold text-slate-600 shadow-sm transition active:scale-[0.98] disabled:opacity-50"
        >
          ยกเลิกการแก้ไข
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="flex-1 rounded-2xl bg-[#003366] py-3.5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? "กำลังบันทึก…" : "บันทึก"}
        </button>
      </div>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

type Props = {
  allOrders: IncomingOrderListItem[];
  date: string;
  detail: OrderDetailData | null;
  expandedId: string;
  searchTerm: string;
};

export function IncomingOrderModal({ allOrders, date, detail, expandedId, searchTerm }: Props) {
  const router = useRouter();
  const [editMode, setEditMode] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [pending, startTransition] = useTransition();

  const [slideDir, setSlideDir] = useState<"left" | "right" | null>(null);
  const [animTargetId, setAnimTargetId] = useState<string | null>(null);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setSlideDir(null);
      setAnimTargetId(null);
    }, 300);
    return () => clearTimeout(t);
  }, [expandedId]);

  const currentIndex = allOrders.findIndex((o) => o.id === expandedId);
  const prevOrder = currentIndex > 0 ? allOrders[currentIndex - 1] : null;
  const nextOrder = currentIndex < allOrders.length - 1 ? allOrders[currentIndex + 1] : null;

  function buildNavHref(orderId: string | null) {
    if (!orderId) return null;
    const p = new URLSearchParams();
    p.set("date", date);
    if (searchTerm) p.set("q", searchTerm);
    p.set("expanded", orderId);
    return `/orders/incoming?${p.toString()}`;
  }

  function navigate(href: string | null, direction: "left" | "right", targetId: string | null) {
    if (!href || !targetId) return;
    setSlideDir(direction);
    setAnimTargetId(targetId);
    setEditMode(false);
    setConfirmCancel(false);
    router.push(href);
  }

  function close() {
    const p = new URLSearchParams();
    p.set("date", date);
    if (searchTerm) p.set("q", searchTerm);
    router.push(`/orders/incoming?${p.toString()}`);
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }
  function onTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) navigate(buildNavHref(nextOrder?.id ?? null), "left", nextOrder?.id ?? null);
    else navigate(buildNavHref(prevOrder?.id ?? null), "right", prevOrder?.id ?? null);
  }

  function handleCancelOrder() {
    if (!detail) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("orderId", detail.id);
      await cancelOrderAction(fd);
      setConfirmCancel(false);
      close();
    });
  }

  if (!detail) return null;

  const canEdit = detail.status === "submitted";
  const { cls: statusCls, label: statusLabel } = STATUS_MAP[detail.status];

  const isNewContent = slideDir && detail.id === animTargetId;
  const slideStyle: React.CSSProperties = isNewContent
    ? { animation: `orderSlideIn${slideDir === "left" ? "Right" : "Left"} 260ms cubic-bezier(0.33,1,0.68,1) both` }
    : {};

  return (
    <>
      <style>{`
        @keyframes orderSlideInRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
        @keyframes orderSlideInLeft {
          from { transform: translateX(-100%); }
          to   { transform: translateX(0); }
        }
      `}</style>

      {/* Full-screen overlay — mobile only */}
      <div className="fixed inset-0 z-50 flex flex-col bg-slate-50 md:hidden">

        {/* ── Top bar ────────────────────────────────────────────────── */}
        <div className="shrink-0 bg-[#003366] shadow-md">
          {/* Row 1: order # + status pill + close */}
          <div className="flex items-center gap-3 px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <ClipboardList className="h-4 w-4 shrink-0 text-white/70" strokeWidth={2} />
                <p className="font-mono text-lg font-bold leading-tight text-white">
                  {detail.orderNumber}
                </p>
              </div>
              <span className={`mt-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusCls}`}>
                {statusLabel}
              </span>
            </div>

            {/* Close button */}
            <button
              type="button"
              onClick={close}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-700 text-white shadow-md transition active:scale-95 active:bg-rose-900"
              aria-label="ปิด"
            >
              <X className="h-5 w-5" strokeWidth={2.8} />
            </button>
          </div>

          {/* Row 2: prev ← customer name → next */}
          <div className="flex items-center gap-2 border-t border-white/10 px-4 py-2.5">
            <button
              onClick={() => navigate(buildNavHref(prevOrder?.id ?? null), "right", prevOrder?.id ?? null)}
              disabled={!prevOrder}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white disabled:opacity-25"
              aria-label="ก่อนหน้า"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
            </button>

            <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
              <Store className="h-3.5 w-3.5 shrink-0 text-white/60" strokeWidth={2} />
              <p className="truncate text-sm font-medium text-white/90">
                {detail.customer.name}
              </p>
            </div>

            <button
              onClick={() => navigate(buildNavHref(nextOrder?.id ?? null), "left", nextOrder?.id ?? null)}
              disabled={!nextOrder}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white disabled:opacity-25"
              aria-label="ถัดไป"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* ── Scrollable body ─────────────────────────────────────────── */}
        <div
          className="min-h-0 flex-1 overflow-hidden"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div
            key={detail.id}
            className="h-full overflow-y-auto px-4 py-4"
            style={slideStyle}
          >
            {/* Meta row */}
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <span>ช่องทาง: <span className="font-medium text-slate-700">{detail.channelLabel}</span></span>
              {detail.notes && (
                <span>หมายเหตุ: <span className="font-medium text-slate-700">{detail.notes}</span></span>
              )}
            </div>

            {editMode ? (
              <EditItemsPanel detail={detail} onDone={() => setEditMode(false)} />
            ) : (
              <ItemsViewList detail={detail} />
            )}

            {/* Bottom padding so last item clears the footer */}
            <div className="h-4" />
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        {!editMode && (
          <div className="shrink-0 border-t border-slate-200 bg-white px-4 pb-8 pt-4 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
            {/* Total */}
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">ยอดรวม</span>
              <span className="text-2xl font-bold text-slate-950 tabular-nums">
                {formatTHB(detail.totalAmount)} <span className="text-base font-semibold text-slate-400">บาท</span>
              </span>
            </div>

            {/* Cancel confirmation */}
            {confirmCancel && (
              <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <p className="text-sm font-semibold text-rose-700">
                  แน่ใจว่าจะยกเลิกออเดอร์ {detail.orderNumber}?
                </p>
                <p className="mt-0.5 text-xs text-rose-500">สต็อกที่จองไว้จะถูกคืนทั้งหมด</p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => setConfirmCancel(false)}
                    className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-600"
                  >
                    ไม่ใช่
                  </button>
                  <button
                    onClick={handleCancelOrder}
                    disabled={pending}
                    className="flex-1 rounded-xl bg-rose-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {pending ? "กำลังยกเลิก…" : "ยืนยันยกเลิก"}
                  </button>
                </div>
              </div>
            )}

            {/* Action buttons */}
            {canEdit && !confirmCancel && (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmCancel(true)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-rose-700 py-4 text-sm font-semibold text-white shadow-md active:scale-[0.98] active:bg-rose-900"
                >
                  <XCircle className="h-4 w-4" strokeWidth={2.2} />
                  ยกเลิกออเดอร์
                </button>
                <button
                  type="button"
                  onClick={() => setEditMode(true)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#003366] py-4 text-sm font-semibold text-white active:scale-[0.98]"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.4} />
                  แก้ไขรายการ
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
