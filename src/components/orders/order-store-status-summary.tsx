"use client";

import { useMemo, useState } from "react";
import { Building2, CheckCircle2, Clock3, Search, Store, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { OrderStoreStatusItem, OrderStoreStatusSummary } from "@/lib/orders/store-status";

type StoreStatusKey = "all" | "ordered" | "unordered";

type OrderStoreStatusSummaryProps = {
  orderDate: string;
  summary: OrderStoreStatusSummary;
};

const statusConfig: Record<
  StoreStatusKey,
  {
    accentClass: string;
    cardClass: string;
    description: string;
    icon: LucideIcon;
    iconClass: string;
    modalTitle: string;
    title: string;
  }
> = {
  all: {
    accentClass: "text-[#003366]",
    cardClass: "border-blue-100 bg-[linear-gradient(135deg,#ffffff,#eef6ff)] hover:border-[#003366]/30",
    description: "ร้านค้าที่เปิดใช้งาน",
    icon: Building2,
    iconClass: "bg-blue-50 ring-blue-100",
    modalTitle: "ร้านค้าทั้งหมด",
    title: "ร้านค้าทั้งหมด",
  },
  ordered: {
    accentClass: "text-emerald-600",
    cardClass: "border-emerald-100 bg-[linear-gradient(135deg,#ffffff,#ecfdf5)] hover:border-emerald-300",
    description: "มีรายการวันนี้",
    icon: CheckCircle2,
    iconClass: "bg-emerald-50 ring-emerald-100",
    modalTitle: "ร้านค้าที่สั่งแล้ววันนี้",
    title: "ร้านค้าที่สั่งแล้ววันนี้",
  },
  unordered: {
    accentClass: "text-amber-600",
    cardClass: "border-amber-100 bg-[linear-gradient(135deg,#ffffff,#fff7ed)] hover:border-amber-300",
    description: "ยังไม่มีออเดอร์",
    icon: Clock3,
    iconClass: "bg-amber-50 ring-amber-100",
    modalTitle: "ร้านค้าที่ยังไม่ได้สั่ง",
    title: "ร้านค้าที่ยังไม่ได้สั่ง",
  },
};

function formatThaiDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Bangkok",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function formatThaiTime(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function getStores(summary: OrderStoreStatusSummary, key: StoreStatusKey) {
  if (key === "ordered") return summary.orderedStores;
  if (key === "unordered") return summary.unorderedStores;
  return summary.allStores;
}

function StoreRow({ store }: { store: OrderStoreStatusItem }) {
  const latestOrderTime = formatThaiTime(store.latestOrderAt);

  return (
    <li className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-[#003366]">
        <Store className="h-5 w-5" strokeWidth={2.2} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-extrabold text-[#003366]">{store.code}</p>
          {store.orderCount > 0 ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-100">
              {store.orderCount.toLocaleString("th-TH")} ออเดอร์
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 whitespace-normal break-words text-base font-bold leading-6 text-slate-950">
          {store.name}
        </p>
        {latestOrderTime ? (
          <p className="mt-0.5 text-xs font-medium text-slate-500">ล่าสุด {latestOrderTime} น.</p>
        ) : null}
      </div>
    </li>
  );
}

export function OrderStoreStatusSummary({ orderDate, summary }: OrderStoreStatusSummaryProps) {
  const [activeStatus, setActiveStatus] = useState<StoreStatusKey | null>(null);
  const [query, setQuery] = useState("");
  const selectedConfig = activeStatus ? statusConfig[activeStatus] : null;
  const selectedStores = useMemo(
    () => (activeStatus ? getStores(summary, activeStatus) : []),
    [activeStatus, summary],
  );

  const filteredStores = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("th");
    if (!normalizedQuery) return selectedStores;

    return selectedStores.filter((store) =>
      `${store.code} ${store.name}`.toLocaleLowerCase("th").includes(normalizedQuery),
    );
  }, [query, selectedStores]);

  function openModal(status: StoreStatusKey) {
    setActiveStatus(status);
    setQuery("");
  }

  function closeModal() {
    setActiveStatus(null);
    setQuery("");
  }

  const cards: Array<{ count: number; key: StoreStatusKey }> = [
    { count: summary.allStores.length, key: "all" },
    { count: summary.unorderedStores.length, key: "unordered" },
    { count: summary.orderedStores.length, key: "ordered" },
  ];

  return (
    <>
      <section className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3">
        {cards.map((card) => {
          const config = statusConfig[card.key];
          const Icon = config.icon;

          return (
            <button
              key={card.key}
              type="button"
              onClick={() => openModal(card.key)}
              className={`group rounded-xl border p-3 text-left transition hover:-translate-y-0.5 active:translate-y-0 md:p-4 ${card.key === "all" ? "col-span-2 md:col-span-1" : ""} ${config.cardClass} shadow-sm border-slate-200`}
            >
              <div className="flex items-start justify-between gap-1.5 md:gap-3">
                <div className="min-w-0">
                  <p className="line-clamp-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 md:text-xs">
                    {config.title}
                  </p>
                  <p className="mt-1 text-xl font-bold tracking-tight text-slate-900 md:text-2xl">
                    {card.count.toLocaleString("th-TH")}
                  </p>
                </div>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 md:h-10 md:w-10 ${config.iconClass} ${config.accentClass}`}>
                  <Icon className="h-4 w-4 md:h-5 md:w-5" strokeWidth={2} />
                </span>
              </div>
            </button>
          );
        })}
      </section>

      {activeStatus && selectedConfig ? (
        <div className="fixed inset-0 z-[80] flex items-end bg-slate-950/45 backdrop-blur-sm md:items-center md:justify-center md:p-4">
          <div className="flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-[1.75rem] bg-white shadow-[0_-24px_70px_rgba(15,23,42,0.28)] md:max-w-2xl md:rounded-[1.75rem]">
            <div className="shrink-0 border-b border-slate-100 px-5 pb-4 pt-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#003366]">
                    {formatThaiDate(orderDate)}
                  </p>
                  <h3 className="mt-1 text-xl font-extrabold tracking-tight text-slate-950">
                    {selectedConfig.modalTitle}
                  </h3>
                  <p className="mt-1 text-sm font-medium text-slate-500">
                    {selectedStores.length.toLocaleString("th-TH")} ร้านค้า
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:bg-slate-50"
                  aria-label="ปิด"
                >
                  <X className="h-5 w-5" strokeWidth={2.2} />
                </button>
              </div>

              <div className="relative mt-4">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" strokeWidth={2.2} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-base font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#003366] focus:bg-white focus:ring-4 focus:ring-[#003366]/10"
                  placeholder="ค้นหารหัสหรือชื่อร้านค้า"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60 px-4 py-4">
              {filteredStores.length > 0 ? (
                <ul className="space-y-2">
                  {filteredStores.map((store) => (
                    <StoreRow key={store.id} store={store} />
                  ))}
                </ul>
              ) : (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center">
                  <p className="text-sm font-bold text-slate-500">ไม่พบร้านค้าที่ค้นหา</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
