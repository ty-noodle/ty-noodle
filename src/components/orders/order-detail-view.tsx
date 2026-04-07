import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Clock3,
  FileText,
  Package2,
  Printer,
  Store,
  Truck,
} from "lucide-react";
import type { OrderDetailData } from "@/lib/orders/detail";
import { UnpricedItemsDialog } from "./unpriced-items-dialog";

type OrderDetailViewProps = {
  detail: OrderDetailData;
};

function formatCurrency(value: number) {
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatNumber(value: number) {
  return value.toLocaleString("th-TH");
}

function formatDateTime(value: string) {
  const date = new Date(value);
  const datePart = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok" }).format(date);
  const [y, m, d] = datePart.split("-");
  const time = new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok", hour12: false,
  }).format(date);
  return `${d}/${m}/${parseInt(y, 10) + 543} ${time}`;
}

function getStatusLabel(status: OrderDetailData["status"]) {
  if (status === "confirmed") {
    return "ยืนยันแล้ว";
  }

  if (status === "cancelled") {
    return "ยกเลิก";
  }

  if (status === "draft") {
    return "ฉบับร่าง";
  }

  return "รับออเดอร์แล้ว";
}

function getStatusClassName(status: OrderDetailData["status"]) {
  if (status === "confirmed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "cancelled") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (status === "draft") {
    return "border-slate-200 bg-slate-100 text-slate-700";
  }

  return "border-sky-200 bg-sky-50 text-sky-700";
}

export function OrderDetailView({ detail }: OrderDetailViewProps) {
  const unpricedItems = detail.items.filter((item) => item.unitPrice === 0);

  return (
    <div className="space-y-6">
      {unpricedItems.length > 0 && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 print:hidden">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" strokeWidth={2.2} />
            <div>
              <p className="font-semibold text-amber-800">
                มี {unpricedItems.length} รายการที่ยังไม่ผูกราคากับร้านนี้
              </p>
              <p className="mt-0.5 text-sm text-amber-700">
                กดปุ่มข้างขวาเพื่อตั้งราคาได้เลย ระบบจะอัปเดตหน้าจัดการร้านค้าให้อัตโนมัติ
              </p>
            </div>
          </div>
          <UnpricedItemsDialog
            customerId={detail.customer.id}
            customerName={detail.customer.name}
            items={unpricedItems.map((item) => ({
              productId: item.productId,
              productName: item.productName,
              productSaleUnitId: item.productSaleUnitId,
              productSku: item.sku,
              saleUnitLabel: item.unit,
            }))}
          />
        </section>
      )}
      <section className="rounded-[1.9rem] border border-slate-200 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.05)]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">
                ออเดอร์เข้าแบบละเอียด
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium ${getStatusClassName(
                  detail.status,
                )}`}
              >
                {getStatusLabel(detail.status)}
              </span>
            </div>

            <h1 className="mt-4 text-[2rem] font-semibold tracking-[-0.02em] text-slate-950">
              {detail.orderNumber}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
              <span className="inline-flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-[#003366]" strokeWidth={2.2} />
                {formatDateTime(detail.createdAt)}
              </span>
              <span>ช่องทาง: {detail.channelLabel}</span>
              <span>วันที่ออเดอร์: {detail.orderDate}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/orders/incoming"
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2.2} />
              กลับหน้าออเดอร์เข้า
            </Link>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <Truck className="h-4 w-4" strokeWidth={2.2} />
              สร้างใบส่งของ
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <Printer className="h-4 w-4" strokeWidth={2.2} />
              พิมพ์
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <article className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
          <div className="flex items-center gap-2">
            <Store className="h-5 w-5 text-[#003366]" strokeWidth={2.2} />
            <h2 className="text-lg font-semibold text-slate-950">ข้อมูลร้านค้า</h2>
          </div>
          <div className="mt-4 space-y-3 text-sm text-slate-700">
            <p>
              <span className="font-semibold text-slate-950">{detail.customer.code}</span>{" "}
              {detail.customer.name}
            </p>
            <p>{detail.customer.address}</p>
            <p>หมายเหตุ: {detail.notes ?? "-"}</p>
          </div>
        </article>

        <article className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#003366]" strokeWidth={2.2} />
            <h2 className="text-lg font-semibold text-slate-950">สรุปออเดอร์</h2>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 px-4 py-4">
              <p className="text-sm text-slate-500">จำนวนรายการ</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {formatNumber(detail.items.length)}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-4">
              <p className="text-sm text-slate-500">จำนวนรวม</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {formatNumber(detail.totalQuantity)}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-4 sm:col-span-2">
              <p className="text-sm text-slate-500">ยอดรวมสุทธิ</p>
              <p className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-slate-950">
                {formatCurrency(detail.totalAmount)} บาท
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="rounded-[1.9rem] border border-slate-200 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.05)]">
        <div className="border-b border-slate-200 px-6 py-5">
          <h2 className="text-lg font-semibold text-slate-950">รายการสินค้าที่ลูกค้าสั่ง</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            มุมมองนี้แสดงออเดอร์ 1 ใบต่อ 1 ครั้งที่ลูกค้าสั่งจากช่องทางขาย เช่น LINE, LINE
            MAN หรือ TikTok Shop
          </p>
        </div>

        <div className="overflow-x-auto px-6 py-6">
          <table className="min-w-full border-separate border-spacing-0 text-left">
            <thead>
              <tr className="bg-slate-50">
                <th className="border-b border-r border-slate-200 px-4 py-4 text-sm font-semibold text-slate-500">
                  สินค้า
                </th>
                <th className="border-b border-r border-slate-200 px-4 py-4 text-sm font-semibold text-slate-500">
                  จำนวนสั่ง
                </th>
                <th className="border-b border-r border-slate-200 px-4 py-4 text-sm font-semibold text-slate-500">
                  สต็อกคงเหลือ
                </th>
                <th className="border-b border-r border-slate-200 px-4 py-4 text-sm font-semibold text-slate-500">
                  ราคา/หน่วย
                </th>
                <th className="border-b border-slate-200 px-4 py-4 text-right text-sm font-semibold text-slate-500">
                  รวม
                </th>
              </tr>
            </thead>
            <tbody>
              {detail.items.map((item) => (
                <tr key={item.id} className="align-middle">
                  <td className="border-b border-r border-slate-200 px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100">
                        {item.imageUrl ? (
                          <Image
                            src={item.imageUrl}
                            alt={item.productName}
                            fill
                            sizes="56px"
                            className="object-contain bg-white p-1"
                          />
                        ) : (
                          <Package2 className="h-5 w-5 text-slate-400" strokeWidth={2.2} />
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="text-base font-semibold text-slate-950">{item.productName}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {item.sku} · {item.unit}
                        </p>
                        {item.notes ? (
                          <p className="mt-1 text-xs text-slate-400">หมายเหตุ: {item.notes}</p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="border-b border-r border-slate-200 px-4 py-4 text-base text-slate-900">
                    {formatNumber(item.quantity)} {item.unit}
                  </td>
                  <td className="border-b border-r border-slate-200 px-4 py-4 text-base text-slate-700">
                    {formatNumber(item.stockQuantity)} {item.unit}
                  </td>
                  <td className="border-b border-r border-slate-200 px-4 py-4 text-base text-slate-700">
                    {item.unitPrice > 0 ? (
                      `${formatCurrency(item.unitPrice)} บาท`
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-700 print:hidden">
                        <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.3} />
                        ยังไม่ผูกราคา
                      </span>
                    )}
                  </td>
                  <td className="border-b border-slate-200 px-4 py-4 text-right text-base font-semibold text-slate-950">
                    {formatCurrency(item.lineTotal)} บาท
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50">
                <td className="border-r border-slate-200 px-4 py-4 text-base font-semibold text-slate-950">
                  รวมทั้งหมด
                </td>
                <td className="border-r border-slate-200 px-4 py-4 text-base font-semibold text-slate-950">
                  {formatNumber(detail.totalQuantity)}
                </td>
                <td className="border-r border-slate-200 px-4 py-4 text-base text-slate-500">-</td>
                <td className="border-r border-slate-200 px-4 py-4 text-base text-slate-500">-</td>
                <td className="px-4 py-4 text-right text-base font-semibold text-slate-950">
                  {formatCurrency(detail.totalAmount)} บาท
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
