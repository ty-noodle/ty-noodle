import Image from "next/image";
import Link from "next/link";
import { Boxes, ClipboardList, LayoutDashboard, ScanText } from "lucide-react";
import { SettingsMobileBottomNav } from "@/components/settings/settings-mobile-bottom-nav";
import { SettingsNavMenu } from "@/components/settings/settings-nav-menu";

type SettingsTopBarAction = {
  form?: string;
  href?: string;
  label: string;
  tone?: "primary" | "secondary";
  type?: "button" | "submit";
};

type SettingsTopBarProps = {
  actions?: SettingsTopBarAction[];
};

function getActionClassName(tone: SettingsTopBarAction["tone"]) {
  return tone === "primary"
    ? "whitespace-nowrap rounded-lg bg-[#003366] px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#003366]/20 transition hover:bg-[#002244] md:px-5"
    : "whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 md:px-4";
}

export function SettingsTopBar({ actions = [] }: SettingsTopBarProps) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 md:grid md:grid-cols-[1fr_auto_1fr] md:gap-6 md:px-8 md:py-3">
          <div className="flex min-w-0 items-center">
            <Link href="/dashboard" className="block shrink-0">
              <Image
                src="/ty-noodles-logo-cropped.png"
                alt="T&Y Noodles"
                width={176}
                height={64}
                priority
                className="h-12 w-auto object-contain md:h-14"
              />
            </Link>
          </div>

          <nav className="hidden items-center justify-center gap-2 md:flex">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
            >
              <LayoutDashboard className="h-4 w-4" strokeWidth={2.2} />
              แดชบอร์ด
            </Link>
            <Link
              href="/stock"
              className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
            >
              <Boxes className="h-4 w-4" strokeWidth={2.2} />
              สต็อก
            </Link>
            <Link
              href="/orders"
              className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
            >
              <ClipboardList className="h-4 w-4" strokeWidth={2.2} />
              ออเดอร์
            </Link>
            <Link
              href="/orders/incoming"
              className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
            >
              <ScanText className="h-4 w-4" strokeWidth={2.2} />
              ออเดอร์เข้า
            </Link>
            <SettingsNavMenu />
          </nav>

          <div className="hidden items-center justify-end gap-2 sm:flex md:gap-3">
            {actions.map((action) =>
              action.href ? (
                <Link
                  key={`${action.label}-${action.href}`}
                  href={action.href}
                  className={getActionClassName(action.tone)}
                >
                  {action.label}
                </Link>
              ) : (
                <button
                  key={`${action.label}-${action.form ?? "button"}`}
                  type={action.type ?? "button"}
                  form={action.form}
                  className={getActionClassName(action.tone)}
                >
                  {action.label}
                </button>
              ),
            )}
          </div>
        </div>
      </header>

      <SettingsMobileBottomNav />
    </>
  );
}
