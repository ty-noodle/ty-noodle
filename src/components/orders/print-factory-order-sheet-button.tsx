"use client";

import { FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type PrintFactoryOrderSheetButtonProps = {
  date: string;
  endDate?: string;
  label?: string;
};

export function PrintFactoryOrderSheetButton({
  date,
  endDate,
  label = "พิมพ์ใบสั่งของ",
}: PrintFactoryOrderSheetButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const url = useMemo(
    () => `/orders/factory-order-sheet?date=${date}${endDate ? `&endDate=${endDate}` : ""}`,
    [date, endDate],
  );

  function handleOpen() {
    if (loading) return;
    setLoading(true);
    router.push(url);
  }

  return (
    <button
      type="button"
      onClick={handleOpen}
      disabled={loading}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#003366]/20 bg-white px-3 py-1.5 text-[13px] font-bold text-[#003366] shadow-sm transition hover:bg-[#003366]/5 hover:shadow-md active:scale-[0.98] disabled:opacity-50 print:hidden md:gap-2 md:px-6 md:py-2.5 md:text-sm"
    >
      <FileText className="h-3.5 w-3.5 md:h-4.5 md:w-4.5" strokeWidth={2.5} />
      {loading ? "กำลังโหลด..." : label}
    </button>
  );
}
