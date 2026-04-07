"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Tag, X } from "lucide-react";
import { getStoreItemCostSnapshots, setStoreItemPrices } from "@/app/orders/actions";
import { confirmBelowCostSave, isBelowCostPrice } from "@/components/pricing/price-guard";

export type UnpricedItem = {
  effectiveCostPrice?: number | null;
  productId: string;
  productName: string;
  productSaleUnitId: string | null;
  productSku: string;
  saleUnitLabel: string;
};

type Props = {
  customerId: string;
  customerName: string;
  items: UnpricedItem[];
};

function itemKey(item: UnpricedItem) {
  return item.productSaleUnitId ?? `${item.productId}-${item.saleUnitLabel}`;
}

export function UnpricedItemsDialog({ customerId, customerName, items }: Props) {
  const [open, setOpen] = useState(false);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState("");
  const [isPending, startTransition] = useTransition();

  const pendingItems = useMemo(
    () => items.filter((item) => !savedIds.has(itemKey(item))),
    [items, savedIds],
  );
  const allSaved = pendingItems.length === 0 && items.length > 0;

  const invalidPriceKeys = useMemo(
    () =>
      pendingItems.flatMap((item) => {
        const key = itemKey(item);
        const priceValue = prices[key] ?? "";
        const parsedPrice = Number.parseFloat(priceValue);

        if (priceValue === "" || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
          return [key];
        }

        return [];
      }),
    [pendingItems, prices],
  );

  const canSaveAll = pendingItems.length > 0 && invalidPriceKeys.length === 0 && !isPending;

  function handleClose() {
    setOpen(false);
    setSaveError("");
  }

  useEffect(() => {
    if (!open || items.length === 0) return;

    let cancelled = false;

    void getStoreItemCostSnapshots(
      items.map((item) => ({
        productId: item.productId,
        productSaleUnitId: item.productSaleUnitId,
      })),
    ).then((result) => {
      if (cancelled) return;

      const nextCosts = result.reduce<Record<string, number>>((acc, snapshot, index) => {
        const key = itemKey(items[index]);
        if (
          snapshot.effectiveCostPrice !== null &&
          snapshot.effectiveCostPrice !== undefined
        ) {
          acc[key] = Number(snapshot.effectiveCostPrice);
        }
        return acc;
      }, {});

      setCosts(nextCosts);
    });

    return () => {
      cancelled = true;
    };
  }, [items, open]);

  function handleSaveAll() {
    if (!canSaveAll) return;

    const itemsToSave = pendingItems.map((item) => {
      const key = itemKey(item);
      return {
        item,
        key,
        salePrice: Number.parseFloat(prices[key] ?? ""),
        effectiveCostPrice: costs[key] ?? item.effectiveCostPrice ?? null,
      };
    });

    const firstBelowCostItem = itemsToSave.find(({ salePrice, effectiveCostPrice }) =>
      isBelowCostPrice(salePrice, effectiveCostPrice),
    );

    if (
      firstBelowCostItem &&
      !confirmBelowCostSave({
        productName:
          itemsToSave.filter(({ salePrice, effectiveCostPrice }) =>
            isBelowCostPrice(salePrice, effectiveCostPrice),
          ).length > 1
            ? `ทั้งหมด ${itemsToSave.length} รายการ`
            : firstBelowCostItem.item.productName,
        saleUnitLabel: firstBelowCostItem.item.saleUnitLabel,
        salePrice: firstBelowCostItem.salePrice,
        effectiveCostPrice: Number(firstBelowCostItem.effectiveCostPrice ?? 0),
      })
    ) {
      return;
    }

    setSaveError("");
    startTransition(async () => {
      try {
        await setStoreItemPrices(
          customerId,
          itemsToSave.map(({ item, salePrice }) => ({
            productId: item.productId,
            productSaleUnitId: item.productSaleUnitId,
            salePrice,
          })),
        );

        setSavedIds((prev) => new Set([...prev, ...itemsToSave.map(({ key }) => key)]));
      } catch (error) {
        console.error(error);
        setSaveError("ไม่สามารถบันทึกราคาสินค้าได้ กรุณาลองใหม่อีกครั้ง");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-amber-700 bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700 active:scale-[0.98]"
      >
        <Tag className="h-4 w-4" strokeWidth={2.3} />
        ตั้งราคา {items.length} รายการ
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[2px]"
            onClick={handleClose}
          />

          <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-0 sm:inset-0 sm:items-center sm:p-4">
            <div className="flex w-full flex-col overflow-hidden rounded-t-[1.75rem] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.25)] sm:max-w-lg sm:rounded-[1.75rem]">
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    ตั้งราคาสินค้า
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-slate-950">{customerName}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {allSaved
                      ? "ตั้งราคาครบทุกรายการแล้ว"
                      : `${pendingItems.length} รายการที่ยังไม่มีราคา`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  aria-label="ปิด"
                >
                  <X className="h-5 w-5" strokeWidth={2.2} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5" style={{ maxHeight: "60dvh" }}>
                {allSaved ? (
                  <div className="flex flex-col items-center py-10 text-center">
                    <CheckCircle2 className="h-14 w-14 text-emerald-500" strokeWidth={1.6} />
                    <p className="mt-4 text-lg font-bold text-slate-950">
                      ตั้งราคาครบทุกรายการแล้ว
                    </p>
                    <p className="mt-2 text-base leading-relaxed text-slate-500">
                      ราคาถูกบันทึกในหน้าจัดการร้านค้าแล้ว
                      <br />
                      สามารถแก้ไขได้ที่หน้าตั้งค่าภายหลัง
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {items.map((item) => {
                      const key = itemKey(item);
                      const isSaved = savedIds.has(key);
                      const priceValue = prices[key] ?? "";
                      const parsedPrice = Number.parseFloat(priceValue);
                      const effectiveCostPrice = costs[key] ?? item.effectiveCostPrice ?? null;
                      const isBelowCost = isBelowCostPrice(parsedPrice, effectiveCostPrice);

                      return (
                        <div
                          key={key}
                          className={[
                            "rounded-2xl border p-5 transition-colors duration-200",
                            isSaved
                              ? "border-emerald-200 bg-emerald-50"
                              : "border-slate-200 bg-slate-50/50",
                          ].join(" ")}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p
                                className={`text-base font-bold leading-snug ${
                                  isSaved ? "text-emerald-800" : "text-slate-900"
                                }`}
                              >
                                {item.productName}
                              </p>
                              <p className="mt-0.5 text-sm text-slate-500">
                                {item.productSku} · {item.saleUnitLabel}
                              </p>
                            </div>
                            {isSaved ? (
                              <CheckCircle2
                                className="h-6 w-6 shrink-0 text-emerald-500"
                                strokeWidth={2}
                              />
                            ) : (
                              <AlertTriangle
                                className="h-5 w-5 shrink-0 text-amber-400"
                                strokeWidth={2.2}
                              />
                            )}
                          </div>

                          {!isSaved ? (
                            <>
                              <div className="mt-4 relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base font-semibold text-slate-400">
                                  ฿
                                </span>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  step="0.01"
                                  placeholder="0.00"
                                  value={priceValue}
                                  onChange={(event) =>
                                    setPrices((prev) => ({
                                      ...prev,
                                      [key]: event.target.value,
                                    }))
                                  }
                                  className={`w-full rounded-xl border bg-white py-3.5 pl-9 pr-4 text-base font-medium text-slate-900 outline-none transition focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/15 ${
                                    isBelowCost ? "border-amber-300 bg-amber-50" : "border-slate-200"
                                  }`}
                                  disabled={isPending}
                                  autoComplete="off"
                                />
                              </div>

                              {isBelowCost && effectiveCostPrice !== null ? (
                                <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                                  <AlertTriangle
                                    className="h-3.5 w-3.5 shrink-0"
                                    strokeWidth={2.2}
                                  />
                                  ราคาต่ำกว่าทุน — ต้นทุน/{item.saleUnitLabel}: ฿
                                  {Number(effectiveCostPrice).toLocaleString("th-TH", {
                                    minimumFractionDigits: 2,
                                  })}
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <p className="mt-2 text-sm font-medium text-emerald-600">
                              {Number.parseFloat(prices[key] ?? "0").toLocaleString("th-TH", {
                                minimumFractionDigits: 2,
                              })}{" "}
                              บาท บันทึกแล้ว
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-3 border-t border-slate-100 px-6 py-4">
                {saveError ? (
                  <p className="text-sm font-medium text-red-600">{saveError}</p>
                ) : null}

                {!allSaved ? (
                  <button
                    type="button"
                    disabled={!canSaveAll}
                    onClick={handleSaveAll}
                    className="w-full rounded-2xl bg-[#003366] py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-[#002244] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isPending ? "กำลังบันทึก..." : `บันทึกราคาทั้งหมด ${pendingItems.length} รายการ`}
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={handleClose}
                  className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 text-base font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98]"
                >
                  {allSaved ? "เสร็จสิ้น" : "ปิด"}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
