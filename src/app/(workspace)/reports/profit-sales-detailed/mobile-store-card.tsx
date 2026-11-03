"use client";

import { useEffect, useState } from "react";
import {
  CalendarDays,
  ChevronRight,
  Package2,
  ReceiptText,
  TrendingUp,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import type { DetailedProfitStoreGroup } from "@/lib/reports/profit-sales-detailed";

type MobileStoreCardProps = {
  store: DetailedProfitStoreGroup;
  storeUnits: string;
};

function formatDateThai(isoDate: string) {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${Number(year) + 543}`;
}

function formatMoney(value: number) {
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: number) {
  return `${value.toLocaleString("th-TH", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function InfoBlock({
  label,
  value,
  icon,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-950">{label}</p>
      <div className="mt-1.5 flex min-w-0 items-center gap-2 text-[15px] font-semibold text-slate-950">
        <span className="shrink-0 text-slate-400">{icon}</span>
        <span className="truncate">{value}</span>
      </div>
    </div>
  );
}

function SummaryBadge({
  positive,
  children,
}: {
  positive: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-extrabold ring-1 ring-inset ${
        positive
          ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
          : "bg-rose-50 text-rose-700 ring-rose-600/20"
      }`}
    >
      {children}
    </span>
  );
}

export function MobileStoreCard({ store, storeUnits }: MobileStoreCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const profitIsPositive = store.totalProfit >= 0;

  useEffect(() => {
    if (!isModalOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isModalOpen]);

  return (
    <>
      <article className="border-b border-slate-400 bg-white px-5 py-4 shadow-[0_10px_26px_rgba(15,23,42,0.1)] last:border-b-0">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-[1.18rem] font-bold leading-tight text-slate-950">
              <span translate="no">{store.customerCode}</span> - {store.customerName}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full text-white ${
                  profitIsPositive ? "bg-emerald-700" : "bg-rose-700"
                }`}
                title={profitIsPositive ? "กำไรเป็นบวก" : "กำไรติดลบ"}
                aria-label={profitIsPositive ? "กำไรเป็นบวก" : "กำไรติดลบ"}
              >
                <TrendingUp className="h-3 w-3" strokeWidth={3} />
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                ใบจัดส่ง
              </span>
              <span className="min-w-0 break-all font-mono text-[0.95rem] font-bold leading-tight text-emerald-700">
                {store.deliveryNumber}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
          <InfoBlock
            label="วันที่"
            icon={<CalendarDays className="h-4 w-4" strokeWidth={2.2} />}
            value={formatDateThai(store.deliveryDate)}
          />
          <div className="min-w-0 border-l border-slate-300 pl-4">
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-950">ยอดขาย</p>
            <p className="mt-1.5 text-[1.05rem] font-bold leading-none text-slate-950">
              {formatMoney(store.totalSales)} บาท
            </p>
          </div>

          <InfoBlock
            label="สินค้า"
            icon={<Package2 className="h-4 w-4" strokeWidth={2.2} />}
            value={`${store.items.length.toLocaleString("th-TH")} รายการ`}
          />
          <InfoBlock
            label="จำนวนรวม"
            icon={<ReceiptText className="h-4 w-4" strokeWidth={2.2} />}
            value={`${store.totalQuantity.toLocaleString("th-TH")} ${storeUnits}`}
          />
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex min-h-11 flex-1 items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 active:scale-[0.99]"
          >
            <span>เปิดรายละเอียดกำไร</span>
            <ChevronRight className="h-4 w-4 text-slate-400" strokeWidth={2.6} />
          </button>
        </div>
      </article>

      {isModalOpen ? (
        <div className="fixed inset-0 z-[90] md:hidden">
          <button
            type="button"
            aria-label="ปิดรายละเอียดกำไร"
            className="absolute inset-0 bg-slate-950/60"
            onClick={() => setIsModalOpen(false)}
          />

          <div className="absolute inset-x-0 bottom-0 top-8 overflow-hidden rounded-t-[28px] bg-white shadow-[0_-18px_48px_rgba(15,23,42,0.25)]">
            <div className="flex h-full flex-col">
              <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 pb-4 pt-3">
                <div className="mb-3 flex justify-center">
                  <div className="h-1.5 w-14 rounded-full bg-slate-200" />
                </div>

                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[1.12rem] font-bold leading-tight text-slate-950">
                      <span translate="no">{store.customerCode}</span> - {store.customerName}
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                      <ReceiptText className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2.2} />
                      <span className="truncate font-mono font-semibold text-emerald-700">
                        {store.deliveryNumber}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm"
                    aria-label="ปิด"
                  >
                    <X className="h-5 w-5" strokeWidth={2.4} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 pb-6 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <InfoBlock
                    label="วันที่"
                    icon={<CalendarDays className="h-4 w-4" strokeWidth={2.2} />}
                    value={formatDateThai(store.deliveryDate)}
                  />
                  <div className="min-w-0 border-l border-slate-300 pl-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-950">ยอดขายรวม</p>
                    <p className="mt-1.5 text-[15px] font-bold text-slate-950">
                      {formatMoney(store.totalSales)}
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {store.items.map((item) => {
                    const totalCost = item.costPrice * item.quantity;
                    const itemProfitPositive = item.profit >= 0;
                    const itemMarginPositive = item.marginPercent >= 0;

                    return (
                      <div
                        key={`${store.deliveryNumber}-${item.productSku}-${item.unit}`}
                        className="border-b border-slate-200 pb-4 last:border-b-0 last:pb-0"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-[15px] font-bold leading-snug text-slate-950">
                              {item.productName}
                            </p>
                            <p className="mt-1 font-mono text-[12px] text-slate-500">{item.productSku}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[15px] font-bold text-slate-950">
                              {item.quantity.toLocaleString("th-TH")} {item.unit}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                          <div className="min-w-0">
                            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-950">
                              ต้นทุน/หน่วย
                            </p>
                            <p className="mt-1.5 text-[15px] font-semibold text-slate-950">
                              {formatMoney(item.costPrice)}
                            </p>
                          </div>
                          <div className="min-w-0 border-l border-slate-300 pl-4">
                            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-950">
                              ต้นทุนรวม
                            </p>
                            <p className="mt-1.5 text-[15px] font-semibold text-slate-950">
                              {formatMoney(totalCost)}
                            </p>
                          </div>

                          <div className="min-w-0">
                            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-950">
                              ยอดขาย
                            </p>
                            <p className="mt-1.5 text-[15px] font-semibold text-slate-950">
                              {formatMoney(item.salesAmount)}
                            </p>
                          </div>
                          <div className="min-w-0 border-l border-slate-300 pl-4">
                            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-950">
                              กำไร
                            </p>
                            <div className="mt-1.5 flex items-center gap-1.5">
                              <span
                                className={`text-[15px] font-bold ${
                                  itemProfitPositive ? "text-emerald-700" : "text-rose-700"
                                }`}
                              >
                                {formatMoney(item.profit)}
                              </span>
                              <SummaryBadge positive={itemMarginPositive}>
                                {formatPercent(item.marginPercent)}
                              </SummaryBadge>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-5 grid grid-cols-2 gap-4 rounded-2xl bg-slate-50 px-4 py-4">
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-950">ต้นทุนรวม</p>
                    <p className="mt-1.5 text-[1.05rem] font-bold leading-none text-slate-950">
                      {formatMoney(store.totalCost)}
                    </p>
                  </div>
                  <div className="min-w-0 border-l border-slate-300 pl-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-950">กำไรสุทธิ</p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span
                        className={`text-[1.05rem] font-bold leading-none ${
                          profitIsPositive ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {formatMoney(store.totalProfit)}
                      </span>
                      <SummaryBadge positive={store.avgMarginPercent >= 0}>
                        {formatPercent(store.avgMarginPercent)}
                      </SummaryBadge>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
