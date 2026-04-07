"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Package2,
  Pencil,
  Plus,
  Search,
  Store,
  Trash2,
  X,
} from "lucide-react";
import {
  deleteCustomerPrice,
  upsertStoreProductPrice,
} from "@/app/dashboard/settings/actions";
import { confirmBelowCostSave, isBelowCostPrice } from "@/components/pricing/price-guard";
import type { SettingsPriceRow, SettingsSaleUnitOption } from "@/lib/settings/admin";

export type CustomerPriceGroup = {
  customerId: string;
  customerCode: string;
  customerName: string;
  prices: SettingsPriceRow[];
};

type CustomerPricePanelProps = {
  groups: CustomerPriceGroup[];
  saleUnits: SettingsSaleUnitOption[];
};

// ── Main panel ────────────────────────────────────────────────────

export function CustomerPricePanel({ groups, saleUnits }: CustomerPricePanelProps) {
  const [search, setSearch] = useState("");

  // Desktop: accordion state
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(groups.filter((g) => g.prices.length > 0).map((g) => g.customerId)),
  );
  const [addingFor, setAddingFor] = useState<string | null>(null);

  // Mobile: bottom sheet state
  const [sheetCustomerId, setSheetCustomerId] = useState<string | null>(null);
  const [sheetAddMode, setSheetAddMode] = useState(false);

  const q = search.trim().toLowerCase();

  const filtered = q
    ? groups.filter(
        (g) =>
          g.customerName.toLowerCase().includes(q) ||
          g.customerCode.toLowerCase().includes(q) ||
          g.prices.some(
            (p) =>
              p.productName.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
          ),
      )
    : groups;

  const sorted = [...filtered].sort((a, b) => {
    const aHas = a.prices.length > 0;
    const bHas = b.prices.length > 0;
    if (aHas !== bHas) return aHas ? -1 : 1;
    return a.customerName.localeCompare(b.customerName, "th");
  });

  function toggle(customerId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(customerId)) next.delete(customerId);
      else next.add(customerId);
      return next;
    });
  }

  function startAdd(customerId: string) {
    setExpanded((prev) => new Set([...prev, customerId]));
    setAddingFor(customerId);
  }

  function openSheet(customerId: string, addMode = false) {
    setSheetCustomerId(customerId);
    setSheetAddMode(addMode);
  }

  return (
    <div>
      {/* Search */}
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาร้านค้า หรือ ชื่อสินค้า, SKU..."
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm text-slate-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#003366] placeholder:text-slate-400"
        />
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
          ไม่พบร้านค้าที่ตรงกับการค้นหา
        </div>
      ) : (
        <div className="-mx-4 border-t border-slate-100 divide-y divide-slate-100 sm:mx-0 sm:border-t-0 sm:divide-y-0 sm:space-y-2">
          {sorted.map((group) => {
            // Filter out already-linked sale units for this customer
            const linkedIds = new Set(group.prices.map((p) => p.productSaleUnitId));
            const availableSaleUnits = saleUnits.filter((u) => !linkedIds.has(u.id));

            return (
              <CustomerGroup
                key={group.customerId}
                group={group}
                availableSaleUnits={availableSaleUnits}
                isExpanded={expanded.has(group.customerId)}
                onToggle={() => toggle(group.customerId)}
                isAddingPrice={addingFor === group.customerId}
                onStartAdd={() => startAdd(group.customerId)}
                onCancelAdd={() => setAddingFor(null)}
                onOpenSheet={() => openSheet(group.customerId)}
                onOpenSheetWithAdd={() => openSheet(group.customerId, true)}
              />
            );
          })}
        </div>
      )}

      {q && (
        <p className="mt-3 text-center text-xs text-slate-400">
          แสดง {sorted.length} ร้านค้า จากทั้งหมด {groups.length} ร้าน
        </p>
      )}

      {/* Mobile bottom sheet */}
      {sheetCustomerId && (
        <MobileSheet
          key={sheetCustomerId}
          groups={sorted}
          initialCustomerId={sheetCustomerId}
          saleUnits={saleUnits}
          startAdding={sheetAddMode}
          onClose={() => {
            setSheetCustomerId(null);
            setSheetAddMode(false);
          }}
        />
      )}
    </div>
  );
}

// ── CustomerGroup ─────────────────────────────────────────────────

type CustomerGroupProps = {
  group: CustomerPriceGroup;
  availableSaleUnits: SettingsSaleUnitOption[];
  isExpanded: boolean;
  onToggle: () => void;
  isAddingPrice: boolean;
  onStartAdd: () => void;
  onCancelAdd: () => void;
  onOpenSheet: () => void;
  onOpenSheetWithAdd: () => void;
};

function CustomerGroup({
  group,
  availableSaleUnits,
  isExpanded,
  onToggle,
  isAddingPrice,
  onStartAdd,
  onCancelAdd,
  onOpenSheet,
  onOpenSheetWithAdd,
}: CustomerGroupProps) {
  const hasPrices = group.prices.length > 0;

  return (
    // Mobile: flat row (no card — parent panel is already a card)
    // Desktop: individual card with border/shadow/rounded
    <div className="sm:overflow-hidden sm:rounded-2xl sm:border sm:border-slate-200 sm:bg-white sm:shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-2 px-4 py-3.5 md:px-5">
        {/* Mobile row → opens sheet (code + count combined in subtitle) */}
        <div
          role="button"
          tabIndex={0}
          onClick={onOpenSheet}
          onKeyDown={(e) => e.key === "Enter" && onOpenSheet()}
          className="flex min-w-0 flex-1 cursor-pointer select-none items-center gap-2.5 active:opacity-70 sm:hidden"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#003366]/10">
            <Store className="h-4 w-4 text-[#003366]" strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{group.customerName}</p>
            <p className="text-xs text-slate-400">
              {group.customerCode}
              {" · "}
              <span className={hasPrices ? "font-semibold text-[#003366]" : ""}>
                {group.prices.length} รายการ
              </span>
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
        </div>

        {/* Desktop toggle → accordion (badge on right) */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          className="hidden min-w-0 flex-1 items-center gap-3 text-left transition hover:opacity-80 sm:flex"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#003366]/10 text-[#003366]">
            <Store className="h-4 w-4" strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{group.customerName}</p>
            <p className="text-xs text-slate-400">{group.customerCode}</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
              hasPrices ? "bg-[#003366]/10 text-[#003366]" : "bg-slate-100 text-slate-400"
            }`}
          >
            {group.prices.length} รายการ
          </span>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
          )}
        </button>

        {/* Mobile add → sheet in add mode */}
        <button
          type="button"
          onClick={onOpenSheetWithAdd}
          className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-[#003366]/30 hover:bg-[#003366]/5 hover:text-[#003366] sm:hidden"
        >
          <span className="flex items-center gap-1">
            <Plus className="h-3 w-3" strokeWidth={2.5} />
            เพิ่ม
          </span>
        </button>

        {/* Desktop add → inline form */}
        <button
          type="button"
          onClick={onStartAdd}
          className="hidden shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-[#003366]/30 hover:bg-[#003366]/5 hover:text-[#003366] sm:inline-flex"
        >
          <span className="flex items-center gap-1">
            <Plus className="h-3 w-3" strokeWidth={2.5} />
            เพิ่มสินค้า
          </span>
        </button>
      </div>

      {/* Desktop accordion content */}
      {isExpanded && (
        <div className="hidden border-t border-slate-100 sm:block">
          {isAddingPrice && (
            <div className="border-b border-slate-100 bg-blue-50/40 px-5 py-4">
              <InlineAddPriceForm
                customerId={group.customerId}
                availableSaleUnits={availableSaleUnits}
                onCancel={onCancelAdd}
              />
            </div>
          )}

          {group.prices.length === 0 && !isAddingPrice && (
            <div className="py-8 text-center text-sm text-slate-400">
              ยังไม่มีสินค้าที่ผูกราคา —{" "}
              <button
                type="button"
                onClick={onStartAdd}
                className="font-medium text-[#003366] hover:underline"
              >
                เพิ่มเลย
              </button>
            </div>
          )}

          {group.prices.length > 0 && (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50/80">
                  <th className="px-5 py-2 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">
                    สินค้า
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">
                    SKU
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">
                    ราคาขาย (฿)
                  </th>
                  <th className="w-20 px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {group.prices.map((price) => (
                  <PriceRowDesktop
                    key={`${price.customerId}-${price.productSaleUnitId}`}
                    price={price}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ── MobileSheet ───────────────────────────────────────────────────

type MobileSheetProps = {
  groups: CustomerPriceGroup[];
  initialCustomerId: string;
  saleUnits: SettingsSaleUnitOption[];
  startAdding: boolean;
  onClose: () => void;
};

function MobileSheet({ groups, initialCustomerId, saleUnits, startAdding, onClose }: MobileSheetProps) {
  const [currentCustomerId, setCurrentCustomerId] = useState(initialCustomerId);
  const [isAddingPrice, setIsAddingPrice] = useState(startAdding);
  const [slideDir, setSlideDir] = useState<"left" | "right" | null>(null);
  const [slideKey, setSlideKey] = useState(0);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const currentIndex = groups.findIndex((g) => g.customerId === currentCustomerId);
  const group = groups[currentIndex] ?? groups[0];
  const prevGroup = currentIndex > 0 ? groups[currentIndex - 1] : null;
  const nextGroup = currentIndex < groups.length - 1 ? groups[currentIndex + 1] : null;

  const linkedIds = new Set(group.prices.map((p) => p.productSaleUnitId));
  const availableSaleUnits = saleUnits.filter((u) => !linkedIds.has(u.id));

  function navigate(target: CustomerPriceGroup | null, direction: "left" | "right") {
    if (!target) return;
    setSlideDir(direction);
    setSlideKey((k) => k + 1);
    setCurrentCustomerId(target.customerId);
    setIsAddingPrice(false);
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }
  function onTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) navigate(nextGroup, "left");
    else navigate(prevGroup, "right");
  }

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const slideStyle: React.CSSProperties = slideDir
    ? { animation: `priceSlideIn${slideDir === "left" ? "Right" : "Left"} 260ms cubic-bezier(0.33,1,0.68,1) both` }
    : {};
  const isBelowCost = false;
  const price = { effectiveCostPrice: 0 };

  return (
    <>
      <style>{`
        @keyframes priceSlideInRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
        @keyframes priceSlideInLeft {
          from { transform: translateX(-100%); }
          to   { transform: translateX(0); }
        }
      `}</style>

      <div
        role="dialog"
        aria-modal="true"
        aria-label={group.customerName}
        className="fixed inset-0 z-50 flex flex-col bg-slate-50"
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="shrink-0 bg-[#003366] shadow-md">
          {/* Row 1: store name + close */}
          <div className="flex items-center gap-3 px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <Store className="h-4 w-4 shrink-0 text-white/70" strokeWidth={2} />
                <p className="truncate text-base font-bold text-white">{group.customerName}</p>
                {isBelowCost && (
                  <p className="mt-1 text-[11px] font-medium text-amber-700">
                    ต่ำกว่าทุน ฿
                    {price.effectiveCostPrice.toLocaleString("th-TH", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                )}
              </div>
              <p className="mt-0.5 font-mono text-xs text-white/50">
                {group.customerCode} · {group.prices.length} รายการ
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-700 text-white shadow-md transition active:scale-95 active:bg-rose-900"
              aria-label="ปิด"
            >
              <X className="h-5 w-5" strokeWidth={2.8} />
            </button>
          </div>

          {/* Row 2: prev ← position → next */}
          <div className="flex items-center gap-2 border-t border-white/10 px-4 py-2.5">
            <button
              type="button"
              onClick={() => navigate(prevGroup, "right")}
              disabled={!prevGroup}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white disabled:opacity-25"
              aria-label="ก่อนหน้า"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
            </button>
            <p className="flex-1 text-center text-xs text-white/60">
              {currentIndex + 1} / {groups.length} ร้านค้า
            </p>
            <button
              type="button"
              onClick={() => navigate(nextGroup, "left")}
              disabled={!nextGroup}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white disabled:opacity-25"
              aria-label="ถัดไป"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* ── Scrollable body ─────────────────────────────────── */}
        <div
          className="min-h-0 flex-1 overflow-hidden"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div key={slideKey} className="h-full overflow-y-auto" style={slideStyle}>
            {isAddingPrice && (
              <div className="border-b border-slate-100 bg-blue-50/40 px-5 py-4">
                <InlineAddPriceForm
                  customerId={group.customerId}
                  availableSaleUnits={availableSaleUnits}
                  onCancel={() => setIsAddingPrice(false)}
                />
              </div>
            )}

            {group.prices.length === 0 && !isAddingPrice ? (
              <div className="py-10 text-center text-sm text-slate-400">
                ยังไม่มีสินค้าที่ผูกราคา
              </div>
            ) : (
              <div className="divide-y divide-slate-100 bg-white">
                {group.prices.map((price) => (
                  <PriceRowMobile
                    key={`${price.customerId}-${price.productSaleUnitId}`}
                    price={price}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Sticky bottom: add button ───────────────────────── */}
        {!isAddingPrice && (
          <div className="shrink-0 border-t border-slate-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => setIsAddingPrice(true)}
              disabled={availableSaleUnits.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#003366] py-3.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(0,51,102,0.25)] transition hover:bg-[#002244] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              {availableSaleUnits.length === 0
                ? "ผูกครบทุกสินค้าแล้ว"
                : "เพิ่มสินค้าให้ร้านนี้"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ── PriceRowDesktop ───────────────────────────────────────────────

function PriceRowDesktop({ price }: { price: SettingsPriceRow }) {
  const [isEditing, setIsEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editPrice, setEditPrice] = useState(String(price.salePrice));
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    const formData = new FormData();
    formData.set("customerId", price.customerId);
    formData.set("productSaleUnitId", price.productSaleUnitId);
    startTransition(async () => {
      await deleteCustomerPrice(formData);
      setConfirmDelete(false);
    });
  }
  const parsedEditPrice = parseFloat(editPrice);
  const isBelowCost = isBelowCostPrice(parsedEditPrice, price.effectiveCostPrice);

  function handleEditAction(formData: FormData) {
    if (
      isBelowCost &&
      !confirmBelowCostSave({
        productName: price.productName,
        saleUnitLabel: price.saleUnitLabel,
        salePrice: parsedEditPrice,
        effectiveCostPrice: price.effectiveCostPrice,
      })
    ) {
      return;
    }

    startTransition(async () => {
      await upsertStoreProductPrice(formData);
      setIsEditing(false);
    });
  }

  if (isEditing) {
    return (
      <tr className="bg-blue-50/30">
        <td colSpan={4} className="px-5 py-2.5">
          <div className="flex items-start gap-3">
            <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
              {price.imageUrl ? (
                <Image
                  src={price.imageUrl}
                  alt={price.productName}
                  fill
                  sizes="32px"
                  className="object-contain bg-white p-0.5"
                />
              ) : (
                <Package2 className="h-3.5 w-3.5 text-slate-400" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-700">{price.productName}</p>
              <p className="text-xs text-slate-400">
                {price.saleUnitLabel} · {price.sku}
              </p>
            </div>
            <form action={handleEditAction} className="flex items-start gap-2">
              <input type="hidden" name="customerId" value={price.customerId} />
              <input type="hidden" name="productSaleUnitId" value={price.productSaleUnitId} />
              <div className="w-28">
                <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                  ฿
                </span>
                <input
                  name="salePrice"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  className={`w-full rounded-lg border bg-white py-1.5 pl-6 pr-2 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-[#003366]/30 ${
                    isBelowCost ? "border-amber-300 bg-amber-50" : "border-[#003366]"
                  }`}
                  autoFocus
                />
                </div>
                {isBelowCost && (
                  <p className="mt-1 text-[11px] font-medium text-amber-700">
                    ต่ำกว่าทุน ฿
                    {price.effectiveCostPrice.toLocaleString("th-TH", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={isPending}
                aria-label="บันทึก"
                className="rounded-lg bg-[#003366] p-1.5 text-white transition disabled:opacity-60"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                aria-label="ยกเลิก"
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-50"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </form>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="group transition hover:bg-slate-50/60">
      <td className="px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
            {price.imageUrl ? (
              <Image
                src={price.imageUrl}
                alt={price.productName}
                fill
                sizes="36px"
                className="object-contain bg-white p-0.5"
              />
            ) : (
              <Package2 className="h-4 w-4 text-slate-400" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">{price.productName}</p>
            <p className="text-xs text-slate-400">{price.saleUnitLabel}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-slate-500">{price.sku}</td>
      <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">
        {price.salePrice.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
      </td>
      <td className="px-3 py-3">
        {confirmDelete ? (
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white transition disabled:opacity-60 hover:bg-red-700"
            >
              {isPending ? "..." : "ยืนยันลบ"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={isPending}
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-50"
            >
              ยกเลิก
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => {
                setEditPrice(String(price.salePrice));
                setIsEditing(true);
              }}
              aria-label="แก้ไข"
              className="rounded-lg p-1.5 text-slate-300 transition hover:bg-blue-50 hover:text-[#003366] group-hover:text-slate-400"
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label="ลบ"
              className="rounded-lg p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-500 group-hover:text-slate-400"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

// ── PriceRowMobile ────────────────────────────────────────────────

function PriceRowMobile({ price }: { price: SettingsPriceRow }) {
  const [isEditing, setIsEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editPrice, setEditPrice] = useState(String(price.salePrice));
  const [isPending, startTransition] = useTransition();
  const parsedEditPrice = parseFloat(editPrice);
  const isBelowCost = isBelowCostPrice(parsedEditPrice, price.effectiveCostPrice);

  function openEdit() {
    setEditPrice(String(price.salePrice));
    setIsEditing(true);
  }

  function handleEditAction(formData: FormData) {
    if (
      isBelowCost &&
      !confirmBelowCostSave({
        productName: price.productName,
        saleUnitLabel: price.saleUnitLabel,
        salePrice: parsedEditPrice,
        effectiveCostPrice: price.effectiveCostPrice,
      })
    ) {
      return;
    }

    startTransition(async () => {
      await upsertStoreProductPrice(formData);
      setIsEditing(false);
    });
  }

  function handleDelete() {
    const formData = new FormData();
    formData.set("customerId", price.customerId);
    formData.set("productSaleUnitId", price.productSaleUnitId);
    startTransition(async () => {
      await deleteCustomerPrice(formData);
      setConfirmDelete(false);
    });
  }

  // ── Edit mode ──────────────────────────────────────
  if (isEditing) {
    return (
      <div className="border-b border-slate-100 bg-[#003366]/[0.03] px-4 py-4">
        {/* Product info */}
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
            {price.imageUrl ? (
              <Image src={price.imageUrl} alt={price.productName} fill sizes="48px" className="object-contain bg-white p-0.5" />
            ) : (
              <Package2 className="h-6 w-6 text-slate-300" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900">{price.productName}</p>
            <p className="text-sm text-slate-400">{price.saleUnitLabel} · {price.sku}</p>
          </div>
        </div>

        {/* Price input */}
        <form action={handleEditAction} className="space-y-3">
          <input type="hidden" name="customerId" value={price.customerId} />
          <input type="hidden" name="productSaleUnitId" value={price.productSaleUnitId} />

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              ราคาขาย (บาท)
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-bold text-slate-400">฿</span>
              <input
                name="salePrice"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                required
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                className={`w-full rounded-xl border py-4 pl-9 pr-4 text-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-[#003366]/30 ${
                  isBelowCost ? "border-amber-300 bg-amber-50" : "border-[#003366] bg-white"
                }`}
                autoFocus
              />
            </div>
            {isBelowCost && (
              <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
                <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2.2} />
                ต่ำกว่าต้นทุน ฿{price.effectiveCostPrice.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </div>
            )}
            {price.effectiveCostPrice > 0 && !isBelowCost && (
              <p className="mt-1.5 text-xs text-slate-400">ต้นทุน/หน่วย: ฿{price.effectiveCostPrice.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
            )}
          </div>

          <div className="flex gap-2.5">
            <button
              type="submit"
              disabled={isPending}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#003366] py-3.5 text-base font-semibold text-white shadow-sm transition disabled:opacity-60"
            >
              <Check className="h-5 w-5" strokeWidth={2.5} />
              {isPending ? "กำลังบันทึก..." : "บันทึก"}
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              disabled={isPending}
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition"
            >
              <X className="h-5 w-5" strokeWidth={2.2} />
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ── Confirm delete ──────────────────────────────────
  if (confirmDelete) {
    return (
      <div className="border-b border-slate-100 bg-red-50 px-4 py-4">
        <p className="mb-1 font-semibold text-slate-900">ลบราคา {price.productName}?</p>
        <p className="mb-4 text-sm text-slate-500">ราคาของ {price.saleUnitLabel} สำหรับร้านนี้จะถูกลบออก</p>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 py-3.5 text-base font-semibold text-white transition disabled:opacity-60"
          >
            <Trash2 className="h-4.5 w-4.5" strokeWidth={2.2} />
            {isPending ? "กำลังลบ..." : "ยืนยันลบ"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            disabled={isPending}
            className="flex-1 rounded-xl border border-slate-200 bg-white py-3.5 text-base font-medium text-slate-600 transition"
          >
            ยกเลิก
          </button>
        </div>
      </div>
    );
  }

  // ── Normal row ──────────────────────────────────────
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openEdit}
      onKeyDown={(e) => e.key === "Enter" && openEdit()}
      className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-4 py-4 transition active:bg-slate-50"
    >
      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
        {price.imageUrl ? (
          <Image src={price.imageUrl} alt={price.productName} fill sizes="48px" className="object-contain bg-white p-0.5" />
        ) : (
          <Package2 className="h-6 w-6 text-slate-300" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug text-slate-900">{price.productName}</p>
        <p className="mt-0.5 text-sm text-slate-400">{price.saleUnitLabel}</p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div className="text-right">
          <p className="text-lg font-bold tabular-nums text-slate-900">
            {price.salePrice.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-slate-400">บาท</p>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
          aria-label="ลบ"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-300 transition hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

// ── InlineAddPriceForm ────────────────────────────────────────────

type InlineAddPriceFormProps = {
  customerId: string;
  availableSaleUnits: SettingsSaleUnitOption[];
  onCancel: () => void;
};

function InlineAddPriceForm({
  customerId,
  availableSaleUnits,
  onCancel,
}: InlineAddPriceFormProps) {
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [priceValue, setPriceValue] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedUnit = availableSaleUnits.find((u) => u.id === selectedUnitId);
  const price = parseFloat(priceValue) || 0;
  const isBelowCost =
    selectedUnit !== undefined && price > 0 && price < selectedUnit.effectiveCostPrice;

  function handleAction(formData: FormData) {
    if (
      isBelowCost &&
      selectedUnit &&
      !confirmBelowCostSave({
        productName: selectedUnit.productName,
        saleUnitLabel: selectedUnit.label,
        salePrice: price,
        effectiveCostPrice: selectedUnit.effectiveCostPrice,
      })
    ) {
      return;
    }

    startTransition(async () => {
      await upsertStoreProductPrice(formData);
      setSelectedUnitId("");
      setPriceValue("");
    });
  }

  if (availableSaleUnits.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        ผูกราคาครบทุกสินค้าแล้ว —{" "}
        <button type="button" onClick={onCancel} className="font-medium text-[#003366] hover:underline">
          ปิด
        </button>
      </p>
    );
  }

  return (
    <form action={handleAction}>
      <input type="hidden" name="customerId" value={customerId} />
      <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
        เพิ่มสินค้าและราคา
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="flex-1">
          <select
            name="productSaleUnitId"
            required
            value={selectedUnitId}
            onChange={(e) => setSelectedUnitId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#003366]"
          >
            <option value="" disabled>
              เลือกสินค้าและหน่วยขาย...
            </option>
            {availableSaleUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.sku} — {u.productName} ({u.label})
              </option>
            ))}
          </select>
        </div>

        <div className="relative w-full sm:w-36">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
            ฿
          </span>
          <input
            name="salePrice"
            type="number"
            min="0"
            step="0.01"
            required
            value={priceValue}
            onChange={(e) => setPriceValue(e.target.value)}
            placeholder="0.00"
            className={`w-full rounded-lg border py-2.5 pl-7 pr-3 text-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#003366] ${
              isBelowCost ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"
            }`}
          />
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 rounded-lg bg-[#003366] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#002244] disabled:opacity-60 sm:flex-none"
          >
            {isPending ? "กำลังบันทึก..." : "บันทึก"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 sm:flex-none"
          >
            ยกเลิก
          </button>
        </div>
      </div>

      {isBelowCost && selectedUnit && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
          ราคาต่ำกว่าต้นทุน — ต้นทุน/{selectedUnit.label}: ฿
          {selectedUnit.effectiveCostPrice.toLocaleString("th-TH", {
            minimumFractionDigits: 2,
          })}
        </div>
      )}
    </form>
  );
}
