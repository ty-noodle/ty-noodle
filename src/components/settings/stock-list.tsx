"use client";

import React, { memo, useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Boxes, Package2, Plus, ClipboardEdit, Coins, Wallet } from "lucide-react";
import {
  SettingsEmptyState,
  SettingsPanel,
  SettingsPanelBody,
} from "@/components/settings/settings-ui";
import { StockReceiveForm } from "./stock-receive-form";
import { StockAdjustForm } from "./stock-adjust-form";
import type { StockProductOption, StockSupplierOption } from "@/lib/stock/admin";

// ─── Utilities ───────────────────────────────────────────────────────────────

function formatMoney(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatQuantity(value: number) {
  return value.toLocaleString("th-TH", { maximumFractionDigits: 3 });
}

// ─── Sub-Components (Memoized for Performance) ───────────────────────────────

const MobileStockCard = memo(({ 
  product, 
  onAdjust
}: { 
  product: StockProductOption; 
  onAdjust: (productId: string) => void;
}) => {
  const defaultUnit = product.saleUnits.find(u => u.isDefault) || product.saleUnits[0];
  const totalValue = product.onHandQuantity * (defaultUnit?.effectiveCostPrice ?? 0);

  return (
    <article
      className={`border-b border-slate-300 bg-white px-5 py-6 shadow-[0_4px_20px_rgba(15,23,42,0.08)] last:border-b-0 ${
        product.isActive ? "" : "opacity-70"
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Product Image */}
        <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              sizes="96px"
              className="object-contain"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-2xl bg-slate-50">
              <Package2 className="h-10 w-10 text-slate-300" strokeWidth={1.5} />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1">
            <p className="line-clamp-2 text-[1.25rem] font-black leading-[1.2] text-slate-950">
              {product.name}
            </p>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold tracking-tight text-slate-500 uppercase">
                {product.sku}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-tight shadow-sm ring-1 ring-inset ${
                  product.isActive
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                    : "bg-slate-50 text-slate-600 ring-slate-500/20"
                }`}
              >
                {product.isActive ? "พร้อมขาย" : "ปิดใช้งาน"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Modern 2x2 Grid for Stock Data */}
      <div className="mt-6 grid grid-cols-2 border-t border-slate-200 pt-5">
        {/* Current Stock */}
        <div className="space-y-1 border-r border-b border-slate-200 pb-4 pr-4">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Boxes className="h-3.5 w-3.5" strokeWidth={2.5} />
            <p className="text-[10px] font-black uppercase tracking-widest">คงเหลือปัจจุบัน</p>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-[1.5rem] font-black tracking-tight ${product.onHandQuantity < 0 ? 'text-rose-600' : 'text-[#003366]'}`}>
              {formatQuantity(product.onHandQuantity)}
            </span>
            <span className="text-[0.9rem] font-bold text-slate-500">{product.unit}</span>
          </div>
        </div>

        {/* Cost per Unit */}
        <div className="space-y-1 border-b border-slate-200 pb-4 pl-4">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Coins className="h-3.5 w-3.5" strokeWidth={2.5} />
            <p className="text-[10px] font-black uppercase tracking-widest">ต้นทุน / {defaultUnit?.label ?? product.unit}</p>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-[1.5rem] font-black tracking-tight text-[#003366]">
              ฿{formatMoney(defaultUnit?.effectiveCostPrice ?? 0)}
            </span>
          </div>
        </div>

        {/* Total Value */}
        <div className="space-y-1 border-r border-slate-200 pt-4 pr-4">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Wallet className="h-3.5 w-3.5" strokeWidth={2.5} />
            <p className="text-[10px] font-black uppercase tracking-widest">มูลค่าสต็อกรวม</p>
          </div>
          <div className="flex items-baseline gap-1">
            <span className={`text-[1.35rem] font-black tracking-tight ${totalValue < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
              ฿{formatMoney(totalValue)}
            </span>
          </div>
        </div>

        {/* Adjust Button Section */}
        <div className="flex items-end justify-end pt-4 pl-4">
          <button
            type="button"
            onClick={() => onAdjust(product.id)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-xs font-black text-white shadow-lg shadow-indigo-600/20 transition active:scale-95"
          >
            <ClipboardEdit className="h-4 w-4" strokeWidth={2.5} />
            ปรับยอด
          </button>
        </div>
      </div>
    </article>
  );
});
MobileStockCard.displayName = "MobileStockCard";

const DesktopStockRow = memo(({ 
  product, 
  onAdjust
}: { 
  product: StockProductOption; 
  onAdjust: (productId: string) => void;
}) => {
  const defaultUnit = product.saleUnits.find(u => u.isDefault) || product.saleUnits[0];
  const totalValue = product.onHandQuantity * (defaultUnit?.effectiveCostPrice ?? 0);

  return (
    <tr className="hover:bg-slate-50 transition-colors group">
      <td className="whitespace-nowrap border-b border-l border-r border-slate-300 px-5 py-4 text-center font-mono font-bold text-slate-500 uppercase tracking-tight align-middle">
        {product.sku}
      </td>
      <td className="border-b border-r border-slate-300 px-5 py-4 align-middle">
        <div className="flex items-center gap-4">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-white p-1">
            {product.imageUrl ? (
              <Image
                src={product.imageUrl}
                alt={product.name}
                fill
                sizes="56px"
                className="object-contain"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-200">
                <Package2 className="h-8 w-8" strokeWidth={1} />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="line-clamp-2 text-[15px] font-black leading-tight text-slate-900 group-hover:text-[#003366]">
              {product.name}
            </p>
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap border-b border-r border-slate-300 px-5 py-4 text-center text-base font-medium text-slate-600 align-middle">
        {product.unit}
      </td>
      <td className="whitespace-nowrap border-b border-r border-slate-300 px-5 py-4 text-center align-middle">
        <div className="flex flex-col gap-1">
          {product.saleUnits.map((unit) => (
            <div key={unit.id} className="flex items-center justify-center">
              <span className="text-sm font-bold text-slate-700">
                ฿{formatMoney(unit.effectiveCostPrice)}
              </span>
            </div>
          ))}
        </div>
      </td>
      <td className="whitespace-nowrap border-b border-r border-slate-300 px-5 py-4 text-center align-middle">
        <div className="flex flex-col items-center gap-1">
          <span className={`text-base font-bold ${product.onHandQuantity < 0 ? 'text-rose-700' : 'text-[#003366]'}`}>
            {formatQuantity(product.onHandQuantity)}
          </span>
          <button
            type="button"
            onClick={() => onAdjust(product.id)}
            className="p-1 text-indigo-400 hover:text-indigo-600 transition-colors"
            title="ปรับปรุงยอด"
          >
            <ClipboardEdit className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>
      </td>
      <td className="whitespace-nowrap border-b border-r border-slate-300 px-5 py-4 text-center align-middle">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-base font-bold text-slate-900">
            ฿{formatMoney(totalValue)}
          </span>
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">VALUE</span>
        </div>
      </td>
    </tr>
  );
});
DesktopStockRow.displayName = "DesktopStockRow";

// ─── Main Component ──────────────────────────────────────────────────────────

export function StockList({ products, suppliers = [], baseHref = "/stock" }: StockListProps) {
  const searchParams = useSearchParams();

  // Local state for immediate UI response
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustProductId, setAdjustProductId] = useState("");

  // Sync with URL on mount only (or when URL changes externally)
  useEffect(() => {
    const receive = searchParams.get("receive") === "1";
    const adjust = searchParams.get("adjust") === "1";
    const product = searchParams.get("product") || "";

    // eslint-disable-next-line react-hooks/set-state-in-effect -- Initial sync with URL params
    if (receive) setReceiveOpen(true);
    if (adjust) {
      setAdjustOpen(true);
      if (product) setAdjustProductId(product);
    }
  }, [searchParams]);

  const handleAdjust = (productId: string) => {
    setAdjustProductId(productId);
    setAdjustOpen(true);
    // Silent URL update for deep linking
    window.history.pushState({}, "", `${baseHref}?adjust=1&product=${productId}`);
  };

  const handleReceive = () => {
    setReceiveOpen(true);
    window.history.pushState({}, "", `${baseHref}?receive=1`);
  };

  const closeModals = () => {
    setReceiveOpen(false);
    setAdjustOpen(false);
    setAdjustProductId("");
    window.history.pushState({}, "", baseHref);
  };

  return (
    <>
      <SettingsPanel>
        <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 md:px-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-950">สต็อกคงเหลือ</h2>
              <p className="mt-1 hidden text-sm leading-6 text-slate-500 sm:block">
                ดูของคงเหลือ จองแล้ว และกดรับเข้าสินค้าได้จากหน้านี้โดยตรง
              </p>
            </div>
          </div>

          {/* Desktop Buttons */}
          <div className="hidden items-center gap-3 sm:flex">
            <button
              onClick={handleReceive}
              className="inline-flex items-center gap-2 rounded-full bg-[#003366] px-4 py-2.5 text-sm font-medium text-white shadow-[0_12px_28px_rgba(0,51,102,0.22)] transition hover:bg-[#002244] active:scale-95"
            >
              <Plus className="h-4 w-4" strokeWidth={2.2} />
              รับสินค้าเข้า
            </button>

            <button
              onClick={() => handleAdjust("")}
              className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-[0_12px_28px_rgba(79,70,229,0.22)] transition hover:bg-indigo-700 active:scale-95"
            >
              <ClipboardEdit className="h-4 w-4" strokeWidth={2.2} />
              ปรับปรุงสต็อก
            </button>
          </div>
        </div>

        <SettingsPanelBody className="p-0">
          {products.length > 0 ? (
            <>
              {/* Mobile Cards */}
              <div className="grid gap-0 lg:hidden">
                {products.map((product) => (
                  <MobileStockCard 
                    key={product.id} 
                    product={product} 
                    onAdjust={handleAdjust}
                  />
                ))}
              </div>

              {/* Desktop Table */}
              <div className="hidden overflow-x-auto lg:block">
                <table className="min-w-full border-collapse border border-slate-300 text-sm">
                  <thead>
                    <tr style={{ backgroundColor: "#003366" }}>
                      {[
                        "รหัสสินค้า",
                        "ชื่อสินค้า",
                        "หน่วย",
                        "ต้นทุน / หน่วย",
                        "คงเหลือ",
                        "มูลค่าสต็อก",
                      ].map((label, i, arr) => (
                        <th
                          key={label}
                          className={[
                            "whitespace-nowrap px-5 py-4 text-center text-base font-bold text-white",
                            i === 0 ? "border-l border-slate-300" : "",
                            i < arr.length - 1
                              ? "border-r border-white/60"
                              : "border-r border-slate-300",
                          ].join(" ")}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => (
                      <DesktopStockRow 
                        key={product.id} 
                        product={product} 
                        onAdjust={handleAdjust}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="p-6">
              <SettingsEmptyState className="py-14">
                <div className="flex flex-col items-center gap-3">
                  <Boxes className="h-8 w-8 text-slate-400" strokeWidth={2.2} />
                  <p>ยังไม่มีสินค้าในระบบ เริ่มจากเพิ่มสินค้า แล้วค่อยกลับมารับเข้าสต็อกได้เลย</p>
                </div>
              </SettingsEmptyState>
            </div>
          )}
        </SettingsPanelBody>
      </SettingsPanel>

      {/* Forms rendered inside the client component for instant response */}
      {receiveOpen && (
        <StockReceiveForm
          products={products}
          suppliers={suppliers}
          returnHref={baseHref}
          onClose={closeModals}
        />
      )}

      {adjustOpen && (
        <StockAdjustForm
          products={products}
          returnHref={baseHref}
          defaultProductId={adjustProductId}
          onClose={closeModals}
        />
      )}
    </>
  );
}

type StockListProps = {
  baseHref?: string;
  products: StockProductOption[];
  suppliers?: StockSupplierOption[];
};

export function StockMobileReceiveButton({ baseHref }: { baseHref: string }) {
  return (
    <Link
      href={`${baseHref}?receive=1`}
      className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#003366] text-white shadow-2xl transition hover:bg-[#002244] sm:hidden"
    >
      <Plus className="h-7 w-7" strokeWidth={2.5} />
    </Link>
  );
}
