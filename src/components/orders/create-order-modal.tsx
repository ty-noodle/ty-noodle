"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  Check,
  ChevronRight,
  ClipboardList,
  History,
  Loader2,
  Lock,
  Minus,
  Package2,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  Truck,
  Unlock,
  X,
  Boxes,
} from "lucide-react";
import { useCreateOrder } from "./create-order-context";
import { getEffectiveSaleUnitCost } from "@/lib/products/sale-unit-cost";
import type { OrderCustomerOption, OrderProductOption } from "@/lib/orders/manage";
import { compareCustomerOrder } from "@/lib/settings/customer-order";
import { normalizeSearch } from "@/lib/utils/search";
import {
  createManualOrderAction,
  fetchCustomerOrderCountsForDateAction,
  fetchCustomerLastOrderItemsAction,
  fetchCustomerPricesAction,
  upsertCustomerPricesBatchFromOrderModalAction,
} from "@/app/orders/incoming/actions";
import type { CustomerLastOrderSnapshot } from "@/app/orders/incoming/types";

import { ThaiDatePicker } from "@/components/ui/thai-date-picker";

type CartItem = {
  productId: string;
  productName: string;
  quantity: number;
  minOrderQty: number;
  saleUnitBaseQty: number;
  saleUnitId: string | null;
  saleUnitLabel: string;
  stepOrderQty: number | null;
  unitPrice: number;
};

type ProductUnit = {
  baseUnitQuantity: number;
  costMode: string | null;
  fixedCostPrice: number | null;
  id: string | null;
  isDefault: boolean;
  label: string;
  minOrderQty: number;
  stepOrderQty: number | null;
};

type ProductSelection = {
  quantity: string;
  unitPrice: string;
  unitId: string | null;
  isPriceLocked: boolean;
};

type ProductSelectionField = keyof ProductSelection;

type ProductSelectModalProps = {
  cart: CartItem[];
  noCustomer: boolean;
  onClose: () => void;
  onConfirmMany: (
    selections: {
      product: OrderProductOption;
      unitId: string | null;
      unitLabel: string;
      baseQty: number;
      quantity: number;
      unitPrice: number;
      minOrderQty: number;
      stepOrderQty: number | null;
    }[]
  ) => Promise<void> | void;
  open: boolean;
  priceMap: Record<string, number>;
  products: OrderProductOption[];
  productsLoading: boolean;
  selectedCustomerLabel: string | null;
};

type Props = {
  autoOpen?: boolean;
  customerOrderCountsToday?: Record<string, number>;
  customers?: OrderCustomerOption[];
  products?: OrderProductOption[];
  today?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  initialCustomerId?: string;
};

type ModalTab = "create" | "history";

function CreateOrderPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return null;

  return createPortal(children, document.body);
}

function ActionPopup({
  message,
  onClose,
}: {
  message: string | null;
  onClose: () => void;
}) {
  if (!message) return null;

  return (
    <div className="pointer-events-none absolute inset-x-4 top-4 z-[70] flex justify-center">
      <div
        role="alert"
        className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-amber-200 bg-white px-4 py-3 shadow-[0_14px_36px_rgba(0,51,102,0.18)]"
      >
        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <AlertTriangle className="h-4 w-4" strokeWidth={2.2} />
        </span>
        <p className="min-w-0 flex-1 text-sm font-semibold leading-6 text-slate-800">{message}</p>
        <button
          type="button"
          onClick={onClose}
          className="action-touch-safe inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          aria-label="ปิดข้อความแจ้งเตือน"
        >
          <X className="h-4 w-4" strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}

function formatTHB(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatThaiShortDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) {
    return isoDate;
  }
  return `${day}/${month}/${Number(year) + 543}`;
}

function getUnits(product: OrderProductOption): ProductUnit[] {
  if (product.saleUnits.length > 0) {
    return product.saleUnits.map((unit) => ({
      baseUnitQuantity: unit.baseUnitQuantity,
      costMode: unit.costMode ?? null,
      fixedCostPrice: unit.fixedCostPrice ?? null,
      id: unit.id,
      isDefault: unit.isDefault,
      label: product.unit,
      minOrderQty: Number(unit.minOrderQty ?? 1),
      stepOrderQty:
        unit.stepOrderQty === null || unit.stepOrderQty === undefined
          ? null
          : Number(unit.stepOrderQty),
    }));
  }
  return [
    {
      baseUnitQuantity: 1,
      costMode: null,
      fixedCostPrice: null,
      id: null,
      isDefault: true,
      label: product.unit,
      minOrderQty: 1,
      stepOrderQty: null,
    },
  ];
}

const QTY_SCALE = 1000;
function toScaled(value: number) {
  return Math.round(value * QTY_SCALE);
}
function fromScaled(value: number) {
  return value / QTY_SCALE;
}
function getEffectiveStep(stepOrderQty: number | null) {
  return stepOrderQty && Number.isFinite(stepOrderQty) && stepOrderQty > 0 ? stepOrderQty : 1;
}
function normalizeToRule(value: number, minOrderQty: number, stepOrderQty: number | null) {
  const safeMin = Number.isFinite(minOrderQty) && minOrderQty > 0 ? minOrderQty : 1;
  const safeStep =
    stepOrderQty && Number.isFinite(stepOrderQty) && stepOrderQty > 0 ? stepOrderQty : null;
  if (!Number.isFinite(value)) return safeMin;

  const clamped = Math.max(value, safeMin);
  if (!safeStep) return clamped;

  const minScaled = toScaled(safeMin);
  const stepScaled = Math.max(1, toScaled(safeStep));
  const valueScaled = toScaled(clamped);
  const snapped = minScaled + Math.round((valueScaled - minScaled) / stepScaled) * stepScaled;
  return fromScaled(Math.max(minScaled, snapped));
}
function isValidByRule(value: number, minOrderQty: number, stepOrderQty: number | null) {
  const safeMin = Number.isFinite(minOrderQty) && minOrderQty > 0 ? minOrderQty : 1;
  if (!Number.isFinite(value) || value < safeMin) return false;

  const safeStep =
    stepOrderQty && Number.isFinite(stepOrderQty) && stepOrderQty > 0 ? stepOrderQty : null;
  if (!safeStep) return true;

  const offset = toScaled(value) - toScaled(safeMin);
  const stepScaled = Math.max(1, toScaled(safeStep));
  return offset % stepScaled === 0;
}
function stepByRule(
  current: number,
  direction: -1 | 1,
  minOrderQty: number,
  stepOrderQty: number | null,
) {
  const normalizedCurrent = normalizeToRule(current, minOrderQty, stepOrderQty);
  const step = getEffectiveStep(stepOrderQty);
  const nextValue = normalizedCurrent + direction * step;
  return normalizeToRule(nextValue, minOrderQty, stepOrderQty);
}

function getUnitPrice(productId: string, unitId: string | null, priceMap: Record<string, number>) {
  return priceMap[unitId ?? productId] ?? priceMap[productId] ?? 0;
}

function formatInitialUnitPrice(price: number) {
  return price > 0 ? String(price) : "";
}

const ProductRow = React.memo(({
  product,
  isSelected,
  onSelect,
  selection,
  onUpdateSelection,
  addedCount,
  priceMap,
  noCustomer
}: {
  product: OrderProductOption;
  isSelected: boolean;
  onSelect: (productId: string, selected: boolean) => void;
  selection?: ProductSelection;
  onUpdateSelection: (
    productId: string,
    field: ProductSelectionField,
    value: ProductSelection[ProductSelectionField],
  ) => void;
  addedCount: number;
  priceMap: Record<string, number>;
  noCustomer: boolean;
}) => {
  const units = getUnits(product);
  const unit = units.find((u) => u.id === selection?.unitId) ?? units.find((u) => u.isDefault) ?? units[0] ?? null;
  const effectiveCost = unit ? getEffectiveSaleUnitCost({
    baseCostPrice: product.baseCostPrice,
    baseUnitQuantity: unit.baseUnitQuantity,
    costMode: unit.costMode,
    fixedCostPrice: unit.fixedCostPrice,
  }) : 0;
  const currentPriceNum = selection?.unitPrice ? Number.parseFloat(selection.unitPrice) : 0;
  const isBelowCost = Boolean(selection && effectiveCost > 0 && currentPriceNum > 0 && currentPriceNum < (effectiveCost - 0.001));
  const customerPrice = priceMap[unit?.id ?? product.id] ?? priceMap[product.id] ?? 0;

  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-[1.4rem] border transition-all md:rounded-[1.8rem] md:border-2 md:shadow-sm ${
        isSelected
          ? isBelowCost
            ? "border-[#FF0000]/60 bg-rose-50 ring-1 ring-[#FF0000]/10"
            : "border-[#003366]/40 bg-[#003366]/5 ring-1 ring-[#003366]/5"
          : "border-slate-200 bg-white hover:border-slate-300"
      } col-span-1`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(product.id, !isSelected)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect(product.id, !isSelected);
          }
        }}
        className="relative cursor-pointer px-3 py-3 md:px-4 md:py-4"
      >
        <div className="absolute right-3 top-3 flex h-6 w-6 shrink-0 items-center justify-center md:right-4 md:top-4">
          <label className="relative flex cursor-pointer items-center justify-center">
            <input
              type="checkbox"
              readOnly
              tabIndex={-1}
              checked={isSelected}
              className="peer pointer-events-none h-5 w-5 appearance-none rounded border-2 border-slate-300 transition-all checked:border-[#003366] checked:bg-[#003366]"
            />
            <Check className="pointer-events-none absolute h-3.5 w-3.5 scale-0 text-white transition-transform peer-checked:scale-100" strokeWidth={5} />
          </label>
        </div>

        <div className="flex flex-col items-center gap-2.5 md:flex-row md:items-center md:gap-3">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl md:h-24 md:w-24">
            {product.imageUrl ? (
              <Image
                src={product.imageUrl}
                alt={product.name}
                fill
                className="object-contain"
                sizes="(max-width: 768px) 80px, 96px"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-100">
                <Package2 className="h-12 w-12" strokeWidth={1} />
              </div>
            )}
          </div>

          <div className="w-full min-w-0 text-center md:flex-1 md:text-left">
            <p className="text-[11px] font-black uppercase tracking-tight text-slate-500 md:hidden">
              {product.sku}
            </p>
            <p className="mt-1 break-words text-[13px] font-black leading-tight text-slate-950 md:mt-0 md:text-[19px]">
              <span className="mr-2 hidden font-bold uppercase tracking-tighter text-slate-950 md:inline">
                {product.sku}
              </span>
              {product.name}
            </p>

            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 md:justify-start">
              <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13.5px] font-black shadow-sm ${
                product.stockQuantity < 0 ? "bg-[#FF0000] text-white" : "bg-[#003366] text-white"
              }`}>
                <Boxes className="h-3.5 w-3.5 md:h-4 md:w-4" strokeWidth={2.5} />
                สต็อก: {product.stockQuantity.toLocaleString("th-TH")} {product.unit}
              </span>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2 md:justify-start md:gap-3">
              {!noCustomer && (
                customerPrice > 0 ? (
                  <span className="inline-flex items-center rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700 ring-1 ring-inset ring-emerald-600/20 md:px-2.5 md:text-[13px]">
                    ราคา {formatTHB(customerPrice)} บ.
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-lg bg-[#FF0000] px-2 py-1 text-[11px] font-black text-white shadow-sm md:px-2.5 md:text-[13px]">
                    ยังไม่มีราคา
                  </span>
                )
              )}

              {addedCount > 0 && (
                <span className="rounded-lg bg-[#003366] px-2 py-1 text-[11px] font-black text-white shadow-sm md:px-2.5 md:text-[12px]">
                  ในตะกร้า {addedCount} {unit?.label}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {isSelected && selection && (
        <div className="bg-[#003366]/5 px-3 pb-4 pt-2 md:px-4 md:pb-4 md:pt-1">
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-[14px] font-black uppercase tracking-wider text-slate-600">
                จำนวน ({unit?.label})
              </label>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => onUpdateSelection(product.id, "quantity", String(stepByRule(Number(selection.quantity), -1, unit?.minOrderQty ?? 1, unit?.stepOrderQty ?? null)))}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-100 bg-white text-slate-700 shadow-md active:scale-90"
                >
                  <Minus className="h-6 w-6" strokeWidth={3} />
                </button>
                <input
                  type="number"
                  value={selection.quantity}
                  onChange={(e) => onUpdateSelection(product.id, "quantity", e.target.value)}
                  className="h-10 w-full min-w-0 rounded-2xl border-2 border-transparent bg-white px-2 text-center text-xl font-black text-slate-950 shadow-md outline-none focus:border-[#003366]/30"
                />
                <button
                  type="button"
                  onClick={() => onUpdateSelection(product.id, "quantity", String(stepByRule(Number(selection.quantity), 1, unit?.minOrderQty ?? 1, unit?.stepOrderQty ?? null)))}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-100 bg-white text-slate-700 shadow-md active:scale-90"
                >
                  <Plus className="h-6 w-6" strokeWidth={3} />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className={`text-[14px] font-black uppercase tracking-wider ${isBelowCost ? "text-[#FF0000]" : "text-slate-600"}`}>
                  ราคาต่อ{unit?.label}
                </label>
                {effectiveCost > 0 && (
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-black ${
                    isBelowCost
                      ? "animate-pulse border-[#FF0000] bg-white text-[#FF0000] shadow-sm"
                      : "border-slate-200 text-slate-400"
                  }`}>
                    ทุน ฿{formatTHB(effectiveCost)}
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type="number"
                  value={selection.unitPrice}
                  disabled={selection.isPriceLocked}
                  onChange={(e) => onUpdateSelection(product.id, "unitPrice", e.target.value)}
                  className={`h-10 w-full rounded-2xl border-2 pl-4 pr-12 text-xl font-black shadow-md outline-none transition-all ${
                    selection.isPriceLocked
                      ? "border-transparent bg-slate-100 text-slate-400 shadow-none"
                      : "border-transparent bg-white text-slate-950 focus:border-[#003366]/30"
                  } ${isBelowCost ? "!border-[#FF0000] !bg-rose-50 !text-[#FF0000]" : ""}`}
                />
                <button
                  type="button"
                  onClick={() => onUpdateSelection(product.id, "isPriceLocked", !selection.isPriceLocked)}
                  className={`absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl transition-all active:scale-90 ${
                    selection.isPriceLocked
                      ? "text-slate-400"
                      : isBelowCost
                        ? "bg-[#FF0000] text-white"
                        : "bg-[#003366] text-white"
                  }`}
                >
                  {selection.isPriceLocked ? <Lock className="h-5 w-5" /> : <Unlock className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </div>

          {isBelowCost && (
            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/20 bg-[#FF0000] px-4 py-3 text-[13px] font-black text-white shadow-xl shadow-rose-500/30 animate-in zoom-in-95 duration-200 md:mt-4 md:border-2 md:px-5 md:py-4 md:text-[16px] md:shadow-rose-500/40">
              <AlertTriangle className="h-6 w-6 shrink-0 text-yellow-300" strokeWidth={3} />
              <div className="min-w-0 flex-1">
                <p className="leading-tight">ราคาต่ำกว่าทุน!</p>
                <p className="mt-1 text-[13px] font-bold uppercase tracking-tight opacity-90">
                  ต้นทุนของ {unit?.label} นี้คือ ฿{formatTHB(effectiveCost)}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
ProductRow.displayName = "ProductRow";

function ProductSelectModal({
  cart,
  noCustomer,
  onClose,
  onConfirmMany,
  open,
  priceMap,
  products,
  productsLoading,
  selectedCustomerLabel,
}: ProductSelectModalProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = React.useDeferredValue(query);
  const [selectedCategoryId, setSelectedCategoryId] = useState("__all__");
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selections, setSelections] = useState<Record<string, ProductSelection>>({});
  const [saving, setSaving] = useState(false);
  const [popupMessage, setPopupMessage] = useState<string | null>(null);
  const [costWarningInfo, setCostWarningInfo] = useState<{ items: { name: string; cost: number; price: number }[] } | null>(null);
  const popupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const showPopup = (message: string) => {
    setPopupMessage(message);
    if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
    popupTimerRef.current = setTimeout(() => setPopupMessage(null), 3000);
  };

  const categoryOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const product of products) {
      for (let i = 0; i < product.categoryIds.length; i++) {
        const id = product.categoryIds[i];
        const name = product.categoryNames[i];
        if (id && name && !seen.has(id)) seen.set(id, name);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [products]);

  const activeCategoryName = categoryOptions.find(c => c.id === selectedCategoryId)?.name ?? "ทุกหมวดหมู่";

  const filteredProducts = useMemo(() => {
    const normalized = normalizeSearch(deferredQuery);
    const result = products.filter((product) => {
      const matchesCategory = selectedCategoryId === "__all__" || product.categoryIds.includes(selectedCategoryId);
      if (!matchesCategory) return false;
      if (!normalized) return true;
      return (
        normalizeSearch(product.name).includes(normalized) ||
        normalizeSearch(product.sku).includes(normalized) ||
        product.categoryNames.some(n => normalizeSearch(n).includes(normalized))
      );
    });
    return result;
  }, [products, deferredQuery, selectedCategoryId]);

  const handleSelectProduct = useCallback((productId: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(productId);
      else next.delete(productId);
      return next;
    });

    if (selected) {
      setSelections((prev) => {
        if (prev[productId]) return prev;
        const product = productsById.get(productId);
        if (!product) return prev;
        const units = getUnits(product);
        const defaultUnit = units.find(u => u.isDefault) ?? units[0] ?? null;
        const price = defaultUnit ? getUnitPrice(productId, defaultUnit.id, priceMap) : 0;
        return {
          ...prev,
          [productId]: {
            quantity: String(defaultUnit?.minOrderQty ?? 1),
            unitPrice: formatInitialUnitPrice(price),
            unitId: defaultUnit?.id ?? null,
            isPriceLocked: price > 0
          }
        };
      });
    }
  }, [productsById, priceMap]);

  useEffect(() => {
    if (!open || selectedIds.size === 0) return;

    setSelections((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const productId of selectedIds) {
        const selection = prev[productId];
        const product = productsById.get(productId);
        if (!selection || !product) continue;

        const units = getUnits(product);
        const unit =
          units.find(u => u.id === selection.unitId) ??
          units.find(u => u.isDefault) ??
          units[0] ??
          null;
        const price = unit ? getUnitPrice(productId, unit.id, priceMap) : 0;
        if (price <= 0) continue;

        const nextUnitPrice = String(price);
        if (selection.unitPrice !== nextUnitPrice || !selection.isPriceLocked) {
          next[productId] = {
            ...selection,
            unitId: unit.id,
            unitPrice: nextUnitPrice,
            isPriceLocked: true,
          };
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [open, priceMap, productsById, selectedIds]);

  const handleUpdateSelection = useCallback((
    productId: string,
    field: ProductSelectionField,
    value: ProductSelection[ProductSelectionField],
  ) => {
    setSelections(prev => ({
      ...prev,
      [productId]: { ...prev[productId], [field]: value } as ProductSelection,
    }));
  }, []);

  const handleConfirm = async (bypassWarning = false) => {
    if (selectedIds.size === 0) {
      showPopup("กรุณาเลือกสินค้าอย่างน้อย 1 รายการ");
      return;
    }

    const itemsToConfirm = [];
    const belowCostItems = [];

    for (const productId of Array.from(selectedIds)) {
      const selection = selections[productId];
      const product = products.find(p => p.id === productId);
      if (!product || !selection) continue;

      const units = getUnits(product);
      const unit = units.find(u => u.id === selection.unitId) ?? units[0] ?? null;
      if (!unit) continue;

      const quantity = Number(selection.quantity);
      const unitPrice = Number(selection.unitPrice);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        showPopup(`จำนวนของ ${product.name} ต้องมากกว่า 0`);
        return;
      }
      if (!isValidByRule(quantity, unit.minOrderQty, unit.stepOrderQty)) {
        showPopup(`จำนวนของ ${product.name} ไม่ถูกต้องตามขั้นต่ำ/การเพิ่ม`);
        return;
      }
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        showPopup(`กรุณาระบุราคาของ ${product.name}`);
        return;
      }

      const effectiveCost = getEffectiveSaleUnitCost({
        baseCostPrice: product.baseCostPrice,
        baseUnitQuantity: unit.baseUnitQuantity,
        costMode: unit.costMode,
        fixedCostPrice: unit.fixedCostPrice,
      });

      // WARNING LOGIC: cost must be > 0 and price < cost (with epsilon for float safety)
      if (effectiveCost > 0 && unitPrice > 0 && unitPrice < (effectiveCost - 0.001)) {
        belowCostItems.push({ name: product.name, cost: effectiveCost, price: unitPrice });
      }

      itemsToConfirm.push({
        product,
        unitId: unit.id,
        unitLabel: unit.label,
        baseQty: unit.baseUnitQuantity,
        quantity,
        unitPrice,
        minOrderQty: unit.minOrderQty,
        stepOrderQty: unit.stepOrderQty,
      });
    }

    if (belowCostItems.length > 0 && !bypassWarning) {
      setCostWarningInfo({ items: belowCostItems });
      return;
    }

    setSaving(true);
    try {
      await onConfirmMany(itemsToConfirm);
      onClose();
    } catch {
      showPopup("เกิดข้อผิดพลาดในการเพิ่มสินค้า");
    } finally {
      setSaving(false);
      setCostWarningInfo(null);
    }
  };

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelectedIds(new Set());
      setSelections({});
      setSaving(false);
      setSelectedCategoryId("__all__");
      setCategoryPickerOpen(false);
      setCostWarningInfo(null);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative flex h-full w-full max-h-full flex-col overflow-hidden bg-white shadow-2xl sm:h-[90dvh] sm:max-h-[90dvh] sm:max-w-6xl sm:rounded-[2.5rem]">
        <ActionPopup message={popupMessage} onClose={() => setPopupMessage(null)} />
        
        {/* Cost Warning Blocking Popup */}
        {costWarningInfo && (
          <div className="absolute inset-0 z-[10010] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-[2.5rem] bg-white p-8 shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-rose-50 text-rose-500 shadow-inner">
                  <AlertCircle className="h-10 w-10" strokeWidth={3} />
                </div>
                <h4 className="mb-2 text-2xl font-black text-slate-900 tracking-tight">ยืนยันราคาต่ำกว่าทุน?</h4>
                <div className="mb-8 space-y-2 max-h-[120px] overflow-y-auto w-full">
                  {costWarningInfo.items.map((item, i) => (
                    <div key={i} className="rounded-2xl bg-rose-50/50 px-4 py-3 text-sm font-bold text-rose-700 text-left">
                      <p className="line-clamp-1">{item.name}</p>
                      <p className="text-[11px] font-black opacity-70 mt-0.5 uppercase tracking-tighter">ราคา ฿{formatTHB(item.price)} (ทุน ฿{formatTHB(item.cost)})</p>
                    </div>
                  ))}
                </div>
                <div className="flex w-full flex-col gap-3">
                  <button
                    onClick={() => void handleConfirm(true)}
                    className="flex h-14 w-full items-center justify-center rounded-2xl bg-rose-600 text-lg font-black text-white shadow-lg shadow-rose-600/20 transition active:scale-95"
                  >
                    ยืนยันราคาตามนี้
                  </button>
                  <button
                    onClick={() => setCostWarningInfo(null)}
                    className="flex h-14 w-full items-center justify-center rounded-2xl bg-slate-100 text-lg font-black text-slate-600 transition active:scale-95"
                  >
                    กลับไปแก้ไข
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 bg-white px-4 py-2.5 sm:px-8 sm:py-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-black tracking-tight text-slate-900 sm:text-xl">เลือกสินค้าเพิ่ม</h3>
            {selectedCustomerLabel && (
              <p className="mt-0.5 text-[10px] font-bold text-[#003366] truncate sm:text-xs">ร้าน: {selectedCustomerLabel}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition active:scale-95 sm:h-11 sm:w-11 sm:rounded-2xl"
          >
            <X className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={3} />
          </button>
        </div>

        {/* Combined Search & Category Filter */}
        <div className="shrink-0 border-b-2 border-slate-100 bg-white px-4 py-3 sm:px-8">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-2xl border-2 border-slate-100 bg-slate-50 px-3 py-2.5 focus-within:border-[#003366]/40 focus-within:bg-white transition-all shadow-sm">
              <Search className="h-5 w-5 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหาสินค้า..."
                className="min-w-0 flex-1 bg-transparent text-base font-bold text-slate-900 outline-none placeholder:text-slate-400"
              />
            </div>
            <button
              onClick={() => setCategoryPickerOpen(true)}
              className="flex items-center gap-2 rounded-2xl border-2 border-slate-100 bg-slate-50 px-3 py-2.5 text-sm font-black text-slate-700 transition active:scale-95 hover:border-[#003366]/20 shadow-sm shrink-0"
            >
              <div className="flex flex-col items-start leading-none gap-1">
                <span className="text-[9px] text-slate-400 uppercase tracking-widest">หมวดหมู่</span>
                <span className="text-[#003366] truncate max-w-[90px]">{activeCategoryName}</span>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-slate-300" strokeWidth={4} />
            </button>
          </div>
        </div>

        {/* Content Area - Full Width List */}
        <div className="flex-1 overflow-y-auto bg-white">
          {productsLoading ? (
            <div className="flex h-64 flex-col items-center justify-center gap-4 text-slate-400">
              <Loader2 className="h-10 w-10 animate-spin" />
              <p className="text-sm font-black uppercase tracking-widest">กำลังโหลด...</p>
            </div>
          ) : products.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-4 text-slate-300">
              <Package2 className="h-16 w-16" strokeWidth={1} />
              <p className="text-lg font-black uppercase tracking-widest text-center px-6">ไม่มีข้อมูลสินค้าในระบบ</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-4 text-slate-300">
              <Search className="h-16 w-16" strokeWidth={1} />
              <p className="text-lg font-black uppercase tracking-widest text-center px-6">ไม่พบสินค้าที่ตรงกับการค้นหา</p>
            </div>
          ) : (
            <div className="space-y-4 p-3 md:space-y-0 md:p-5">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3">
                {filteredProducts.map((p) => (
                  <ProductRow
                    key={p.id}
                    product={p}
                    isSelected={selectedIds.has(p.id)}
                    onSelect={handleSelectProduct}
                    selection={selections[p.id]}
                    onUpdateSelection={handleUpdateSelection}
                    addedCount={cart.filter(item => item.productId === p.id).reduce((s, i) => s + i.quantity, 0)}
                    priceMap={priceMap}
                    noCustomer={noCustomer}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="shrink-0 border-t-2 border-slate-200 bg-white px-5 py-4 pb-safe-or-4 sm:px-8 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
          <div className="flex items-center justify-between gap-6">
            <div className="min-w-0">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">เลือกแล้ว</p>
              <p className="text-2xl font-black text-[#003366] tabular-nums leading-none">{selectedIds.size} <span className="text-xs">รายการ</span></p>
            </div>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={saving || selectedIds.size === 0}
              className="flex-1 flex items-center justify-center gap-3 rounded-2xl bg-[#003366] py-3.5 text-xl font-black text-white shadow-xl shadow-[#003366]/30 transition-all hover:bg-[#002244] disabled:opacity-40 active:scale-[0.98]"
            >
              {saving ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>กำลังเพิ่ม...</span>
                </>
              ) : (
                <>
                  <ShoppingCart className="h-5 w-5" strokeWidth={3} />
                  <span>เพิ่มเข้ารายการ</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Sliding Category Picker */}
        {categoryPickerOpen && (
          <div className="absolute inset-0 z-[10010] flex flex-col bg-slate-950/40 backdrop-blur-sm">
            <div className="absolute inset-0" onClick={() => setCategoryPickerOpen(false)} />
            <div className="mt-auto relative flex max-h-[85%] flex-col overflow-hidden rounded-t-[3rem] bg-white shadow-2xl animate-in slide-in-from-bottom duration-300">
              <div className="flex items-center justify-between border-b border-slate-100 px-8 py-6">
                <h4 className="text-2xl font-black text-slate-900 uppercase tracking-tight">เลือกหมวดหมู่</h4>
                <button
                  onClick={() => setCategoryPickerOpen(false)}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition active:scale-95"
                >
                  <X className="h-6 w-6" strokeWidth={3} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                <div className="grid grid-cols-1 gap-3">
                  <button
                    onClick={() => { setSelectedCategoryId("__all__"); setCategoryPickerOpen(false); }}
                    className={`flex items-center justify-between rounded-3xl px-6 py-5 text-left transition-all ${
                      selectedCategoryId === "__all__" ? "bg-[#003366] text-white shadow-xl" : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <span className="text-xl font-black">ทุกหมวดหมู่</span>
                    {selectedCategoryId === "__all__" && <Check className="h-6 w-6" strokeWidth={5} />}
                  </button>
                  {categoryOptions.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setSelectedCategoryId(c.id); setCategoryPickerOpen(false); }}
                      className={`flex items-center justify-between rounded-3xl px-6 py-5 text-left transition-all ${
                        selectedCategoryId === c.id ? "bg-[#003366] text-white shadow-xl" : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <span className="text-xl font-black">{c.name}</span>
                      {selectedCategoryId === c.id && <Check className="h-6 w-6" strokeWidth={5} />}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-safe-or-8 bg-white" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Manual Order Creation
export function CreateOrderModal({
  autoOpen,
  customerOrderCountsToday = {},
  customers = [],
  products = [],
  today = new Date().toISOString().split("T")[0],
  open: propOpen,
  onOpenChange,
  hideTrigger,
  initialCustomerId,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = propOpen !== undefined ? propOpen : internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const router = useRouter();
  const [isClosing, setIsClosing] = useState(false);
  const [activeTab, setActiveTab] = useState<ModalTab>("create");
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [success, setSuccess] = useState<{ deliveryNumber: string } | null>(null);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyNotice, setHistoryNotice] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [orderDate, setOrderDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [customerOrderCountsByDate, setCustomerOrderCountsByDate] =
    useState<Record<string, number>>(customerOrderCountsToday);


  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [customerPickerQuery, setCustomerPickerQuery] = useState("");
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  const [pricesLoading, setPricesLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [lastOrderSnapshot, setLastOrderSnapshot] = useState<CustomerLastOrderSnapshot | null>(null);
  const [submitPopupMessage, setSubmitPopupMessage] = useState<string | null>(null);
  const [editingCartIndex, setEditingCartIndex] = useState<number | null>(null);
  const [editQty, setEditQty] = useState(1);
  const historyRequestId = useRef(0);
  const submitPopupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === customerId) ?? null,
    [customers, customerId],
  );
  const selectedCustomerOrderCount = customerId ? customerOrderCountsByDate[customerId] ?? 0 : 0;
  const orderedCustomers = useMemo(
    () => customers.toSorted(compareCustomerOrder),
    [customers],
  );

  // Pre-select customer if initialCustomerId is provided
  useEffect(() => {
    if (open && initialCustomerId && !customerId) {
      void handleCustomerSelect(initialCustomerId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialCustomerId]);

  useEffect(() => {
    return () => {
      if (submitPopupTimerRef.current) {
        clearTimeout(submitPopupTimerRef.current);
      }
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (autoOpen) {
      setIsClosing(false);
      setOpen(true);
    }
  }, [autoOpen, setOpen]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const counts = await fetchCustomerOrderCountsForDateAction(orderDate);
      if (!cancelled) {
        setCustomerOrderCountsByDate(counts);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, orderDate]);

  const filteredCustomers = customerPickerQuery
    ? orderedCustomers.filter((c) => {
        const n = normalizeSearch(customerPickerQuery);
        return normalizeSearch(c.name).includes(n) || normalizeSearch(c.code).includes(n);
      })
    : orderedCustomers;

  async function loadLastOrderSnapshot(nextCustomerId: string, nextOrderDate: string) {
    if (!nextCustomerId) {
      setLastOrderSnapshot(null);
      setHistoryLoading(false);
      return null;
    }

    const requestId = ++historyRequestId.current;
    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const snapshot = await fetchCustomerLastOrderItemsAction(nextCustomerId, nextOrderDate);
      if (historyRequestId.current !== requestId) {
        return null;
      }
      setLastOrderSnapshot(snapshot);
      return snapshot;
    } catch {
      if (historyRequestId.current === requestId) {
        setHistoryError("ไม่สามารถโหลดประวัติร้านค้านี้ได้");
      }
      return null;
    } finally {
      if (historyRequestId.current === requestId) {
        setHistoryLoading(false);
      }
    }
  }

  function applyLastOrderItemsToCart(snapshot: CustomerLastOrderSnapshot | null) {
    if (!snapshot || snapshot.items.length === 0) {
      setHistoryNotice("ไม่พบรายการล่าสุดให้สั่งซ้ำ");
      return;
    }

    setCart((prev) => {
      const nextCart = [...prev];

      for (const row of snapshot.items) {
        const product = productsById.get(row.productId);
        if (!product) {
          continue;
        }
        const productUnits = getUnits(product);
        const matchedUnit =
          productUnits.find((unit) => unit.id === row.saleUnitId) ??
          productUnits.find((unit) => unit.isDefault) ??
          productUnits[0] ?? {
            minOrderQty: 1,
            stepOrderQty: null,
          };

        const resolvedUnitPrice =
          priceMap[row.saleUnitId ?? row.productId] ?? priceMap[row.productId] ?? row.unitPrice;

        const existingIndex = nextCart.findIndex(
          (item) => item.productId === row.productId && (item.saleUnitId || null) === (row.saleUnitId || null),
        );

        if (existingIndex >= 0) {
          const existingItem = nextCart[existingIndex];
          nextCart[existingIndex] = {
            ...existingItem,
            quantity: normalizeToRule(
              existingItem.quantity + row.quantity,
              existingItem.minOrderQty,
              existingItem.stepOrderQty,
            ),
            unitPrice: resolvedUnitPrice,
          };
          continue;
        }

        nextCart.push({
          productId: row.productId,
          productName: product.name,
          quantity: normalizeToRule(row.quantity, matchedUnit.minOrderQty, matchedUnit.stepOrderQty),
          minOrderQty: matchedUnit.minOrderQty,
          saleUnitBaseQty: row.saleUnitBaseQty,
          saleUnitId: row.saleUnitId,
          saleUnitLabel: row.saleUnitLabel,
          stepOrderQty: matchedUnit.stepOrderQty,
          unitPrice: resolvedUnitPrice,
        });
      }

      return nextCart;
    });

    setActiveTab("create");
    setHistoryNotice(`นำเข้ารายการล่าสุดแล้ว ${snapshot.items.length} รายการ`);
  }

  async function handleCustomerSelect(id: string) {
    setHistoryNotice(null);
    setCustomerId(id);
    setActiveTab("create"); // Keep on Product List tab after selection
    setCustomerPickerOpen(false);
    setCustomerPickerQuery("");
    setPricesLoading(true);
    setHistoryError(null);
    try {
      // Ensure we have a valid date for loading snapshot
      const fetchDate = orderDate || today;

      const [prices] = await Promise.all([
        fetchCustomerPricesAction(id),
        loadLastOrderSnapshot(id, fetchDate),
      ]);
      setPriceMap(prices);
      setCart((prev) =>
        prev.map((item) => ({
          ...item,
          unitPrice:
            prices[item.saleUnitId ?? item.productId] ??
            prices[item.productId] ??
            item.unitPrice,
        })),
      );
    } catch {
      setHistoryError("โหลดข้อมูลร้านค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setPricesLoading(false);
    }
  }

  function addManyToCart(
    selections: {
      product: OrderProductOption;
      unitId: string | null;
      unitLabel: string;
      baseQty: number;
      quantity: number;
      unitPrice: number;
      minOrderQty: number;
      stepOrderQty: number | null;
    }[]
  ) {
    const targetCustomerId = customerId;

    setCart((prev) => {
      const nextCart = [...prev];
      for (const sel of selections) {
        const existingIndex = nextCart.findIndex(
          (item) => item.productId === sel.product.id && (item.saleUnitId || null) === (sel.unitId || null),
        );
        if (existingIndex >= 0) {
          nextCart[existingIndex] = {
            ...nextCart[existingIndex],
            quantity: normalizeToRule(
              nextCart[existingIndex].quantity + sel.quantity,
              sel.minOrderQty,
              sel.stepOrderQty,
            ),
            minOrderQty: sel.minOrderQty,
            stepOrderQty: sel.stepOrderQty,
            unitPrice: sel.unitPrice,
          };
        } else {
          nextCart.push({
            productId: sel.product.id,
            productName: sel.product.name,
            quantity: sel.quantity,
            minOrderQty: sel.minOrderQty,
            saleUnitBaseQty: sel.baseQty,
            saleUnitId: sel.unitId,
            saleUnitLabel: sel.unitLabel,
            stepOrderQty: sel.stepOrderQty,
            unitPrice: sel.unitPrice,
          });
        }
      }
      return nextCart;
    });

    if (!targetCustomerId) return;

        const priceItems = selections.map((sel) => ({
      productId: sel.product.id,
      productSaleUnitId: sel.unitId,
      salePrice: sel.unitPrice,
    }));

    void upsertCustomerPricesBatchFromOrderModalAction({
      customerId: targetCustomerId,
      items: priceItems,
    }).catch((err) => {
      console.error("Background price upsert error:", err);
    });

    setPriceMap((prev) => {
      const next = { ...prev };
      for (const sel of selections) {
        const priceKey = sel.unitId ?? sel.product.id;
        next[sel.product.id] = sel.unitPrice;
        next[priceKey] = sel.unitPrice;
      }
      return next;
    });
  }

  function openCartEdit(index: number) {
    const item = cart[index];
    if (!item) return;
    setEditQty(item.quantity);
    setEditingCartIndex(index);
  }

  function confirmCartEdit() {
    if (editingCartIndex === null) return;
    const item = cart[editingCartIndex];
    if (!item) return;
    const normalized = normalizeToRule(editQty, item.minOrderQty, item.stepOrderQty);
    setCart((prev) =>
      prev.map((c, i) => (i === editingCartIndex ? { ...c, quantity: normalized } : c)),
    );
    setEditingCartIndex(null);
  }

  function removeFromCartAndClose(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
    setEditingCartIndex(null);
  }

  function resetForm() {
    historyRequestId.current += 1;
    setActiveTab("create");
    setCart([]);
    setCustomerId("");
    setCustomerPickerOpen(false);
    setCustomerPickerQuery("");
    setOrderDate(today);
    setNotes("");
    setError(null);
    setSuccess(null);
    setHistoryNotice(null);
    setPriceMap({});
    setPricesLoading(false);
    setHistoryLoading(false);
    setHistoryError(null);
    setLastOrderSnapshot(null);
    setProductModalOpen(false);
    setSubmitPopupMessage(null);
  }

  function handleClose() {
    if (!open || isClosing) return;
    setIsClosing(true);
    setCustomerPickerOpen(false);
    setProductModalOpen(false);
    setEditingCartIndex(null);
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      setIsClosing(false);
      resetForm();
    }, 380);
  }

  function handleSubmit() {
    setError(null);
    function showSubmitPopup(message: string) {
      setError(message);
      setSubmitPopupMessage(message);
      if (submitPopupTimerRef.current) {
        clearTimeout(submitPopupTimerRef.current);
      }
      submitPopupTimerRef.current = setTimeout(() => setSubmitPopupMessage(null), 2800);
    }

    if (!customerId) {
      showSubmitPopup("กรุณาเลือกลูกค้าก่อน");
      return;
    }
    if (cart.length === 0) {
      showSubmitPopup("กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ");
      return;
    }
    if (
      cart.some((item) => !isValidByRule(item.quantity, item.minOrderQty, item.stepOrderQty))
    ) {
      showSubmitPopup("จำนวนสินค้าบางรายการไม่ตรงตามขั้นต่ำ/จำนวนเพิ่ม กรุณาปรับใหม่ก่อนบันทึก");
      return;
    }
    if (cart.some((item) => !Number.isFinite(item.unitPrice) || item.unitPrice <= 0)) {
      showSubmitPopup("ยังมีสินค้าที่ยังไม่ตั้งราคา กรุณาใส่ราคามากกว่า 0 ก่อนบันทึกออเดอร์");
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.set("customerId", customerId);
      formData.set("channel", "created");
      formData.set("orderDate", orderDate);
      formData.set("notes", notes.trim());
      formData.set("items", JSON.stringify(cart));
      const result = await createManualOrderAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      
      // SHOW SUCCESS OVERLAY AND RESET FORM (DON'T CLOSE)
      const resolvedDeliveryNumber =
        (result.deliveryNumber && String(result.deliveryNumber).trim()) ||
        (result.orderNumber && String(result.orderNumber).trim().startsWith("DN")
          ? String(result.orderNumber).trim()
          : "");
      if (resolvedDeliveryNumber) {
        setSuccess({ deliveryNumber: resolvedDeliveryNumber });
      } else {
        setSuccess(null);
      }
      setShowSuccessOverlay(true);
      
      // Clear overlay after 3 seconds and reset form
      setTimeout(() => {
        setShowSuccessOverlay(false);
        resetForm();
      }, 2500);
    });
  }

  const totalAmount = cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const hasUnpricedItems = cart.some(
    (item) => !Number.isFinite(item.unitPrice) || item.unitPrice <= 0,
  );
  const historyItems = lastOrderSnapshot?.items ?? [];
  const editingCartItem =
    editingCartIndex !== null ? (cart[editingCartIndex] ?? null) : null;

  return (
    <>
      {/* Trigger */}
      {!hideTrigger && (
        <button
          type="button"
          onClick={() => {
            if (closeTimerRef.current) {
              clearTimeout(closeTimerRef.current);
            }
            setIsClosing(false);
            setOpen(true);
          }}
          className="action-touch-safe inline-flex items-center justify-center gap-2 rounded-full bg-[#003366] px-4 py-2.5 text-sm font-bold text-white shadow-[0_12px_40px_rgba(0,51,102,0.35)] transition-all hover:scale-105 hover:bg-[#002244] active:scale-95 md:h-14 md:px-7 md:text-[15px]"
        >
          <Plus className="h-4.5 w-4.5 md:h-5 md:w-5" strokeWidth={3} />
          สร้างออเดอร์
        </button>
      )}

      <CreateOrderPortal>
      {/* Main modal */}
      {(open || isClosing) && (
        <div
          className={`fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 p-0 sm:p-4 ${
            isClosing ? "animate-fade-out" : "animate-fade-in"
          }`}
        >
          <div className="absolute inset-0" onClick={handleClose} />

          <div
            className={`relative flex h-full w-full max-h-full flex-col overflow-hidden rounded-none bg-white shadow-2xl sm:h-[94dvh] sm:max-h-[94dvh] sm:max-w-6xl sm:rounded-[2rem] lg:h-[86dvh] lg:max-h-[86dvh] ${
              isClosing ? "animate-slide-up-premium" : "animate-slide-down-premium"
            }`}
          >
            <ActionPopup message={submitPopupMessage} onClose={() => setSubmitPopupMessage(null)} />

            {/* Premium Success Overlay */}
            {showSuccessOverlay && success && (
              <div className="absolute inset-0 z-[100] flex items-center justify-center bg-white/60 backdrop-blur-md animate-in fade-in duration-300">
                <div className="flex w-full max-w-sm flex-col items-center rounded-[2.5rem] bg-white p-10 text-center shadow-[0_32px_64px_rgba(0,0,0,0.15)] ring-1 ring-slate-100 animate-in zoom-in-95 duration-500">
                  <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">
                    <Check className="h-14 w-14" strokeWidth={4} />
                  </div>
                  <h3 className="mb-2 text-3xl font-black text-slate-900 tracking-tight">บันทึกสำเร็จ!</h3>
                  <div className="space-y-1 text-slate-500">
                    <p className="text-sm font-bold uppercase tracking-widest opacity-60">เลขที่ใบส่งของ</p>
                    <p className="font-mono text-2xl font-black text-[#003366]">{success.deliveryNumber}</p>
                  </div>
                  {success.deliveryNumber && (
                    <div className="mt-4 rounded-2xl bg-slate-50 px-6 py-3 border border-slate-100">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">ใบส่งของ</p>
                      <p className="font-mono text-lg font-black text-slate-700">{success.deliveryNumber}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Header */}
            <div className="sticky top-0 z-40 flex shrink-0 items-center justify-between gap-3 border-b border-[#003366]/30 bg-[#003366] px-4 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] text-white shadow-sm sm:px-5 sm:py-4 sm:pt-4">
              <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 sm:h-11 sm:w-11 sm:rounded-2xl">
                  <ShoppingCart className="h-4.5 w-4.5 text-white sm:h-5 sm:w-5" strokeWidth={2.2} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-white sm:text-lg">สร้างออเดอร์ใหม่</h2>
                  <p className="text-[10px] text-white/60 sm:text-xs">ช่องทาง: สร้าง (โดยแอดมิน)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white active:scale-95 sm:h-11 sm:w-11 sm:rounded-2xl"
                aria-label="ปิด"
              >
                <X className="h-4.5 w-4.5 sm:h-5 sm:w-5" strokeWidth={2.2} />
              </button>
            </div>

            {/* Success banner */}
            {success && (
              <div className="shrink-0 bg-emerald-50 px-5 py-4 text-emerald-800 shadow-[inset_0_-1px_0_rgba(16,185,129,0.1)]">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
                      <Check className="h-6 w-6" strokeWidth={3} />
                    </div>
                    <div>
                      <p className="text-base font-bold leading-tight">บันทึกออเดอร์สำเร็จ!</p>
                      <p className="mt-1 text-sm font-semibold opacity-90">
                        ใบส่งของ: <span className="font-mono text-[#003366] font-bold">{success.deliveryNumber}</span>
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      router.push("/dashboard?date=" + orderDate + "&print=" + success.deliveryNumber);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#003366] px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#002244]"
                  >
                    <Truck className="h-3.5 w-3.5" strokeWidth={2.4} />
                    ไปที่หน้าพิมพ์
                  </button>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              <div className="flex flex-col lg:grid lg:grid-cols-2 lg:divide-x lg:divide-slate-200">
                {/* Left Column: Customer + Date + History Tab Control */}
                <div className="flex flex-col px-4 py-5 sm:px-5">
                  <div className="space-y-6">
                    {/* Customer */}
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        ลูกค้า <span className="text-rose-500">*</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCustomerPickerOpen(true)}
                          className={`action-touch-safe flex min-w-0 flex-1 items-center gap-3 rounded-2xl border bg-white px-4 py-3.5 text-left transition ${
                            customerId ? "border-[#003366]/40" : "border-slate-200 hover:border-[#003366]/40"
                          }`}
                        >
                          <Building2 className="h-5 w-5 shrink-0 text-slate-400" strokeWidth={2} />
                          <div className="min-w-0 flex-1">
                            {selectedCustomer ? (
                              <>
                                <p className="truncate text-base font-semibold text-slate-900">
                                  {selectedCustomer.name}
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <p className="text-sm text-slate-500">{selectedCustomer.code}</p>
                                  {selectedCustomerOrderCount > 0 ? (
                                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                                      สั่งแล้ววันนี้
                                      {selectedCustomerOrderCount > 1
                                        ? ` ${selectedCustomerOrderCount}`
                                        : ""}
                                    </span>
                                  ) : null}
                                </div>
                              </>
                            ) : (
                              <p className="text-base text-slate-400">แตะเพื่อเลือกร้านค้า</p>
                            )}
                          </div>
                          <ChevronRight className="h-4.5 w-4.5 shrink-0 text-slate-400" strokeWidth={2.2} />
                        </button>
                        {customerId ? (
                          <button
                            type="button"
                            onClick={() => {
                              setCustomerId("");
                              setPriceMap({});
                              setLastOrderSnapshot(null);
                              setHistoryError(null);
                              setHistoryNotice(null);
                            }}
                            className="action-touch-safe flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:bg-slate-50"
                            aria-label="ล้างการเลือกลูกค้า"
                          >
                            <X className="h-4.5 w-4.5" strokeWidth={2.2} />
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {/* Order date */}
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        วันที่ออเดอร์
                      </label>
                      <ThaiDatePicker
                        id="create-order-date"
                        name="orderDate"
                        value={orderDate}
                        onChange={(nextOrderDate) => {
                          setOrderDate(nextOrderDate);
                          setHistoryNotice(null);
                          if (!customerId) return;
                          void loadLastOrderSnapshot(customerId, nextOrderDate);
                        }}
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="create-order-notes"
                        className="mb-2 block text-sm font-semibold text-slate-700"
                      >
                        หมายเหตุ
                      </label>
                      <textarea
                        id="create-order-notes"
                        name="notes"
                        rows={3}
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        placeholder="ใส่หมายเหตุสำหรับออเดอร์นี้"
                        className="min-h-[88px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#003366]/40 focus:ring-2 focus:ring-[#003366]/10"
                      />
                    </div>

                    {/* History Tab Toggle (Mobile only, hidden on desktop if we want both visible, but user said history on right) */}
                    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:hidden">
                      <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2">
                        <button
                          type="button"
                          onClick={() => setActiveTab("create")}
                          className={`inline-flex items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
                            activeTab === "create"
                              ? "bg-[#003366] text-white shadow-sm"
                              : "bg-white text-slate-600 hover:text-[#003366]"
                          }`}
                        >
                          <ClipboardList className="h-4 w-4" strokeWidth={2.2} />
                          สร้างออเดอร์
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab("history")}
                          className={`inline-flex items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
                            activeTab === "history"
                              ? "bg-[#003366] text-white shadow-sm"
                              : "bg-white text-slate-600 hover:text-[#003366]"
                          }`}
                        >
                          <History className="h-4 w-4" strokeWidth={2.2} />
                          ประวัติร้านนี้
                        </button>
                      </div>
                    </section>

                    {/* History Section (Visible on Desktop Right, but if user wants history on right, maybe we put it there) */}
                    <div className="hidden lg:block">
                       {/* Desktop History can be placed here or in right column. 
                           User said: "Right side will be products list, add product, history"
                           So I will put History in the right column, maybe as a section or toggle.
                       */}
                    </div>
                  </div>
                </div>

                {/* Right Column: Products + History (Desktop) */}
                <div className="flex flex-col bg-slate-50/30 px-4 py-5 sm:px-5">
                  <div className="space-y-6">
                    {historyNotice ? (
                      <div className="rounded-2xl border border-[#003366]/20 bg-[#003366]/5 px-4 py-3 text-sm font-medium text-[#003366]">
                        {historyNotice}
                      </div>
                    ) : null}

                    {/* Only show Create/History toggle on desktop if we want to switch views in right col */}
                    <div className="hidden lg:block">
                      <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">
                        <button
                          type="button"
                          onClick={() => setActiveTab("create")}
                          className={`inline-flex items-center justify-center gap-2 rounded-xl py-2 text-sm font-bold transition ${
                            activeTab === "create" ? "bg-white text-[#003366] shadow-sm" : "text-slate-500 hover:text-slate-700"
                          }`}
                        >
                          <ClipboardList className="h-4 w-4" />
                          รายการสินค้า
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab("history")}
                          className={`inline-flex items-center justify-center gap-2 rounded-xl py-2 text-sm font-bold transition ${
                            activeTab === "history" ? "bg-white text-[#003366] shadow-sm" : "text-slate-500 hover:text-slate-700"
                          }`}
                        >
                          <History className="h-4 w-4" />
                          ประวัติสั่งซื้อ
                        </button>
                      </div>
                    </div>

                    {activeTab === "create" ? (
                      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
                          <p className="text-xs font-bold tracking-widest text-slate-400 uppercase">
                            รายการสินค้า
                          </p>
                          <button
                            type="button"
                            onClick={() => setProductModalOpen(true)}
                            className="action-touch-safe inline-flex items-center gap-1.5 rounded-xl bg-[#003366] px-3 py-2 text-sm font-bold text-white transition hover:bg-[#002244] active:scale-95"
                          >
                            <Plus className="h-4 w-4" strokeWidth={2.5} />
                            เพิ่มสินค้า
                          </button>
                        </div>

                        <div className="px-2 py-4 sm:px-3">
                          {cart.length === 0 ? (
                            <button
                              type="button"
                              onClick={() => setProductModalOpen(true)}
                              className="action-touch-safe flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center transition hover:border-[#003366]/30 hover:bg-[#003366]/5"
                            >
                              <Package2 className="h-9 w-9 text-slate-300" strokeWidth={1.8} />
                              <p className="mt-3 text-base font-semibold text-slate-500">
                                ยังไม่มีสินค้าในออเดอร์
                              </p>
                              <p className="mt-1 text-sm text-slate-400">แตะที่นี่เพื่อเพิ่มสินค้า</p>
                            </button>
                          ) : (
                            <div className="divide-y divide-slate-100">
                              {cart.map((item, index) => {
                                const product = productsById.get(item.productId);
                                return (
                                  <div
                                    key={`${item.productId}-${item.saleUnitId}`}
                                    className="flex items-center gap-2.5 px-2 py-3 sm:gap-3"
                                  >
                                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                                      {product?.imageUrl ? (
                                        <Image
                                          src={product.imageUrl}
                                          alt={item.productName}
                                          fill
                                          className="object-cover"
                                          sizes="48px"
                                        />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center">
                                          <Package2 className="h-6 w-6 text-slate-300" strokeWidth={1.8} />
                                        </div>
                                      )}
                                    </div>

                                    <div className="min-w-0 flex-1">
                                      <p className="max-h-[2.8rem] overflow-hidden whitespace-normal break-words text-sm font-semibold leading-snug text-slate-900">
                                        {item.productName}
                                      </p>
                                    </div>

                                    <div className="shrink-0 text-right">
                                      <p className="whitespace-nowrap text-sm font-bold tabular-nums text-slate-900">
                                        ×{item.quantity.toLocaleString("th-TH")} {item.saleUnitLabel}
                                      </p>
                                      <p className="mt-0.5 text-xs font-semibold tabular-nums text-[#003366]">
                                        ฿{formatTHB(item.quantity * item.unitPrice)}
                                      </p>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => openCartEdit(index)}
                                      className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-[#003366]/30 hover:bg-[#003366]/5 hover:text-[#003366] active:scale-95"
                                      aria-label={`แก้ไขจำนวน ${item.productName}`}
                                    >
                                      แก้ไข
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </section>
                    ) : (
                      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
                          <p className="text-sm font-semibold text-slate-700">รายการที่เคยสั่งล่าสุด</p>
                          {customerId ? (
                            <button
                              type="button"
                              onClick={() => void loadLastOrderSnapshot(customerId, orderDate)}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:text-[#003366]"
                            >
                              รีเฟรช
                            </button>
                          ) : null}
                        </div>

                        <div className="px-4 py-4">
                          {!customerId ? (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                              กรุณาเลือกร้านค้าก่อน
                            </div>
                          ) : historyLoading ? (
                            <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} />
                              กำลังโหลดประวัติการสั่งซื้อ
                            </div>
                          ) : historyError ? (
                            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                              {historyError}
                            </div>
                          ) : historyItems.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                              ไม่พบประวัติการสั่งซื้อที่ผ่านมา
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <button
                                type="button"
                                onClick={() => applyLastOrderItemsToCart(lastOrderSnapshot)}
                                className="w-full rounded-2xl bg-[#003366] py-3.5 text-base font-bold text-white shadow-[0_8px_16px_rgba(0,51,102,0.15)] transition hover:bg-[#002244] active:scale-[0.98]"
                              >
                                สั่งซ้ำและกลับไปแก้รายการ
                              </button>

                              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                                วันที่อ้างอิง {formatThaiShortDate(lastOrderSnapshot?.sourceDate ?? "")}
                                <span className="mx-2 text-slate-300">|</span>
                                {lastOrderSnapshot?.orderCount ?? 0} ใบสั่งซื้อ
                              </div>

                              {historyItems.map((item) => {
                                const product = productsById.get(item.productId);
                                const name = product?.name ?? item.productId;
                                return (
                                  <div
                                    key={`${item.productId}-${item.saleUnitId ?? "__default__"}`}
                                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3"
                                  >
                                    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                                      {product?.imageUrl ? (
                                        <Image
                                          src={product.imageUrl}
                                          alt={name}
                                          fill
                                          className="object-cover"
                                          sizes="44px"
                                        />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center">
                                          <Package2 className="h-5 w-5 text-slate-400" strokeWidth={1.9} />
                                        </div>
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
                                      <p className="mt-0.5 text-xs text-slate-500">
                                        {item.quantity.toLocaleString("th-TH")} {item.saleUnitLabel} ·{" "}
                                        {formatTHB(item.unitPrice)} บาท
                                      </p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </section>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Sticky Footer */}
            <div className="sticky bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 pb-safe-or-5 pt-4 backdrop-blur supports-[backdrop-filter]:bg-white/90 sm:px-6">
              <div className="mx-auto max-w-6xl">
                {error && (
                  <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500 text-xs font-bold text-white">
                      !
                    </span>
                    <p className="text-base font-medium text-rose-700">{error}</p>
                  </div>
                )}

                {hasUnpricedItems && activeTab === "create" && (
                  <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                    มีสินค้าที่ยังไม่ตั้งราคา กรุณาใส่ราคาก่อนบันทึกออเดอร์
                  </div>
                )}

                <div className="grid grid-cols-2 items-center gap-4 sm:gap-6">
                  <div className="flex flex-col justify-center">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">ยอดรวมทั้งหมด</span>
                    <span className="mt-1 text-2xl font-black tabular-nums text-[#003366] sm:text-3xl">
                      ฿{formatTHB(totalAmount)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={pending}
                    className="action-touch-safe flex h-14 items-center justify-center rounded-2xl bg-[#003366] px-4 py-4 text-lg font-bold text-white shadow-lg shadow-[#003366]/20 transition hover:bg-[#002244] disabled:opacity-40 active:scale-[0.98] sm:h-16 sm:text-xl"
                  >
                    {pending ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span>กำลังบันทึก...</span>
                      </div>
                    ) : (
                      "บันทึกออเดอร์"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {open && customerPickerOpen ? (
        <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4">
          <div className="absolute inset-0" onClick={() => setCustomerPickerOpen(false)} />
          <div className="relative flex h-full w-full max-h-full flex-col overflow-hidden rounded-none bg-white shadow-2xl sm:h-[80dvh] sm:max-w-md sm:rounded-[2rem]">
            <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2.5 sm:py-4">
              <div className="min-w-0">
                <h3 className="truncate text-base font-bold text-slate-950 sm:text-lg">เลือกร้านค้า</h3>
                <p className="text-[10px] text-slate-500 sm:text-xs">ค้นหาด้วยชื่อร้าน หรือรหัสร้าน</p>
              </div>
              <button
                type="button"
                onClick={() => setCustomerPickerOpen(false)}
                className="action-touch-safe flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 sm:h-10 sm:w-10"
                aria-label="ปิดหน้าต่างเลือกร้านค้า"
              >
                <X className="h-4.5 w-4.5 sm:h-5 sm:w-5" strokeWidth={2.2} />
              </button>
            </div>

            <div className="shrink-0 border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition focus-within:border-[#003366]/60 focus-within:ring-2 focus-within:ring-[#003366]/10">
                <Search className="h-5 w-5 shrink-0 text-slate-400" strokeWidth={2} />
                <input
                  type="text"
                  value={customerPickerQuery}
                  onChange={(e) => setCustomerPickerQuery(e.target.value)}
                  placeholder="ค้นหาชื่อร้าน หรือรหัสร้าน"
                  className="min-w-0 flex-1 bg-transparent text-base text-slate-700 outline-none placeholder:text-slate-400"
                />
                {customerPickerQuery ? (
                  <button
                    type="button"
                    onClick={() => setCustomerPickerQuery("")}
                    className="action-touch-safe text-slate-400 transition hover:text-slate-600"
                    aria-label="ล้างคำค้นหาร้านค้า"
                  >
                    <X className="h-4 w-4" strokeWidth={2.2} />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3">
              {filteredCustomers.length === 0 ? (
                <div className="flex h-full min-h-[14rem] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center">
                  <Building2 className="h-8 w-8 text-slate-300" strokeWidth={1.9} />
                  <p className="mt-3 text-sm font-semibold text-slate-500">ไม่พบร้านค้าที่ค้นหา</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredCustomers.map((customer) => {
                    const isSelected = customer.id === customerId;
                    const orderCountToday = customerOrderCountsByDate[customer.id] ?? 0;
                    return (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => void handleCustomerSelect(customer.id)}
                        className={`action-touch-safe flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition ${
                          isSelected
                            ? "border-[#003366]/50 bg-[#003366]/5"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100">
                          <Building2 className="h-4.5 w-4.5 text-slate-500" strokeWidth={2} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-semibold leading-snug text-slate-900">{customer.name}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <p className="text-sm text-slate-500">{customer.code}</p>
                            {orderCountToday > 0 ? (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                                สั่งแล้ววันนี้{orderCountToday > 1 ? ` ${orderCountToday}` : ""}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        {isSelected ? (
                          <span className="rounded-full bg-[#003366] px-2 py-0.5 text-xs font-bold text-white">
                            เลือกแล้ว
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {open && editingCartItem && editingCartIndex !== null ? (
        <CreateOrderPortal>
        <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-slate-950/55 p-4">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setEditingCartIndex(null)}
            aria-label="ปิดหน้าต่างแก้ไขจำนวน"
          />
          <div className="relative w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="mb-3">
              <p className="text-sm font-bold text-slate-950">แก้ไขจำนวนสินค้า</p>
              <p className="mt-1 line-clamp-2 text-sm text-slate-500">{editingCartItem.productName}</p>
              <p className="text-xs text-slate-400">{editingCartItem.saleUnitLabel}</p>
            </div>

            <div className="mb-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  setEditQty((current) =>
                    stepByRule(
                      current,
                      -1,
                      editingCartItem.minOrderQty,
                      editingCartItem.stepOrderQty,
                    ),
                  )
                }
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 active:scale-95"
                aria-label="ลดจำนวนสินค้า"
              >
                <Minus className="h-4.5 w-4.5" strokeWidth={2.4} />
              </button>
              <div className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 py-2 text-center">
                <p className="text-xl font-bold tabular-nums text-slate-900">
                  {editQty.toLocaleString("th-TH")}
                </p>
                <p className="text-[11px] text-slate-500">{editingCartItem.saleUnitLabel}</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setEditQty((current) =>
                    stepByRule(
                      current,
                      1,
                      editingCartItem.minOrderQty,
                      editingCartItem.stepOrderQty,
                    ),
                  )
                }
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 active:scale-95"
                aria-label="เพิ่มจำนวนสินค้า"
              >
                <Plus className="h-4.5 w-4.5" strokeWidth={2.4} />
              </button>
            </div>

            <p className="mb-4 text-xs text-slate-500">
              {editingCartItem.stepOrderQty
                ? `เริ่มที่ ${editingCartItem.minOrderQty} และเพิ่มทีละ ${editingCartItem.stepOrderQty}`
                : `ขั้นต่ำ ${editingCartItem.minOrderQty}`}
            </p>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => removeFromCartAndClose(editingCartIndex)}
                className="inline-flex items-center justify-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2 py-2.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 active:scale-95"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
                ลบ
              </button>
              <button
                type="button"
                onClick={() => setEditingCartIndex(null)}
                className="rounded-xl border border-slate-200 px-2 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-95"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={confirmCartEdit}
                className="rounded-xl bg-[#003366] px-2 py-2.5 text-xs font-bold text-white transition hover:bg-[#002244] active:scale-95"
              >
                ยืนยัน
              </button>
            </div>
          </div>
        </div>
        </CreateOrderPortal>
      ) : null}

      <ProductSelectModal
        cart={cart}
        noCustomer={!customerId}
        onClose={() => setProductModalOpen(false)}
        onConfirmMany={addManyToCart}
        open={productModalOpen}
        priceMap={priceMap}
        products={products}
        productsLoading={pricesLoading}
        selectedCustomerLabel={
          selectedCustomer ? `${selectedCustomer.code} ${selectedCustomer.name}` : null
        }
      />
      </CreateOrderPortal>
    </>
  );
}

export function GlobalCreateOrderModal() {
  const { isOpen, close, data, isLoading, initialCustomerId } = useCreateOrder();

  if (!isOpen) return null;

  if (!data) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 p-4">
        <button
          type="button"
          className="absolute inset-0"
          aria-label="ปิดหน้าต่างสร้างออเดอร์"
          onClick={close}
        />
        <div className="relative w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#003366]" />
          <p className="text-base font-bold text-slate-950">กำลังเตรียมข้อมูลสร้างออเดอร์</p>
          <p className="mt-1 text-sm font-medium text-slate-600">
            {isLoading ? "กรุณารอสักครู่" : "กำลังโหลดข้อมูลร้านค้าและสินค้า"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <CreateOrderModal
      open={isOpen}
      onOpenChange={(open) => !open && close()}
      customers={data.customers}
      products={data.products}
      today={data.today}
      customerOrderCountsToday={{}}
      hideTrigger={true}
      initialCustomerId={initialCustomerId}
    />
  );
}
