"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart2,
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileCheck,
  FileText,
  LayoutDashboard,
  LogOut,
  Package2,
  ScanText,
  Search,
  Settings2,
  Store,
  TrendingUp,
  Truck,
  X,
} from "lucide-react";
import { signOut } from "@/app/login/actions";
import { SettingsMobileBottomNav } from "@/components/settings/settings-mobile-bottom-nav";
import { OrdersMobileTabs } from "@/components/orders/orders-mobile-tabs";
import { ReportsMobileTabs } from "@/components/reports/reports-mobile-tabs";
import { MobileSearchProvider, useMobileSearch } from "@/components/mobile-search/mobile-search-context";

// ─── Page title map (mobile top bar) ─────────────────────────────────────────

const PAGE_TITLES: [string, string][] = [
  ["/orders/incoming", "รายการออเดอร์"],
  ["/orders/delivery-notes", "ใบจัดส่ง"],
  ["/orders/packing-list", "ใบจัดสินค้า"],
  ["/orders", "สรุปออเดอร์"],
  ["/delivery/print", "พิมพ์ใบจัดส่ง"],
  ["/delivery", "ใบจัดส่ง"],
  ["/billing/print", "พิมพ์ใบวางบิล"],
  ["/billing", "ใบวางบิล"],
  ["/stock/movements", "ความเคลื่อนไหวสต็อก"],
  ["/stock", "สต็อก"],
  ["/reports/product-sales", "ยอดขายสินค้า"],
  ["/reports/store-sales", "ยอดขายตามร้านค้า"],
  ["/reports/delivery-notes", "รายงานใบจัดส่ง"],
  ["/settings/products", "จัดการสินค้า"],
  ["/settings/customers", "จัดการร้านค้า"],
  ["/settings/vehicles", "จัดการรถ"],
  ["/settings/stock", "รับสินค้า"],
  ["/settings", "ตั้งค่า"],
  ["/dashboard", "แดชบอร์ด"],
];

function getPageTitle(pathname: string): string {
  for (const [prefix, title] of PAGE_TITLES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return title;
  }
  return "T&Y Noodle";
}

// ─── Mobile top bar (uses search context) ────────────────────────────────────

function MobileTopBar() {
  const pathname = usePathname();
  const { hasSearch, isOpen, open, close } = useMobileSearch();
  const title = getPageTitle(pathname);

  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur md:hidden">
      <div className="flex h-[68px] items-center gap-3 px-4">
        {/* Logo */}
        <Link href="/dashboard" className="block shrink-0">
          <Image
            src="/ty-noodles-logo-cropped.png"
            alt="T&Y Noodles"
            width={176}
            height={64}
            priority
            className="h-10 w-auto object-contain"
          />
        </Link>

        {/* Page title */}
        <span className="min-w-0 flex-1 truncate text-center text-[15px] font-semibold text-slate-800">
          {title}
        </span>

        {/* Search icon / close — only shown on pages that have search */}
        {hasSearch ? (
          <button
            type="button"
            onClick={isOpen ? close : open}
            aria-label={isOpen ? "ปิดค้นหา" : "ค้นหา"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 active:scale-95"
          >
            {isOpen
              ? <X className="h-5 w-5" strokeWidth={2} />
              : <Search className="h-5 w-5" strokeWidth={2} />
            }
          </button>
        ) : (
          /* Spacer keeps title centred when no icon */
          <div className="h-9 w-9 shrink-0" aria-hidden="true" />
        )}
      </div>
    </header>
  );
}

// ─── Nav data ────────────────────────────────────────────────────────────────

const mainNavItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "แดชบอร์ด" },
  { href: "/stock", icon: Boxes, label: "สต็อก" },
  { href: "/orders/incoming", icon: ScanText, label: "รายการออเดอร์" },
  { href: "/orders", icon: ClipboardList, label: "สรุปออเดอร์" },
  { href: "/delivery", icon: Truck, label: "ใบจัดส่ง" },
  { href: "/billing", icon: FileText, label: "ใบวางบิล" },
] as const;

const reportsNavItems = [
  { href: "/reports/sales-overview", icon: BarChart2, label: "ภาพรวมยอดขายรายปี" },
  { href: "/reports/product-sales", icon: TrendingUp, label: "ยอดขายสินค้า" },
  { href: "/reports/store-sales", icon: Store, label: "ยอดขายตามร้านค้า" },
  { href: "/reports/delivery-notes", icon: FileCheck, label: "รายงานใบจัดส่ง" },
] as const;

const settingsNavItems = [
  { href: "/settings/products", icon: Package2, label: "จัดการสินค้า" },
  { href: "/settings/customers", icon: Store, label: "จัดการร้านค้า" },
  { href: "/settings/vehicles", icon: Truck, label: "จัดการรถ" },
] as const;

function isActive(href: string, pathname: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/orders") return pathname === "/orders" || pathname === "/orders/formal";
  return pathname.startsWith(href);
}

// ─── Sidebar nav link ─────────────────────────────────────────────────────────

type NavItem = { href: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; label: string };

function SidebarLink({
  item,
  collapsed,
  pathname,
  indent = false,
}: {
  item: NavItem;
  collapsed: boolean;
  pathname: string;
  indent?: boolean;
}) {
  const active = isActive(item.href, pathname);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={`flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm font-medium transition-colors ${
        active ? "bg-[#003366]/10 text-[#003366]" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      } ${collapsed ? "justify-center" : ""} ${indent && !collapsed ? "pl-9" : ""}`}
    >
      <Icon className="h-4.5 w-4.5 shrink-0" strokeWidth={2.2} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export function AppSidebarLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pathname = usePathname();

  // Restore collapse state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored === "true") setCollapsed(true);
  }, []);

  // Auto-expand reports section when navigating to a reports page
  useEffect(() => {
    if (pathname.startsWith("/reports")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReportsOpen(true);
    }
  }, [pathname]);

  // Auto-expand settings section when navigating to a settings page
  useEffect(() => {
    if (pathname.startsWith("/settings")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSettingsOpen(true);
    }
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  }

  const anyReportsActive = reportsNavItems.some((item) => pathname.startsWith(item.href));
  const anySettingsActive = settingsNavItems.some((item) => pathname.startsWith(item.href));
  const ordersTabsActive = pathname === "/orders" || pathname.startsWith("/orders/incoming");
  const reportsTabsActive = pathname.startsWith("/reports");

  return (
    <MobileSearchProvider>
      {/* ── Desktop sidebar (fixed) ───────────────────────────────────────── */}
      <aside
        className={`hidden md:fixed md:inset-y-0 md:left-0 md:z-50 md:flex md:flex-col md:border-r md:border-slate-200 md:bg-white md:shadow-[2px_0_20px_rgba(15,23,42,0.06)] ${
          collapsed ? "w-16" : "w-60"
        } transition-[width] duration-200 ease-in-out`}
      >
        {/* Logo + toggle */}
        <div
          className={`flex h-[68px] shrink-0 items-center border-b border-slate-100 ${
            collapsed ? "justify-center px-3" : "justify-between px-4"
          }`}
        >
          {!collapsed && (
            <Link href="/dashboard" className="flex min-w-0 shrink items-center gap-2.5">
              <Image
                src="/ty-noodles-logo-cropped.png"
                alt="T&Y Noodles"
                width={176}
                height={64}
                priority
                className="h-12 w-auto object-contain"
              />
              <span className="truncate text-base font-bold tracking-tight text-slate-800">
                T&amp;Y Noodle
              </span>
            </Link>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label={collapsed ? "ขยาย sidebar" : "ย่อ sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" strokeWidth={2.2} />
            ) : (
              <ChevronLeft className="h-4 w-4" strokeWidth={2.2} />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3">
          {/* Main nav items */}
          <div className="space-y-0.5 px-2">
            {mainNavItems.map((item) => (
              <SidebarLink key={item.href} item={item} collapsed={collapsed} pathname={pathname} />
            ))}
          </div>

          {/* Divider */}
          <div className="mx-3 my-3 border-t border-slate-100" />

          {/* Reports collapsible section */}
          <div className="px-2">
            {collapsed ? (
              <div className="space-y-0.5">
                {reportsNavItems.map((item) => (
                  <SidebarLink key={item.href} item={item} collapsed={collapsed} pathname={pathname} />
                ))}
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setReportsOpen((v) => !v)}
                  className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2.5 text-sm font-medium transition-colors ${
                    anyReportsActive
                      ? "text-[#003366]"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <BarChart2 className="h-4.5 w-4.5 shrink-0" strokeWidth={2.2} />
                    <span>รายงาน</span>
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                      reportsOpen ? "rotate-180" : ""
                    }`}
                    strokeWidth={2.2}
                  />
                </button>
                <div
                  className={`overflow-hidden transition-all duration-200 ${
                    reportsOpen ? "max-h-56 opacity-100" : "max-h-0 opacity-0"
                  }`}
                >
                  <div className="mt-0.5 space-y-0.5">
                    {reportsNavItems.map((item) => (
                      <SidebarLink
                        key={item.href}
                        item={item}
                        collapsed={collapsed}
                        pathname={pathname}
                        indent
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Divider */}
          <div className="mx-3 my-3 border-t border-slate-100" />

          {/* Settings collapsible section */}
          <div className="px-2">
            {/* Section header — shows as a regular icon link when collapsed */}
            {collapsed ? (
              <div className="space-y-0.5">
                {settingsNavItems.map((item) => (
                  <SidebarLink key={item.href} item={item} collapsed={collapsed} pathname={pathname} />
                ))}
              </div>
            ) : (
              <>
                {/* Collapsible header */}
                <button
                  type="button"
                  onClick={() => setSettingsOpen((v) => !v)}
                  className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2.5 text-sm font-medium transition-colors ${
                    anySettingsActive
                      ? "text-[#003366]"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Settings2 className="h-4.5 w-4.5 shrink-0" strokeWidth={2.2} />
                    <span>ตั้งค่า</span>
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                      settingsOpen ? "rotate-180" : ""
                    }`}
                    strokeWidth={2.2}
                  />
                </button>

                {/* Sub-items (animated) */}
                <div
                  className={`overflow-hidden transition-all duration-200 ${
                    settingsOpen ? "max-h-40 opacity-100" : "max-h-0 opacity-0"
                  }`}
                >
                  <div className="mt-0.5 space-y-0.5">
                    {settingsNavItems.map((item) => (
                      <SidebarLink
                        key={item.href}
                        item={item}
                        collapsed={collapsed}
                        pathname={pathname}
                        indent
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </nav>

        {/* Logout button */}
        <div className={`shrink-0 border-t border-slate-100 p-2 ${collapsed ? "" : "px-2"}`}>
          <form action={signOut}>
            <button
              type="submit"
              title={collapsed ? "ออกจากระบบ" : undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600 ${collapsed ? "justify-center" : ""}`}
            >
              <LogOut className="h-4.5 w-4.5 shrink-0" strokeWidth={2.2} />
              {!collapsed && <span>ออกจากระบบ</span>}
            </button>
          </form>
        </div>
      </aside>

      {/* ── Mobile: top bar (logo + page title + search icon) ───────────── */}
      <MobileTopBar />

      {/* ── Mobile: orders tab bar (fixed below top bar) ─────────────────── */}
      <OrdersMobileTabs />

      {/* ── Mobile: reports tab bar (fixed below top bar) ────────────────── */}
      <ReportsMobileTabs />

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div
        className={`${collapsed ? "md:pl-16" : "md:pl-60"} ${
          ordersTabsActive || reportsTabsActive ? "pt-[116px] md:pt-0" : "pt-[68px] md:pt-0"
        } transition-[padding-left] duration-200 ease-in-out`}
      >
        {children}
      </div>

      {/* ── Mobile bottom nav ────────────────────────────────────────────── */}
      <SettingsMobileBottomNav />
    </MobileSearchProvider>
  );
}
