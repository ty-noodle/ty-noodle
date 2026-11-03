"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleDollarSign, Receipt, TrendingUp, BarChart2 } from "lucide-react";

const reportTabs = [
  { href: "/reports/profit-sales", icon: CircleDollarSign, label: "กำไร" },
  { href: "/reports/profit-sales-detailed", icon: BarChart2, label: "ละเอียด" },
  { href: "/reports/product-sales", icon: TrendingUp, label: "สินค้า" },
  { href: "/reports/billing", icon: Receipt, label: "ใบวางบิล" },
];

export function ReportsMobileTabs() {
  const pathname = usePathname();

  if (!pathname.startsWith("/reports")) return null;

  return (
    <div className="fixed inset-x-0 top-[68px] z-30 border-b border-slate-200 bg-white shadow-sm md:hidden">
      <div className="flex">
        {reportTabs.map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 border-b-2 py-2 transition-colors ${
                active
                  ? "border-[#003366] text-[#003366]"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={2.2} />
              <span className="text-[11px] font-semibold leading-tight">{label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
