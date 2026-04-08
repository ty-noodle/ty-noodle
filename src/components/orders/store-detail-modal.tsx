"use client";

import { startTransition, useEffect, useRef, useState } from "react";
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

export function StoreDetailModal({
  allStores,
  date,
  detail,
  expandedId,
  q,
}: Props) {
  const SWIPE_THRESHOLD_RATIO = 0.14;
  const router = useRouter();

  const [slideDir, setSlideDir] = useState<"left" | "right" | null>(null);
  const [animTargetId, setAnimTargetId] = useState<string | null>(null);
  const [roundsOpen, setRoundsOpen] = useState(false);
  const [isSwipeClosing, setIsSwipeClosing] = useState(false);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const dragXRef = useRef(0);
  const dragActiveRef = useRef(false);
  const dragTargetLockedRef = useRef(false);
  const dragDirectionRef = useRef<1 | -1>(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setIsSwipeClosing(false);
      setSlideDir(null);
      setAnimTargetId(null);
      setRoundsOpen(false);
    }, 220);
    return () => clearTimeout(t);
  }, [expandedId]);

  function shouldIgnoreDragStart(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    const horizontalScroll = target.closest("[data-horizontal-scroll='true']") as HTMLElement | null;
    return Boolean(horizontalScroll && horizontalScroll.scrollWidth > horizontalScroll.clientWidth);
  }

  const currentIndex = allStores.findIndex((s) => s.customerId === expandedId);
  const wrappedPrevStore =
    currentIndex >= 0 && allStores.length > 1
      ? allStores[(currentIndex - 1 + allStores.length) % allStores.length] ?? null
      : null;
  const wrappedNextStore =
    currentIndex >= 0 && allStores.length > 1
      ? allStores[(currentIndex + 1) % allStores.length] ?? null
      : null;
  const prevStore = wrappedPrevStore;
  const nextStore = wrappedNextStore;

  function buildNavHref(customerId: string | null) {
    if (!customerId) return null;
    const p = new URLSearchParams();
    p.set("date", date);
    if (q) p.set("q", q);
    p.set("expanded", customerId);
    return `/orders?${p.toString()}`;
  }

  // Prefetch adjacent stores for faster navigation
  useEffect(() => {
    const prevHref = buildNavHref(prevStore?.customerId ?? null);
    const nextHref = buildNavHref(nextStore?.customerId ?? null);
    if (prevHref) router.prefetch(prevHref);
    if (nextHref) router.prefetch(nextHref);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedId]);

  function navigate(href: string | null, direction: "left" | "right", targetId: string | null) {
    if (!href || !targetId) return;
    setSlideDir(direction);
    setAnimTargetId(targetId);
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  function close() {
    const p = new URLSearchParams();
    p.set("date", date);
    if (q) p.set("q", q);
    const href = `/orders?${p.toString()}`;
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  function onTouchStart(e: React.TouchEvent) {
    if (isSwipeClosing) {
      return;
    }
    if (shouldIgnoreDragStart(e.target)) {
      dragTargetLockedRef.current = true;
      return;
    }
    dragTargetLockedRef.current = false;
    dragActiveRef.current = false;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (isSwipeClosing || dragTargetLockedRef.current) {
      return;
    }

    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;

    if (!dragActiveRef.current) {
      if (dx > 8 && Math.abs(dx) > Math.abs(dy) * 1.15) {
        dragActiveRef.current = true;
      } else if (dx < -8 && Math.abs(dx) > Math.abs(dy) * 1.15) {
        dragActiveRef.current = true;
      } else {
        return;
      }
    }

    dragDirectionRef.current = dx >= 0 ? 1 : -1;
    dragXRef.current = dx;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (dragTargetLockedRef.current) {
      dragTargetLockedRef.current = false;
      return;
    }

    const endDx = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    if (!dragActiveRef.current && Math.abs(endDx) > 10) {
      dragActiveRef.current = true;
    }

    if (!dragActiveRef.current || isSwipeClosing) {
      return;
    }

    dragActiveRef.current = false;
    if (Math.abs(endDx) > Math.abs(dragXRef.current)) {
      dragXRef.current = endDx;
      dragDirectionRef.current = endDx >= 0 ? 1 : -1;
    }

    const width = window.innerWidth || 1;
    const shouldNavigate = Math.abs(dragXRef.current) >= width * SWIPE_THRESHOLD_RATIO;

    if (shouldNavigate) {
      const goingNext = dragDirectionRef.current < 0;
      const targetCustomerId = goingNext
        ? wrappedNextStore?.customerId ?? null
        : wrappedPrevStore?.customerId ?? null;
      const targetHref = buildNavHref(targetCustomerId);

      if (targetHref && targetCustomerId) {
        setIsSwipeClosing(true);
        navigate(targetHref, goingNext ? "left" : "right", targetCustomerId);
        return;
      }
    }
  }

  if (!detail) return null;

  const unpricedItems = detail.items.filter((item) => item.unitPrice === 0);
  const previewDisplayDetail = detail;

  const isNewContent = slideDir && detail.customerId === animTargetId;
  const slideStyle: React.CSSProperties = isNewContent
    ? {
        animation: `storeSlideIn${slideDir === "left" ? "Right" : "Left"} 220ms cubic-bezier(0.22,1,0.36,1) both`,
        willChange: "transform",
        position: "absolute",
        inset: 0,
        zIndex: 2,
        overflowY: "auto",
      }
    : {};

  return (
    <>
      <style>{`
        @keyframes storeSlideInRight {
          from {
            transform: translateX(100%);
            box-shadow: -12px 0 32px rgba(0,0,0,0.18);
          }
          to {
            transform: translateX(0);
            box-shadow: -12px 0 0px rgba(0,0,0,0);
          }
        }
        @keyframes storeSlideInLeft {
          from {
            transform: translateX(-100%);
            box-shadow: 12px 0 32px rgba(0,0,0,0.18);
          }
          to {
            transform: translateX(0);
            box-shadow: 12px 0 0px rgba(0,0,0,0);
          }
        }
      `}</style>

      <div className="fixed inset-0 z-50 md:hidden">
        <div
          className="absolute inset-0 bg-slate-950"
          style={{ opacity: 0.45, transition: "opacity 220ms ease" }}
        />

        {false ? (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex flex-col bg-slate-50 shadow-[0_0_28px_rgba(15,23,42,0.28)]"
          style={{ opacity: 0, transform: "translateX(100%)", transition: "none" }}
        >
          <div className="shrink-0 bg-[#003366] shadow-md">
            <div className="flex items-center gap-3 px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <Store className="h-4 w-4 shrink-0 text-white/70" strokeWidth={2} />
                  <p className="truncate text-base font-bold text-white">{previewDisplayDetail.customerName}</p>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <p className="font-mono text-xs text-white/50">{previewDisplayDetail.customerCode}</p>
                  <span className="text-white/30">·</span>
                  <span className="font-mono text-xs font-bold text-white/70">
                    {Math.min(currentIndex + 2, allStores.length)}/{allStores.length}
                  </span>
                </div>
              </div>
              <div className="h-10 w-10 rounded-full bg-white/10" />
            </div>
            <div className="flex items-center gap-2 border-t border-white/10 px-4 py-2.5">
              <div className="h-8 w-8 rounded-full bg-white/10" />
              <p className="flex-1 text-center text-xs text-white/60">
                {Math.min(currentIndex + 2, allStores.length)} / {allStores.length} ร้านค้า
              </p>
              <div className="h-8 w-8 rounded-full bg-white/10" />
            </div>
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden" style={{ contain: "layout style" }}>
            <div className="h-full overflow-y-auto px-4 py-4">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-700">รายการสินค้า</p>
                </div>
                <div className="divide-y divide-slate-200">
                  {previewDisplayDetail.items.map((item) => (
                    <div key={`preview-${item.productId}-${item.productUnit}`} className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-slate-500">{item.productSku}</p>
                        <p className="truncate text-sm font-semibold text-slate-900">{item.productName}</p>
                      </div>
                      <p className="text-sm font-bold text-slate-900 tabular-nums">
                        {item.orderedQuantity.toLocaleString("th-TH")} {item.productUnit}
                      </p>
                      <p className="text-sm font-bold text-[#003366] tabular-nums">
                        {formatTHB(item.lineTotal)} บาท
                      </p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-700">
                    รวมจำนวน {previewDisplayDetail.totalOrderedQuantity.toLocaleString("th-TH")}
                  </p>
                  <p className="text-right text-base font-bold text-[#003366] tabular-nums">
                    {formatTHB(previewDisplayDetail.totalAmount)} บาท
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        ) : null}

        <div
          className="relative z-10 flex h-full flex-col bg-slate-50"
          style={{ touchAction: "pan-y" }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
        <div className="shrink-0 bg-[#003366] shadow-md">
          <div className="flex items-center gap-3 px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <Store className="h-4 w-4 shrink-0 text-white/70" strokeWidth={2} />
                <p className="truncate text-base font-bold text-white">{detail.customerName}</p>
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <p className="font-mono text-xs text-white/50">{detail.customerCode}</p>
                <span className="text-white/30">·</span>
                <span className="font-mono text-xs font-bold text-white/70">{currentIndex + 1}/{allStores.length}</span>
              </div>
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

        <div className="relative min-h-0 flex-1 overflow-hidden" style={{ contain: "layout style" }}>
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
                <article
                  key={`${item.productId}-${item.productUnit}-${idx}-mobile`}
                  className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                      {item.imageUrl ? (
                        <Image
                          src={item.imageUrl}
                          alt={item.productName}
                          fill
                          sizes="48px"
                          className="object-contain bg-white p-0.5"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Package2 className="h-5 w-5 text-slate-300" strokeWidth={1.8} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[11px] font-semibold text-slate-500">{item.productSku}</p>
                      <p className="line-clamp-2 text-sm font-semibold leading-5 text-slate-900">
                        {item.productName}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">ออเดอร์</p>
                      <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                        {item.orderedQuantity.toLocaleString("th-TH")}{" "}
                        <span className="text-xs font-medium text-slate-500">{item.productUnit}</span>
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">สต็อก</p>
                      <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                        {item.currentStockQuantity.toLocaleString("th-TH")}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">ราคา/หน่วย</p>
                      <div className="mt-1">
                        {item.unitPrice > 0 ? (
                          <p className="text-sm font-bold tabular-nums text-slate-900">{formatTHB(item.unitPrice)}</p>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                            <AlertTriangle className="h-3 w-3" strokeWidth={2.4} />
                            ยังไม่ผูกราคา
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">จำนวนเงินรวม</p>
                      <p className="mt-1 text-sm font-bold tabular-nums text-[#003366]">
                        {formatTHB(item.lineTotal)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    {item.shortQuantity > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
                        <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.4} />
                        ขาด {item.shortQuantity.toLocaleString("th-TH")}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-emerald-700">สต็อกพอ</span>
                    )}

                    {item.shortQuantity > 0 ? (
                      <Link
                        href={`/stock?receive=1&product=${item.productId}`}
                        className="inline-flex items-center gap-1 rounded-md border border-[#003366]/25 bg-[#003366]/5 px-2 py-1 text-[11px] font-semibold text-[#003366] transition active:bg-[#003366]/10"
                      >
                        <PackagePlus className="h-3 w-3" strokeWidth={2.2} />
                        รับเข้า
                      </Link>
                    ) : null}
                  </div>
                </article>
              ))}

              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <span className="font-semibold text-slate-500">ยอดรวมทั้งหมด</span>
                <span className="font-bold tabular-nums text-[#003366]">{formatTHB(detail.totalAmount)}</span>
              </div>
            </div>

            <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div data-horizontal-scroll="true" className="overflow-x-auto touch-pan-x">
                <table className="min-w-[860px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="bg-[#003366]">
                      {(["รหัสสินค้า", "รายการสินค้า", "ออเดอร์", "หน่วย", "สต็อก", "ขาด", "ราคา/หน่วย", "จำนวนเงินรวม"] as const).map(
                        (column, index, arr) => (
                          <th
                            key={column}
                            className={`px-3 py-2.5 text-center text-[11px] font-bold text-white ${index < arr.length - 1 ? "border-r border-white/20" : ""}`}
                          >
                            {column}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {detail.items.map((item, idx) => (
                      <tr key={`${item.productId}-${item.productUnit}-${idx}`} className="align-middle">
                        <td className="border-r border-slate-200 px-3 py-3 text-center">
                          <span className="font-mono text-xs font-semibold text-slate-700">{item.productSku}</span>
                        </td>
                        <td className="border-r border-slate-200 px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                              {item.imageUrl ? (
                                <Image
                                  src={item.imageUrl}
                                  alt={item.productName}
                                  fill
                                  sizes="36px"
                                  className="object-contain bg-white p-0.5"
                                />
                              ) : (
                                <Package2 className="h-4 w-4 text-slate-300" strokeWidth={1.8} />
                              )}
                            </div>
                            <p className="font-medium text-slate-900">{item.productName}</p>
                          </div>
                        </td>
                        <td className="border-r border-slate-200 px-3 py-3 text-center font-semibold tabular-nums text-slate-900">
                          {item.orderedQuantity.toLocaleString("th-TH")}
                        </td>
                        <td className="border-r border-slate-200 px-3 py-3 text-center text-slate-600">
                          {item.productUnit}
                        </td>
                        <td className="border-r border-slate-200 px-3 py-3 text-center tabular-nums text-slate-700">
                          {item.currentStockQuantity.toLocaleString("th-TH")}
                        </td>
                        <td className="border-r border-slate-200 px-3 py-3 text-center">
                          {item.shortQuantity > 0 ? (
                            <div className="flex flex-col items-center gap-1">
                              <span className="inline-flex items-center gap-1 font-semibold text-red-700">
                                <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.4} />
                                {item.shortQuantity.toLocaleString("th-TH")}
                              </span>
                              <Link
                                href={`/stock?receive=1&product=${item.productId}`}
                                className="inline-flex items-center gap-1 rounded-md border border-[#003366]/25 bg-[#003366]/5 px-2 py-1 text-[11px] font-semibold text-[#003366] transition active:bg-[#003366]/10"
                              >
                                <PackagePlus className="h-3 w-3" strokeWidth={2.2} />
                                รับเข้า
                              </Link>
                            </div>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="border-r border-slate-200 px-3 py-3 text-center tabular-nums text-slate-700">
                          {item.unitPrice > 0 ? (
                            formatTHB(item.unitPrice)
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                              <AlertTriangle className="h-3 w-3" strokeWidth={2.4} />
                              ยังไม่ผูกราคา
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center font-semibold tabular-nums text-slate-900">
                          {formatTHB(item.lineTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50">
                      <td
                        colSpan={7}
                        className="border-r border-t border-slate-200 px-3 py-3 text-right text-sm font-semibold text-slate-600"
                      >
                        ยอดเงินรวมทุกรายการ
                      </td>
                      <td className="border-t border-slate-200 px-3 py-3 text-center text-base font-bold tabular-nums text-[#003366]">
                        {formatTHB(detail.totalAmount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="h-4" />
          </div>
        </div>
        </div>
      </div>
    </>
  );
}
