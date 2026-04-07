"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Package2,
  PackagePlus,
  Store,
  X,
} from "lucide-react";
import type { OrderStoreDetail, OrderStoreSummary } from "@/lib/orders/admin";
import { UnpricedItemsDialog } from "./unpriced-items-dialog";

function formatTHB(v: number) {
  return v.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  allStores: OrderStoreSummary[];
  date: string;
  detail: OrderStoreDetail | null;
  expandedId: string;
  q: string;
};

export function StoreDetailModal({ allStores, date, detail, expandedId, q }: Props) {
  const router = useRouter();

  const [slideDir, setSlideDir] = useState<"left" | "right" | null>(null);
  const [animTargetId, setAnimTargetId] = useState<string | null>(null);
  const [roundsOpen, setRoundsOpen] = useState(false);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setSlideDir(null);
      setAnimTargetId(null);
      setRoundsOpen(false);
    }, 0);
    return () => clearTimeout(t);
  }, [expandedId]);

  const currentIndex = allStores.findIndex((s) => s.customerId === expandedId);
  const prevStore = currentIndex > 0 ? allStores[currentIndex - 1] : null;
  const nextStore = currentIndex < allStores.length - 1 ? allStores[currentIndex + 1] : null;

  function buildNavHref(customerId: string | null) {
    if (!customerId) return null;
    const p = new URLSearchParams();
    p.set("date", date);
    if (q) p.set("q", q);
    p.set("expanded", customerId);
    return `/orders?${p.toString()}`;
  }

  function navigate(href: string | null, direction: "left" | "right", targetId: string | null) {
    if (!href || !targetId) return;
    setSlideDir(direction);
    setAnimTargetId(targetId);
    router.push(href);
  }

  function close() {
    const p = new URLSearchParams();
    p.set("date", date);
    if (q) p.set("q", q);
    router.push(`/orders?${p.toString()}`);
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function onTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) navigate(buildNavHref(nextStore?.customerId ?? null), "left", nextStore?.customerId ?? null);
    else navigate(buildNavHref(prevStore?.customerId ?? null), "right", prevStore?.customerId ?? null);
  }

  if (!detail) return null;

  const unpricedItems = detail.items.filter((item) => item.unitPrice === 0);

  const isNewContent = slideDir && detail.customerId === animTargetId;
  const slideStyle: React.CSSProperties = isNewContent
    ? { animation: `storeSlideIn${slideDir === "left" ? "Right" : "Left"} 260ms cubic-bezier(0.33,1,0.68,1) both` }
    : {};

  return (
    <>
      <style>{`
        @keyframes storeSlideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes storeSlideInLeft {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
      `}</style>

      <div className="fixed inset-0 z-50 flex flex-col bg-slate-50 md:hidden">
        <div className="shrink-0 bg-[#003366] shadow-md">
          <div className="flex items-center gap-3 px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <Store className="h-4 w-4 shrink-0 text-white/70" strokeWidth={2} />
                <p className="truncate text-base font-bold text-white">{detail.customerName}</p>
              </div>
              <p className="mt-0.5 font-mono text-xs text-white/50">{detail.customerCode}</p>
            </div>
            <button
              type="button"
              onClick={close}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-700 text-white shadow-md transition active:scale-95 active:bg-rose-900"
              aria-label="ปิด"
            >
              <X className="h-5 w-5" strokeWidth={2.8} />
            </button>
          </div>

          <div className="flex items-center gap-2 border-t border-white/10 px-4 py-2.5">
            <button
              onClick={() => navigate(buildNavHref(prevStore?.customerId ?? null), "right", prevStore?.customerId ?? null)}
              disabled={!prevStore}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white disabled:opacity-25"
              aria-label="ก่อนหน้า"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
            </button>

            <p className="flex-1 text-center text-xs text-white/60">
              {currentIndex + 1} / {allStores.length} ร้านค้า
            </p>

            <button
              onClick={() => navigate(buildNavHref(nextStore?.customerId ?? null), "left", nextStore?.customerId ?? null)}
              disabled={!nextStore}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white disabled:opacity-25"
              aria-label="ถัดไป"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <div key={detail.customerId} className="h-full overflow-y-auto px-4 py-4" style={slideStyle}>
            {unpricedItems.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-600 bg-amber-600 px-4 py-3.5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-white" strokeWidth={2.2} />
                  <span className="text-sm font-semibold text-white">
                    {unpricedItems.length} รายการยังไม่ผูกราคากับร้านนี้
                  </span>
                </div>
                <UnpricedItemsDialog
                  customerId={detail.customerId}
                  customerName={detail.customerName}
                  items={unpricedItems.map((item) => ({
                    productId: item.productId,
                    productName: item.productName,
                    productSaleUnitId: null,
                    productSku: item.productSku,
                    saleUnitLabel: item.productUnit,
                  }))}
                />
              </div>
            )}

            {detail.orderRounds.length > 0 && (
              <div className="mb-4 overflow-hidden rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setRoundsOpen((v) => !v)}
                  className="flex w-full items-center gap-2 bg-slate-50 px-4 py-2.5 transition active:bg-slate-100"
                >
                  <ClipboardList className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={2.4} />
                  <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">
                    รอบออเดอร์
                  </span>
                  <span className="ml-auto inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600">
                    {detail.orderRounds.length} รอบ
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${roundsOpen ? "rotate-180" : ""}`}
                    strokeWidth={2.4}
                  />
                </button>
                <div className={`overflow-hidden transition-all duration-200 ${roundsOpen ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"}`}>
                  <div className="divide-y divide-slate-50 border-t border-slate-100">
                    {detail.orderRounds.map((round, idx) => (
                      <Link
                        key={round.id}
                        href={`/orders/incoming?date=${date}&expanded=${round.id}`}
                        className="flex items-center gap-3 px-4 py-2.5 transition active:bg-slate-50"
                      >
                        <span className="w-5 shrink-0 text-center text-xs font-bold text-slate-300">{idx + 1}</span>
                        <span className="font-mono text-xs font-semibold text-[#003366]">{round.orderNumber}</span>
                        <span className="ml-auto text-sm font-bold text-slate-800">
                          {formatTHB(round.totalAmount)} บาท
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {detail.items.map((item, idx) => (
                <div
                  key={`${item.productId}-${item.productUnit}-${idx}`}
                  className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                      {item.imageUrl ? (
                        <Image
                          src={item.imageUrl}
                          alt={item.productName}
                          fill
                          sizes="44px"
                          className="object-contain bg-white p-0.5"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Package2 className="h-5 w-5 text-slate-300" strokeWidth={1.8} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{item.productName}</p>
                      <p className="font-mono text-xs text-slate-400">{item.productSku}</p>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-14 text-xs text-slate-500">
                    <span>
                      สั่ง <span className="font-bold text-slate-800">{item.orderedQuantity.toLocaleString("th-TH")}</span> {item.productUnit}
                    </span>
                    <span>·</span>
                    <span>
                      ส่งแล้ว <span className="font-bold text-emerald-700">{item.deliveredQuantity.toLocaleString("th-TH")}</span>
                    </span>
                    <span>·</span>
                    <span>
                      สต็อก <span className="font-medium text-slate-700">{item.currentStockQuantity.toLocaleString("th-TH")}</span>
                    </span>
                    {item.shortQuantity > 0 && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-0.5 font-semibold text-red-700">
                          <AlertTriangle className="h-3 w-3" strokeWidth={2.4} />
                          ขาด {item.shortQuantity.toLocaleString("th-TH")}
                        </span>
                      </>
                    )}
                  </div>

                  {item.shortQuantity > 0 && (
                    <div className="mt-2 pl-14">
                      <Link
                        href={`/stock?receive=1&product=${item.productId}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#003366]/30 bg-[#003366]/5 px-3 py-1.5 text-xs font-semibold text-[#003366] transition active:bg-[#003366]/10"
                      >
                        <PackagePlus className="h-3.5 w-3.5" strokeWidth={2.2} />
                        ไปรับสินค้าเข้า →
                      </Link>
                    </div>
                  )}

                  <div className="mt-1 flex items-center justify-between pl-14 text-xs">
                    {item.unitPrice > 0 ? (
                      <span className="text-slate-400">{formatTHB(item.unitPrice)} บาท/หน่วย</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 font-semibold text-white">
                        <AlertTriangle className="h-3 w-3" strokeWidth={2.4} />
                        ยังไม่ผูกราคา
                      </span>
                    )}
                    <span className="font-bold text-slate-900">{formatTHB(item.lineTotal)} บาท</span>
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <span className="text-sm font-semibold text-slate-500">ยอดเงินรวมทุกรายการ</span>
                <span className="text-lg font-bold text-[#003366] tabular-nums">
                  {formatTHB(detail.totalAmount)} <span className="text-sm font-semibold text-slate-400">บาท</span>
                </span>
              </div>
            </div>

            <div className="h-4" />
          </div>
        </div>
      </div>
    </>
  );
}
