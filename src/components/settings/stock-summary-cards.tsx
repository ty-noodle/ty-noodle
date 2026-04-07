import { Archive, Boxes, CircleAlert, PackageCheck } from "lucide-react";
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

function formatQuantity(value: number) {
  return value.toLocaleString("th-TH", {
    maximumFractionDigits: 3,
  });
}

export function StockSummaryCards({ data }: StockSummaryCardsProps) {
  const productCount = data.products.length;
  const outOfStockCount = data.products.filter((product) => product.onHandQuantity <= 0).length;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <article className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)]">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#003366]/10 text-[#003366]">
            <Boxes className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-500">สินค้าทั้งหมด</p>
            <p className="mt-1 truncate text-2xl font-semibold tracking-[-0.02em] text-slate-950 md:text-[2rem]">
              {productCount.toLocaleString("th-TH")}
            </p>
          </div>
        </div>
      </article>

      <article className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)]">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <PackageCheck className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-500">มูลค่าสต็อก</p>
            <p className="mt-1 truncate text-2xl font-semibold tracking-[-0.02em] text-slate-950 md:text-[2rem]">
              {formatMoney(data.totalOnHandValue)}
            </p>
            <p className="text-xs font-medium text-slate-400">บาท</p>
          </div>
        </div>
      </article>

      <article className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)]">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <CircleAlert className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-500">ใกล้หมด / หมด</p>
            <p className="mt-1 truncate text-2xl font-semibold tracking-[-0.02em] text-slate-950 md:text-[2rem]">
              {(data.lowStockCount + outOfStockCount).toLocaleString("th-TH")}
            </p>
          </div>
        </div>
      </article>

      <article className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)]">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
            <Archive className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-500">จองแล้ว</p>
            <p className="mt-1 truncate text-2xl font-semibold tracking-[-0.02em] text-slate-950 md:text-[2rem]">
              {formatQuantity(data.reservedTotal)}
            </p>
          </div>
        </div>
      </article>
    </div>
  );
}
