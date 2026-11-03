"use client";

import { useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, ChevronRight, Save, Search, X } from "lucide-react";
import { AppSidebarLayout } from "@/components/app-sidebar";

type SettingsSection = "customerData" | "customers" | "products" | "vehicles" | "suppliers" | "orderWindow" | "stock";

type SettingsShellProps = {
  children: React.ReactNode;
  current?: SettingsSection;
  description: string;
  floatingSubmit?: boolean;
  headerContent?: React.ReactNode;
  titleIcon?: LucideIcon;
  title: string;
  showSearch?: boolean;
  searchPlaceholder?: string;
  initialSearchTerm?: string;
  onSearch?: (term: string) => void;
};

function getSubmitFormId(current: SettingsSection) {
  if (current === "products") {
    return "create-product";
  }

  if (current === "customers") {
    return "create-customer";
  }

  if (current === "customerData") {
    return "create-customer";
  }

  return "create-vehicle";
}

function getSubmitLabel(current: SettingsSection) {
  if (current === "products") {
    return "บันทึกสินค้า";
  }

  if (current === "customers") {
    return "บันทึกร้านค้า";
  }

  if (current === "customerData") {
    return "บันทึกข้อมูลลูกค้า";
  }

  return "บันทึกรถ";
}

function getSwitchLink(current: SettingsSection) {
  if (current === "products") {
    return {
      href: "/settings/customers",
      label: "ไปหน้าจัดการร้านค้า",
    };
  }

  if (current === "customers") {
    return {
      href: "/settings/customer-data",
      label: "ไปหน้าข้อมูลลูกค้า",
    };
  }

  if (current === "customerData") {
    return {
      href: "/settings/customers",
      label: "ไปหน้าจัดการร้านค้า",
    };
  }

  return {
    href: "/settings/products",
    label: "ไปหน้าจัดการสินค้า",
  };
}

export function SettingsShell({
  children,
  current,
  description,
  floatingSubmit = true,
  headerContent,
  titleIcon: TitleIcon,
  title,
  showSearch = false,
  searchPlaceholder = "ค้นหา...",
  initialSearchTerm = "",
  onSearch,
}: SettingsShellProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const switchLink = current ? getSwitchLink(current) : null;
  const submitFormId = current ? getSubmitFormId(current) : null;
  const submitLabel = current ? getSubmitLabel(current) : null;

  const handleSearchToggle = () => {
    setIsSearchOpen(!isSearchOpen);
    if (isSearchOpen) {
      setSearchTerm("");
      if (onSearch) onSearch("");
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    if (onSearch) onSearch(value);
  };

  const inner = (
    <div className="min-h-screen bg-[#f6f7f8] font-[family:var(--font-sarabun)] text-slate-900">
      <div className="relative z-20 hidden bg-gradient-to-br from-[#0c1929] via-[#0d2444] to-[#003366] text-white lg:block">
        <div className="mx-auto w-full max-w-[88rem] px-4 py-1.5 lg:px-8 lg:py-10">
          <div className="flex flex-col gap-0.5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-2 lg:gap-4">
              {TitleIcon ? (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 backdrop-blur-sm ring-1 ring-white/20 lg:h-14 lg:w-14 lg:rounded-2xl">
                  <TitleIcon className="h-3.5 w-3.5 text-white lg:h-6 lg:w-6" strokeWidth={2} />
                </span>
              ) : null}
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="text-[8px] font-semibold uppercase tracking-[0.15em] text-white/45 lg:text-xs">
                  {current ? "เมนูตั้งค่า" : "ระบบจัดการ"}
                </p>
                <h1 className="mt-0 text-base font-bold tracking-tight text-white lg:mt-1 lg:text-3xl">
                  {title}
                </h1>
                {description ? (
                  <p className="mt-0 break-words text-[10px] leading-tight text-white/55 lg:mt-1.5 lg:text-sm">
                    {description}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-2 self-start lg:self-auto lg:gap-3">
              {showSearch && (
                <button
                  onClick={handleSearchToggle}
                  className={`flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-sm ring-1 ring-white/20 transition ${
                    isSearchOpen ? "bg-rose-500/20 text-white" : "bg-white/10 text-white/80 hover:bg-white/20 hover:text-white"
                  }`}
                >
                  {isSearchOpen ? <X className="h-5 w-5" strokeWidth={2.5} /> : <Search className="h-5 w-5" strokeWidth={2.2} />}
                </button>
              )}

              {switchLink ? (
                <Link
                  href={switchLink.href}
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white/80 backdrop-blur-sm transition hover:bg-white/20 hover:text-white"
                >
                  <span className="hidden sm:inline">{switchLink.label}</span>
                  <ArrowUpRight className="h-4 w-4" strokeWidth={2.2} />
                </Link>
              ) : null}
            </div>
          </div>

          {/* Search Bar Slide Down */}
          {showSearch && (
            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                isSearchOpen ? "mt-6 max-h-20 opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
                <input
                  type="text"
                  placeholder={searchPlaceholder}
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="w-full rounded-2xl border border-white/10 bg-white/10 py-4 pl-12 pr-4 text-base text-white placeholder:text-white/30 outline-none backdrop-blur-md focus:bg-white/15"
                  autoFocus={isSearchOpen}
                />
              </div>
            </div>
          )}

          {headerContent ? <div className="mt-6">{headerContent}</div> : null}
        </div>
      </div>

      <main className="mx-auto min-w-0 w-full max-w-[88rem] px-4 py-4 pb-28 lg:px-3 lg:py-8 lg:pb-32">
        {/* Mobile Breadcrumb */}
        {current && (
          <nav className="mb-4 flex items-center gap-1.5 text-[13px] font-bold lg:hidden">
            <Link href="/settings" className="text-slate-400 transition hover:text-[#003366]">ตั้งค่า</Link>
            <ChevronRight className="h-3.5 w-3.5 text-slate-300" strokeWidth={3} />
            <span className="text-[#003366]">{title}</span>
          </nav>
        )}
        {children}
      </main>

      {floatingSubmit && submitFormId && submitLabel ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-30 flex justify-end p-4 lg:bottom-0 lg:p-6">
          <button
            type="submit"
            form={submitFormId}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-[#003366] px-5 py-3 text-sm font-medium text-white shadow-[0_18px_40px_rgba(0,51,102,0.32)] transition hover:bg-[#002244] lg:px-6"
          >
            <Save className="h-4 w-4" strokeWidth={2.2} />
            {submitLabel}
          </button>
        </div>
      ) : null}
    </div>
  );

  return <AppSidebarLayout>{inner}</AppSidebarLayout>;
}
