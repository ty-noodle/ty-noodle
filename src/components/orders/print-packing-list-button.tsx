"use client";

import { useMemo, useState } from "react";
import { LayoutList } from "lucide-react";

type PrintPackingListButtonProps = {
  date: string;
  endDate?: string;
  layout?: "standard" | "transposed";
  label?: string;
};

export function PrintPackingListButton({
  date,
  endDate,
  layout = "standard",
  label = "พิมพ์ใบจัดของ",
}: PrintPackingListButtonProps) {
  const [loading, setLoading] = useState(false);
  const basePageUrl = useMemo(
    () =>
      `/orders/packing-list?date=${date}${endDate ? `&endDate=${endDate}` : ""}${
        layout !== "standard" ? `&layout=${layout}` : ""
      }`,
    [date, endDate, layout],
  );

  function handlePrint() {
    if (loading) return;
    setLoading(true);
    window.location.assign(basePageUrl);
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      disabled={loading}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#003366]/20 bg-white px-3 py-1.5 text-[13px] font-bold text-[#003366] shadow-sm transition hover:bg-[#003366]/5 hover:shadow-md active:scale-[0.98] disabled:opacity-50 print:hidden md:gap-2 md:px-6 md:py-2.5 md:text-sm"
    >
      <LayoutList className="h-3.5 w-3.5 md:h-4.5 md:w-4.5" strokeWidth={2.5} />
      {loading ? "กำลังโหลด..." : label}
    </button>
  );
}
