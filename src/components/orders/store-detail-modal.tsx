"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
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
  X,
} from "lucide-react";
import type { OrderStoreDetail, OrderStoreSummary } from "@/lib/orders/admin";
import { UnpricedItemsDialog } from "./unpriced-items-dialog";

function formatTHB(value: number) {
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type Props = {
  allStores: OrderStoreSummary[];
  date: string;
  detail: OrderStoreDetail | null;
  expandedId: string;
  q: string;
};

function getVisibleStores(stores: OrderStoreSummary[]) {
  return stores.filter(
    (store, index, entries) =>
      !store.isComplete &&
      entries.findIndex((entry) => entry.customerId === store.customerId) === index,
  );
}

export function StoreDetailModal({
  allStores,
  date,
  detail,
  expandedId,
  q,
}: Props) {
  const swipeThresholdRatio = 0.14;
  const router = useRouter();

  const [roundsOpen, setRoundsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isSwipeClosing, setIsSwipeClosing] = useState(false);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const dragXRef = useRef(0);
  const dragActiveRef = useRef(false);
  const dragTargetLockedRef = useRef(false);
  const dragDirectionRef = useRef<1 | -1>(1);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setIsSwipeClosing(false);
      setRoundsOpen(false);
    }, 220);

    return () => clearTimeout(timeout);
  }, [expandedId]);

  function shouldIgnoreDragStart(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    const horizontalScroll = target.closest("[data-horizontal-scroll='true']") as HTMLElement | null;
    return Boolean(horizontalScroll && horizontalScroll.scrollWidth > horizontalScroll.clientWidth);
  }

  const visibleStores = getVisibleStores(allStores);
  const currentIndex = visibleStores.findIndex((store) => store.customerId === expandedId);
  const wrappedPrevStore =
    currentIndex >= 0 && visibleStores.length > 1
      ? visibleStores[(currentIndex - 1 + visibleStores.length) % visibleStores.length] ?? null
      : null;
  const wrappedNextStore =
    currentIndex >= 0 && visibleStores.length > 1
      ? visibleStores[(currentIndex + 1) % visibleStores.length] ?? null
      : null;

  const buildNavHref = useCallback(
    (customerId: string | null) => {
      if (!customerId) return null;
      const params = new URLSearchParams();
      params.set("date", date);
      if (q) params.set("q", q);
      params.set("expanded", customerId);
      return `/orders?${params.toString()}`;
    },
    [date, q],
  );

  function navigate(href: string | null) {
    if (!href) return;
    startTransition(() => {
      router.replace(href, { scroll: false });
      router.refresh();
    });
  }

  function close() {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      const params = new URLSearchParams();
      params.set("date", date);
      if (q) params.set("q", q);

      startTransition(() => {
        router.replace(`/orders?${params.toString()}`, { scroll: false });
      });
    }, 250);
  }

  function onTouchStart(event: React.TouchEvent) {
    if (isSwipeClosing) return;

    if (shouldIgnoreDragStart(event.target)) {
      dragTargetLockedRef.current = true;
      return;
    }

    dragTargetLockedRef.current = false;
    dragActiveRef.current = false;
    touchStartX.current = event.touches[0].clientX;
    touchStartY.current = event.touches[0].clientY;
  }

  function onTouchMove(event: React.TouchEvent) {
    if (isSwipeClosing || dragTargetLockedRef.current) {
      return;
    }

    const dx = event.touches[0].clientX - touchStartX.current;
    const dy = event.touches[0].clientY - touchStartY.current;

    if (!dragActiveRef.current) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.15) {
        dragActiveRef.current = true;
      } else {
        return;
      }
    }

    dragDirectionRef.current = dx >= 0 ? 1 : -1;
    dragXRef.current = dx;
  }

  function onTouchEnd(event: React.TouchEvent) {
    if (dragTargetLockedRef.current) {
      dragTargetLockedRef.current = false;
      return;
    }

    const endDx = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;

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
    const shouldNavigate = Math.abs(dragXRef.current) >= width * swipeThresholdRatio;

    if (!shouldNavigate) {
      return;
    }

    const goingNext = dragDirectionRef.current < 0;
    const targetCustomerId = goingNext
      ? wrappedNextStore?.customerId ?? null
      : wrappedPrevStore?.customerId ?? null;
    const targetHref = buildNavHref(targetCustomerId);

    if (targetHref && targetCustomerId) {
      setIsSwipeClosing(true);
      navigate(targetHref);
    }
  }

  if (!detail) return null;

  const unpricedItems = detail.items.filter((item) => item.unitPrice === 0);
  const positionLabel =
    currentIndex >= 0 ? `${currentIndex + 1}/${visibleStores.length}` : `1/${visibleStores.length || 1}`;

  return (
    <>
      <style>{`
        @keyframes sheetSlideIn {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes sheetSlideOut {
          from { transform: translateY(0); }
          to { transform: translateY(100%); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        .animate-sheet { animation: sheetSlideIn 300ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        .animate-sheet-out { animation: sheetSlideOut 250ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        .animate-fade { animation: fadeIn 200ms ease both; }
        .animate-fade-out { animation: fadeOut 200ms ease both; }
      `}</style>

      <div className="fixed inset-0 z-[100] flex flex-col md:hidden">
        <div
          className={`absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] ${isClosing ? "animate-fade-out" : "animate-fade"}`}
          onClick={close}
        />

        <div
          className={`relative mt-auto flex max-h-[94vh] min-h-[50vh] w-full flex-col overflow-hidden rounded-t-[2.5rem] bg-white shadow-2xl ${isClosing ? "animate-sheet-out" : "animate-sheet"}`}
          style={{ touchAction: "pan-y" }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-slate-200" />

          <div className="flex shrink-0 flex-col border-b border-slate-100 bg-white/80 px-6 py-4 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1 pr-4">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 rounded bg-[#003366]/5 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#003366]">
                    {detail.customerCode}
                  </span>
                  <span className="text-xs font-bold text-slate-400">{positionLabel}</span>
                </div>
                <h2 className="mt-1 truncate text-lg font-black text-slate-900">
                  {detail.customerName}
                </h2>
              </div>
              <button
                type="button"
                onClick={close}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 active:bg-slate-200"
                aria-label="ปิดรายละเอียดร้านค้า"
              >
                <X className="h-5 w-5" strokeWidth={2.5} />
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => navigate(buildNavHref(wrappedPrevStore?.customerId ?? null))}
                disabled={!wrappedPrevStore}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-600 transition active:bg-slate-50 disabled:opacity-30"
              >
                <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
                ร้านก่อนหน้า
              </button>
              <button
                type="button"
                onClick={() => navigate(buildNavHref(wrappedNextStore?.customerId ?? null))}
                disabled={!wrappedNextStore}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-600 transition active:bg-slate-50 disabled:opacity-30"
              >
                ร้านถัดไป
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/50">
            <div key={detail.customerId} className="space-y-4 p-4 pb-[env(safe-area-inset-bottom,2rem)]">
              {unpricedItems.length > 0 ? (
                <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm">
                      <AlertTriangle className="h-5 w-5" strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold leading-snug text-amber-900">
                        พบสินค้าที่ยังไม่ได้ตั้งราคา
                      </p>
                      <p className="mt-0.5 text-xs font-semibold text-amber-700/80">
                        กรุณาตั้งราคาเพื่อสรุปยอดให้ถูกต้อง
                      </p>
                    </div>
                  </div>
                  <UnpricedItemsDialog
                    customerId={detail.customerId}
                    customerName={detail.customerName}
                    items={unpricedItems.map((item) => ({
                      imageUrl: item.imageUrl,
                      productId: item.productId,
                      productName: item.productName,
                      productSaleUnitId: item.productSaleUnitId,
                      productSku: item.productSku,
                      saleUnitLabel: item.productUnit,
                    }))}
                  />
                </div>
              ) : null}

              {detail.orderRounds.length > 0 ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => setRoundsOpen((value) => !value)}
                    className="flex w-full items-center gap-3 px-4 py-3.5 transition active:bg-slate-50"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                      <ClipboardList className="h-4 w-4" strokeWidth={2.5} />
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        รอบออเดอร์
                      </p>
                      <p className="text-[13px] font-bold text-slate-700">
                        {detail.orderRounds.length} รายการวันนี้
                      </p>
                    </div>
                    <ChevronDown
                      className={`h-5 w-5 text-slate-300 transition-transform duration-300 ${
                        roundsOpen ? "rotate-180" : ""
                      }`}
                      strokeWidth={2.5}
                    />
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-300 ${
                      roundsOpen ? "max-h-[500px] border-t border-slate-100" : "max-h-0"
                    }`}
                  >
                    <div className="divide-y divide-slate-50 bg-slate-50/30">
                      {detail.orderRounds.map((round) => (
                        <Link
                          key={round.id}
                          href={`/orders/incoming?date=${date}&expanded=${round.id}`}
                          className="flex items-center gap-3 px-4 py-3.5 transition active:bg-white"
                        >
                          <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-xs font-bold text-[#003366]">
                              {round.orderNumber}
                            </p>
                            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              {round.status}
                            </p>
                          </div>
                          <p className="text-sm font-black text-slate-900">
                            {formatTHB(round.totalAmount)}
                            <span className="ml-1 text-[10px] text-slate-400">฿</span>
                          </p>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="space-y-4">
                {detail.items.map((item, index) => (
                  <article
                    key={`${item.productId}-${item.productUnit}-${index}-mobile`}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                  >
                    <div className="flex items-start gap-3 p-4">
                      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                        {item.imageUrl ? (
                          <Image
                            src={item.imageUrl}
                            alt={item.productName}
                            fill
                            sizes="56px"
                            className="object-contain bg-white p-1"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Package2 className="h-6 w-6 text-slate-300" strokeWidth={1.5} />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="font-mono text-[10px] font-bold tracking-wider text-slate-400">
                          {item.productSku}
                        </p>
                        <h4 className="line-clamp-2 text-[15px] font-bold leading-tight text-slate-900">
                          {item.productName}
                        </h4>
                        <div className="flex items-center gap-2 pt-1">
                          {item.shortQuantity > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-red-100 bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-600">
                              <AlertTriangle className="h-3 w-3" strokeWidth={3} />
                              สินค้าขาด {item.shortQuantity}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-600">
                              สต็อกพอ
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 divide-x divide-slate-100 border-t border-slate-100">
                      <div className="p-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          ออเดอร์
                        </p>
                        <p className="mt-1 text-sm font-black text-slate-900">
                          {item.orderedQuantity.toLocaleString("th-TH")}
                          <span className="ml-1 text-[10px] font-bold text-slate-400">
                            {item.productUnit}
                          </span>
                        </p>
                      </div>
                      <div className="p-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          สต็อกคงเหลือ
                        </p>
                        <p className="mt-1 text-sm font-black text-slate-900">
                          {item.currentStockQuantity.toLocaleString("th-TH")}
                          <span className="ml-1 text-[10px] font-bold text-slate-400">
                            {item.productUnit}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          จำนวนเงินรวม
                        </p>
                        <p className="text-[15px] font-black text-[#003366]">
                          {formatTHB(item.lineTotal)}
                          <span className="ml-0.5 text-[10px]">฿</span>
                        </p>
                      </div>

                      {item.shortQuantity > 0 ? (
                        <Link
                          href={`/stock?receive=1&product=${item.productId}`}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[#003366] px-4 py-2 text-[12px] font-bold text-white shadow-sm transition active:scale-95"
                        >
                          <PackagePlus className="h-4 w-4" strokeWidth={2.5} />
                          รับเข้าสินค้า
                        </Link>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>

              <div className="sticky bottom-0 mt-6 flex items-center justify-between rounded-2xl border border-[#003366]/10 bg-[#003366] px-6 py-4 shadow-[0_-8px_30px_rgba(0,0,0,0.1)]">
                <span className="text-sm font-bold text-white/70">รวมยอดทั้งหมด</span>
                <span className="text-xl font-black tabular-nums text-white">
                  {formatTHB(detail.totalAmount)}
                  <span className="ml-1 text-xs">฿</span>
                </span>
              </div>
            </div>

            <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div data-horizontal-scroll="true" className="overflow-x-auto touch-pan-x">
                <table className="min-w-[860px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="bg-[#003366]">
                      {[
                        "รหัสสินค้า",
                        "รายการสินค้า",
                        "ออเดอร์",
                        "หน่วย",
                        "สต็อก",
                        "ขาด",
                        "ราคา/หน่วย",
                        "จำนวนเงินรวม",
                      ].map((column, index, columns) => (
                        <th
                          key={column}
                          className={`px-3 py-2.5 text-center text-[11px] font-bold text-white ${
                            index < columns.length - 1 ? "border-r border-white/20" : ""
                          }`}
                        >
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {detail.items.map((item, index) => (
                      <tr key={`${item.productId}-${item.productUnit}-${index}`} className="align-middle">
                        <td className="border-r border-slate-200 px-3 py-3 text-center">
                          <span className="font-mono text-xs font-semibold text-slate-700">
                            {item.productSku}
                          </span>
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
                                {item.shortBaseQuantity.toLocaleString("th-TH")}
                                <span className="ml-0.5 text-[10px] font-bold text-red-500">
                                  {item.productBaseUnit}
                                </span>
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
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="border-r border-slate-200 px-3 py-3 text-center tabular-nums text-slate-700">
                          {item.unitPrice > 0 ? (
                            formatTHB(item.unitPrice)
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                              <AlertTriangle className="h-3 w-3" strokeWidth={2.4} />
                              ยังไม่ได้ตั้งราคา
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
    </>
  );
}
