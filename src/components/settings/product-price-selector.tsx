"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Check, Package2, Search, X } from "lucide-react";
import { upsertStoreProductPrice } from "@/app/(workspace)/dashboard/settings/actions";
import { confirmBelowCostSave, isBelowCostPrice } from "@/components/pricing/price-guard";
import type { SettingsSaleUnitOption } from "@/lib/settings/admin";
import { normalizeSearch } from "@/lib/utils/search";

type ProductPriceSelectorModalProps = {
  customerId: string;
  customerName: string;
  availableSaleUnits: SettingsSaleUnitOption[];
  onClose: () => void;
};

export function ProductPriceSelectorModal({
  customerId,
  customerName,
  availableSaleUnits,
  onClose,
}: ProductPriceSelectorModalProps) {
  const [search, setSearch] = useState("");
  const [selections, setSelections] = useState<Map<string, string>>(new Map());
  const [isPending, startTransition] = useTransition();

  const q = normalizeSearch(search);
  const filtered = q
    ? availableSaleUnits.filter(
        (u) =>
          normalizeSearch(u.productName).includes(q) ||
          normalizeSearch(u.sku).includes(q) ||
          normalizeSearch(u.label).includes(q),
      )
    : availableSaleUnits;

  const skuCollator = new Intl.Collator("th", { numeric: true, sensitivity: "base" });
  const sorted = [...filtered].sort((a, b) => {
    const skuComp = skuCollator.compare(a.sku, b.sku);
    if (skuComp !== 0) return skuComp;
    return a.productName.localeCompare(b.productName, "th");
  });

  const toggleSelection = (unitId: string) => {
    setSelections((prev) => {
      const next = new Map(prev);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.set(unitId, "");
      }
      return next;
    });
  };

  const updatePrice = (unitId: string, price: string) => {
    setSelections((prev) => {
      const next = new Map(prev);
      next.set(unitId, price);
      return next;
    });
  };

  const handleSave = async () => {
    const toSave = Array.from(selections.entries())
      .map(([id, price]) => {
        const unit = availableSaleUnits.find((u) => u.id === id);
        return { unit, price: parseFloat(price) };
      })
      .filter((item) => item.unit && !isNaN(item.price));

    if (toSave.length === 0) return;

    // Check below cost for all
    for (const item of toSave) {
      if (
        isBelowCostPrice(item.price, item.unit!.effectiveCostPrice) &&
        !confirmBelowCostSave({
          productName: item.unit!.productName,
          saleUnitLabel: item.unit!.label,
          salePrice: item.price,
          effectiveCostPrice: item.unit!.effectiveCostPrice,
        })
      ) {
        return;
      }
    }

    startTransition(async () => {
      for (const item of toSave) {
        const formData = new FormData();
        formData.set("customerId", customerId);
        formData.set("productSaleUnitId", item.unit!.id);
        formData.set("salePrice", String(item.price));
        await upsertStoreProductPrice(formData);
      }
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-0 backdrop-blur-sm transition-all md:p-10">
      <div className="flex h-full w-full max-w-7xl flex-col bg-slate-50 shadow-2xl md:rounded-3xl md:overflow-hidden">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold text-slate-900">เพิ่มสินค้า: {customerName}</h3>
            <p className="text-xs text-slate-500">เลือกสินค้าที่ต้องการและระบุราคาขาย</p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 active:scale-95"
          >
            <X className="h-5 w-5" strokeWidth={2.5} />
          </button>
        </div>

        {/* Search */}
        <div className="shrink-0 border-b border-slate-100 bg-white p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="ค้นหาสินค้า หรือ SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-[#003366]"
            />
          </div>
        </div>

        {/* List */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100/30 p-4 md:p-6">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Package2 className="mb-3 h-12 w-12 text-slate-200" />
              <p className="text-sm text-slate-400">ไม่พบสินค้าที่คุณค้นหา</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sorted.map((unit) => {
                const isSelected = selections.has(unit.id);
                const priceVal = selections.get(unit.id) || "";
                const parsedPrice = parseFloat(priceVal);
                const isBelowCost = isBelowCostPrice(parsedPrice, unit.effectiveCostPrice);

                return (
                  <div
                    key={unit.id}
                    className={`flex flex-col overflow-hidden rounded-2xl border-2 transition-all duration-300 ${
                      isSelected 
                        ? "border-[#003366] bg-white shadow-lg ring-4 ring-[#003366]/5" 
                        : "border-white bg-white shadow-sm hover:border-slate-200"
                    }`}
                  >
                    <div
                      className="flex cursor-pointer items-start gap-4 p-4 active:bg-slate-50 md:items-center"
                      onClick={() => toggleSelection(unit.id)}
                    >
                      <div className="relative h-24 w-24 shrink-0 overflow-hidden bg-white md:h-14 md:w-14">
                        {unit.imageUrl ? (
                          <Image 
                            src={unit.imageUrl} 
                            alt={unit.productName} 
                            fill 
                            sizes="(max-width: 768px) 96px, 56px"
                            className="object-contain" 
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Package2 className="h-8 w-8 text-slate-300 md:h-6 md:w-6" />
                          </div>
                        )}
                      </div>
                      
                      <div className="min-w-0 flex-1">
                        <p className="mb-0.5 font-mono text-[10px] font-extrabold tracking-wider text-[#003366]/60">
                          {unit.sku}
                        </p>
                        <p className="text-sm font-bold leading-tight text-slate-900">
                          {unit.productName}
                        </p>
                        <p className="mt-1 text-[11px] font-medium text-slate-400">
                          หน่วยขาย: {unit.label}
                        </p>
                      </div>

                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                          isSelected 
                            ? "border-[#003366] bg-[#003366] text-white rotate-0" 
                            : "border-slate-200 bg-white rotate-[-90deg]"
                        }`}
                      >
                        <Check className={`h-4 w-4 transition-opacity ${isSelected ? "opacity-100" : "opacity-0"}`} strokeWidth={3} />
                      </div>
                    </div>

                    {/* Price Input Section */}
                    <div
                      className={`grid transition-all duration-300 ease-in-out ${
                        isSelected ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className="border-t border-slate-50 p-4">
                          <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                            ราคาขาย (บาท)
                          </label>
                          <div className="relative">
                            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-bold text-slate-300">
                              ฿
                            </span>
                            <input
                              type="number"
                              inputMode="decimal"
                              value={priceVal}
                              onChange={(e) => updatePrice(unit.id, e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              placeholder="0.00"
                              className={`w-full rounded-xl border py-3 pl-9 pr-4 text-lg font-bold outline-none transition-all focus:ring-4 focus:ring-[#003366]/10 ${
                                isBelowCost 
                                  ? "border-amber-300 bg-amber-50 text-amber-700" 
                                  : "border-slate-200 bg-slate-50 text-slate-900 focus:border-[#003366] focus:bg-white"
                              }`}
                            />
                          </div>
                          
                          {isBelowCost && (
                            <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-100/50 px-2 py-1.5 text-[10px] font-bold text-amber-700">
                              ⚠️ ต่ำกว่าทุน (฿{unit.effectiveCostPrice.toLocaleString("th-TH")})
                            </div>
                          )}
                          {!isBelowCost && unit.effectiveCostPrice > 0 && (
                            <p className="mt-2 text-[10px] text-slate-400">
                              ต้นทุน: ฿{unit.effectiveCostPrice.toLocaleString("th-TH")}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-slate-200 bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-8px_20px_rgba(0,0,0,0.03)]">
          <div className="mx-auto flex max-w-2xl gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-2xl border border-slate-200 py-4 text-sm font-bold text-slate-500 transition hover:bg-slate-50 active:scale-95"
            >
              ยกเลิก
            </button>
            <button
              onClick={handleSave}
              disabled={isPending || selections.size === 0}
              className="flex-[2] rounded-2xl bg-[#003366] py-4 text-sm font-bold text-white shadow-xl shadow-[#003366]/20 transition enabled:hover:bg-[#002244] enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPending ? "กำลังบันทึก..." : `บันทึก ${selections.size} รายการ`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
