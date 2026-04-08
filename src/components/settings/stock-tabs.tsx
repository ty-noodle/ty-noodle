import Link from "next/link";

type StockTabsProps = {
  current: "movements" | "stock";
};

const tabs = [
  {
    href: "/stock",
    key: "stock",
    label: "สต็อกคงเหลือ",
  },
  {
    href: "/stock/movements",
    key: "movements",
    label: "เคลื่อนไหว",
  },
] as const;

export function StockTabs({ current }: StockTabsProps) {
  return (
    <div className="mt-8">
      <div className="grid grid-cols-2 rounded-2xl border border-slate-200 bg-white p-1 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        {tabs.map((tab) => {
          const isActive = current === tab.key;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-[1rem] px-2 py-2 text-center text-xs font-semibold transition sm:px-4 sm:py-2.5 sm:text-sm ${
                isActive
                  ? "bg-[#003366] text-white shadow-[0_10px_24px_rgba(0,51,102,0.24)]"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
