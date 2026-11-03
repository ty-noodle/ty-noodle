"use client";

import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
import { Loader2, Package } from "lucide-react";
import { getCustomerDeliveredSummary } from "@/app/order/actions";
import type { DeliveredProductSummary } from "@/app/order/actions";
import { formatDisplayUnit } from "@/app/order/customer/unit-label";

const PODIUM_CONFIG = {
  1: {
    medal: "🥇",
    card: "bg-gradient-to-b from-amber-50 to-yellow-100 border-yellow-300/60 shadow-[0_12px_28px_-4px_rgba(234,179,8,0.32)]",
    badge: "bg-yellow-400 text-yellow-900",
    imgSize: "h-16 w-16",
    imgSizes: "64px",
    nameSize: "text-sm",
    qtySize: "text-lg",
  },
  2: {
    medal: "🥈",
    card: "bg-gradient-to-b from-slate-50 to-slate-100 border-slate-200/80 shadow-[0_6px_16px_-4px_rgba(0,0,0,0.10)]",
    badge: "bg-slate-400 text-white",
    imgSize: "h-12 w-12",
    imgSizes: "48px",
    nameSize: "text-xs",
    qtySize: "text-sm",
  },
  3: {
    medal: "🥉",
    card: "bg-gradient-to-b from-orange-50 to-amber-100 border-amber-200/60 shadow-[0_6px_16px_-4px_rgba(217,119,6,0.15)]",
    badge: "bg-amber-600 text-white",
    imgSize: "h-12 w-12",
    imgSizes: "48px",
    nameSize: "text-xs",
    qtySize: "text-sm",
  },
} as const;

function PodiumCard({ item, rank }: { item: DeliveredProductSummary; rank: 1 | 2 | 3 }) {
  const c = PODIUM_CONFIG[rank];
  return (
    <div className={`flex flex-col items-center gap-2 rounded-2xl border px-2 py-3 ${c.card}`}>
      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${c.badge}`}>
        {c.medal} อันดับ {rank}
      </span>
      <div className={`relative shrink-0 overflow-hidden rounded-xl bg-white/70 ${c.imgSize}`}>
        <Image
          src={item.imageUrl ?? "/placeholders/product-placeholder.svg"}
          alt={item.productName}
          fill
          sizes={c.imgSizes}
          className="object-cover"
        />
      </div>
      <p className={`w-full truncate text-center font-bold text-slate-800 leading-tight ${c.nameSize}`}>
        {item.productName}
      </p>
      <p className={`font-black text-[#003366] leading-none ${c.qtySize}`}>
        {item.totalDelivered.toLocaleString("th-TH")}
        <span className="ml-0.5 text-[10px] font-semibold opacity-60">
          {formatDisplayUnit(item.saleUnitLabel)}
        </span>
      </p>
      <p className="text-[10px] text-slate-400">{item.orderCount} ออเดอร์</p>
    </div>
  );
}

export function OrderSummaryView({ customerId }: { customerId: string }) {
  const [summary, setSummary] = useState<DeliveredProductSummary[] | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const result = await getCustomerDeliveredSummary(customerId);
      if (result.success) setSummary(result.data);
    });
  }, [customerId]);

  if (isPending || summary === null) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <Loader2 className="mb-3 h-8 w-8 animate-spin" />
        <p className="text-sm">กำลังโหลดสรุปสินค้า...</p>
      </div>
    );
  }

  if (summary.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <Package className="mb-3 h-10 w-10 opacity-30" />
        <p className="font-medium">ยังไม่มีประวัติการรับสินค้า</p>
      </div>
    );
  }

  const top3 = summary.slice(0, 3) as DeliveredProductSummary[];
  const rest = summary.slice(3);

  return (
    <section className="space-y-6 p-4">
      {/* Podium */}
      <div>
        <p className="mb-3 px-1 text-xs font-bold uppercase tracking-widest text-slate-400">
          Top สินค้าที่ได้รับมากที่สุด
        </p>
        {/* Row 1 — #1 centered */}
        {top3[0] && (
          <div className="flex justify-center">
            <div className="w-[55%] min-w-[140px] max-w-[220px]">
              <PodiumCard item={top3[0]} rank={1} />
            </div>
          </div>
        )}
        {/* Row 2 — #2 left, #3 right */}
        {top3.length > 1 && (
          <div className="mt-2 flex gap-2">
            <div className="flex-1 min-w-0">
              {top3[1] && <PodiumCard item={top3[1]} rank={2} />}
            </div>
            <div className="flex-1 min-w-0">
              {top3[2] && <PodiumCard item={top3[2]} rank={3} />}
            </div>
          </div>
        )}
      </div>

      {/* Rest of list */}
      {rest.length > 0 && (
        <div>
          <p className="mb-2 px-1 text-xs font-bold uppercase tracking-widest text-slate-400">
            รายการอื่นๆ
          </p>
          <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_4px_12px_-2px_rgba(0,0,0,0.04)]">
            {rest.map((item, i) => (
              <div
                key={`${item.productId}::${item.saleUnitLabel}`}
                className={`flex items-center gap-3 px-4 py-3 ${i < rest.length - 1 ? "border-b border-slate-100" : ""}`}
              >
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                  <Image
                    src={item.imageUrl ?? "/placeholders/product-placeholder.svg"}
                    alt={item.productName}
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{item.productName}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                    <Package className="h-3 w-3 shrink-0" />
                    {item.orderCount} ออเดอร์
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-black text-[#003366]">
                    {item.totalDelivered.toLocaleString("th-TH")}
                  </p>
                  <p className="text-xs text-slate-400">{formatDisplayUnit(item.saleUnitLabel)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
