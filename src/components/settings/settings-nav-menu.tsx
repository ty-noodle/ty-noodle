"use client";

import Link from "next/link";
import { ChevronDown, Package2, Settings2, Store, Truck } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const items = [
  {
    description: "เพิ่ม แก้ไข และอัปเดตข้อมูลสินค้า",
    href: "/settings/products",
    icon: Package2,
    label: "จัดการสินค้า",
  },
  {
    description: "เพิ่มร้านค้า ตั้งค่าที่อยู่ และเลือกรถประจำร้าน",
    href: "/settings/customers",
    icon: Store,
    label: "จัดการร้านค้า",
  },
  {
    description: "เพิ่มรถส่งของสำหรับผูกร้านค้าและต่อยอดไปหน้าออเดอร์",
    href: "/settings/vehicles",
    icon: Truck,
    label: "จัดการรถ",
  },
] as const;

export function SettingsNavMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isActive = pathname.startsWith("/settings");

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition ${
          isActive
            ? "bg-[#003366]/10 text-[#003366]"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
        }`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Settings2 className="h-4 w-4" strokeWidth={2.2} />
        ตั้งค่า
        <ChevronDown
          className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`}
          strokeWidth={2.2}
        />
      </button>

      <div
        className={`absolute left-0 top-[calc(100%+12px)] w-72 origin-top rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_48px_rgba(15,23,42,0.14)] transition-all ${
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-2 opacity-0"
        }`}
        role="menu"
      >
        {items.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={`flex items-start gap-3 rounded-xl px-3 py-3 transition ${
                active
                  ? "bg-[#003366]/8 text-[#003366]"
                  : "text-slate-700 hover:bg-slate-50 hover:text-slate-950"
              }`}
            >
              <span
                className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl ${
                  active ? "bg-[#003366]/12" : "bg-slate-100"
                }`}
              >
                <Icon className="h-4.5 w-4.5" strokeWidth={2.2} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  {item.description}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
