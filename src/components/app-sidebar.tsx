"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart2,
  CircleDollarSign,
  Boxes,
  Clock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Package2,
  Receipt,
  ReceiptText,
  Search,
  Settings2,
  Store,
  TrendingUp,
  Truck,
  X,
  Factory,
  KeyRound,
  Plus,
  ClipboardEdit,
} from "lucide-react";
import { signOut } from "@/app/login/actions";
import { LineAppIcon } from "@/components/icons/line-app-icon";
import { LOGIN_PUSH_PENDING_COOKIE } from "@/lib/auth/login-push";
import { SettingsMobileBottomNav } from "@/components/settings/settings-mobile-bottom-nav";
import { OrdersMobileTabs } from "@/components/orders/orders-mobile-tabs";
import { ReportsMobileTabs } from "@/components/reports/reports-mobile-tabs";
import { MobileSearchProvider, useMobileSearch } from "@/components/mobile-search/mobile-search-context";
import { CreateOrderProvider } from "@/components/orders/create-order-context";
import { GlobalCreateOrderModal } from "@/components/orders/create-order-modal";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";

// ─── Page title map (mobile top bar) ─────────────────────────────────────────

const PAGE_TITLES: [string, string][] = [
  ["/orders/incoming", "รายการออเดอร์"],
  ["/orders/packing-list", "ใบจัดสินค้า"],
  ["/delivery/print", "พิมพ์ใบจัดส่ง"],
  ["/billing/print", "พิมพ์ใบวางบิล"],
  ["/billing", "ใบวางบิล"],
  ["/stock/movements", "ความเคลื่อนไหวสต็อก"],
  ["/stock", "สต็อก"],
  ["/reports/product-sales", "ยอดขายสินค้า"],
  ["/reports/profit-sales-detailed", "กำไรขายแบบละเอียด"],
  ["/reports/profit-sales", "รายงานกำไรขาย"],
  ["/reports/billing", "รายงานใบวางบิล"],
  ["/settings/products", "จัดการสินค้า"],
  ["/settings/customers", "จัดการร้านค้า"],
  ["/settings/customer-data", "ข้อมูลลูกค้า"],
  ["/settings/vehicles", "จัดการรถ"],
  ["/settings/order-window", "เวลารับออเดอร์"],
  ["/settings/login-pin", "ตั้งค่า PIN"],
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
    <header className="fixed inset-x-0 top-0 z-[60] h-[68px] border-b border-slate-200 bg-white text-slate-950 lg:hidden">
      <div className="flex h-full items-center gap-3 px-4">
        {/* Logo */}
        <Link href="/dashboard" prefetch={false} className="block shrink-0">
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
        <span className="min-w-0 flex-1 truncate text-center text-[15px] font-bold text-slate-950">
          {title}
        </span>

        {/* Actions for specific pages */}
        <div className="flex items-center gap-2">
          {pathname === "/stock" && !isOpen && (
            <div className="flex items-center gap-1.5">
              <Link
                href="/stock?receive=1"
                prefetch={false}
                className="flex items-center gap-1 rounded-full bg-[#003366] px-2.5 py-1.5 text-[12px] font-bold text-white shadow-lg shadow-[#003366]/20 transition active:scale-95"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={3} />
                รับเข้า
              </Link>
              <Link
                href="/stock?adjust=1"
                prefetch={false}
                className="flex items-center gap-1 rounded-full bg-indigo-600 px-2.5 py-1.5 text-[12px] font-bold text-white shadow-lg shadow-indigo-600/20 transition active:scale-95"
              >
                <ClipboardEdit className="h-3.5 w-3.5" strokeWidth={3} />
                ปรับยอด
              </Link>
            </div>
          )}

          {hasSearch ? (
            <button
              type="button"
              onClick={isOpen ? close : open}
              aria-label={isOpen ? "ปิดค้นหา" : "ค้นหา"}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 active:scale-95"
            >
              {isOpen ? (
                <X className="h-5 w-5" strokeWidth={2.5} />
              ) : (
                <Search className="h-5 w-5" strokeWidth={2.5} />
              )}
            </button>
          ) : (
            /* Spacer keeps title centred when no icon */
            <div className="h-9 w-9 shrink-0" aria-hidden="true" />
          )}
        </div>
      </div>
    </header>
  );
}

// ─── Nav data ────────────────────────────────────────────────────────────────

const mainNavItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "แดชบอร์ด" },
  { href: "/stock", icon: Boxes, label: "สต็อก" },
  { href: "/orders/incoming", icon: ReceiptText, label: "รายการออเดอร์" },
  { href: "/billing", icon: Receipt, label: "ใบวางบิล" },
] as const;

const reportsNavItems = [
  { href: "/reports/profit-sales", icon: CircleDollarSign, label: "รายงานกำไรขาย" },
  { href: "/reports/profit-sales-detailed", icon: BarChart2, label: "กำไรขายแบบละเอียด" },
  { href: "/reports/product-sales", icon: TrendingUp, label: "ยอดขายสินค้า" },
  { href: "/reports/billing", icon: Receipt, label: "รายงานใบวางบิล" },
] as const;

const settingsNavItems = [
  { href: "/settings/products", icon: Package2, label: "จัดการสินค้า" },
  { href: "/settings/customers", icon: Store, label: "จัดการร้านค้า" },
  { href: "/settings/suppliers", icon: Factory, label: "จัดการผู้ขาย" },
  { href: "/settings/customer-data", icon: LineAppIcon, label: "ข้อมูลลูกค้า" },
  { href: "/settings/vehicles", icon: Truck, label: "จัดการรถ" },
  { href: "/settings/order-window", icon: Clock, label: "เวลารับออเดอร์" },
  { href: "/settings/login-pin", icon: KeyRound, label: "ตั้งค่า PIN" },
] as const;

function isActive(href: string, pathname: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(href);
}

function shouldShowScrollTopButton(pathname: string) {
  return (
    pathname === "/delivery" ||
    pathname.startsWith("/orders/delivery-notes") ||
    pathname.startsWith("/orders/incoming") ||
    pathname.startsWith("/settings/customers") ||
    pathname.startsWith("/settings/products") ||
    pathname.startsWith("/stock") ||
    pathname.startsWith("/reports/")
  );
}

function hasCookie(name: string) {
  if (typeof document === "undefined") {
    return false;
  }

  return document.cookie
    .split(";")
    .some((item) => item.trim().startsWith(`${name}=`));
}

function LoginSuccessPushReporter() {
  useEffect(() => {
    if (!hasCookie(LOGIN_PUSH_PENDING_COOKIE)) {
      return;
    }

    void fetch("/api/push/login-success", {
      method: "POST",
      keepalive: true,
    });
  }, []);

  return null;
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
      prefetch={false}
      title={collapsed ? item.label : undefined}
      className={`flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm font-black transition-colors ${active ? "bg-[#003366]/10 text-[#003366]" : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
        } ${collapsed ? "justify-center" : ""} ${indent && !collapsed ? "pl-9" : ""}`}
    >
      <Icon className="h-4.5 w-4.5 shrink-0" strokeWidth={2.2} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export function AppSidebarLayout({
  children,
  hideMobileTopBar = false,
  hideOrdersTabs = false,
  hideReportsTabs = false,
}: {
  children: React.ReactNode;
  hideMobileTopBar?: boolean;
  hideOrdersTabs?: boolean;
  hideReportsTabs?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const pathname = usePathname();

  const isReportsPage = pathname.startsWith("/reports");
  const isSettingsPage = pathname.startsWith("/settings");

  // Track if user has manually toggled these sections. 
  const [reportsUserToggled, setReportsUserToggled] = useState(false);
  const [settingsUserToggled, setSettingsUserToggled] = useState(false);

  const [reportsOpenInternal, setReportsOpenInternal] = useState(isReportsPage);
  const [settingsOpenInternal, setSettingsOpenInternal] = useState(isSettingsPage);

  // Derived states
  const reportsOpen = reportsOpenInternal || (isReportsPage && !reportsUserToggled);
  const settingsOpen = settingsOpenInternal || (isSettingsPage && !settingsUserToggled);

  // Handle client-side initialization after mount to prevent hydration mismatch
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored === "true") {
      setCollapsed(true);
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("sidebar-collapsed", String(next));
      }
      return next;
    });
  }

  // Pre-hydration, we render a consistent base state (expanded)
  // After hydration, 'mounted' becomes true and we apply the user's preference
  const isSidebarCollapsed = mounted ? collapsed : false;

  const anyReportsActive = reportsNavItems.some((item) => pathname.startsWith(item.href));
  const anySettingsActive = settingsNavItems.some((item) => pathname.startsWith(item.href));
  const showMobileTopBar = pathname !== "/dashboard" && !hideMobileTopBar;
  const showOrdersTabs = !hideOrdersTabs;
  const showReportsTabs = !hideReportsTabs;
  const reportsTabsActive = pathname.startsWith("/reports") && showReportsTabs && showMobileTopBar;
  const mobileTopOffset = showMobileTopBar ? 68 : 0;
  const mobileContentTopPaddingClass =
    pathname === "/dashboard"
      ? "pt-0"
      : reportsTabsActive
        ? "pt-[116px] lg:pt-0"
        : mobileTopOffset === 68
          ? "pt-[68px] lg:pt-0"
          : "pt-0";

  return (
    <CreateOrderProvider>
      <LoginSuccessPushReporter />
      <GlobalCreateOrderModal />
      <MobileSearchProvider>
        {/* ── Desktop sidebar (fixed) ───────────────────────────────────────── */}
        <aside
          className={`hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:flex lg:flex-col lg:border-r lg:border-slate-200 lg:bg-white lg:shadow-[2px_0_20px_rgba(15,23,42,0.06)] ${collapsed ? "w-16" : "w-60"
            } transition-[width] duration-200 ease-in-out [will-change:width] motion-reduce:transition-none`}
        >
          {/* Logo + toggle */}
          <div
            className={`flex h-[68px] shrink-0 items-center border-b border-slate-100 ${collapsed ? "justify-center px-3" : "justify-between px-4"
              }`}
          >
            {!collapsed && (
              <Link href="/dashboard" prefetch={false} className="flex min-w-0 shrink items-center gap-2.5">
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
                <SidebarLink key={item.href} item={item} collapsed={isSidebarCollapsed} pathname={pathname} />
              ))}
            </div>

            {/* Divider */}
            <div className="mx-3 my-3 border-t border-slate-100" />

            {/* Reports collapsible section */}
            <div className="px-2">
              {collapsed ? (
                <Link
                  href="/reports/profit-sales"
                  prefetch={false}
                  title="Reports"
                  className={`flex items-center justify-center rounded-xl px-2.5 py-2.5 text-sm font-black transition-colors ${anyReportsActive
                      ? "bg-[#003366]/10 text-[#003366]"
                      : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
                    }`}
                >
                  <BarChart2 className="h-4.5 w-4.5 shrink-0" strokeWidth={2.2} />
                </Link>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setReportsOpenInternal(!reportsOpen);
                      setReportsUserToggled(true);
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2.5 text-sm font-black transition-colors ${anyReportsActive
                        ? "text-[#003366]"
                        : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
                      }`}
                  >
                    <span className="flex items-center gap-3">
                      <BarChart2 className="h-4.5 w-4.5 shrink-0" strokeWidth={2.2} />
                      <span>รายงาน</span>
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 transition-transform duration-200 ${reportsOpen ? "rotate-180" : ""
                        }`}
                      strokeWidth={2.2}
                    />
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-200 ${reportsOpen ? "max-h-56 opacity-100" : "max-h-0 opacity-0"
                      }`}
                  >
                    <div className="mt-0.5 space-y-0.5">
                      {reportsNavItems.map((item) => (
                        <SidebarLink
                          key={item.href}
                          item={item}
                          collapsed={isSidebarCollapsed}
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
              {collapsed ? (
                <Link
                  href="/settings/products"
                  prefetch={false}
                  title="Settings"
                  className={`flex items-center justify-center rounded-xl px-2.5 py-2.5 text-sm font-black transition-colors ${anySettingsActive
                      ? "bg-[#003366]/10 text-[#003366]"
                      : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
                    }`}
                >
                  <Settings2 className="h-4.5 w-4.5 shrink-0" strokeWidth={2.2} />
                </Link>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsOpenInternal(!settingsOpen);
                      setSettingsUserToggled(true);
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2.5 text-sm font-black transition-colors ${anySettingsActive
                        ? "text-[#003366]"
                        : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
                      }`}
                  >
                    <span className="flex items-center gap-3">
                      <Settings2 className="h-4.5 w-4.5 shrink-0" strokeWidth={2.2} />
                      <span>ตั้งค่า</span>
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 transition-transform duration-200 ${settingsOpen ? "rotate-180" : ""
                        }`}
                      strokeWidth={2.2}
                    />
                  </button>

                  <div
                    className={`overflow-hidden transition-all duration-200 ${settingsOpen ? "max-h-[28rem] opacity-100" : "max-h-0 opacity-0"
                      }`}
                  >
                    <div className="mt-0.5 space-y-0.5">
                      {settingsNavItems.map((item) => (
                        <SidebarLink
                          key={item.href}
                          item={item}
                          collapsed={isSidebarCollapsed}
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
                className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm font-black text-slate-700 transition-colors hover:bg-rose-50 hover:text-rose-600 ${collapsed ? "justify-center" : ""}`}
              >
                <LogOut className="h-4.5 w-4.5 shrink-0" strokeWidth={2.2} />
                {!collapsed && <span>ออกจากระบบ</span>}
              </button>
            </form>
          </div>
        </aside>

        {/* ── Mobile: top bar (logo + page title + search icon) ───────────── */}
        <div className="no-print">
          {showMobileTopBar && <MobileTopBar />}
        </div>

        {/* ── Mobile: orders tab bar (fixed below top bar) ─────────────────── */}
        <div className="no-print">
          {showOrdersTabs ? <OrdersMobileTabs /> : null}
        </div>

        {/* ── Mobile: reports tab bar (fixed below top bar) ────────────────── */}
        <div className="no-print">
          {showReportsTabs ? <ReportsMobileTabs /> : null}
        </div>

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <div
          className={`${collapsed ? "lg:pl-16" : "lg:pl-60"} ${mobileContentTopPaddingClass} pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0 print:pl-0 print:pt-0 print:pb-0 transition-[padding-left] duration-200 ease-in-out [will-change:padding-left] motion-reduce:transition-none`}
        >
          {children}
        </div>

        <div className="no-print">
          <SettingsMobileBottomNav />
          <ScrollToTopButton enabled={shouldShowScrollTopButton(pathname)} />
        </div>
      </MobileSearchProvider>
    </CreateOrderProvider>
  );
}
