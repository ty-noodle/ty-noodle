"use client";

import Link from "next/link";
import { BarChart2, Boxes, ClipboardList, FileText, LayoutDashboard, MoreHorizontal, Settings2, Truck, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";

const primaryNav = [
  { href: "/dashboard", icon: LayoutDashboard, label: "แดชบอร์ด" },
  { href: "/orders", icon: ClipboardList, label: "ออเดอร์" },
  { href: "/delivery", icon: Truck, label: "ใบจัดส่ง" },
  { href: "/reports/product-sales", icon: BarChart2, label: "รายงาน", activePrefix: "/reports" },
] as const;

const moreItems = [
  { href: "/stock", icon: Boxes, label: "สต็อก" },
  { href: "/billing", icon: FileText, label: "ใบวางบิล" },
  { href: "/settings", icon: Settings2, label: "ตั้งค่า" },
] as const;

function isActive(href: string, pathname: string, activePrefix?: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (activePrefix) return pathname.startsWith(activePrefix);
  return pathname.startsWith(href);
}

export function SettingsMobileBottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const moreActive = moreItems.some((item) => pathname.startsWith(item.href));

  return (
    <>
      {/* Backdrop */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setMoreOpen(false)}
        />
      )}

      {/* Bottom sheet */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-white shadow-2xl transition-transform duration-300 ease-out md:hidden ${
          moreOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <span className="text-base font-semibold text-slate-800">เมนูเพิ่มเติม</span>
          <button
            type="button"
            onClick={() => setMoreOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
            aria-label="ปิด"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3 p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {moreItems.map(({ href, icon: Icon, label }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMoreOpen(false)}
                className={`flex flex-col items-center gap-2.5 rounded-2xl px-3 py-5 text-sm font-semibold transition ${
                  active
                    ? "bg-[#003366]/10 text-[#003366]"
                    : "bg-slate-50 text-slate-600 active:bg-slate-200"
                }`}
              >
                <Icon className="h-7 w-7" strokeWidth={1.8} />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Bottom nav bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_32px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {primaryNav.map(({ href, icon: Icon, label, ...rest }) => {
            const activePrefix = "activePrefix" in rest ? (rest as { activePrefix: string }).activePrefix : undefined;
            const active = isActive(href, pathname, activePrefix);
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-medium transition ${
                  active
                    ? "bg-[#003366]/10 text-[#003366]"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={2.2} />
                <span className="whitespace-nowrap">{label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-medium transition ${
              moreActive
                ? "bg-[#003366]/10 text-[#003366]"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <MoreHorizontal className="h-5 w-5" strokeWidth={2.2} />
            <span className="whitespace-nowrap">เพิ่มเติม</span>
          </button>
        </div>
      </nav>
    </>
  );
}
