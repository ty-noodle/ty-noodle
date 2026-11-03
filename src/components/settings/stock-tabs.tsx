import Link from "next/link";

type StockTabsProps = {
  current: "stock" | "history" | "issues";
};

const tabs = [
  {
    href: "/stock",
    key: "stock",
    label: "สต็อกคงเหลือ",
  },
  {
    href: "/stock/history",
    key: "history",
    label: "ประวัติการรับเข้า",
  },
  {
    href: "/stock/issues",
    key: "issues",
    label: "เบิกออก",
  },
] as const;

export function StockTabs({ current }: StockTabsProps) {
  return (
    <div className="mt-4 mb-6">
      <div className="grid grid-cols-3 rounded-xl bg-slate-100/80 p-1 backdrop-blur-sm border border-slate-200/50 shadow-sm">
        {tabs.map((tab) => {
          const isActive = current === tab.key;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-lg px-1 py-2.5 text-center text-[11px] font-black transition-all duration-200 sm:px-4 sm:py-2.5 sm:text-sm ${
                isActive
                  ? "bg-[#0051d5] text-white shadow-sm scale-[1.02]"
                  : "text-slate-600 hover:text-slate-900"
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
