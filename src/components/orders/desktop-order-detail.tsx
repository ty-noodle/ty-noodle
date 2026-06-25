"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Building2, Package2, Plus, XCircle } from "lucide-react";
import type { OrderDetailData } from "@/lib/orders/detail";

function formatCurrency(value: number) {
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type Props = {
  detail: OrderDetailData;
  deliveryNumbers?: string[];
  onEdit: (detail: OrderDetailData) => void;
};

const TABLE_COLUMNS = [
  "รหัสสินค้า",
  "รายการสินค้า",
  "จำนวน",
  "หน่วย",
  "สต็อก",
  "ราคา/หน่วย",
  "รวม",
] as const;

export function DesktopOrderDetail({ detail, deliveryNumbers, onEdit }: Props) {
  const router = useRouter();
  const canEdit = detail.status !== "cancelled";
  const canDelete = detail.status !== "cancelled";
  const deliveryNumberText =
    Array.from(new Set((deliveryNumbers ?? []).filter(Boolean))).join(", ") ||
    detail.deliveryNumber ||
    "";

  function handleEditInModal() {
    onEdit(detail);
  }

  function handleDeleteInModal() {
    const params = new URLSearchParams(window.location.search);
    params.set("expanded", detail.id);
    params.set("delete", "1");
    params.delete("edit");
    router.replace(`/orders/incoming?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="overflow-hidden border-y border-slate-300 bg-white [&_*]:font-bold">
      <div className="border-b border-slate-200 bg-white px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#003366]/5 text-[#003366]">
                <Building2 className="h-5 w-5" strokeWidth={2.4} />
              </div>
              <div>
                <h3 className="text-2xl font-bold tracking-tight text-slate-950">
                  {detail.customer.name}
                </h3>
                <p className="mt-0.5 font-mono text-base font-bold text-[#003366]">
                  {detail.customer.code}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-base font-semibold text-slate-700">
              {deliveryNumberText ? (
                <span>
                  ใบส่งของ:{" "}
                  <span className="font-mono text-slate-900" translate="no">
                    {deliveryNumberText}
                  </span>
                </span>
              ) : null}
              {deliveryNumberText ? (
                <span className="h-4 w-px bg-slate-200" aria-hidden="true" />
              ) : null}
              <span>
                ช่องทาง: <span className="text-slate-900">{detail.channelLabel}</span>
              </span>
              <span className="h-4 w-px bg-slate-200" aria-hidden="true" />
              <span>
                รวม:{" "}
                <span className="text-slate-900">
                  {detail.totalQuantity.toLocaleString("th-TH")} หน่วย
                </span>
              </span>
            </div>

            <div className="mt-3 border-t border-slate-200 pt-3 text-sm font-semibold text-slate-700">
              <div className="flex items-start gap-3">
                <span className="shrink-0 font-bold text-slate-950">หมายเหตุ</span>
                <span className="min-w-0 flex-1 leading-6 text-slate-700">
                  {detail.notes?.trim() ? (
                    <span className="italic text-slate-900">&ldquo;{detail.notes}&rdquo;</span>
                  ) : (
                    <span className="text-slate-500">-</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {canEdit ? (
              <button
                type="button"
                onClick={handleEditInModal}
                className="inline-flex items-center gap-2 rounded-lg bg-[#003366] px-5 py-2.5 text-sm font-bold text-white shadow-[0_8px_20px_rgba(0,51,102,0.12)] transition hover:bg-[#002244] active:scale-[0.98]"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                แก้ไขรายการ
              </button>
            ) : null}
            {canDelete ? (
              <button
                type="button"
                onClick={handleDeleteInModal}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-100 bg-rose-50 px-5 py-2.5 text-sm font-bold text-rose-600 transition hover:bg-rose-100 active:scale-[0.98]"
              >
                <XCircle className="h-4 w-4" />
                ลบออเดอร์
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <table className="min-w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-slate-300 bg-slate-50">
            {TABLE_COLUMNS.map((column) => (
              <th
                key={column}
                className="px-6 py-3.5 text-center text-sm font-bold uppercase tracking-widest text-slate-700"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {detail.items.map((item) => (
            <tr key={item.id} className="align-middle transition-colors hover:bg-slate-50/40">
              <td className="px-6 py-4 text-center">
                <span className="font-mono text-base font-bold text-[#003366]/80">{item.sku}</span>
              </td>

              <td className="px-6 py-4">
                <div className="flex items-center gap-4">
                  <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={item.productName}
                        fill
                        sizes="56px"
                        className="bg-white object-contain"
                      />
                    ) : (
                      <Package2 className="h-6 w-6 text-slate-300" strokeWidth={1.5} />
                    )}
                  </div>
                  <p className="text-lg font-bold leading-tight text-slate-900">{item.productName}</p>
                </div>
              </td>

              <td className="px-6 py-4 text-center">
                <span className="text-xl font-bold tabular-nums text-slate-950">
                  {item.quantity.toLocaleString("th-TH")}
                </span>
              </td>

              <td className="px-6 py-4 text-center text-base font-bold uppercase tracking-wide text-slate-600">
                {item.unit}
              </td>

              <td className="px-6 py-4 text-center">
                <span
                  className={`text-base font-bold tabular-nums ${
                    item.stockQuantity < 0 ? "text-rose-800" : "text-slate-600"
                  }`}
                >
                  {item.stockQuantity.toLocaleString("th-TH")}
                </span>
              </td>

              <td className="px-6 py-4 text-center text-base font-bold tabular-nums text-slate-600">
                {formatCurrency(item.unitPrice)}
              </td>

              <td className="px-6 py-4 text-center">
                <p className="font-mono text-lg font-bold tabular-nums text-[#003366]">
                  {formatCurrency(item.lineTotal)}
                </p>
              </td>
            </tr>
          ))}
        </tbody>

        <tfoot>
          <tr className="border-t border-slate-300 bg-slate-50">
            <td
              colSpan={6}
              className="px-8 py-4 text-right text-base font-bold uppercase tracking-widest text-slate-700"
            >
              ยอดรวมทั้งสิ้น
            </td>
            <td className="px-8 py-4 text-center">
              <p className="font-mono text-xl font-bold tabular-nums text-[#003366]">
                {formatCurrency(detail.items.reduce((sum, item) => sum + item.lineTotal, 0))} บาท
              </p>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
