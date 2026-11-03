import { Boxes, CircleAlert, PackageCheck } from "lucide-react";
import type { StockDashboardData } from "@/lib/stock/admin";

type StockSummaryCardsProps = {
  data: StockDashboardData;
};

function formatMoney(value: number) {
  return value.toLocaleString("th-TH", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

export function StockSummaryCards({ data }: StockSummaryCardsProps) {
  const productCount = data.products.length;
  const lowStockCount = data.lowStockCount;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <article className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)]">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#003366]/10 text-[#003366]">
            <Boxes className="h-6 w-6" strokeWidth={2.4} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">สินค้าทั้งหมด</p>
            <p className="mt-1 truncate text-3xl font-black tracking-tight text-slate-950 tabular-nums">
              {productCount.toLocaleString("th-TH")}
            </p>
          </div>
        </div>
      </article>

      <article className="rounded-[1.75rem] border border-[#003366]/15 bg-[#003366] p-5 shadow-[0_20px_50px_rgba(0,51,102,0.15)] text-white">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white">
            <PackageCheck className="h-6 w-6" strokeWidth={2.4} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-widest text-white/50">มูลค่าสต็อกรวม</p>
            <p className="mt-1 truncate text-3xl font-black tracking-tight tabular-nums">
              ฿{formatMoney(data.totalOnHandValue)}
            </p>
          </div>
        </div>
      </article>

      <article className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)]">
        <div className="flex items-center gap-4">
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
            lowStockCount > 0 ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600"
          }`}>
            <CircleAlert className="h-6 w-6" strokeWidth={2.4} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">ใกล้หมด / หมด</p>
            <p className={`mt-1 truncate text-3xl font-black tracking-tight tabular-nums ${
               lowStockCount > 0 ? "text-rose-600" : "text-slate-950"
            }`}>
              {lowStockCount.toLocaleString("th-TH")}
            </p>
          </div>
        </div>
      </article>
    </div>
  );
}
