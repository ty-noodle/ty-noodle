"use client";

import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  Check,
  Minus,
  Package2,
  Plus,
  Search,
  ShoppingBag,
  X,
  Boxes,
} from "lucide-react";
import { fetchCustomerPricesAction } from "@/app/orders/incoming/actions";
import { getEffectiveSaleUnitCost } from "@/lib/products/sale-unit-cost";
import type { OrderProductOption } from "@/lib/orders/manage";
import { normalizeSearch } from "@/lib/utils/search";
import {
  getEffectiveOrderMinimum,
  getEffectiveOrderStep as getEffectiveStep,
  normalizeOrderQuantity as normalizeQuantity,
} from "@/lib/orders/quantity-rules";

export type AddedOrderItemDraft = {
  imageUrl: string | null;
  key: string;
  productId: string;
  productName: string;
  productSaleUnitId: string | null;
  quantity: number;
  sku: string;
  unitLabel: string;
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

type SelectionDraft = {
  price: string;
  quantity: number;
  unitId: string | null;
};

type Props = {
  addedItems: AddedOrderItemDraft[];
  customerId: string;
  onAddMany: (items: AddedOrderItemDraft[]) => void;
  products: OrderProductOption[];
};

function formatTHB(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getUnits(product: OrderProductOption): ProductUnit[] {
  if (product.saleUnits.length > 0) {
    return product.saleUnits.map((unit) => {
      const stepOrderQty =
        unit.stepOrderQty === null || unit.stepOrderQty === undefined
          ? null
          : Number(unit.stepOrderQty);
      return {
        baseUnitQuantity: unit.baseUnitQuantity,
        costMode: unit.costMode ?? null,
        fixedCostPrice: unit.fixedCostPrice ?? null,
        id: unit.id,
        isDefault: unit.isDefault,
        label: product.unit,
        minOrderQty: getEffectiveOrderMinimum(Number(unit.minOrderQty ?? 1), stepOrderQty),
        stepOrderQty,
      };
    });
  }

  return [
    {
      baseUnitQuantity: 1,
      costMode: null,
      fixedCostPrice: null,
      id: null,
      isDefault: true,
      label: product.unit,
      minOrderQty: getEffectiveOrderMinimum(1, null),
      stepOrderQty: null,
    },
  ];
}

function getDefaultUnit(product: OrderProductOption) {
  const units = getUnits(product);
  return units.find((unit) => unit.isDefault) ?? units[0] ?? null;
}

function getPriceKey(productId: string, unitId: string | null) {
  return unitId ?? productId;
}

function getUnitPrice(productId: string, unitId: string | null, priceMap: Record<string, number>) {
  return priceMap[getPriceKey(productId, unitId)] ?? priceMap[productId] ?? 0;
}

export function OrderAddProductPicker({
  addedItems,
  customerId,
  onAddMany,
  products,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  const [selections, setSelections] = useState<Record<string, SelectionDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;

    startTransition(async () => {
      const prices = await fetchCustomerPricesAction(customerId);
      setPriceMap(prices);
    });
  }, [customerId, open]);

  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product] as const)),
    [products],
  );

  const filteredProducts = useMemo(() => {
    const normalized = normalizeSearch(deferredQuery);
    const source = normalized
      ? products.filter((product) => {
          return (
            normalizeSearch(product.name).includes(normalized) ||
            normalizeSearch(product.sku).includes(normalized) ||
            product.categoryNames.some((category) => normalizeSearch(category).includes(normalized))
          );
        })
      : products;

    return source.slice(0, 50);
  }, [products, deferredQuery]);

  const selectedCount = Object.keys(selections).length;

  function toggleProduct(product: OrderProductOption) {
    setError(null);
    setSelections((current) => {
      if (current[product.id]) {
        const next = { ...current };
        delete next[product.id];
        return next;
      }

      const defaultUnit = getDefaultUnit(product);
      if (!defaultUnit) return current;
      const defaultPrice = getUnitPrice(product.id, defaultUnit.id, priceMap);

      return {
        ...current,
        [product.id]: {
          price: defaultPrice === 0 ? "" : String(defaultPrice),
          quantity: defaultUnit.minOrderQty,
          unitId: defaultUnit.id,
        },
      };
    });
  }

  function updateSelection(productId: string, updater: (draft: SelectionDraft) => SelectionDraft) {
    setError(null);
    setSelections((current) => {
      const draft = current[productId];
      if (!draft) return current;
      return { ...current, [productId]: updater(draft) };
    });
  }

  function changeUnit(product: OrderProductOption, unitId: string | null) {
    const unit = getUnits(product).find((item) => item.id === unitId) ?? getDefaultUnit(product);
    if (!unit) return;
    const unitPrice = getUnitPrice(product.id, unit.id, priceMap);

    updateSelection(product.id, (curr) => ({
      ...curr,
      unitId: unit.id,
      price: unitPrice === 0 ? "" : String(unitPrice),
      quantity: Math.max(curr.quantity, unit.minOrderQty),
    }));
  }

  function stepQuantity(product: OrderProductOption, direction: -1 | 1) {
    const draft = selections[product.id];
    if (!draft) return;
    const unit = getUnits(product).find((item) => item.id === draft.unitId) ?? getDefaultUnit(product);
    if (!unit) return;

    updateSelection(product.id, (current) => ({
      ...current,
      quantity: normalizeQuantity(
        current.quantity + direction * getEffectiveStep(unit.stepOrderQty),
        unit.minOrderQty,
        unit.stepOrderQty,
      ),
    }));
  }

  function getSelectionIssue(product: OrderProductOption, draft: SelectionDraft) {
    const unit = getUnits(product).find((item) => item.id === draft.unitId) ?? getDefaultUnit(product);
    const price = Number(draft.price);
    if (!unit) return "ไม่พบหน่วยขาย";
    if (!Number.isFinite(price) || price <= 0) return "กรุณาใส่ราคามากกว่า 0";

    const cost = getEffectiveSaleUnitCost({
      baseCostPrice: product.baseCostPrice,
      baseUnitQuantity: unit.baseUnitQuantity,
      costMode: unit.costMode,
      fixedCostPrice: unit.fixedCostPrice,
    });

    if (cost > 0 && price < cost) {
      return `ราคาต่ำกว่าต้นทุน ฿${formatTHB(cost)}`;
    }

    return null;
  }

  function addSelectedProducts() {
    const selectedItems = Object.entries(selections)
      .map(([productId, draft]) => {
        const product = productsById.get(productId);
        if (!product) return null;
        const unit = getUnits(product).find((item) => item.id === draft.unitId) ?? getDefaultUnit(product);
        if (!unit) return null;
        const issue = getSelectionIssue(product, draft);
        if (issue) {
          setError(`${product.name}: ${issue}`);
          return null;
        }

        return {
          imageUrl: product.imageUrl,
          key: `${product.id}:${unit.id ?? "base"}:${crypto.randomUUID()}`,
          productId: product.id,
          productName: product.name,
          productSaleUnitId: unit.id,
          quantity: draft.quantity,
          sku: product.sku,
          unitLabel: unit.label,
          unitPrice: Number(draft.price),
        };
      })
      .filter((item): item is AddedOrderItemDraft => Boolean(item));

    if (selectedItems.length !== selectedCount) {
      return;
    }
    if (selectedItems.length === 0) {
      setError("กรุณาเลือกสินค้าอย่างน้อย 1 รายการ");
      return;
    }

    onAddMany(selectedItems);
    setOpen(false);
    setQuery("");
    setSelections({});
    setError(null);
  }

  return (
    <>
      <div className="rounded-[1.35rem] border border-slate-200 bg-white p-3 shadow-sm">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100 active:scale-[0.99]"
        >
          <span className="inline-flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#003366] text-white">
              <ShoppingBag className="h-4.5 w-4.5" strokeWidth={2.3} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-slate-950">เพิ่มสินค้าใหม่</span>
              {addedItems.length > 0 ? (
                <span className="block text-xs font-medium text-slate-500">
                  เพิ่มใหม่ {addedItems.length} รายการ
                </span>
              ) : null}
            </span>
          </span>
          <Plus className="h-5 w-5 shrink-0 text-[#003366]" />
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center overflow-x-hidden bg-slate-950/55 sm:items-center sm:p-2 xl:p-4">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setOpen(false)}
            aria-label="ปิดหน้าต่างเพิ่มสินค้า"
          />
          <div className="relative flex h-[92dvh] w-full max-w-[100vw] min-w-0 flex-col overflow-x-hidden overflow-y-hidden rounded-t-[2rem] bg-white shadow-2xl sm:h-[88dvh] sm:w-[min(1500px,calc(100vw-1rem))] sm:max-w-none sm:rounded-[2rem] xl:h-[86dvh] xl:w-[min(1760px,calc(100vw-1rem))]">
            <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:px-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#003366]/8 text-[#003366]">
                <ShoppingBag className="h-5 w-5" strokeWidth={2.3} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold text-slate-950">เพิ่มสินค้าใหม่</h3>
                <p className="mt-0.5 text-xs font-medium text-slate-500">
                  เลือกแล้ว {selectedCount.toLocaleString("th-TH")} รายการ
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 active:scale-95"
                aria-label="ปิด"
              >
                <X className="h-5 w-5" strokeWidth={2.2} />
              </button>
            </div>

            <div className="shrink-0 border-b border-slate-100 px-4 py-3 sm:px-5">
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition focus-within:border-[#003366]/60 focus-within:bg-white focus-within:ring-2 focus-within:ring-[#003366]/10">
                <Search className="h-5 w-5 shrink-0 text-slate-400" strokeWidth={2.1} />
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="ค้นหาสินค้า SKU หรือหมวดหมู่"
                  className="min-w-0 flex-1 bg-transparent text-base text-slate-800 outline-none placeholder:text-slate-400"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="text-slate-400 transition hover:text-slate-600"
                    aria-label="ล้างคำค้นหา"
                  >
                    <X className="h-4 w-4" strokeWidth={2.1} />
                  </button>
                ) : null}
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-3 sm:px-5">
              {error ? (
                <div className="mb-3 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} />
                  <p>{error}</p>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {filteredProducts.map((product) => {
                  const draft = selections[product.id];
                  const units = getUnits(product);
                  const selectedUnit =
                    units.find((unit) => unit.id === draft?.unitId) ?? getDefaultUnit(product);
                  const issue = draft ? getSelectionIssue(product, draft) : null;
                  const cost = selectedUnit
                    ? getEffectiveSaleUnitCost({
                        baseCostPrice: product.baseCostPrice,
                        baseUnitQuantity: selectedUnit.baseUnitQuantity,
                        costMode: selectedUnit.costMode,
                        fixedCostPrice: selectedUnit.fixedCostPrice,
                      })
                    : 0;

                  const currentPriceNum = draft?.price ? Number.parseFloat(draft.price) : 0;
                  const isBelowCost = draft && cost > 0 && currentPriceNum > 0 && currentPriceNum < (cost - 0.001);

                  return (
                    <div
                      key={product.id}
                      className={`relative min-w-0 overflow-hidden rounded-[1.4rem] border transition-all md:rounded-[1.8rem] md:border-2 md:shadow-sm ${
                        draft
                          ? isBelowCost
                            ? "border-[#FF0000]/60 bg-rose-50 ring-1 ring-[#FF0000]/10"
                            : "border-[#003366]/40 bg-[#003366]/5 ring-1 ring-[#003366]/5"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleProduct(product)}
                        className="relative flex w-full min-w-0 flex-col items-center gap-2.5 px-3 py-3 text-left md:flex-row md:items-center md:gap-3 md:px-4 md:py-4"
                      >
                        <span
                          className="absolute right-3 top-3 flex h-6 w-6 shrink-0 items-center justify-center md:right-4 md:top-4"
                          aria-hidden="true"
                        >
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-all ${
                              draft ? "border-[#003366] bg-[#003366]" : "border-slate-300 bg-white"
                            }`}
                          >
                            <Check
                              className={`h-3.5 w-3.5 text-white transition-transform ${draft ? "scale-100" : "scale-0"}`}
                              strokeWidth={5}
                            />
                          </span>
                        </span>
                        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl md:h-24 md:w-24">
                          {product.imageUrl ? (
                            <Image
                              src={product.imageUrl}
                              alt={product.name}
                              fill
                              sizes="(max-width: 768px) 80px, 96px"
                              className="object-contain"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-slate-100">
                              <Package2 className="h-12 w-12" strokeWidth={1} />
                            </div>
                          )}
                        </div>
                        <div className="w-full min-w-0 text-center md:flex-1 md:pr-9 md:text-left">
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
                              product.stockQuantity < 0 
                                ? "bg-[#FF0000] text-white" 
                                : "bg-[#003366] text-white"
                            }`}>
                              <Boxes className="h-4 w-4" strokeWidth={2.5} />
                              สต็อก: {product.stockQuantity.toLocaleString("th-TH")} {product.unit}
                            </span>
                            
                            {cost > 0 && isBelowCost && (
                              <div className="inline-flex items-center rounded-lg bg-[#FF0000] px-2 py-1 text-[10px] font-black text-white animate-pulse">
                                ต่ำกว่าทุน!
                              </div>
                            )}
                          </div>
                        </div>
                      </button>

                      {draft && selectedUnit ? (
                        <div className="bg-[#003366]/5 px-3 pb-4 pt-2 md:px-4 md:pb-4 md:pt-1">
                          {units.length > 1 ? (
                            <div className="mb-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar md:mb-4">
                              {units.map((unit) => (
                                <button
                                  key={unit.id ?? "__base__"}
                                  type="button"
                                  onClick={() => changeUnit(product, unit.id)}
                                  className={`shrink-0 rounded-xl border-2 px-4 py-2 text-sm font-black transition-all ${
                                    selectedUnit.id === unit.id
                                      ? "border-[#003366] bg-[#003366] text-white shadow-md shadow-[#003366]/20"
                                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                                  }`}
                                >
                                  {unit.label}
                                </button>
                              ))}
                            </div>
                          ) : null}

                          <div className="space-y-3">
                            <div className="space-y-1.5 md:space-y-2">
                              <label className="text-[12px] font-black uppercase tracking-wide text-slate-600 md:text-[14px] md:tracking-wider">
                                จำนวน ({selectedUnit.label})
                              </label>
                              <div className="flex items-center gap-1.5 md:gap-2.5">
                                <button
                                  type="button"
                                  onClick={() => stepQuantity(product, -1)}
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white text-slate-700 shadow-md active:scale-90 md:h-10 md:w-10 md:rounded-2xl"
                                >
                                  <Minus className="h-5 w-5 md:h-6 md:w-6" strokeWidth={3} />
                                </button>
                                <input
                                  type="number"
                                  min={selectedUnit.minOrderQty}
                                  step={selectedUnit.stepOrderQty ?? 0.001}
                                  value={draft.quantity}
                                  onChange={(e) => {
                                    const val = Number(e.target.value);
                                    updateSelection(product.id, (curr) => ({
                                      ...curr,
                                      quantity: isNaN(val) ? selectedUnit.minOrderQty : val,
                                    }));
                                  }}
                                  onBlur={() => {
                                    updateSelection(product.id, (curr) => ({
                                      ...curr,
                                      quantity: normalizeQuantity(
                                        curr.quantity,
                                        selectedUnit.minOrderQty,
                                        selectedUnit.stepOrderQty,
                                      ),
                                    }));
                                  }}
                                  className="h-9 w-full min-w-0 rounded-xl border-2 border-transparent bg-white px-1.5 text-center text-lg font-black text-slate-950 shadow-md outline-none focus:border-[#003366]/30 md:h-10 md:rounded-2xl md:px-2 md:text-xl"
                                />
                                <button
                                  type="button"
                                  onClick={() => stepQuantity(product, 1)}
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white text-slate-700 shadow-md active:scale-90 md:h-10 md:w-10 md:rounded-2xl"
                                >
                                  <Plus className="h-5 w-5 md:h-6 md:w-6" strokeWidth={3} />
                                </button>
                              </div>
                            </div>

                            <div className="space-y-1.5 md:space-y-2">
                              <div className="flex items-center justify-between">
                                <label
                                  className={`text-[12px] font-black uppercase tracking-wide md:text-[14px] md:tracking-wider ${
                                    isBelowCost ? "text-[#FF0000]" : "text-slate-600"
                                  }`}
                                >
                                  ราคาต่อ{selectedUnit.label}
                                </label>
                                {cost > 0 && (
                                  <span
                                    className={`rounded-full border px-1.5 py-0.5 text-[10px] font-black md:px-2 md:text-[11px] ${
                                      isBelowCost
                                        ? "animate-pulse border-[#FF0000] bg-white text-[#FF0000] shadow-sm"
                                        : "border-slate-200 text-slate-400"
                                    }`}
                                  >
                                    ทุน ฿{formatTHB(cost)}
                                  </span>
                                )}
                              </div>
                              <div className="relative">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={draft.price}
                                  onFocus={(e) => e.target.select()}
                                  placeholder="0.00"
                                  onChange={(event) =>
                                    updateSelection(product.id, (current) => ({
                                      ...current,
                                      price: event.target.value,
                                    }))
                                  }
                                  className={`h-9 w-full rounded-xl border-2 pl-3 pr-12 text-lg font-black shadow-md outline-none transition-all md:h-10 md:rounded-2xl md:pl-4 md:pr-16 md:text-xl ${
                                    isBelowCost
                                      ? "!border-[#FF0000] !bg-rose-50 !text-[#FF0000]"
                                      : "border-transparent bg-white text-slate-950 focus:border-[#003366]/30"
                                  }`}
                                />
                                <span
                                  className={`absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-black md:right-4 md:text-xs ${
                                    isBelowCost ? "text-[#FF0000]" : "text-slate-500"
                                  }`}
                                >
                                  บาท
                                </span>
                              </div>
                            </div>
                          </div>

                          {isBelowCost && (
                            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/20 bg-[#FF0000] px-4 py-3 text-[13px] font-black text-white shadow-xl shadow-rose-500/30 animate-in zoom-in-95 duration-200 md:mt-4 md:border-2 md:px-5 md:py-4 md:text-[16px] md:shadow-rose-500/40">
                              <AlertTriangle className="h-6 w-6 shrink-0 text-yellow-300" strokeWidth={3} />
                              <div className="min-w-0 flex-1">
                                <p className="leading-tight">ราคาต่ำกว่าทุน!</p>
                                <p className="mt-1 text-[13px] font-bold uppercase tracking-tight opacity-90">
                                  ต้นทุนของ {selectedUnit.label} นี้คือ ฿{formatTHB(cost)}
                                </p>
                              </div>
                            </div>
                          )}

                          {issue ? (
                            <div className="mt-3 flex items-start gap-2 rounded-xl border-2 border-rose-200 bg-rose-50 px-3 py-2 text-sm font-black text-rose-700">
                              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} />
                              <p>{issue}</p>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="shrink-0 border-t border-slate-200 bg-white px-4 pb-safe-or-5 pt-4 sm:px-5">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-2xl border border-slate-200 bg-white py-3.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={addSelectedProducts}
                  disabled={pending || selectedCount === 0}
                  className="rounded-2xl bg-[#003366] py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#002244] disabled:opacity-45 active:scale-[0.98]"
                >
                  เพิ่ม {selectedCount > 0 ? selectedCount.toLocaleString("th-TH") : ""} รายการ
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
