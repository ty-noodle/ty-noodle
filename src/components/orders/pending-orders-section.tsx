"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AlertTriangle, Building2, CheckCircle2, Layers3, Loader2, Package2, Truck, X } from "lucide-react";
import {
  createDeliveryNoteAction,
  getBatchStoreDeliveryDataAction,
  getDeliveryFormDataAction,
  getStoreDeliveryDataAction,
} from "@/app/orders/delivery-actions";
import type { CreateDeliveryState } from "@/app/orders/delivery-actions";
import type { DeliveryFormData, DeliveryItemData, PendingOrder } from "@/lib/delivery/admin";

// Helpers

function formatDate(isoDate: string) {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${parseInt(y, 10) + 543}`;
}

function formatNum(value: number, fractions = 3) {
  return value.toLocaleString("th-TH", { maximumFractionDigits: fractions });
}

function formatMoney(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPendingLine(item: PendingOrder["pendingItems"][number]) {
  return `ค้างส่ง: ${item.productName} ${formatNum(item.remainingQty)} ${item.saleUnitLabel}`;
}

type StoreSummaryForBatch = {
  customerId: string;
  customerName: string;
  customerCode: string;
  orderRounds: number;
  totalAmount: number;
};

type GroupedStoreItem = DeliveryItemData & {
  customerId: string;
  groupKey: string;
  orderId: string;
  orderItems: Array<DeliveryItemData & { customerId: string; groupKey: string; orderId: string }>;
  totalRemaining: number;
};

type BatchStoreGroup = StoreSummaryForBatch & {
  groupedItems: GroupedStoreItem[];
  orders: DeliveryFormData[];
};

function toGroupKey(productId: string, saleUnitLabel: string) {
  return `${productId}::${saleUnitLabel}`;
}

function buildGroupedItemsForOrders(orders: DeliveryFormData[]): GroupedStoreItem[] {
  const allItems = orders.flatMap((order) =>
    order.items.map((item) => ({
      ...item,
      customerId: order.customerId,
      groupKey: toGroupKey(item.productId, item.saleUnitLabel),
      orderId: order.orderId,
    })),
  );

  const grouped = new Map<string, typeof allItems>();
  for (const item of allItems) {
    if (!grouped.has(item.groupKey)) {
      grouped.set(item.groupKey, []);
    }
    grouped.get(item.groupKey)?.push(item);
  }

  return Array.from(grouped.values())
    .map((items) => {
      const totalRemaining = items.reduce(
        (sum, item) =>
          sum + (item.saleUnitRatio > 0 ? item.remainingBaseQty / item.saleUnitRatio : 0),
        0,
      );
      return {
        ...items[0],
        orderItems: items,
        totalRemaining,
      };
    })
    .sort((a, b) => a.productName.localeCompare(b.productName, "th"));
}

// Delivery Modal

function DeliveryModal({
  orderId,
  onClose,
}: {
  orderId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [formData, setFormData] = useState<DeliveryFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const [actionState, setActionState] = useState<CreateDeliveryState | null>(null);

  // Load order items on mount
  useEffect(() => {
    getDeliveryFormDataAction(orderId).then((data) => {
      setFormData(data);
      if (data) {
        const init: Record<string, string> = {};
        for (const item of data.items) {
          const defaultQty =
            item.saleUnitRatio > 0 ? item.remainingBaseQty / item.saleUnitRatio : 0;
          init[item.orderItemId] =
            defaultQty > 0 ? formatNum(defaultQty, 3).replace(/,/g, "") : "";
        }
        setQtys(init);
      }
      setLoading(false);
    });
  }, [orderId]);

  const overStockItems: DeliveryItemData[] =
    formData?.items.filter((item) => {
      const qty = parseFloat(qtys[item.orderItemId] ?? "0");
      return qty > 0 && qty * item.saleUnitRatio > item.availableStock;
    }) ?? [];

  const hasOverStock = overStockItems.length > 0;
  const hasAnyQty = formData?.items.some(
    (item) => parseFloat(qtys[item.orderItemId] ?? "0") > 0,
  );

  const unpricedActiveItems = formData?.items.filter(
    (item) => item.unitPrice === 0 && parseFloat(qtys[item.orderItemId] ?? "0") > 0,
  ) ?? [];

  async function handleSubmit() {
    if (!formData || hasOverStock || !hasAnyQty || isPending) return;

    if (unpricedActiveItems.length > 0) {
      const names = unpricedActiveItems.map((i) => `  • ${i.productName} (${i.saleUnitLabel})`).join("\n");
      const confirmed = window.confirm(
        `⚠️ รายการต่อไปนี้ยังไม่ได้ตั้งราคา (${unpricedActiveItems.length} รายการ)\n\n${names}\n\nใบส่งของจะคิดราคาเป็น 0 บาท\nต้องการยืนยันต่อไหม?`
      );
      if (!confirmed) return;
    }

    const itemsPayload = formData.items
      .map((item) => ({
        orderItemId: item.orderItemId,
        productId: item.productId,
        productSaleUnitId: item.productSaleUnitId,
        saleUnitLabel: item.saleUnitLabel,
        saleUnitRatio: item.saleUnitRatio,
        quantityDelivered: parseFloat(qtys[item.orderItemId] ?? "0") || 0,
        unitPrice: item.unitPrice,
      }))
      .filter((i) => i.quantityDelivered > 0);

    const fd = new FormData();
    fd.set("orderIds", JSON.stringify([formData.orderId]));
    fd.set("customerId", formData.customerId);
    fd.set("notes", notes);
    fd.set("items", JSON.stringify(itemsPayload));

    startTransition(async () => {
      const result = await createDeliveryNoteAction(null, fd);
      setActionState(result);
      if (result.status === "success") {
        router.refresh();
        setTimeout(onClose, 1200);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-3xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-t-3xl border-b border-slate-100 bg-white px-6 py-5">
          <div>
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-[#003366]" strokeWidth={2.2} />
              <h2 className="text-lg font-bold text-slate-950">สร้างใบส่งของ</h2>
            </div>
            {formData && (
              <p className="mt-0.5 text-sm text-slate-500">
                {formData.customerName} ·{" "}
                <span className="font-mono">{formData.orderNumber}</span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" strokeWidth={2.4} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-slate-300" strokeWidth={2} />
            </div>
          ) : !formData ? (
            <p className="py-8 text-center text-sm text-slate-500">โหลดข้อมูลไม่สำเร็จ</p>
          ) : (
            <div className="space-y-3">
              {formData.items.map((item) => {
                const qty = qtys[item.orderItemId] ?? "";
                const qtyNum = parseFloat(qty) || 0;
                const qtyBase = qtyNum * item.saleUnitRatio;
                const isOver = qtyNum > 0 && qtyBase > item.availableStock;
                const availableSaleUnits =
                  item.saleUnitRatio > 0 ? item.availableStock / item.saleUnitRatio : 0;

                return (
                  <div
                    key={item.orderItemId}
                    className={`rounded-2xl border p-4 transition ${
                      isOver ? "border-red-200 bg-red-50" : "border-slate-100 bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-950">{item.productName}</p>
                        <p className="mt-0.5 font-mono text-xs text-slate-400">{item.productSku}</p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span>
                            สั่ง{" "}
                            <span className="font-semibold text-slate-700">
                              {formatNum(item.orderedQty)} {item.saleUnitLabel}
                            </span>
                          </span>
                          {item.deliveredBaseQty > 0 && (
                            <span>
                              ส่งแล้ว{" "}
                              <span className="font-semibold text-emerald-600">
                                {formatNum(item.deliveredBaseQty / item.saleUnitRatio)}{" "}
                                {item.saleUnitLabel}
                              </span>
                            </span>
                          )}
                          <span>
                            สต็อก{" "}
                            <span
                              className={`font-semibold ${
                                item.availableStock <= 0 ? "text-red-600" : "text-slate-700"
                              }`}
                            >
                              {formatNum(item.availableStock)} {item.productUnit}
                            </span>
                          </span>
                        </div>
                      </div>

                      {/* Qty input */}
                      <div className="flex shrink-0 items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={qty}
                          onChange={(e) =>
                            setQtys((prev) => ({
                              ...prev,
                              [item.orderItemId]: e.target.value,
                            }))
                          }
                          className={`w-24 rounded-xl border px-3 py-2 text-right text-base font-bold outline-none transition focus:ring-2 ${
                            isOver
                              ? "border-red-300 bg-white text-red-700 focus:ring-red-200"
                              : "border-slate-200 bg-white text-slate-950 focus:border-[#003366] focus:ring-[#003366]/10"
                          }`}
                          placeholder="0"
                        />
                        <span className="min-w-[3rem] text-sm text-slate-500">
                          {item.saleUnitLabel}
                        </span>
                      </div>
                    </div>

                    {/* No-price warning */}
                    {item.unitPrice === 0 && (
                      <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} />
                        <span>ยังไม่ได้ตั้งราคาสินค้านี้กับลูกค้า ใบส่งของจะคิดเป็น 0 บาท</span>
                      </div>
                    )}
                    {/* Over-stock warning */}
                    {isOver && (
                      <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-100 px-3 py-2.5 text-xs text-red-700">
                        <AlertTriangle
                          className="mt-0.5 h-3.5 w-3.5 shrink-0"
                          strokeWidth={2.4}
                        />
                        <span>
                          สต็อกมีแค่{" "}
                          <span className="font-bold">
                            {formatNum(availableSaleUnits)} {item.saleUnitLabel}
                          </span>{" "}
                          แต่กรอก{" "}
                          <span className="font-bold">
                            {qtyNum} {item.saleUnitLabel}
                          </span>{" "}
                          -{" "}
                          <a
                            href="/settings/stock?receive=1"
                            className="font-bold underline underline-offset-2"
                          >
                            ไปรับเข้าสต็อก
                          </a>
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Notes */}
              <div className="pt-1">
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                  หมายเหตุ (ถ้ามี)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="เช่น ส่งรอบเช้า"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/10"
                />
              </div>
            </div>
          )}

          {/* Action state feedback */}
          {actionState?.status === "error" && (
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.4} />
              {actionState.message}
            </div>
          )}
          {actionState?.status === "success" && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-emerald-50 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2.4} />
                สร้าง {actionState.deliveryNumber} เรียบร้อยแล้ว
              </div>
              {actionState.deliveryId && (
                <a
                  href={`/orders/delivery-notes/${actionState.deliveryId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                >
                  <Truck className="h-3.5 w-3.5" strokeWidth={2.2} />
                  พิมพ์ใบส่งของ
                </a>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-slate-100 bg-white px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            ยกเลิก
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!formData || hasOverStock || !hasAnyQty || isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-[#003366] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#002244] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                กำลังสร้าง...
              </>
            ) : (
              <>
                <Truck className="h-4 w-4" strokeWidth={2.2} />
                ยืนยันใบส่งของ
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Store-level delivery modal (combines all order rounds of one store)

function StoreDeliveryModal({
  customerName,
  orders,
  onClose,
}: {
  customerName: string;
  orders: DeliveryFormData[];
  onClose: () => void;
}) {
  const router = useRouter();
  // All items across all orders, each tagged with orderId
  const allItems = orders.flatMap((order) =>
    order.items.map((item) => ({ ...item, orderId: order.orderId, customerId: order.customerId })),
  );

  // Group by productId: one display row per product
  const groupedItems = (() => {
    const map = new Map<string, typeof allItems>();
    for (const item of allItems) {
      if (!map.has(item.productId)) map.set(item.productId, []);
      map.get(item.productId)!.push(item);
    }
    return Array.from(map.values()).map((items) => {
      const totalRemaining = items.reduce(
        (sum, i) => sum + (i.saleUnitRatio > 0 ? i.remainingBaseQty / i.saleUnitRatio : 0),
        0,
      );
      return { ...items[0], totalRemaining, orderItems: items };
    });
  })();

  // qtys keyed by productId
  const [qtys, setQtys] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const group of groupedItems) {
      init[group.productId] =
        group.totalRemaining > 0 ? formatNum(group.totalRemaining, 3).replace(/,/g, "") : "";
    }
    return init;
  });
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const [results, setResults] = useState<CreateDeliveryState[]>([]);

  const overStockGroups = groupedItems.filter((g) => {
    const qty = parseFloat(qtys[g.productId] ?? "0");
    return qty > 0 && qty * g.saleUnitRatio > g.availableStock;
  });

  const hasOverStock = overStockGroups.length > 0;
  const hasAnyQty = groupedItems.some((g) => parseFloat(qtys[g.productId] ?? "0") > 0);

  const unpricedActiveGroups = groupedItems.filter(
    (g) => g.unitPrice === 0 && parseFloat(qtys[g.productId] ?? "0") > 0,
  );

  const anySuccess = results.some((r) => r.status === "success");
  const anyError = results.filter((r) => r.status === "error");

  async function handleSubmit() {
    if (hasOverStock || !hasAnyQty || isPending) return;

    if (unpricedActiveGroups.length > 0) {
      const names = unpricedActiveGroups.map((g) => `  • ${g.productName} (${g.saleUnitLabel})`).join("\n");
      const confirmed = window.confirm(
        `⚠️ รายการต่อไปนี้ยังไม่ได้ตั้งราคา (${unpricedActiveGroups.length} รายการ)\n\n${names}\n\nใบส่งของจะคิดราคาเป็น 0 บาท\nต้องการยืนยันต่อไหม?`
      );
      if (!confirmed) return;
    }

    startTransition(async () => {
      // Distribute qty greedily across order items (earliest order first)
      // then submit ALL items in ONE delivery note
      const toDistribute = new Map<string, number>();
      for (const g of groupedItems) {
        toDistribute.set(g.productId, parseFloat(qtys[g.productId] ?? "0") || 0);
      }

      const allItemsPayload = [];
      for (const order of orders) {
        for (const item of order.items) {
          const remaining = toDistribute.get(item.productId) ?? 0;
          if (remaining <= 0) continue;
          const itemMax = item.saleUnitRatio > 0 ? item.remainingBaseQty / item.saleUnitRatio : 0;
          const qty = Math.min(remaining, itemMax);
          if (qty <= 0) continue;
          toDistribute.set(item.productId, remaining - qty);
          allItemsPayload.push({
            orderItemId: item.orderItemId,
            productId: item.productId,
            productSaleUnitId: item.productSaleUnitId,
            saleUnitLabel: item.saleUnitLabel,
            saleUnitRatio: item.saleUnitRatio,
            quantityDelivered: qty,
            unitPrice: item.unitPrice,
          });
        }
      }

      const fd = new FormData();
      fd.set("orderIds", JSON.stringify(orders.map((o) => o.orderId)));
      fd.set("customerId", orders[0].customerId);
      fd.set("notes", notes);
      fd.set("items", JSON.stringify(allItemsPayload));

      const result = await createDeliveryNoteAction(null, fd);
      setResults([result]);
        if (result.status === "success") {
          router.refresh();
          setTimeout(onClose, 1400);
        }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-5xl sm:rounded-3xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-t-3xl border-b border-slate-100 bg-white px-6 py-5">
          <div>
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-[#003366]" strokeWidth={2.2} />
              <h2 className="text-lg font-bold text-slate-950">สร้างใบส่งของ</h2>
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              {customerName}
              {orders.length > 1 && (
                <span className="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                  {orders.length} รอบออเดอร์
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" strokeWidth={2.4} />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 sm:px-6 sm:py-5">

        {/* ── Mobile card view (< sm) ── */}
        <div className="space-y-2 sm:hidden">
          {groupedItems.map((item) => {
            const qty = qtys[item.productId] ?? "";
            const qtyNum = parseFloat(qty) || 0;
            const qtyBase = qtyNum * item.saleUnitRatio;
            const isOver = qtyNum > 0 && qtyBase > item.availableStock;
            const availableSaleUnits =
              item.saleUnitRatio > 0 ? item.availableStock / item.saleUnitRatio : 0;
            const lineTotal = qtyNum * item.unitPrice;

            return (
              <div
                key={item.orderItemId}
                className={`rounded-2xl border p-3 ${isOver ? "border-red-200 bg-red-50" : "border-slate-100 bg-slate-50"}`}
              >
                {/* Product row */}
                <div className="flex items-center gap-3">
                  {item.imageUrl ? (
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-slate-100">
                      <Image src={item.imageUrl} alt={item.productName} fill className="object-cover" sizes="40px" />
                    </div>
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-slate-100">
                      <Package2 className="h-4 w-4 text-slate-300" strokeWidth={1.8} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold leading-snug text-slate-900">{item.productName}</p>
                    <p className="font-mono text-xs text-slate-400">{item.productSku}</p>
                    {item.unitPrice === 0 && (
                      <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                        <AlertTriangle className="h-2.5 w-2.5 shrink-0" strokeWidth={2.4} />
                        ยังไม่ตั้งราคา
                      </div>
                    )}
                  </div>
                  {/* Qty input */}
                  <div className="flex shrink-0 items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={qty}
                      onChange={(e) =>
                        setQtys((prev) => ({ ...prev, [item.productId]: e.target.value }))
                      }
                      className={`w-20 rounded-xl border px-2 py-2 text-center text-sm font-bold outline-none transition focus:ring-2 ${
                        isOver
                          ? "border-red-300 bg-white text-red-700 focus:ring-red-200"
                          : "border-slate-200 bg-white text-slate-950 focus:border-[#003366] focus:ring-[#003366]/10"
                      }`}
                      placeholder="0"
                    />
                    <span className="text-xs text-slate-500">{item.saleUnitLabel}</span>
                  </div>
                </div>

                {/* Info row */}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="text-slate-500">
                    สต็อก{" "}
                    <span className={`font-semibold ${item.availableStock <= 0 ? "text-red-600" : "text-slate-700"}`}>
                      {formatNum(item.availableStock)} {item.productUnit}
                    </span>
                  </span>
                  <span className="text-slate-500">
                    ราคา{" "}
                    <span className="font-semibold text-slate-700">
                      {item.unitPrice > 0 ? `${formatMoney(item.unitPrice)} บาท` : "-"}
                    </span>
                  </span>
                  {lineTotal > 0 && (
                    <span className="ml-auto font-bold text-slate-900">{formatMoney(lineTotal)} บาท</span>
                  )}
                </div>

                {isOver && (
                  <p className="mt-1.5 text-xs text-red-600">
                    มีแค่ {formatNum(availableSaleUnits)} {item.saleUnitLabel}{" "}
                    <a href="/settings/stock?receive=1" className="font-bold underline">รับเข้าสต็อก</a>
                  </p>
                )}
              </div>
            );
          })}

          {/* Mobile total */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2.5">
            <span className="text-sm font-semibold text-slate-600">รวมทั้งหมด</span>
            <span className="text-base font-bold text-slate-950">
              {formatMoney(
                groupedItems.reduce((sum, item) => sum + (parseFloat(qtys[item.productId] ?? "0") || 0) * item.unitPrice, 0)
              )} บาท
            </span>
          </div>
        </div>

        {/* ── Desktop table view (≥ sm) ── */}
        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 sm:block">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="border-b border-r border-slate-200 px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  รหัส
                </th>
                <th className="border-b border-r border-slate-200 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  สินค้า
                </th>
                <th className="border-b border-r border-slate-200 px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  จำนวน
                </th>
                <th className="border-b border-r border-slate-200 px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  หน่วย
                </th>
                <th className="border-b border-r border-slate-200 px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  สต็อก
                </th>
                <th className="border-b border-r border-slate-200 px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  ราคา/หน่วย
                </th>
                <th className="border-b border-slate-200 px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  รวมยอดเงิน
                </th>
              </tr>
            </thead>
            <tbody>
              {groupedItems.map((item, idx) => {
                const qty = qtys[item.productId] ?? "";
                const qtyNum = parseFloat(qty) || 0;
                const qtyBase = qtyNum * item.saleUnitRatio;
                const isOver = qtyNum > 0 && qtyBase > item.availableStock;
                const availableSaleUnits =
                  item.saleUnitRatio > 0 ? item.availableStock / item.saleUnitRatio : 0;
                const lineTotal = qtyNum * item.unitPrice;
                const rowBorder = idx < groupedItems.length - 1 ? "border-b border-slate-200" : "";

                return (
                  <tr
                    key={item.orderItemId}
                    className={isOver ? "bg-red-50" : idx % 2 === 1 ? "bg-slate-50/40" : "bg-white"}
                  >
                    <td className={`border-r border-slate-200 px-3 py-3 text-center font-mono text-xs text-slate-500 ${rowBorder}`}>
                      {item.productSku}
                    </td>
                    <td className={`border-r border-slate-200 px-3 py-3 ${rowBorder}`}>
                      <div className="flex items-center gap-2.5">
                        {item.imageUrl ? (
                          <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-slate-100">
                            <Image src={item.imageUrl} alt={item.productName} fill className="object-cover" sizes="36px" />
                          </div>
                        ) : (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50">
                            <Package2 className="h-4 w-4 text-slate-300" strokeWidth={1.8} />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold leading-snug text-slate-900">{item.productName}</p>
                          {item.unitPrice === 0 && (
                            <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                              <AlertTriangle className="h-2.5 w-2.5 shrink-0" strokeWidth={2.4} />
                              ยังไม่ตั้งราคา
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className={`border-r border-slate-200 px-2 py-3 ${rowBorder}`}>
                      <div className="flex flex-col items-center gap-0.5">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={qty}
                          onChange={(e) =>
                            setQtys((prev) => ({ ...prev, [item.productId]: e.target.value }))
                          }
                          className={`w-20 rounded-lg border px-2 py-1.5 text-center text-sm font-bold outline-none transition focus:ring-2 ${
                            isOver
                              ? "border-red-300 bg-white text-red-700 focus:ring-red-200"
                              : "border-slate-200 bg-white text-slate-950 focus:border-[#003366] focus:ring-[#003366]/10"
                          }`}
                          placeholder="0"
                        />
                        {isOver && (
                          <p className="text-center text-[10px] text-red-600">
                            มีแค่ {formatNum(availableSaleUnits)}{" "}
                            <a href="/settings/stock?receive=1" className="font-bold underline">
                              รับเข้า
                            </a>
                          </p>
                        )}
                      </div>
                    </td>
                    <td className={`border-r border-slate-200 px-3 py-3 text-center text-sm text-slate-600 ${rowBorder}`}>
                      {item.saleUnitLabel}
                    </td>
                    <td className={`border-r border-slate-200 px-3 py-3 text-right ${rowBorder}`}>
                      <span className={`text-sm font-medium ${item.availableStock <= 0 ? "text-red-600" : "text-slate-700"}`}>
                        {formatNum(item.availableStock)}
                      </span>
                      <span className="ml-1 text-xs text-slate-400">{item.productUnit}</span>
                    </td>
                    <td className={`border-r border-slate-200 px-3 py-3 text-right text-sm text-slate-700 ${rowBorder}`}>
                      {item.unitPrice > 0 ? formatMoney(item.unitPrice) : <span className="text-slate-300">-</span>}
                    </td>
                    <td className={`px-3 py-3 text-right text-sm font-semibold ${lineTotal > 0 ? "text-slate-900" : "text-slate-300"} ${rowBorder}`}>
                      {lineTotal > 0 ? formatMoney(lineTotal) : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50">
                <td colSpan={6} className="px-3 py-3 text-right text-sm font-semibold text-slate-600">
                  รวมทั้งหมด
                </td>
                <td className="px-3 py-3 text-right text-base font-bold text-slate-950">
                  {formatMoney(
                    groupedItems.reduce((sum, item) => sum + (parseFloat(qtys[item.productId] ?? "0") || 0) * item.unitPrice, 0)
                  )} บาท
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

          {/* Notes */}

          <div className="mt-4 pt-1">
            <label className="mb-1.5 block text-xs font-semibold text-slate-500">
              หมายเหตุ (ถ้ามี)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="เช่น ส่งรอบเช้า"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/10"
            />
          </div>

          {/* Results */}
          {anyError.length > 0 && (
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.4} />
              {anyError[0].message}
            </div>
          )}
          {anySuccess && (
            <div className="mt-4 space-y-2 rounded-xl bg-emerald-50 px-4 py-3">
              {results
                .filter((r) => r.status === "success")
                .map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2.4} />
                      สร้าง {r.deliveryNumber} เรียบร้อยแล้ว
                    </div>
                    {r.deliveryId && (
                      <a
                        href={`/orders/delivery-notes/${r.deliveryId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                      >
                        <Truck className="h-3.5 w-3.5" strokeWidth={2.2} />
                        พิมพ์ใบส่งของ
                      </a>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-slate-100 bg-white px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={hasOverStock || !hasAnyQty || isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-[#003366] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#002244] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                กำลังสร้าง...
              </>
            ) : (
              <>
                <Truck className="h-4 w-4" strokeWidth={2.2} />
                ยืนยันใบส่งของ
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function AllStoresDeliveryModal({
  date,
  groups,
  onClose,
}: {
  date: string;
  groups: BatchStoreGroup[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [qtysByStore, setQtysByStore] = useState<Record<string, Record<string, string>>>(() => {
    const init: Record<string, Record<string, string>> = {};
    for (const group of groups) {
      const itemQtys: Record<string, string> = {};
      for (const item of group.groupedItems) {
        itemQtys[item.groupKey] =
          item.totalRemaining > 0 ? formatNum(item.totalRemaining, 3).replace(/,/g, "") : "";
      }
      init[group.customerId] = itemQtys;
    }
    return init;
  });
  const [notesByStore, setNotesByStore] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const [results, setResults] = useState<
    Array<{ customerId: string; customerName: string; state: CreateDeliveryState }>
  >([]);

  const productStockStatus = useMemo(() => {
    const selectedBaseByProduct = new Map<string, number>();
    const pendingBaseByProduct = new Map<string, number>();
    const availableBaseByProduct = new Map<string, number>();

    for (const group of groups) {
      const qtyMap = qtysByStore[group.customerId] ?? {};
      for (const item of group.groupedItems) {
        const selectedQty = parseFloat(qtyMap[item.groupKey] ?? "0") || 0;
        const selectedBase = selectedQty * item.saleUnitRatio;
        if (selectedBase > 0) {
          selectedBaseByProduct.set(
            item.productId,
            (selectedBaseByProduct.get(item.productId) ?? 0) + selectedBase,
          );
        }

        const pendingBaseInScope = item.orderItems.reduce(
          (sum, orderItem) => sum + orderItem.remainingBaseQty,
          0,
        );
        pendingBaseByProduct.set(
          item.productId,
          (pendingBaseByProduct.get(item.productId) ?? 0) + pendingBaseInScope,
        );

        const currentAvailable = availableBaseByProduct.get(item.productId) ?? 0;
        availableBaseByProduct.set(
          item.productId,
          Math.max(currentAvailable, item.availableStock),
        );
      }
    }

    const overProducts = new Set<string>();
    for (const [productId, selectedBase] of selectedBaseByProduct.entries()) {
      const pendingBase = pendingBaseByProduct.get(productId) ?? 0;
      const availableBase = availableBaseByProduct.get(productId) ?? 0;
      // In this flow, "pending in scope" is often already reserved for these submitted orders.
      // Allow deliverable pool = available now + pending in the selected scope.
      const maxDeliverableBase = availableBase + pendingBase;
      if (selectedBase > maxDeliverableBase + 0.000001) {
        overProducts.add(productId);
      }
    }

    return {
      overProducts,
      selectedBaseByProduct,
    };
  }, [groups, qtysByStore]);

  const overStockRows = groups.flatMap((group) =>
    group.groupedItems
      .filter((item) => {
        const qty = parseFloat(qtysByStore[group.customerId]?.[item.groupKey] ?? "0");
        return qty > 0 && productStockStatus.overProducts.has(item.productId);
      })
      .map((item) => ({ customerName: group.customerName, item })),
  );

  const hasOverStock = overStockRows.length > 0;
  const storesWithQty = groups.filter((group) =>
    group.groupedItems.some(
      (item) => parseFloat(qtysByStore[group.customerId]?.[item.groupKey] ?? "0") > 0,
    ),
  );
  const hasAnyQty = storesWithQty.length > 0;

  const unpricedActiveRows = groups.flatMap((group) =>
    group.groupedItems
      .filter(
        (item) =>
          item.unitPrice === 0 &&
          parseFloat(qtysByStore[group.customerId]?.[item.groupKey] ?? "0") > 0,
      )
      .map((item) => ({ customerName: group.customerName, item })),
  );

  function setQtyValue(customerId: string, groupKey: string, value: string) {
    setQtysByStore((prev) => ({
      ...prev,
      [customerId]: {
        ...(prev[customerId] ?? {}),
        [groupKey]: value,
      },
    }));
  }

  function nudgeQty(customerId: string, groupKey: string, delta: number) {
    const current = parseFloat(qtysByStore[customerId]?.[groupKey] ?? "0") || 0;
    const next = Math.max(0, current + delta);
    setQtyValue(customerId, groupKey, String(next));
  }

  async function handleSubmit() {
    if (!hasAnyQty || hasOverStock || isPending) return;

    if (unpricedActiveRows.length > 0) {
      const lines = unpricedActiveRows
        .slice(0, 12)
        .map(({ customerName, item }) => `  • ${customerName}: ${item.productName}`)
        .join("\n");
      const moreText =
        unpricedActiveRows.length > 12
          ? `\n  • และอีก ${unpricedActiveRows.length - 12} รายการ`
          : "";
      const confirmed = window.confirm(
        `⚠️ มีรายการที่ยังไม่ได้ตั้งราคา ${unpricedActiveRows.length} รายการ\n\n${lines}${moreText}\n\nระบบจะคิดราคาเป็น 0 บาทในรายการเหล่านี้\nต้องการยืนยันต่อหรือไม่?`,
      );
      if (!confirmed) return;
    }

    startTransition(async () => {
      const nextResults: Array<{ customerId: string; customerName: string; state: CreateDeliveryState }> = [];

      for (const group of groups) {
        const qtyMap = qtysByStore[group.customerId] ?? {};
        const toDistribute = new Map<string, number>();
        for (const item of group.groupedItems) {
          const qty = parseFloat(qtyMap[item.groupKey] ?? "0") || 0;
          if (qty > 0) {
            toDistribute.set(item.groupKey, qty);
          }
        }

        if (toDistribute.size === 0) {
          continue;
        }

        const itemsPayload: Array<{
          orderItemId: string;
          productId: string;
          productSaleUnitId: string | null;
          quantityDelivered: number;
          saleUnitLabel: string;
          saleUnitRatio: number;
          unitPrice: number;
        }> = [];

        for (const order of group.orders) {
          for (const item of order.items) {
            const key = toGroupKey(item.productId, item.saleUnitLabel);
            const remaining = toDistribute.get(key) ?? 0;
            if (remaining <= 0) continue;

            const itemMax = item.saleUnitRatio > 0 ? item.remainingBaseQty / item.saleUnitRatio : 0;
            const qty = Math.min(remaining, itemMax);
            if (qty <= 0) continue;

            toDistribute.set(key, remaining - qty);
            itemsPayload.push({
              orderItemId: item.orderItemId,
              productId: item.productId,
              productSaleUnitId: item.productSaleUnitId,
              quantityDelivered: qty,
              saleUnitLabel: item.saleUnitLabel,
              saleUnitRatio: item.saleUnitRatio,
              unitPrice: item.unitPrice,
            });
          }
        }

        if (itemsPayload.length === 0) {
          continue;
        }

        const fd = new FormData();
        fd.set("orderIds", JSON.stringify(group.orders.map((order) => order.orderId)));
        fd.set("customerId", group.customerId);
        fd.set("notes", (notesByStore[group.customerId] ?? "").trim());
        fd.set("items", JSON.stringify(itemsPayload));

        const state = await createDeliveryNoteAction(null, fd);
        nextResults.push({
          customerId: group.customerId,
          customerName: group.customerName,
          state,
        });
      }

      setResults(nextResults);
      if (nextResults.some((row) => row.state.status === "success")) {
        router.refresh();
      }
      if (nextResults.length > 0 && nextResults.every((row) => row.state.status === "success")) {
        setTimeout(onClose, 1600);
      }
    });
  }

  const totalSelectedAmount = groups.reduce((sum, group) => {
    const qtyMap = qtysByStore[group.customerId] ?? {};
    const subtotal = group.groupedItems.reduce((storeSum, item) => {
      const qty = parseFloat(qtyMap[item.groupKey] ?? "0") || 0;
      return storeSum + qty * item.unitPrice;
    }, 0);
    return sum + subtotal;
  }, 0);

  const successRows = results.filter((row) => row.state.status === "success");
  const errorRows = results.filter((row) => row.state.status === "error");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-h-[94vh] overflow-x-hidden overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-6xl sm:rounded-3xl">
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Layers3 className="h-5 w-5 text-[#003366]" strokeWidth={2.2} />
                <h2 className="truncate text-lg font-bold text-slate-950">สร้างใบส่งของทั้งหมด</h2>
              </div>
              <p className="mt-0.5 text-sm text-slate-500">
                วันที่ {formatDate(date)} · {groups.length} ร้านค้า
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="ปิด"
            >
              <X className="h-4 w-4" strokeWidth={2.4} />
            </button>
          </div>
        </div>

        <div className="space-y-4 px-4 py-4 sm:px-6 sm:py-5">
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-4">
            <div className="rounded-xl bg-white p-3 text-center shadow-sm">
              <p className="text-xs font-semibold text-slate-500">ร้านค้าที่เลือกส่ง</p>
              <p className="mt-1 text-xl font-bold text-[#003366]">{storesWithQty.length}</p>
            </div>
            <div className="rounded-xl bg-white p-3 text-center shadow-sm">
              <p className="text-xs font-semibold text-slate-500">รายการที่สต็อกไม่พอ</p>
              <p className="mt-1 text-xl font-bold text-red-700">{overStockRows.length}</p>
            </div>
            <div className="rounded-xl bg-white p-3 text-center shadow-sm">
              <p className="text-xs font-semibold text-slate-500">รวมยอดส่งรอบนี้</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{formatMoney(totalSelectedAmount)}</p>
            </div>
            <div className="rounded-xl bg-white p-3 text-center shadow-sm">
              <p className="text-xs font-semibold text-slate-500">รายการยังไม่ตั้งราคา</p>
              <p className="mt-1 text-xl font-bold text-amber-700">{unpricedActiveRows.length}</p>
            </div>
          </div>

          {hasOverStock && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              มี {overStockRows.length} รายการส่งเกินสต็อกที่พร้อมส่ง กรุณาปรับจำนวนก่อนยืนยัน
            </div>
          )}

          {groups.map((group) => {
            const qtyMap = qtysByStore[group.customerId] ?? {};
            return (
              <section key={group.customerId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-[#003366] px-4 py-3 text-white">
                  <Building2 className="h-4 w-4 shrink-0" strokeWidth={2.2} />
                  <p className="text-sm font-bold">
                    {group.customerCode} {group.customerName}
                  </p>
                  <span className="ml-auto inline-flex items-center rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold">
                    {group.orderRounds} รอบออเดอร์
                  </span>
                </div>

                <div className="space-y-2 p-3 sm:hidden">
                  {group.groupedItems.map((item) => {
                    const qty = qtyMap[item.groupKey] ?? "";
                    const qtyNum = parseFloat(qty) || 0;
                    const isOver = qtyNum > 0 && productStockStatus.overProducts.has(item.productId);
                    return (
                      <div
                        key={`${group.customerId}-${item.groupKey}`}
                        className={`rounded-xl border p-3 ${isOver ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}
                      >
                        <div className="flex items-center gap-3">
                          {item.imageUrl ? (
                            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-slate-100">
                              <Image src={item.imageUrl} alt={item.productName} fill className="object-cover" sizes="40px" />
                            </div>
                          ) : (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-white">
                              <Package2 className="h-4 w-4 text-slate-300" strokeWidth={1.8} />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-slate-900">{item.productName}</p>
                            <p className="font-mono text-xs text-slate-400">{item.productSku}</p>
                          </div>
                        </div>
                        <div className="mt-2 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-500">ออเดอร์</span>
                            <span className="text-xs text-slate-500">
                              คงเหลือ {formatNum(item.totalRemaining)} {item.saleUnitLabel}
                            </span>
                          </div>
                          <div className="grid grid-cols-[40px_minmax(0,1fr)_40px_auto] items-center gap-2">
                            <button
                              type="button"
                              onClick={() => nudgeQty(group.customerId, item.groupKey, -1)}
                              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-lg font-bold text-slate-700"
                              aria-label="ลดจำนวน"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={qty}
                              onChange={(e) => setQtyValue(group.customerId, item.groupKey, e.target.value)}
                              className={`w-full min-w-0 rounded-lg border px-2 py-1.5 text-center text-sm font-bold outline-none ${isOver ? "border-red-300 text-red-700" : "border-slate-300 text-slate-900"}`}
                              placeholder="0"
                            />
                            <button
                              type="button"
                              onClick={() => nudgeQty(group.customerId, item.groupKey, 1)}
                              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-lg font-bold text-slate-700"
                              aria-label="เพิ่มจำนวน"
                            >
                              +
                            </button>
                            <span className="text-xs text-slate-500">{item.saleUnitLabel}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="border-b border-r border-slate-200 px-3 py-2 text-center text-xs font-semibold text-slate-500">
                          รหัสสินค้า
                        </th>
                        <th className="border-b border-r border-slate-200 px-3 py-2 text-left text-xs font-semibold text-slate-500">
                          รายการสินค้า
                        </th>
                        <th className="border-b border-r border-slate-200 px-3 py-2 text-center text-xs font-semibold text-slate-500">
                          ออเดอร์
                        </th>
                        <th className="border-b border-r border-slate-200 px-3 py-2 text-center text-xs font-semibold text-slate-500">
                          หน่วย
                        </th>
                        <th className="border-b border-r border-slate-200 px-3 py-2 text-right text-xs font-semibold text-slate-500">
                          ราคา/หน่วย
                        </th>
                        <th className="border-b border-slate-200 px-3 py-2 text-right text-xs font-semibold text-slate-500">
                          รวมเงิน
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.groupedItems.map((item, idx) => {
                        const qty = qtyMap[item.groupKey] ?? "";
                        const qtyNum = parseFloat(qty) || 0;
                        const isOver = qtyNum > 0 && productStockStatus.overProducts.has(item.productId);
                        const rowBorder = idx < group.groupedItems.length - 1 ? "border-b border-slate-200" : "";
                        return (
                          <tr key={`${group.customerId}-${item.groupKey}`} className={isOver ? "bg-red-50" : "bg-white"}>
                            <td className={`border-r border-slate-200 px-3 py-3 text-center ${rowBorder}`}>
                              <span className="font-mono text-xs font-semibold text-slate-700">{item.productSku}</span>
                            </td>
                            <td className={`border-r border-slate-200 px-3 py-3 ${rowBorder}`}>
                              <div className="flex items-center gap-2.5">
                                {item.imageUrl ? (
                                  <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-slate-100">
                                    <Image src={item.imageUrl} alt={item.productName} fill className="object-cover" sizes="36px" />
                                  </div>
                                ) : (
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50">
                                    <Package2 className="h-4 w-4 text-slate-300" strokeWidth={1.8} />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="font-semibold text-slate-900">{item.productName}</p>
                                  <p className="text-xs text-slate-500">คงเหลือออเดอร์ {formatNum(item.totalRemaining)}</p>
                                </div>
                              </div>
                            </td>
                            <td className={`border-r border-slate-200 px-3 py-3 text-center ${rowBorder}`}>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={qty}
                                onChange={(e) => setQtyValue(group.customerId, item.groupKey, e.target.value)}
                                className={`w-24 rounded-lg border px-2 py-1.5 text-center text-sm font-bold outline-none ${isOver ? "border-red-300 text-red-700" : "border-slate-300 text-slate-900"}`}
                                placeholder="0"
                              />
                            </td>
                            <td className={`border-r border-slate-200 px-3 py-3 text-center text-sm text-slate-600 ${rowBorder}`}>
                              {item.saleUnitLabel}
                            </td>
                            <td className={`border-r border-slate-200 px-3 py-3 text-right text-sm text-slate-700 ${rowBorder}`}>
                              {item.unitPrice > 0 ? `${formatMoney(item.unitPrice)} บาท` : "-"}
                            </td>
                            <td className={`px-3 py-3 text-right text-sm font-semibold text-slate-900 ${rowBorder}`}>
                              {qtyNum > 0 ? `${formatMoney(qtyNum * item.unitPrice)} บาท` : "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="border-t border-slate-100 p-3">
                  <label className="mb-1 block text-xs font-semibold text-slate-500">หมายเหตุร้านนี้ (ถ้ามี)</label>
                  <input
                    type="text"
                    value={notesByStore[group.customerId] ?? ""}
                    onChange={(e) =>
                      setNotesByStore((prev) => ({
                        ...prev,
                        [group.customerId]: e.target.value,
                      }))
                    }
                    placeholder="เช่น ส่งรอบเช้า"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/10"
                  />
                </div>
              </section>
            );
          })}

          {errorRows.length > 0 && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorRows.map((row) => (
                <p key={row.customerId}>
                  {row.customerName}: {row.state.message}
                </p>
              ))}
            </div>
          )}

          {successRows.length > 0 && (
            <div className="space-y-2 rounded-xl bg-emerald-50 px-4 py-3">
              {successRows.map((row) => (
                <div key={row.customerId} className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                    <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2.4} />
                    {row.customerName} · {row.state.deliveryNumber}
                  </div>
                  {row.state.deliveryId && (
                    <a
                      href={`/orders/delivery-notes/${row.state.deliveryId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                    >
                      <Truck className="h-3.5 w-3.5" strokeWidth={2.2} />
                      พิมพ์ใบส่งของ
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex flex-col gap-3 border-t border-slate-100 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="w-full rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 sm:w-auto"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!hasAnyQty || hasOverStock || isPending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#003366] px-5 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-[#002244] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:py-2.5 sm:text-sm"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                กำลังสร้าง...
              </>
            ) : (
              <>
                <Layers3 className="h-4 w-4" strokeWidth={2.2} />
                สร้างใบส่งของทั้งหมด
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AllStoresDeliveryButton({
  date,
  stores,
}: {
  date: string;
  stores: StoreSummaryForBatch[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<BatchStoreGroup[] | null>(null);

  async function handleOpen() {
    setLoading(true);
    const orderMap = await getBatchStoreDeliveryDataAction(
      stores.map((store) => store.customerId),
      date,
    );

    const nextGroups = stores
      .map((store) => {
        const orders = orderMap[store.customerId] ?? [];
        if (orders.length === 0) return null;
        return {
          ...store,
          groupedItems: buildGroupedItemsForOrders(orders),
          orders,
        } satisfies BatchStoreGroup;
      })
      .filter((group): group is BatchStoreGroup => group !== null);

    setGroups(nextGroups);
    setOpen(true);
    setLoading(false);
  }

  if (stores.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-xl bg-[#003366] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#002244] disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
        ) : (
          <Layers3 className="h-4 w-4" strokeWidth={2.2} />
        )}
        สร้างใบส่งของทั้งหมด
      </button>
      {open && groups && groups.length > 0 && (
        <AllStoresDeliveryModal date={date} groups={groups} onClose={() => setOpen(false)} />
      )}
      {open && groups && groups.length === 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div className="rounded-2xl bg-white px-8 py-6 text-center shadow-2xl">
            <p className="text-sm text-slate-500">ไม่มีออเดอร์ที่พร้อมสร้างใบส่งของ</p>
          </div>
        </div>
      )}
    </>
  );
}

export function StoreDeliveryButton({
  customerId,
  customerName,
  date,
}: {
  customerId: string;
  customerName: string;
  date: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<DeliveryFormData[] | null>(null);

  async function handleOpen() {
    setLoading(true);
    const data = await getStoreDeliveryDataAction(customerId, date);
    setOrders(data);
    setLoading(false);
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={loading}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-[#003366] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#002244] disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
        ) : (
          <Truck className="h-3.5 w-3.5" strokeWidth={2.2} />
        )}
        สร้างใบส่งของ
      </button>
      {open && orders && orders.length > 0 && (
        <StoreDeliveryModal
          customerName={customerName}
          orders={orders}
          onClose={() => { setOpen(false); setOrders(null); }}
        />
      )}
      {open && orders && orders.length === 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div className="rounded-2xl bg-white px-8 py-6 text-center shadow-2xl">
            <p className="text-sm text-slate-500">ไม่มีออเดอร์ที่พร้อมสร้างใบส่งของ</p>
          </div>
        </div>
      )}
    </>
  );
}

// Standalone create-delivery button (reusable in order rounds list)

export function CreateDeliveryButton({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-[#003366] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#002244]"
      >
        <Truck className="h-3.5 w-3.5" strokeWidth={2.2} />
        สร้างใบส่งของ
      </button>
      {open && <DeliveryModal orderId={orderId} onClose={() => setOpen(false)} />}
    </>
  );
}

// Pending Orders Section

export function PendingOrdersSection({ orders }: { orders: PendingOrder[] }) {
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  if (orders.length === 0) return null;

  const totalOutstandingAmount = orders.reduce((sum, order) => sum + order.totalAmount, 0);
  const outstandingDates = Array.from(new Set(orders.map((order) => order.orderDate)));
  const outstandingDateLabel =
    outstandingDates.length === 1
      ? formatDate(outstandingDates[0])
      : `${formatDate(outstandingDates[0])} - ${formatDate(outstandingDates[outstandingDates.length - 1])}`;

  return (
    <>
      <section className="overflow-hidden rounded-[1.5rem] border border-amber-200 bg-amber-50 shadow-[0_12px_40px_rgba(15,23,42,0.05)]">
        {/* Section header */}
        <div className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-100/60 px-5 py-3.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" strokeWidth={2.4} />
          <span className="text-sm font-bold text-amber-800">
            ค้างส่ง {orders.length} ออเดอร์
          </span>
          <span className="text-xs font-semibold text-amber-700">
            ยอดค้างส่ง {formatMoney(totalOutstandingAmount)} บาท
          </span>
          <span className="text-xs text-amber-700/80">
            ของวันที่ {outstandingDateLabel}
          </span>
          <span className="ml-auto text-xs text-amber-600">
            ออเดอร์จากวันก่อนหน้าที่ยังไม่ได้จัดส่ง
          </span>
        </div>

        {/* Order rows */}
        <div className="divide-y divide-amber-100">
          {orders.map((order) => (
            <div key={order.id} className="px-4 py-3 sm:px-5 sm:py-4">
              {/* Top row: date | customer | amount + button */}
              <div className="flex items-start gap-3">
                {/* Date + badge */}
                <div className="shrink-0 text-center">
                  <p className="text-xs font-semibold text-amber-700">
                    {formatDate(order.orderDate)}
                  </p>
                  {order.fulfillmentStatus === "partial" && (
                    <span className="mt-1 inline-block rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                      ส่งบางส่วน
                    </span>
                  )}
                </div>

                {/* Customer */}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{order.customerName}</p>
                  <p className="mt-0.5 font-mono text-xs text-slate-400">{order.orderNumber}</p>
                </div>

                {/* Amount + button (stacked on mobile, side-by-side on sm+) */}
                <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                  <p className="text-sm font-bold text-slate-950 whitespace-nowrap">
                    {formatMoney(order.totalAmount)} บาท
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveOrderId(order.id)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#003366] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#002244]"
                  >
                    <Truck className="h-3.5 w-3.5" strokeWidth={2.2} />
                    <span className="hidden xs:inline">สร้างใบส่งของ</span>
                    <span className="xs:hidden">สร้าง</span>
                  </button>
                </div>
              </div>

              {/* Pending item tags */}
              {order.pendingItems.length > 0 && (
                <div className="mt-2 ml-[52px] flex flex-wrap gap-1.5">
                  {order.pendingItems.map((item) => (
                    <span
                      key={item.orderItemId}
                      className="inline-flex rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200"
                      title={`${item.productSku} · สั่ง ${formatNum(item.orderedQty)} ${item.saleUnitLabel} · ส่งแล้ว ${formatNum(item.deliveredQty)} ${item.saleUnitLabel}`}
                    >
                      {formatPendingLine(item)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Modal */}
      {activeOrderId && (
        <DeliveryModal
          orderId={activeOrderId}
          onClose={() => setActiveOrderId(null)}
        />
      )}
    </>
  );
}
