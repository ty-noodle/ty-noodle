import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, Save } from "lucide-react";
import { AppSidebarLayout } from "@/components/app-sidebar";

type SettingsSection = "customers" | "products" | "vehicles";

type SettingsShellProps = {
  children: React.ReactNode;
  current?: SettingsSection;
  description: string;
  floatingSubmit?: boolean;
  titleIcon?: LucideIcon;
  title: string;
};

function getSubmitFormId(current: SettingsSection) {
  if (current === "products") {
    return "create-product";
  }

  if (current === "customers") {
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
      href: "/settings/vehicles",
      label: "ไปหน้าจัดการรถ",
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
  titleIcon: TitleIcon,
  title,
}: SettingsShellProps) {
  const switchLink = current ? getSwitchLink(current) : null;
  const submitFormId = current ? getSubmitFormId(current) : null;
  const submitLabel = current ? getSubmitLabel(current) : null;

  const inner = (
    <div className="min-h-screen bg-[#f6f7f8] font-[family:var(--font-sarabun)] text-slate-900">

      {/* ── Dark header banner ──────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-[#0c1929] via-[#0d2444] to-[#003366] text-white">
        <div className="mx-auto w-full max-w-[88rem] px-4 py-10 md:px-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              {TitleIcon ? (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm ring-1 ring-white/20">
                  <TitleIcon className="h-6 w-6 text-white" strokeWidth={2} />
                </span>
              ) : null}
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                  {current ? "เมนูตั้งค่า" : "ระบบจัดการ"}
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-white md:text-3xl">
                  {title}
                </h1>
                {description ? (
                  <p className="mt-1.5 break-words text-sm leading-relaxed text-white/55">
                    {description}
                  </p>
                ) : null}
              </div>
            </div>

            {switchLink ? (
              <Link
                href={switchLink.href}
                className="inline-flex items-center gap-2 self-start rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white/80 backdrop-blur-sm transition hover:bg-white/20 hover:text-white md:self-auto"
              >
                {switchLink.label}
                <ArrowUpRight className="h-4 w-4" strokeWidth={2.2} />
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-[88rem] px-4 py-8 pb-28 md:px-8 md:pb-32">
        {children}
      </main>

      {floatingSubmit && submitFormId && submitLabel ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-30 flex justify-end p-4 md:bottom-0 md:p-6">
          <button
            type="submit"
            form={submitFormId}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-[#003366] px-5 py-3 text-sm font-medium text-white shadow-[0_18px_40px_rgba(0,51,102,0.32)] transition hover:bg-[#002244] md:px-6"
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
