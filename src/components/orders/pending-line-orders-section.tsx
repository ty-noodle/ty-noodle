"use client";

import Image from "next/image";
import { useMemo, useState, useTransition } from "react";
import { BadgeCheck, Link2, Loader2, Package2, Search, Store, X } from "lucide-react";
import { linkPendingLineOrderAction } from "@/app/(workspace)/orders/incoming/actions";
import type { OrderCustomerOption } from "@/lib/orders/manage";
import type { PendingLineOrderListItem } from "@/lib/orders/line-pending";

type PendingLineOrdersSectionProps = {
  customers: OrderCustomerOption[];
  pendingOrders: PendingLineOrderListItem[];
};

function formatDateTime(value: string) {
  const date = new Date(value);
  const datePart = new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(date);
  return `${datePart} ${timePart}`;
}

function customerSearchText(customer: OrderCustomerOption) {
  return `${customer.code} ${customer.name}`.toLocaleLowerCase("th");
}

export function PendingLineOrdersSection({
  customers,
  pendingOrders,
}: PendingLineOrdersSectionProps) {
  const [activeOrder, setActiveOrder] = useState<PendingLineOrderListItem | null>(null);
  const [query, setQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const filteredCustomers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("th");
    if (!normalizedQuery) return customers;
    return customers.filter((customer) =>
      customerSearchText(customer).includes(normalizedQuery),
    );
  }, [customers, query]);

  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId);

  if (pendingOrders.length === 0) {
    return null;
  }

  function openModal(order: PendingLineOrderListItem) {
    setActiveOrder(order);
    setQuery("");
    setSelectedCustomerId("");
    setError("");
    setSuccessMessage("");
  }

  function closeModal() {
    if (isPending) return;
    setActiveOrder(null);
  }

  function submitLink() {
    if (!activeOrder || !selectedCustomerId) {
      setError("กรุณาเลือกร้านค้าที่ต้องการผูก");
      return;
    }

    const formData = new FormData();
    formData.set("pendingOrderId", activeOrder.id);
    formData.set("customerId", selectedCustomerId);

    setError("");
    setSuccessMessage("");
    startTransition(async () => {
      const result = await linkPendingLineOrderAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }

      setSuccessMessage(
        result.receiptWarning ??
          (result.orderNumber
            ? `ผูกสำเร็จและสร้างออเดอร์ ${result.orderNumber}`
            : "ผูกสำเร็จและสร้างออเดอร์แล้ว"),
      );
      window.setTimeout(() => {
        window.location.reload();
      }, result.receiptWarning ? 4500 : 900);
    });
  }

  return (
    <>
      <section className="overflow-hidden rounded-[1.35rem] border border-slate-200 bg-white shadow-[0_22px_60px_rgba(15,23,42,0.08)]">
        <div className="border-b border-slate-100 bg-[linear-gradient(135deg,#f8fafc_0%,#eef4fa_100%)] px-4 py-4 md:px-6">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center">
              <Image
                src="/icons8-line.svg"
                alt="LINE"
                width={44}
                height={44}
                className="h-11 w-11"
              />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#003366]/70">
                  LINE Queue
                </p>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-extrabold text-[#003366] shadow-sm ring-1 ring-slate-200">
                  {pendingOrders.length} รายการ
                </span>
              </div>
              <h2 className="mt-1 text-lg font-extrabold tracking-tight text-slate-950">
                รายการรอผูกร้านค้า
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                ตรวจสอบลูกค้า LINE แล้วเลือกผูกร้านค้าที่ถูกต้องเพื่อสร้างออเดอร์จริง
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-3 md:grid-cols-2 md:gap-4 md:p-5 xl:grid-cols-3">
          {pendingOrders.map((order) => (
            <article
              key={order.id}
              className="rounded-[1.2rem] border border-slate-200 bg-white p-3 shadow-[0_14px_34px_rgba(15,23,42,0.07)] transition hover:border-[#003366]/25 hover:shadow-[0_18px_44px_rgba(15,23,42,0.10)]"
            >
              <div className="flex items-start gap-3">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200">
                  {order.linePictureUrl ? (
                    <Image
                      src={order.linePictureUrl}
                      alt={order.lineDisplayName}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[#06c755]/10 text-sm font-extrabold text-[#003366]">
                      LINE
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <h3 className="min-w-0 flex-1 truncate text-lg font-extrabold leading-tight text-slate-950">
                      {order.lineDisplayName}
                    </h3>
                    <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-extrabold text-amber-700 ring-1 ring-amber-200">
                      รอผูก
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-slate-400">
                    {formatDateTime(order.createdAt)}
                  </p>
                </div>
              </div>

              <div className="mt-3 space-y-2 rounded-2xl bg-slate-50/80 p-3 ring-1 ring-slate-100">
                {order.items.slice(0, 3).map((item) => (
                  <div key={item.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <Package2 className="h-4 w-4 shrink-0 text-[#003366]" strokeWidth={2.2} />
                    <span className="min-w-0 flex-1 truncate font-semibold">{item.productName}</span>
                    <span className="shrink-0 font-extrabold text-slate-950">
                      {item.quantity.toLocaleString("th-TH")} {item.saleUnitLabel}
                    </span>
                  </div>
                ))}
                {order.items.length > 3 ? (
                  <p className="pl-6 text-xs font-extrabold text-[#003366]">
                    + อีก {order.items.length - 3} รายการ
                  </p>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => openModal(order)}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#003366] px-4 py-3 text-sm font-extrabold text-white shadow-[0_12px_26px_rgba(0,51,102,0.22)] transition hover:bg-[#00264d] active:scale-[0.98]"
              >
                <Link2 className="h-4 w-4" strokeWidth={2.2} />
                ผูกร้านค้า
              </button>
            </article>
          ))}
        </div>
      </section>

      {activeOrder ? (
        <div className="fixed inset-0 z-[300] flex items-end bg-slate-950/45 backdrop-blur-sm md:items-center md:justify-center">
          <div className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[1.75rem] bg-white shadow-[0_-24px_70px_rgba(15,23,42,0.28)] md:max-w-3xl md:rounded-[1.75rem]">
            {/* Navy Header */}
            <div className="flex shrink-0 items-start justify-between gap-4 bg-[#003366] px-5 py-5 pt-[max(1.25rem,env(safe-area-inset-top))] md:pt-5 text-white">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white">
                    <Store className="h-5 w-5" strokeWidth={2.2} />
                  </span>
                  <div>
                    <h3 className="text-xl font-bold text-white">ผูกร้านค้ากับลูกค้า LINE</h3>
                    <p className="text-sm text-white/70">
                      เมื่อผูกแล้ว pending order ทั้งหมดของ LINE นี้จะถูกสร้างเป็นออเดอร์อัตโนมัติ
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-6 w-6" strokeWidth={3} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                  LINE Profile
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="relative h-12 w-12 overflow-hidden rounded-2xl bg-white">
                    {activeOrder.linePictureUrl ? (
                      <Image
                        src={activeOrder.linePictureUrl}
                        alt={activeOrder.lineDisplayName}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <div>
                    <p className="font-bold text-slate-950">{activeOrder.lineDisplayName}</p>
                    <p className="text-xs text-slate-500">{activeOrder.lineUserId}</p>
                  </div>
                </div>
              </div>

              <label className="relative mt-5 block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="ค้นหารหัสร้าน / ชื่อร้าน"
                  className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-11 pr-4 text-base text-slate-900 outline-none transition focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/10"
                />
              </label>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {filteredCustomers.map((customer) => {
                  const selected = customer.id === selectedCustomerId;
                  return (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => setSelectedCustomerId(customer.id)}
                      className={`rounded-2xl border px-4 py-3 text-left transition ${
                        selected
                          ? "border-[#003366] bg-blue-50 text-[#003366]"
                          : "border-slate-200 bg-white text-slate-800 hover:border-[#003366]/30"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold">{customer.code}</span>
                        {selected ? <BadgeCheck className="ml-auto h-4 w-4" /> : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm font-bold">{customer.name}</p>
                    </button>
                  );
                })}
              </div>

              {selectedCustomer ? (
                <div className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-semibold text-[#003366]">
                  จะผูกกับ {selectedCustomer.code} {selectedCustomer.name}
                </div>
              ) : null}

              {error ? (
                <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
                  {error}
                </div>
              ) : null}
              {successMessage ? (
                <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                  {successMessage}
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 gap-3 border-t border-slate-100 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={closeModal}
                className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={submitLink}
                disabled={isPending || !selectedCustomerId}
                className="flex-[1.5] rounded-2xl bg-[#003366] py-3 text-sm font-bold text-white shadow-[0_12px_26px_rgba(0,51,102,0.22)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    กำลังผูก
                  </span>
                ) : (
                  "ผูกและสร้างออเดอร์"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
