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
      <div className="flex rounded-2xl border border-slate-200 bg-white p-1 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        {tabs.map((tab) => {
          const isActive = current === tab.key;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex-1 rounded-[1rem] px-4 py-2.5 text-center text-sm font-medium transition ${
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
