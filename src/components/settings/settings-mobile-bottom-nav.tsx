"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ArrowRight,
  BarChart2,
  Boxes,
  ClipboardList,
  Clock3,
  Factory,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MessageCircleMore,
  MoreHorizontal,
  Package2,
  Plus,
  Receipt,
  Settings2,
  Store,
  Truck,
  X,
} from "lucide-react";
import { signOut } from "@/app/login/actions";
import { useCreateOrder } from "@/components/orders/create-order-context";

const primaryNav = [
  { href: "/dashboard", icon: LayoutDashboard, label: "แดชบอร์ด" },
  { href: "/orders/incoming", icon: ClipboardList, label: "ออเดอร์" },
  { href: "/reports/product-sales", icon: BarChart2, label: "รายงาน", activePrefix: "/reports" },
] as const;

const moreItems = [
  { href: "/stock", icon: Boxes, label: "สต็อก" },
  { href: "/billing", icon: Receipt, label: "ใบวางบิล" },
  { href: "/settings", icon: Settings2, label: "ตั้งค่า" },
] as const;

function isActive(href: string, pathname: string, activePrefix?: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (activePrefix) return pathname.startsWith(activePrefix);
  return pathname.startsWith(href);
}

export function SettingsMobileBottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const { open: openCreateOrder, isOpen: isCreateModalOpen } = useCreateOrder();

  const moreActive = moreItems.some((item) => pathname.startsWith(item.href));
  const createOrderActive = pathname.startsWith("/orders/incoming");
  const visiblePendingHref = pendingHref && pathname !== pendingHref ? pendingHref : null;

  function markNavigationPending(href: string) {
    if (pathname !== href) {
      setPendingHref(href);
    }
  }

  function isNavigationPending(href: string) {
    return visiblePendingHref === href;
  }

  return (
    <>
      {visiblePendingHref ? (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[250] lg:hidden">
          <div className="h-0.5 w-full overflow-hidden bg-[#003366]/10">
            <div className="h-full w-2/5 animate-mobile-nav-progress rounded-full bg-[#003366]" />
          </div>
          <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-[#003366]/25 shadow-[0_0_18px_rgba(0,51,102,0.25)]" />
        </div>
      ) : null}

      {moreOpen ? (
        <div
          className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMoreOpen(false)}
        />
      ) : null}

      <div
        className={`fixed inset-x-0 bottom-0 z-[100] rounded-t-3xl bg-white shadow-2xl transition-transform duration-300 ease-out lg:hidden ${
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

            return href === "/settings" ? (
              <button
                key={href}
                onClick={() => {
                  setMoreOpen(false);
                  setSettingsOpen(true);
                }}
                className={`flex flex-col items-center gap-2.5 rounded-2xl px-3 py-5 text-sm font-semibold transition ${
                  active
                    ? "bg-[#003366]/10 text-[#003366]"
                    : "bg-slate-50 text-slate-600 active:bg-slate-200"
                }`}
              >
                <Icon className="h-7 w-7" strokeWidth={1.8} />
                <span>{label}</span>
              </button>
            ) : (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => {
                      markNavigationPending(href);
                      setMoreOpen(false);
                    }}
                    className={`flex flex-col items-center gap-2.5 rounded-2xl px-3 py-5 text-sm font-semibold transition ${
                      active
                        ? "bg-[#003366]/10 text-[#003366]"
                        : "bg-slate-50 text-slate-600 active:bg-slate-200"
                    } ${isNavigationPending(href) ? "scale-[0.98] opacity-70" : ""}`}
                  >
                <Icon className="h-7 w-7" strokeWidth={1.8} />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>

        <div className="border-t border-slate-100 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
          <form action={signOut}>
            <button
              type="submit"
              onClick={() => setMoreOpen(false)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 transition active:bg-rose-100"
            >
              <LogOut className="h-5 w-5" strokeWidth={2.2} />
              <span>ออกจากระบบ</span>
            </button>
          </form>
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 lg:hidden">
        <div className="relative w-full">
          {/* Curved Background with Notch */}
          <div className="absolute inset-x-0 bottom-0 -z-10 h-[calc(100%+20px)]">
            <svg
              viewBox="0 0 400 80"
              preserveAspectRatio="none"
              className="h-full w-full fill-white drop-shadow-[0_-12px_28px_rgba(15,23,42,0.1)]"
            >
              <path
                d="M0 20 H130 C160 20, 160 68, 200 68 C240 68, 240 20, 270 20 H400 V80 H0 Z"
              />
            </svg>
          </div>

          <div className="relative px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3">

            <div className="grid grid-cols-5 items-end">
              {primaryNav.slice(0, 2).map(({ href, icon: Icon, label, ...rest }) => {
                const activePrefix =
                  "activePrefix" in rest ? (rest as { activePrefix: string }).activePrefix : undefined;
                const active = isActive(href, pathname, activePrefix);

                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => markNavigationPending(href)}
                    className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-medium transition ${
                      active
                        ? "text-[#003366]"
                        : "text-slate-500 hover:text-slate-900"
                    } ${isNavigationPending(href) ? "scale-95 opacity-70" : ""}`}
                  >
                    <Icon className={`h-5 w-5 transition-colors ${active ? "text-[#003366]" : "text-slate-500"}`} strokeWidth={active ? 2.8 : 2.2} />
                    <span className={`whitespace-nowrap transition-all ${active ? "font-bold scale-105" : ""}`}>{label}</span>
                  </Link>
                );
              })}

              <div aria-hidden="true" />

              {primaryNav.slice(2).map(({ href, icon: Icon, label, ...rest }) => {
                const activePrefix =
                  "activePrefix" in rest ? (rest as { activePrefix: string }).activePrefix : undefined;
                const active = isActive(href, pathname, activePrefix);

                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => markNavigationPending(href)}
                    className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-medium transition ${
                      active
                        ? "text-[#003366]"
                        : "text-slate-500 hover:text-slate-900"
                    } ${isNavigationPending(href) ? "scale-95 opacity-70" : ""}`}
                  >
                    <Icon className={`h-5 w-5 transition-colors ${active ? "text-[#003366]" : "text-slate-500"}`} strokeWidth={active ? 2.8 : 2.2} />
                    <span className={`whitespace-nowrap transition-all ${active ? "font-bold scale-105" : ""}`}>{label}</span>
                  </Link>
                );
              })}

               <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-medium transition ${
                  moreActive
                    ? "text-[#003366]"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <MoreHorizontal className={`h-5 w-5 transition-colors ${moreActive ? "text-[#003366]" : "text-slate-500"}`} strokeWidth={2.4} />
                <span className={`whitespace-nowrap ${moreActive ? "font-bold" : ""}`}>เพิ่มเติม</span>
              </button>
            </div>
          </div>

           <button
            type="button"
            onClick={() => openCreateOrder()}
            className={`absolute -top-4 left-1/2 z-50 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full shadow-[0_12px_32px_rgba(0,51,102,0.35)] transition-all duration-300 active:scale-90 ${
              isCreateModalOpen
                ? "bg-rose-600 text-white rotate-45"
                : createOrderActive
                ? "bg-[#003366] text-white"
                : "bg-gradient-to-br from-[#0B5BC6] to-[#003366] text-white hover:brightness-110"
            }`}
            aria-label="สร้างออเดอร์"
          >
            <Plus className="h-9 w-9" strokeWidth={3} />
          </button>
        </div>
      </nav>

      {/* Settings Full Screen Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-[200] bg-[#f6f7f8] animate-in fade-in duration-200 lg:hidden font-[family:var(--font-sarabun)]">
          <div className="flex h-[68px] items-center justify-between border-b border-slate-200 bg-white px-4">
            <span className="text-lg font-bold text-slate-950">ตั้งค่า</span>
            <button
              onClick={() => setSettingsOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition active:scale-95"
            >
              <X className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </div>
          <div className="overflow-y-auto p-4 pb-20" style={{ maxHeight: "calc(100vh - 68px)" }}>
            <div className="grid gap-4">
              {[
                {
                  description: "เพิ่มสินค้าใหม่ อัปเดตรหัสสินค้า รูปสินค้า และต้นทุน",
                  href: "/settings/products",
                  icon: Package2,
                  label: "จัดการสินค้า",
                },
                {
                  description: "เพิ่มร้านค้า จัดการข้อมูลหน้าร้าน ที่อยู่ และเลือกรถประจำร้าน",
                  href: "/settings/customers",
                  icon: Store,
                  label: "จัดการร้านค้า",
                },
                {
                  description: "เพิ่มรายชื่อผู้ขายหรือโรงงานที่คุณสั่งซื้อสินค้า เพื่อใช้บันทึกรับเข้าสต็อก",
                  href: "/settings/suppliers",
                  icon: Factory,
                  label: "จัดการผู้ขาย",
                },
                {
                  description: "ดูชื่อ LINE รูปโปรไฟล์ สถานะการใช้งาน และจัดการสิทธิ์ลูกค้าที่เข้ามาผ่าน LINE",
                  href: "/settings/customer-data",
                  icon: MessageCircleMore,
                  label: "ข้อมูลลูกค้า",
                },
                {
                  description: "เพิ่มรถส่งของแบบง่าย เพื่อเอาไปผูกร้านค้าและใช้ต่อยอดกับงานจัดส่ง",
                  href: "/settings/vehicles",
                  icon: Truck,
                  label: "จัดการรถ",
                },
                {
                  description: "ตั้งเวลาเปิด-ปิดรับออเดอร์ และจัดการแจ้งเตือนออเดอร์ใหม่",
                  href: "/settings/order-window",
                  icon: Clock3,
                  label: "เวลารับออเดอร์และแจ้งเตือน",
                },
                {
                  description: "เปลี่ยนรหัสเข้าใช้งานสำหรับผู้ดูแลระบบ",
                  href: "/settings/login-pin",
                  icon: KeyRound,
                  label: "ตั้งค่า PIN",
                },
              ].map((option) => (
	                <Link
	                  key={option.href}
	                  href={option.href}
	                  onClick={() => {
                      markNavigationPending(option.href);
                      setSettingsOpen(false);
                    }}
	                  className={`flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition active:bg-slate-50 ${isNavigationPending(option.href) ? "scale-[0.99] opacity-70" : ""}`}
	                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#003366]/10 text-[#003366]">
                    <option.icon className="h-5 w-5" strokeWidth={2.2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-slate-950 truncate">{option.label}</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">{option.description}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        </div>
	      )}
	    </>
	  );
	}
