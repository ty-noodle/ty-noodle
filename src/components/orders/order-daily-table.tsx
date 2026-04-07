import { Fragment } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Package2,
  PackagePlus,
  PackageSearch,
  Store,
  WalletCards,
} from "lucide-react";
import type { OrderDailyData, OrderStoreDetail } from "@/lib/orders/admin";
import { PrintDailyDeliveryButton } from "./print-daily-delivery-button";
import { UnpricedItemsDialog } from "./unpriced-items-dialog";
import { StoreDeliveryButton } from "./pending-orders-section";
import { DateNav } from "@/components/ui/date-nav";
import { OrderSearchForm } from "./order-search-form";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";
import { OrderRoundsCollapsible } from "./order-rounds-collapsible";
import {
  DeliveredTodaySection as DeliveredTodayExpandableSection,
  type DeliveredTodayRow,
} from "./delivered-today-section";

type Props = {
  data: OrderDailyData;
  date: string;
  expanded: string[];
  q: string;
  deliveredToday: DeliveredTodayRow[];
};

function formatThaiCurrency(value: number) {
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatThaiDate(isoDate: string) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(new Date(isoDate));
}


function buildMobileHref(date: string, q: string, customerId: string) {
  const p = new URLSearchParams();
  p.set("date", date);
  if (q) p.set("q", q);
  p.set("expanded", customerId);
  return `/orders?${p.toString()}`;
}

function buildToggleHref(date: string, q: string, expandedIds: string[], customerId: string) {
  const nextIds = expandedIds.includes(customerId)
    ? expandedIds.filter((id) => id !== customerId)
    : [...expandedIds, customerId];

  const params = new URLSearchParams();
  params.set("date", date);
  if (q) params.set("q", q);
  if (nextIds.length > 0) params.set("expanded", nextIds.join(","));

  return `/orders?${params.toString()}`;
}



function StoreDetailPanel({ date, detail }: { date: string; detail: OrderStoreDetail }) {
  const unpricedItems = detail.items.filter((item) => item.unitPrice === 0);

  return (
    <div className="space-y-6 px-4 pb-6 pt-4 print:px-0">
      {unpricedItems.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-600 bg-amber-600 px-4 py-3.5 print:hidden">
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

      {/* Order rounds — collapsible */}
      <OrderRoundsCollapsible date={date} rounds={detail.orderRounds} />

      {/* ── Mobile item cards (below md) ── */}
      <div className="space-y-3 md:hidden">
        {detail.items.map((item, idx) => (
          <div
            key={`${item.productId}-${item.productUnit}-${idx}`}
            className="rounded-2xl border border-slate-200 bg-white p-3"
          >
            <div className="flex items-start gap-3">
              {item.imageUrl ? (
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                  <Image
                    src={item.imageUrl}
                    alt={item.productName}
                    fill
                    className="object-cover"
                    sizes="48px"
                  />
                </div>
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-slate-50">
                  <Package2 className="h-5 w-5 text-slate-300" strokeWidth={1.8} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium leading-snug text-slate-900">{item.productName}</p>
                <p className="mt-0.5 font-mono text-xs text-slate-400">{item.productSku}</p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
              <span>
                สั่ง{" "}
                <span className="font-medium text-slate-700">
                  {item.orderedQuantity.toLocaleString("th-TH")}
                </span>
                <span className="ml-0.5 text-xs text-slate-400">{item.productUnit}</span>
              </span>
              <span>·</span>
              <span>
                ส่งแล้ว{" "}
                <span className="font-medium text-emerald-700">
                  {item.deliveredQuantity.toLocaleString("th-TH")}
                </span>
              </span>
              <span>·</span>
              <span>
                สต็อก{" "}
                <span className="font-medium text-slate-700">
                  {item.currentStockQuantity.toLocaleString("th-TH")}
                </span>
              </span>
              <span>·</span>
              <span>
                ขาด{" "}
                {item.shortQuantity > 0 ? (
                  <span className="inline-flex items-center gap-0.5 font-semibold text-red-700">
                    <AlertTriangle className="h-3 w-3" strokeWidth={2.4} />
                    {item.shortQuantity.toLocaleString("th-TH")}
                  </span>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </span>
              <span>·</span>
              <span>
                {item.unitPrice > 0 ? (
                  `${formatThaiCurrency(item.unitPrice)} บาท/หน่วย`
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-600 px-2 py-0.5 text-xs font-semibold text-white print:hidden">
                    <AlertTriangle className="h-3 w-3" strokeWidth={2.4} />
                    ยังไม่ผูกราคา
                  </span>
                )}
              </span>
            </div>
            <div className="mt-2 text-right text-sm font-semibold text-slate-900">
              รวม {formatThaiCurrency(item.lineTotal)} บาท
            </div>
          </div>
        ))}
        {/* Mobile totals footer */}
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <span className="font-semibold text-slate-500">รวมทั้งหมด</span>
          <span className="font-bold text-slate-950">
            {formatThaiCurrency(detail.totalAmount)} บาท
          </span>
        </div>
      </div>

      {/* ── Desktop items table (md+) ── */}
      <div className="hidden overflow-x-auto rounded-[1.25rem] border border-slate-300 md:block">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead>
            <tr style={{ backgroundColor: "#003366" }}>
              {(["รหัสสินค้า", "รายการสินค้า", "สั่ง", "ส่งแล้ว", "หน่วย", "สต็อก", "ขาด", "ราคา/หน่วย", "จำนวนเงินรวม"] as const).map(
                (col, i, arr) => (
                  <th
                    key={col}
                    style={{ color: "white" }}
                    className={`px-4 py-3 text-center text-xs font-bold uppercase tracking-[0.1em] ${i < arr.length - 1 ? "border-r border-white/20" : ""}`}
                  >
                    {col}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {detail.items.map((item, idx) => (
              <tr
                key={`${item.productId}-${item.productUnit}-${idx}`}
                className="align-middle transition hover:bg-slate-50"
              >
                {/* รหัสสินค้า */}
                <td className="border-r border-slate-300 px-4 py-3 text-center">
                  <span className="font-mono text-xs font-semibold text-slate-700">{item.productSku}</span>
                </td>

                {/* รายการสินค้า */}
                <td className="border-r border-slate-300 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                      {item.imageUrl ? (
                        <Image
                          src={item.imageUrl}
                          alt={item.productName}
                          fill
                          className="object-contain bg-white p-0.5"
                          sizes="40px"
                        />
                      ) : (
                        <Package2 className="h-4 w-4 text-slate-300" strokeWidth={1.8} />
                      )}
                    </div>
                    <p className="font-medium text-slate-900">{item.productName}</p>
                  </div>
                </td>

                {/* สั่ง */}
                <td className="border-r border-slate-300 px-4 py-3 text-center font-bold tabular-nums text-slate-900">
                  {item.orderedQuantity.toLocaleString("th-TH")}
                </td>

                {/* ส่งแล้ว */}
                <td className="border-r border-slate-300 px-4 py-3 text-center font-bold tabular-nums text-emerald-700">
                  {item.deliveredQuantity.toLocaleString("th-TH")}
                </td>

                {/* หน่วย */}
                <td className="border-r border-slate-300 px-4 py-3 text-center text-slate-600">
                  {item.productUnit}
                </td>

                {/* สต็อก */}
                <td className="border-r border-slate-300 px-4 py-3 text-center tabular-nums text-slate-700">
                  {item.currentStockQuantity.toLocaleString("th-TH")}
                </td>

                {/* ขาด */}
                <td className="border-r border-slate-300 px-4 py-3 text-center print:hidden">
                  {item.shortQuantity > 0 ? (
                    <div className="flex flex-col items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 font-semibold text-red-700">
                        <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.4} />
                        {item.shortQuantity.toLocaleString("th-TH")}
                      </span>
                      <Link
                        href={`/stock?receive=1&product=${item.productId}`}
                        className="inline-flex items-center gap-1 rounded-md border border-[#003366]/25 bg-[#003366]/5 px-2 py-1 text-[11px] font-semibold text-[#003366] transition hover:bg-[#003366]/10"
                      >
                        <PackagePlus className="h-3 w-3" strokeWidth={2.2} />
                        รับเข้า
                      </Link>
                    </div>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>

                {/* ราคา/หน่วย */}
                <td className="border-r border-slate-300 px-4 py-3 text-center tabular-nums text-slate-600">
                  {item.unitPrice > 0 ? (
                    formatThaiCurrency(item.unitPrice)
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-600 px-2 py-0.5 text-xs font-semibold text-white print:hidden">
                      <AlertTriangle className="h-3 w-3" strokeWidth={2.4} />
                      ยังไม่ผูกราคา
                    </span>
                  )}
                </td>

                {/* จำนวนเงินรวม */}
                <td className="px-4 py-3 text-center font-bold tabular-nums text-slate-950">
                  {formatThaiCurrency(item.lineTotal)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ backgroundColor: "#f8fafc" }}>
              <td
                colSpan={8}
                className="border-r border-t border-slate-300 px-4 py-3 text-right text-sm font-semibold text-slate-600"
              >
                ยอดเงินรวมทุกรายการ
              </td>
              <td className="border-t border-slate-300 px-4 py-3 text-center text-base font-bold tabular-nums text-[#003366]">
                {formatThaiCurrency(detail.totalAmount)} บาท
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export function OrderDailyTable({ data, date, expanded, q, deliveredToday }: Props) {
  const { stats, stores, expandedDetails } = data;

  return (
    <div className="space-y-8">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-slate-950 md:text-xl">
            ออเดอร์ประจำวัน{" "}
            <span className="text-[#003366]">{formatThaiDate(date)}</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {stats.activeStoreCount > 0
              ? `${stats.activeStoreCount.toLocaleString("th-TH")} ร้านค้า · ${stats.totalOrderRounds.toLocaleString("th-TH")} รอบออเดอร์`
              : "ยังไม่มีออเดอร์ในวันที่เลือก"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <PrintDailyDeliveryButton date={date} />
        </div>
      </div>

      {/* Date + Search filter */}
      <div className="flex flex-col gap-3 print:hidden">
        {/* Row 1: date nav */}
        <DateNav
          mode="single"
          date={date}
          basePath="/orders"
          extra={{
            ...(q ? { q } : {}),
            ...(expanded.length > 0 ? { expanded: expanded.join(",") } : {}),
          }}
        />
        {/* Row 2: search — desktop only (mobile uses top bar search icon) */}
        <div className="hidden md:block">
          <OrderSearchForm date={date} expanded={expanded} q={q} />
        </div>
      </div>

      {/* Mobile search drawer */}
      <MobileSearchDrawer title="ค้นหาออเดอร์">
        <OrderSearchForm date={date} expanded={expanded} q={q} />
      </MobileSearchDrawer>

      {/* Stat cards */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <article className="rounded-[1.5rem] border border-slate-200 bg-white p-3 shadow-[0_12px_40px_rgba(15,23,42,0.05)] md:p-5">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 shrink-0 text-[#003366]" strokeWidth={2.2} />
            <span className="truncate text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              ร้านค้า
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-[-0.03em] text-slate-950 md:mt-3 md:text-3xl">
            {stats.activeStoreCount.toLocaleString("th-TH")}
          </p>
        </article>

        <article className="rounded-[1.5rem] border border-slate-200 bg-white p-3 shadow-[0_12px_40px_rgba(15,23,42,0.05)] md:p-5">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 shrink-0 text-[#003366]" strokeWidth={2.2} />
            <span className="truncate text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              รอบออเดอร์
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-[-0.03em] text-slate-950 md:mt-3 md:text-3xl">
            {stats.totalOrderRounds.toLocaleString("th-TH")}
          </p>
        </article>

        <article className="rounded-[1.5rem] border border-slate-200 bg-white p-3 shadow-[0_12px_40px_rgba(15,23,42,0.05)] md:p-5">
          <div className="flex items-center gap-2">
            <WalletCards className="h-4 w-4 shrink-0 text-[#003366]" strokeWidth={2.2} />
            <span className="truncate text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              ยอดรวมวันนี้
            </span>
          </div>
          <p className="mt-2 truncate text-xl font-bold tracking-[-0.03em] text-slate-950 md:mt-3 md:text-3xl">
            {formatThaiCurrency(stats.totalAmount)}
          </p>
          <p className="text-xs font-medium text-slate-400">บาท</p>
        </article>

        <article
          className={[
            "rounded-[1.5rem] border p-3 shadow-[0_12px_40px_rgba(15,23,42,0.05)] md:p-5",
            stats.shortageStoreCount > 0
              ? "border-red-700 bg-red-700"
              : "border-slate-200 bg-white",
          ].join(" ")}
        >
          <div className="flex items-center gap-2">
            <Package2
              className={`h-4 w-4 shrink-0 ${stats.shortageStoreCount > 0 ? "text-white" : "text-[#003366]"}`}
              strokeWidth={2.2}
            />
            <span
              className={`truncate text-xs font-semibold uppercase tracking-[0.1em] ${stats.shortageStoreCount > 0 ? "text-white/80" : "text-slate-500"}`}
            >
              สต็อกไม่พอ
            </span>
          </div>
          <p
            className={`mt-2 text-2xl font-bold tracking-[-0.03em] md:mt-3 md:text-3xl ${stats.shortageStoreCount > 0 ? "text-white" : "text-slate-950"}`}
          >
            {stats.shortageStoreCount.toLocaleString("th-TH")}
          </p>
        </article>
      </section>

      {/* Delivered today (prevents "disappearing rows" confusion) */}
      <DeliveredTodayExpandableSection date={date} deliveredToday={deliveredToday} />

      {/* Main table */}
      {stores.length === 0 ? (
        <section className="rounded-[1.9rem] border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-[0_18px_55px_rgba(15,23,42,0.04)]">
          <PackageSearch className="mx-auto h-12 w-12 text-slate-300" strokeWidth={1.8} />
          <h2 className="mt-5 text-2xl font-semibold text-slate-950">
            ยังไม่มีออเดอร์ในวันที่เลือก
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-slate-500">
            เมื่อลูกค้าสั่งออเดอร์ผ่าน LINE
            รายการจะถูกรวมมาแสดงที่หน้านี้เป็นรายร้านต่อวัน
          </p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.05)]">

          {/* ── Mobile card list (below md) ────────────────────────────── */}
          <div className="divide-y divide-slate-100 md:hidden">
            {stores.map((store) => {
              const isExpanded = expanded.includes(store.customerId);
              const mobileHref = buildMobileHref(date, q, store.customerId);

              return (
                <div key={store.customerId}>
                  <Link
                    href={mobileHref}
                    scroll={false}
                    className={`flex items-center gap-3 px-4 py-4 transition active:bg-slate-50 ${isExpanded ? "bg-[#003366]/[0.03]" : ""}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-900">{store.customerName}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs text-slate-400">{store.customerCode}</span>
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                          {store.orderRounds}x
                        </span>
                        {store.shortageProductCount > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-700 px-2 py-0.5 text-xs font-semibold text-white">
                            <AlertTriangle className="h-3 w-3" strokeWidth={2.4} />
                            {store.shortageProductCount}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-bold text-slate-950">{formatThaiCurrency(store.totalAmount)}</p>
                      <p className="text-xs text-slate-400">บาท</p>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                      strokeWidth={2.4}
                    />
                  </Link>
                  {/* Detail handled by StoreDetailModal on mobile */}
                </div>
              );
            })}
          </div>

          {/* ── Desktop table (md+) ─────────────────────────────────────── */}
          <div className="hidden md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="w-8 px-4 py-3" />
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    ร้านค้า
                  </th>
                  <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 sm:table-cell">
                    รอบออเดอร์
                  </th>
                  <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 md:table-cell">
                    รายการสินค้า
                  </th>
                  <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 md:table-cell">
                    สินค้าขาด
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    ยอดรวม
                  </th>
                  <th className="px-4 py-3 print:hidden" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stores.map((store) => {
                  const isExpanded = expanded.includes(store.customerId);
                  const detail = expandedDetails[store.customerId] ?? null;
                  const toggleHref = buildToggleHref(date, q, expanded, store.customerId);

                  return (
                    <Fragment key={store.customerId}>
                      <tr
                        className={["transition", isExpanded ? "bg-[#003366]/[0.03]" : "hover:bg-slate-50/70"].join(" ")}
                        style={{ contentVisibility: "auto" }}
                      >
                        <td className="px-4 py-4">
                          <Link
                            href={toggleHref}
                            scroll={false}
                            className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 print:hidden"
                            aria-label={isExpanded ? "ยุบ" : "ขยาย"}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" strokeWidth={2.4} />
                            ) : (
                              <ChevronRight className="h-4 w-4" strokeWidth={2.4} />
                            )}
                          </Link>
                        </td>
                        <td className="px-4 py-4">
                          <Link href={toggleHref} scroll={false} className="group block print:pointer-events-none">
                            <p className="font-semibold text-slate-900 transition group-hover:text-[#003366]">
                              {store.customerName}
                            </p>
                            <p className="mt-0.5 font-mono text-xs text-slate-400">{store.customerCode}</p>
                          </Link>
                        </td>
                        <td className="hidden px-4 py-4 text-right sm:table-cell">
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                            {store.orderRounds}x
                          </span>
                        </td>
                        <td className="hidden px-4 py-4 text-right text-slate-600 md:table-cell">
                          {store.productCount.toLocaleString("th-TH")} รายการ
                        </td>
                        <td className="hidden px-4 py-4 text-right md:table-cell">
                          {store.shortageProductCount > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-700 px-2.5 py-0.5 text-xs font-semibold text-white">
                              <AlertTriangle className="h-3 w-3" strokeWidth={2.4} />
                              {store.shortageProductCount} รายการ
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right font-bold text-slate-950">
                          {formatThaiCurrency(store.totalAmount)} บาท
                        </td>
                        <td className="px-4 py-4 print:hidden">
                          <StoreDeliveryButton
                            customerId={store.customerId}
                            customerName={store.customerName}
                            date={date}
                          />
                        </td>
                      </tr>
                      {isExpanded && detail && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={7} className="px-2 py-0">
                            <StoreDetailPanel date={date} detail={detail} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
