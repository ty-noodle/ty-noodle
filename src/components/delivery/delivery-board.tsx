"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { createContext, useContext, useMemo, useState, useTransition } from "react";
import { AlertTriangle, Building2, ExternalLink, FileText, Loader2, Package2, Pencil, Save, Search, Truck, X, } from "lucide-react";
import { adjustDeliveryGroupQtyAction, adjustDeliveryLineQtyAction, type DeliveryAdjustmentMode, } from "@/app/delivery/actions";
import type { BillingRecordInfo, DeliveryDaySummary, DeliveryEditableItem, DeliveryListItem, } from "@/lib/delivery/delivery-list";
import { PrintDailyDeliveryButton } from "@/components/orders/print-daily-delivery-button";
import { PrintPackingListButton } from "@/components/orders/print-packing-list-button";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";

const ReadOnlyCtx = createContext(false);

function fmtMoney(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtMoneyBaht(n: number) {
  return `${fmtMoney(n)} บาท`;
}

function fmtQty(n: number) {
  return n.toLocaleString("th-TH", { maximumFractionDigits: 3 });
}

function fmtDateShort(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${parseInt(y, 10) + 543}`;
}

function fmtDateLabel(iso: string) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(new Date(iso + "T00:00:00"));
}

function orderNumberToDate(orderNumber: string): string | null {
  const normalized = orderNumber.trim();
  const prefixedMatch = normalized.match(/^(?:TY-|ORD)(\d{4})(\d{2})(\d{2})/);
  if (prefixedMatch) {
    return `${prefixedMatch[1]}-${prefixedMatch[2]}-${prefixedMatch[3]}`;
  }

  const compactMatch = normalized.match(/(\d{4})(\d{2})(\d{2})/);
  if (!compactMatch) return null;
  return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;
}

function summarize(items: DeliveryListItem[]): DeliveryDaySummary {
  return items.reduce(
    (acc, item) => {
      acc.count += 1;
      acc.totalItemCount += item.itemCount;
      acc.totalOrderedAmount += item.orderedAmount;
      acc.totalDeliveredAmount += item.deliveredAmount;
      return acc;
    },
    { count: 0, totalItemCount: 0, totalOrderedAmount: 0, totalDeliveredAmount: 0 } as DeliveryDaySummary,
  );
}

type StatusTone = { badge: string; badgeClass: string; accentClass: string };

function statusTone(): StatusTone {
  return {
    badge: "ครบ",
    badgeClass: "bg-emerald-600 text-white",
    accentClass: "border-l-emerald-500",
  };
}

// Shared UI

function BillingBadge({ billingNumber }: { billingNumber: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-semibold text-white">
      <FileText className="h-3 w-3 shrink-0" strokeWidth={2.2} />
      วางบิลแล้ว · {billingNumber}
    </span>
  );
}

function PendingBillingBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-semibold text-white">
      <FileText className="h-3 w-3 shrink-0" strokeWidth={2.2} />
      ยังไม่วางบิล
    </span>
  );
}

function StatusBadge({ tone }: { tone: StatusTone }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold leading-none ${tone.badgeClass}`}>
      {tone.badge}
    </span>
  );
}

// Search form

export function DeliverySearchForm({ from, to, q }: { from: string; to: string; q: string }) {
  const hasQuery = q.trim().length > 0;
  const clearHref = `/delivery?${new URLSearchParams({ from, to }).toString()}`;

  return (
    <form
      action="/delivery"
      method="get"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="space-y-3 xl:grid xl:grid-cols-[minmax(0,1fr)_176px_176px_auto] xl:items-end xl:gap-3 xl:space-y-0">
        <div className="min-w-0">
          <label
            htmlFor="delivery-search"
            className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"
          >
            ค้นหาร้านค้า / เอกสาร
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" strokeWidth={2.2} />
            <input
              id="delivery-search"
              name="q"
              defaultValue={q}
              placeholder="ชื่อร้าน, รหัสร้าน, เลขที่ใบส่งของ"
              className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-12 pr-4 text-base text-slate-800 outline-none transition focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/10"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 xl:contents">
          <div className="min-w-0">
            <label
              htmlFor="delivery-from"
              className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"
            >
              จากวันที่
            </label>
            <ThaiDatePicker
              id="delivery-from"
              name="from"
              defaultValue={from}
              max={to}
            />
          </div>
          <div className="min-w-0">
            <label
              htmlFor="delivery-to"
              className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"
            >
              ถึงวันที่
            </label>
            <ThaiDatePicker
              id="delivery-to"
              name="to"
              defaultValue={to}
              min={from}
            />
          </div>
        </div>
        <div className="flex gap-2 xl:justify-end">
          <button
            type="submit"
            className="inline-flex flex-1 items-center justify-center rounded-xl bg-[#0f2f56] px-5 py-3 text-base font-semibold text-white transition hover:bg-[#0a2340] xl:flex-none"
          >
            ค้นหา
          </button>
          {hasQuery && (
            <a
              href={clearHref}
              className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-300 px-5 py-3 text-base font-medium text-slate-600 transition hover:bg-slate-50 xl:flex-none"
            >
              ล้าง
            </a>
          )}
        </div>
      </div>
    </form>
  );
}

// Summary strip

function SummaryStrip({ summary }: { summary: DeliveryDaySummary }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-2 md:grid-cols-4">
        <article className="flex flex-col items-center justify-center border-b border-r border-slate-200 px-4 py-3 text-center md:border-b-0">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            <Building2 className="h-3.5 w-3.5 text-[#003366]" strokeWidth={2.1} />
            <span>ร้านค้า</span>
          </div>
          <p className="mt-1 text-xl font-bold text-slate-950">{summary.count.toLocaleString("th-TH")}</p>
        </article>
        <article className="flex flex-col items-center justify-center border-b border-slate-200 px-4 py-3 text-center md:border-b-0 md:border-r">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            <Package2 className="h-3.5 w-3.5 text-[#003366]" strokeWidth={2.1} />
            <span>รายการรวม</span>
          </div>
          <p className="mt-1 text-xl font-bold text-slate-950">{summary.totalItemCount.toLocaleString("th-TH")}</p>
        </article>
        <article className="flex flex-col items-center justify-center border-r border-slate-200 px-4 py-3 text-center">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            <FileText className="h-3.5 w-3.5 text-[#003366]" strokeWidth={2.1} />
            <span>ยอดออเดอร์</span>
          </div>
          <p className="mt-1 text-xl font-bold text-slate-950">{fmtMoneyBaht(summary.totalOrderedAmount)}</p>
        </article>
        <article className="flex flex-col items-center justify-center px-4 py-3 text-center">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            <Truck className="h-3.5 w-3.5 text-[#003366]" strokeWidth={2.1} />
            <span>ยอดจัดส่ง</span>
          </div>
          <p className="mt-1 text-xl font-bold text-slate-950">{fmtMoneyBaht(summary.totalDeliveredAmount)}</p>
        </article>
      </div>
    </section>
  );
}



function LineItemQtyEditor({ item }: { item: DeliveryEditableItem }) {
  const [isEditing, setIsEditing] = useState(false);
  const [qty, setQty] = useState(String(item.quantityDelivered));
  const [mode, setMode] = useState<DeliveryAdjustmentMode>("return_to_stock");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function startEdit() {
    setQty(String(item.quantityDelivered));
    setMode("return_to_stock");
    setError(null);
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setError(null);
  }

  function saveEdit() {
    const parsed = Number.parseFloat(qty);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError("จำนวนต้องเป็น 0 หรือมากกว่า");
      return;
    }
    if (parsed > item.quantityDelivered) {
      setError("ไม่สามารถเพิ่มจำนวนส่งจริงได้");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await adjustDeliveryLineQtyAction(item.id, parsed, mode);
      if (result.error) {
        setError(result.error);
        return;
      }
      setIsEditing(false);
      router.refresh();
    });
  }

  if (!isEditing) {
    return (
      <div className="flex items-center justify-center gap-2">
        <span className="text-sm font-semibold text-slate-800">
          {fmtQty(item.quantityDelivered)}
        </span>
        <button
          type="button"
          onClick={startEdit}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-400 hover:border-[#003366] hover:text-[#003366]"
          aria-label="แก้ไขจำนวนส่งจริง"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <div className="flex flex-col items-end gap-1">
          <input
            type="number"
            min="0"
            step="0.001"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm font-semibold focus:border-[#003366] focus:outline-none"
          />
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as DeliveryAdjustmentMode)}
            className="w-32 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:border-[#003366] focus:outline-none"
          >
            <option value="return_to_stock">คืนสต็อก</option>
            <option value="lost">ของหาย/เสียหาย</option>
          </select>
        </div>
        <button
          type="button"
          onClick={saveEdit}
          disabled={isPending}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#003366] text-white hover:bg-[#002244] disabled:opacity-50"
          aria-label="บันทึก"
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={cancelEdit}
          disabled={isPending}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
          aria-label="ยกเลิก"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}

function GroupQtyPopupEditor({
  items,
  quantityDelivered,
}: {
  items: Array<{ id: string; quantityDelivered: number }>;
  quantityDelivered: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [qty, setQty] = useState(String(quantityDelivered));
  const [mode, setMode] = useState<DeliveryAdjustmentMode>("return_to_stock");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function openDialog() {
    setQty(String(quantityDelivered));
    setMode("return_to_stock");
    setError(null);
    setIsOpen(true);
  }

  function closeDialog() {
    if (isPending) return;
    setIsOpen(false);
    setError(null);
  }

  function saveEdit() {
    const parsed = Number.parseFloat(qty);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError("จำนวนต้องเป็น 0 หรือมากกว่า");
      return;
    }
    if (parsed > quantityDelivered) {
      setError("ไม่สามารถเพิ่มจำนวนส่งจริงได้");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await adjustDeliveryGroupQtyAction(
        items.map((item) => ({ id: item.id, currentQty: item.quantityDelivered })),
        parsed,
        mode,
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setIsOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="text-sm font-semibold text-[#0f2f56] underline decoration-slate-300 underline-offset-2 transition hover:text-[#0a2340]"
      >
        แก้ไข
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div>
                <p className="text-sm font-bold text-slate-900">แก้ไขยอดส่ง</p>
                <p className="mt-1 text-xs text-slate-500">จำนวนส่งเดิม {fmtQty(quantityDelivered)}</p>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                disabled={isPending}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                aria-label="ปิด"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">จำนวนใหม่</span>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-right text-lg font-semibold text-slate-900 outline-none transition focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/10"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">วิธีจัดการส่วนต่าง</span>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as DeliveryAdjustmentMode)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-800 outline-none transition focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/10"
                >
                  <option value="return_to_stock">คืนสต็อก</option>
                  <option value="lost">ของหาย/เสียหาย</option>
                </select>
              </label>

              {error && <p className="text-sm font-medium text-red-600">{error}</p>}
            </div>

            <div className="flex gap-3 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={closeDialog}
                disabled={isPending}
                className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={isPending}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#003366] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#002244] disabled:opacity-50"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Order detail modal

function OrderDetailModal({
  customerName,
  deliveryNumber,
  deliveryDate,
  items,
  billingRecord,
  onClose,
}: {
  customerName: string;
  deliveryNumber: string;
  deliveryDate: string;
  items: DeliveryEditableItem[];
  billingRecord: BillingRecordInfo | null;
  onClose: () => void;
}) {
  const orderGroups = useMemo(() => {
    const map = new Map<string, DeliveryEditableItem[]>();
    for (const item of items) {
      const key = item.orderNumber ?? "__unlinked__";
      const bucket = map.get(key) ?? [];
      bucket.push(item);
      map.set(key, bucket);
    }
    return Array.from(map.entries()).map(([key, orderItems]) => ({
      orderNumber: key === "__unlinked__" ? null : key,
      items: orderItems,
      total: orderItems.reduce((s, i) => s + i.lineTotal, 0),
    }));
  }, [items]);

  const grandTotal = items.reduce((s, i) => s + i.lineTotal, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 flex max-h-[95svh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-3xl">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between bg-[#0f2f56] px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/50">
              รายละเอียดใบจัดส่ง
            </p>
            <p className="mt-1 text-2xl font-bold text-white">{deliveryNumber}</p>
            <p className="mt-1 text-sm text-white/70">
              {customerName} · {fmtDateShort(deliveryDate)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-white/50 transition hover:bg-white/10 hover:text-white"
            aria-label="ปิด"
          >
            <X className="h-5 w-5" strokeWidth={2.2} />
          </button>
        </div>

        {/* Billing warning */}
        {billingRecord && (
          <div className="shrink-0 flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-6 py-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" strokeWidth={2.2} />
            <p className="text-sm font-semibold text-amber-800">
              วางบิลแล้ว · {billingRecord.billingNumber}
              <span className="ml-2 font-normal text-amber-600">
                (ออกเมื่อ {fmtDateShort(billingRecord.billingDate)})
              </span>
            </p>
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {orderGroups.map(({ orderNumber, items: orderItems, total }) => {
            const orderDate = orderNumber ? orderNumberToDate(orderNumber) : null;
            return (
              <div key={orderNumber ?? "__unlinked__"}>
                {/* Order header */}
                <div className="flex items-center justify-between bg-slate-50 px-6 py-3">
                  {orderNumber && orderDate ? (
                    <a
                      href={`/orders?date=${orderDate}`}
                      className="inline-flex items-center gap-1.5 font-mono text-sm font-bold text-indigo-700 transition hover:text-indigo-900"
                    >
                      {orderNumber}
                      <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.2} />
                    </a>
                  ) : (
                    <span className="text-sm font-semibold text-slate-400">
                      ไม่มีออเดอร์อ้างอิง
                    </span>
                  )}
                  <span className="text-sm font-bold text-slate-700">
                    {fmtMoneyBaht(total)}
                  </span>
                </div>

                {/* Product rows */}
                <div className="divide-y divide-slate-50 px-6">
                  {orderItems.map((di) => (
                    <div key={di.id} className="flex items-center gap-4 py-4">
                      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                        {di.imageUrl ? (
                          <Image
                            src={di.imageUrl}
                            alt={di.productName}
                            fill
                            sizes="48px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Package2 className="h-5 w-5 text-slate-300" strokeWidth={1.8} />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold leading-snug text-slate-900">
                          {di.productName}
                        </p>
                        <p className="font-mono text-xs text-slate-400">{di.productSku}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {fmtMoneyBaht(di.unitPrice)} / {di.saleUnitLabel}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <LineItemQtyEditor item={di} />
                        <p className="mt-1 text-sm font-bold text-slate-900">
                          {fmtMoneyBaht(di.lineTotal)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <span className="text-sm font-semibold text-slate-500">ยอดรวมใบจัดส่ง</span>
          <span className="text-2xl font-bold text-slate-950">{fmtMoneyBaht(grandTotal)}</span>
        </div>
      </div>
    </div>
  );
}

// Mobile card (per store) — shown on small screens instead of the table

function DeliveryCustomerCard({
  item,
  onOpenNote,
}: {
  item: DeliveryListItem;
  onOpenNote: (noteId: string) => void;
}) {
  const readOnly = useContext(ReadOnlyCtx);
  const tone = statusTone();

  const noteGroups = useMemo(() => {
    const itemsByNote = new Map<string, DeliveryEditableItem[]>();
    for (const di of item.deliveryItems) {
      const bucket = itemsByNote.get(di.deliveryNoteId) ?? [];
      bucket.push(di);
      itemsByNote.set(di.deliveryNoteId, bucket);
    }
    return item.deliveryNotes.map((note) => ({
      note,
      items: itemsByNote.get(note.id) ?? [],
    }));
  }, [item]);

  const primaryNoteId = noteGroups[0]?.note.id ?? null;
  const deliveryNumberLabel = item.deliveryNotes.map((n) => n.deliveryNumber).join(", ");

  const aggregatedRows = useMemo(() => {
    const deliveredTotals = new Map<string, { lineTotal: number; quantityDelivered: number }>();
    const deliveryImageMap = new Map<string, string>();
    for (const deliveryItem of item.deliveryItems) {
      const key = `${deliveryItem.productId}::${deliveryItem.saleUnitLabel}`;
      const current = deliveredTotals.get(key) ?? { lineTotal: 0, quantityDelivered: 0 };
      current.lineTotal += deliveryItem.lineTotal;
      current.quantityDelivered += deliveryItem.quantityDelivered;
      deliveredTotals.set(key, current);
      if (deliveryItem.imageUrl && !deliveryImageMap.has(key)) {
        deliveryImageMap.set(key, deliveryItem.imageUrl);
      }
    }
    return item.lines
      .map((line) => {
        const key = `${line.productId}::${line.saleUnitLabel}`;
        const delivered = deliveredTotals.get(key) ?? {
          lineTotal: line.deliveredLineTotal,
          quantityDelivered: line.deliveredQuantity,
        };
        const basisQty = delivered.quantityDelivered > 0 ? delivered.quantityDelivered : line.orderedQuantity;
        const basisTotal = delivered.lineTotal > 0 ? delivered.lineTotal : line.orderedLineTotal;
        return {
          ...line,
          editableItems: item.deliveryItems
            .filter((di) => di.productId === line.productId && di.saleUnitLabel === line.saleUnitLabel)
            .map((di) => ({ id: di.id, quantityDelivered: di.quantityDelivered })),
          imageUrl: deliveryImageMap.get(key) ?? null,
          unitPrice: basisQty > 0 ? basisTotal / basisQty : 0,
        };
      })
      .sort((a, b) => a.productName.localeCompare(b.productName, "th"));
  }, [item.deliveryItems, item.lines]);

  return (
    <div className={`overflow-hidden rounded-2xl border-2 bg-white shadow-sm ${tone.accentClass}`}>
      {/* Card header */}
      <div className="bg-[#0f2f56] px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Building2 className="h-4 w-4 shrink-0 text-white/80" strokeWidth={2.1} />
              <p className="truncate font-bold text-white">{item.customerName}</p>
            </div>
            <p className="mt-0.5 font-mono text-xs text-white/60">{item.customerCode} · {deliveryNumberLabel}</p>
          </div>
          <StatusBadge tone={tone} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {item.billingRecord ? (
            <BillingBadge billingNumber={item.billingRecord.billingNumber} />
          ) : (
            <PendingBillingBadge />
          )}
          {primaryNoteId && (
            <button
              type="button"
              onClick={readOnly ? undefined : () => onOpenNote(primaryNoteId)}
              disabled={readOnly}
              className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileText className="h-3.5 w-3.5" strokeWidth={2.2} />
              ดูรายละเอียด
            </button>
          )}
        </div>
      </div>

      {/* Product rows */}
      <div className="divide-y divide-slate-100">
        {aggregatedRows.map((line) => (
          <div key={`${line.productId}::${line.saleUnitLabel}`} className="px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                {line.imageUrl ? (
                  <Image src={line.imageUrl} alt={line.productName} fill sizes="40px" className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Package2 className="h-4 w-4 text-slate-300" strokeWidth={1.8} />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold leading-snug text-slate-900">{line.productName}</p>
                <p className="font-mono text-xs text-slate-400">{line.productSku}</p>
              </div>
              <div className={`shrink-0${readOnly ? " pointer-events-none opacity-40" : ""}`}>
                <GroupQtyPopupEditor items={line.editableItems} quantityDelivered={line.deliveredQuantity} />
              </div>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-xs">
              <span className="text-slate-400">
                {fmtQty(line.orderedQuantity)} {line.saleUnitLabel} · {fmtMoney(line.unitPrice)} บาท
              </span>
              <span className="font-bold text-slate-900">{fmtMoneyBaht(line.deliveredLineTotal)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Subtotal */}
      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2.5">
        <span className="text-xs font-semibold text-slate-500">
          ยอดรวม — {item.customerName}
        </span>
        <span className="font-bold text-slate-900">{fmtMoneyBaht(item.deliveredAmount)}</span>
      </div>
    </div>
  );
}

// Customer section (per store)

function DeliveryCustomerSection({
  item,
  onOpenNote,
}: {
  item: DeliveryListItem;
  onOpenNote: (noteId: string) => void;
}) {
  const readOnly = useContext(ReadOnlyCtx);

  const noteGroups = useMemo(() => {
    const itemsByNote = new Map<string, DeliveryEditableItem[]>();
    for (const di of item.deliveryItems) {
      const bucket = itemsByNote.get(di.deliveryNoteId) ?? [];
      bucket.push(di);
      itemsByNote.set(di.deliveryNoteId, bucket);
    }
    return item.deliveryNotes.map((note) => ({
      note,
      items: itemsByNote.get(note.id) ?? [],
    }));
  }, [item]);

  const deliveryNumberLabel = item.deliveryNotes.map((note) => note.deliveryNumber).join(", ");
  const primaryNoteId = noteGroups[0]?.note.id ?? null;
  const aggregatedRows = useMemo(() => {
    const deliveredTotals = new Map<string, { lineTotal: number; quantityDelivered: number }>();
    const deliveryImageMap = new Map<string, string>();

    for (const deliveryItem of item.deliveryItems) {
      const key = `${deliveryItem.productId}::${deliveryItem.saleUnitLabel}`;
      const current = deliveredTotals.get(key) ?? { lineTotal: 0, quantityDelivered: 0 };
      current.lineTotal += deliveryItem.lineTotal;
      current.quantityDelivered += deliveryItem.quantityDelivered;
      deliveredTotals.set(key, current);
      if (deliveryItem.imageUrl && !deliveryImageMap.has(key)) {
        deliveryImageMap.set(key, deliveryItem.imageUrl);
      }
    }

    return item.lines
      .map((line) => {
        const key = `${line.productId}::${line.saleUnitLabel}`;
        const delivered = deliveredTotals.get(key) ?? {
          lineTotal: line.deliveredLineTotal,
          quantityDelivered: line.deliveredQuantity,
        };
        const basisQty =
          delivered.quantityDelivered > 0 ? delivered.quantityDelivered : line.orderedQuantity;
        const basisTotal = delivered.lineTotal > 0 ? delivered.lineTotal : line.orderedLineTotal;

        return {
          ...line,
          editableItems: item.deliveryItems
            .filter(
              (deliveryItem) =>
                deliveryItem.productId === line.productId &&
                deliveryItem.saleUnitLabel === line.saleUnitLabel,
            )
            .map((deliveryItem) => ({
              id: deliveryItem.id,
              quantityDelivered: deliveryItem.quantityDelivered,
            })),
          imageUrl: deliveryImageMap.get(key) ?? null,
          unitPrice: basisQty > 0 ? basisTotal / basisQty : 0,
        };
      })
      .sort((a, b) => a.productName.localeCompare(b.productName, "th"));
  }, [item.deliveryItems, item.lines]);

  return (
    <>
      {/* Store group header row */}
      <tr>
        <td colSpan={8} className="border-t-2 border-[#0a2340] bg-[#0f2f56] px-4 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-base font-bold text-white">
                <Building2 className="h-4 w-4 shrink-0 text-white/85" strokeWidth={2.1} />
                <span>{item.customerName}</span>
              </span>
              <span className="h-3.5 w-px bg-white/20" aria-hidden="true" />
              <span className="font-mono text-sm font-bold text-white/80">{item.customerCode}</span>
              <span className="h-3.5 w-px bg-white/20" aria-hidden="true" />
              <span className="font-mono text-sm font-bold text-white">{deliveryNumberLabel}</span>
              <span className="h-3.5 w-px bg-white/20" aria-hidden="true" />
              {item.billingRecord ? (
                <BillingBadge billingNumber={item.billingRecord.billingNumber} />
              ) : (
                <PendingBillingBadge />
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {primaryNoteId && (
                <button
                  type="button"
                  onClick={readOnly ? undefined : () => onOpenNote(primaryNoteId)}
                  disabled={readOnly}
                  className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <FileText className="h-3.5 w-3.5" strokeWidth={2.2} />
                  ดูรายละเอียด
                </button>
              )}
            </div>
          </div>
        </td>
      </tr>

      {/* Product rows */}
      {aggregatedRows.map((line, idx) => (
        <tr
          key={`${line.productId}::${line.saleUnitLabel}`}
          className="border-t border-slate-100 text-sm transition hover:bg-slate-50/40"
        >
          <td className="border-r border-slate-100 px-3 py-2 text-center text-xs text-slate-400 tabular-nums">{idx + 1}</td>
          <td className="border-r border-slate-100 px-3 py-2 text-center">
            <p className="font-mono text-xs text-slate-500">{line.productSku}</p>
          </td>
          <td className="border-r border-slate-100 px-3 py-2 text-left font-semibold text-slate-800">
            {line.productName}
          </td>
          <td className="border-r border-slate-100 px-3 py-2 text-center text-slate-600">{line.saleUnitLabel}</td>
          <td className="border-r border-slate-100 px-3 py-2 text-center tabular-nums font-semibold text-slate-600">
            {fmtQty(line.orderedQuantity)}
          </td>
          <td className="border-r border-slate-100 px-3 py-2 text-right tabular-nums text-slate-600 whitespace-nowrap">
            {fmtMoneyBaht(line.unitPrice)}
          </td>
          <td className="border-r border-slate-100 px-3 py-2 text-right tabular-nums font-bold text-slate-900 whitespace-nowrap">
            {fmtMoneyBaht(line.deliveredLineTotal)}
          </td>
          <td className={`px-3 py-2 text-center${readOnly ? " pointer-events-none opacity-40" : ""}`}>
            <GroupQtyPopupEditor
              items={line.editableItems}
              quantityDelivered={line.deliveredQuantity}
            />
          </td>
        </tr>
      ))}

      {/* Store subtotal */}
      <tr className="border-t border-slate-200 bg-slate-50">
        <td
          colSpan={6}
          className="border-r border-slate-200 px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap"
        >
          ยอดรวม — {item.customerName}
        </td>
        <td className="border-r border-slate-200 px-3 py-2 text-right tabular-nums font-bold text-slate-900 whitespace-nowrap">
          {fmtMoneyBaht(item.deliveredAmount)}
        </td>
        <td className="px-3 py-2" />
      </tr>
    </>
  );
}

// -- Day section --

function DeliveryTableCols() {
  return (
    <colgroup>
      <col style={{ width: 40 }} />
      <col style={{ width: 112 }} />
      <col />
      <col style={{ width: 64 }} />
      <col style={{ width: 80 }} />
      <col style={{ width: 112 }} />
      <col style={{ width: 112 }} />
      <col style={{ width: 64 }} />
    </colgroup>
  );
}

function DeliveryDayTable({
  date,
  items,
  summary,
}: {
  date: string;
  items: DeliveryListItem[];
  summary: DeliveryDaySummary;
}) {
  const [modalState, setModalState] = useState<{
    item: DeliveryListItem;
    noteId: string;
  } | null>(null);

  const openGroup = useMemo(() => {
    if (!modalState) return null;
    const { item, noteId } = modalState;
    const itemsByNote = new Map<string, DeliveryEditableItem[]>();
    for (const di of item.deliveryItems) {
      const bucket = itemsByNote.get(di.deliveryNoteId) ?? [];
      bucket.push(di);
      itemsByNote.set(di.deliveryNoteId, bucket);
    }
    const noteGroups = item.deliveryNotes.map((note) => ({
      note,
      items: itemsByNote.get(note.id) ?? [],
    }));
    return noteGroups.find((g) => g.note.id === noteId) ?? null;
  }, [modalState]);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:rounded">
      {/* Day bar — sticky on desktop only; mobile just flows in place */}
      <div className="z-20 flex items-center gap-x-3 border-b border-l-4 border-slate-200 border-l-[#003366] bg-slate-50 px-4 py-2.5 md:sticky md:top-0">
        <span className="text-sm font-bold text-[#003366]">{fmtDateLabel(date)}</span>
        <span className="hidden text-slate-300 sm:inline">·</span>
        <span className="text-xs font-medium text-slate-500">{summary.count.toLocaleString("th-TH")} ร้านค้า</span>
        <div className="ml-auto hidden shrink-0 items-center gap-2 sm:flex">
          <PrintPackingListButton date={date} />
          <PrintDailyDeliveryButton date={date} />
        </div>
      </div>

      {/* ── Mobile card view (< md) ── */}
      <div className="space-y-3 bg-slate-50 p-3 md:hidden">
        {items.map((item) => (
          <DeliveryCustomerCard
            key={`${date}::${item.customerId}`}
            item={item}
            onOpenNote={(noteId) => setModalState({ item, noteId })}
          />
        ))}

        {/* Day total */}
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">ยอดรวมทุกร้านค้า</p>
          </div>
          <p className="text-lg font-bold text-slate-950">{fmtMoneyBaht(summary.totalDeliveredAmount)}</p>
        </div>
      </div>

      {/* ── Desktop table view (≥ md) ── */}
      <div className="hidden md:block">
        <div>
          {/* Sticky column header */}
          <div className="sticky top-[41px] z-10 overflow-hidden border-b border-slate-200">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse table-fixed text-sm">
                <DeliveryTableCols />
                <thead>
                  <tr className="bg-slate-100 text-xs font-semibold uppercase tracking-[0.09em]">
                    <th className="border-r border-slate-200 px-3 py-2.5 text-center text-slate-600 whitespace-nowrap">#</th>
                    <th className="border-r border-slate-200 px-3 py-2.5 text-left text-slate-600 whitespace-nowrap">รหัสสินค้า</th>
                    <th className="border-r border-slate-200 px-3 py-2.5 text-center text-slate-600 whitespace-nowrap">สินค้า</th>
                    <th className="border-r border-slate-200 px-3 py-2.5 text-center text-slate-600 whitespace-nowrap">หน่วย</th>
                    <th className="border-r border-slate-200 px-3 py-2.5 text-center text-slate-600 whitespace-nowrap">ออเดอร์</th>
                    <th className="border-r border-slate-200 px-3 py-2.5 text-center text-slate-600 whitespace-nowrap">ราคา/หน่วย</th>
                    <th className="border-r border-slate-200 px-3 py-2.5 text-center text-slate-600 whitespace-nowrap">ยอดเงิน</th>
                    <th className="px-3 py-2.5 text-center text-slate-600 whitespace-nowrap">จัดการ</th>
                  </tr>
                </thead>
              </table>
            </div>
          </div>

          {/* Table body */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse table-fixed text-sm">
              <DeliveryTableCols />
              <tbody>
                {items.map((item) => (
                  <DeliveryCustomerSection
                    key={`${date}::${item.customerId}`}
                    item={item}
                    onOpenNote={(noteId) => setModalState({ item, noteId })}
                  />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-100">
                  <td
                    colSpan={6}
                    className="border-r border-slate-200 px-4 py-3 text-right text-sm font-bold uppercase tracking-wide text-slate-700 whitespace-nowrap"
                  >
                    <span>ยอดรวมทุกร้านค้า</span>
                  </td>
                  <td className="border-r border-slate-200 px-3 py-3 text-right tabular-nums text-base font-bold text-slate-950 whitespace-nowrap">
                    {fmtMoneyBaht(summary.totalDeliveredAmount)}
                  </td>
                  <td className="px-3 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* Modal */}
      {modalState && openGroup && (
        <OrderDetailModal
          customerName={modalState.item.customerName}
          deliveryNumber={openGroup.note.deliveryNumber}
          deliveryDate={modalState.item.deliveryDate}
          items={openGroup.items}
          billingRecord={modalState.item.billingRecord}
          onClose={() => setModalState(null)}
        />
      )}
    </section>
  );
}


// Main board

export function DeliveryBoard({
  items,
  summary,
  from,
  to,
  q,
  readOnly = false,
}: {
  items: DeliveryListItem[];
  summary: DeliveryDaySummary;
  from: string;
  to: string;
  q: string;
  readOnly?: boolean;
}) {
  const isRange = from !== to;

  const sections = useMemo(() => {
    const groupedByDate = new Map<string, DeliveryListItem[]>();
    for (const item of items) {
      const bucket = groupedByDate.get(item.deliveryDate) ?? [];
      bucket.push(item);
      groupedByDate.set(item.deliveryDate, bucket);
    }
    return Array.from(groupedByDate.entries()).map(([date, dayItems]) => ({
      date,
      items: dayItems,
      summary: summarize(dayItems),
    }));
  }, [items]);

  return (
    <ReadOnlyCtx.Provider value={readOnly}>
      <div className="space-y-5">
        {/* Desktop search form */}
        <div className="hidden md:block">
          <DeliverySearchForm from={from} to={to} q={q} />
        </div>

        {/* Mobile search drawer */}
        <MobileSearchDrawer title="ค้นหาใบจัดส่ง">
          <DeliverySearchForm from={from} to={to} q={q} />
        </MobileSearchDrawer>

        <SummaryStrip summary={summary} />

        {items.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
            <Truck className="h-10 w-10 text-slate-300" strokeWidth={1.5} />
            <p className="font-semibold text-slate-500">ไม่พบข้อมูลการจัดส่งในช่วงที่เลือก</p>
            <p className="text-sm text-slate-400">ลองเปลี่ยนช่วงวันที่หรือคำค้นหา</p>
          </div>
        )}

        {isRange ? (
          <div className="space-y-4">
            {sections.map((section) => (
              <DeliveryDayTable
                key={section.date}
                date={section.date}
                items={section.items}
                summary={section.summary}
              />
            ))}
          </div>
        ) : (
          items.length > 0 && (
            <DeliveryDayTable date={from} items={items} summary={summary} />
          )
        )}
      </div>
    </ReadOnlyCtx.Provider>
  );
}
