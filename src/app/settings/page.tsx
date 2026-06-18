import Link from "next/link";
import {
  ArrowRight,
  Clock3,
  Factory,
  KeyRound,
  MessageCircleMore,
  Package2,
  Store,
  Truck,
} from "lucide-react";
import { SettingsShell } from "@/components/settings/settings-shell";
import { requireAppRole } from "@/lib/auth/authorization";

const options = [
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
    description: "เพิ่มรายชื่อผู้ขายหรือโรงงานที่ใช้สั่งซื้อสินค้าเพื่อบันทึกรับเข้าสินค้า",
    href: "/settings/suppliers",
    icon: Factory,
    label: "จัดการผู้ขาย",
  },
  {
    description: "ดูชื่อ LINE รูปโปรไฟล์ สถานะการใช้งาน และจัดการสิทธิ์ลูกค้าที่เข้าผ่าน LINE",
    href: "/settings/customer-data",
    icon: MessageCircleMore,
    label: "ข้อมูลลูกค้า",
  },
  {
    description: "เพิ่มรถส่งของและผูกกับร้านค้าเพื่อใช้ต่อยอดงานจัดส่ง",
    href: "/settings/vehicles",
    icon: Truck,
    label: "จัดการรถ",
  },
  {
    description: "ตั้งเวลาเปิด-ปิดรับออเดอร์ และจัดการการแจ้งเตือนออเดอร์ใหม่",
    href: "/settings/order-window",
    icon: Clock3,
    label: "เวลารับออเดอร์และแจ้งเตือน",
  },
  {
    description: "เปลี่ยนรหัสเข้าใช้งานและดูประวัติการเข้าใช้งานล่าสุด",
    href: "/settings/login-pin",
    icon: KeyRound,
    label: "ตั้งค่า PIN",
  },
] as const;

export default async function SettingsIndexPage() {
  await requireAppRole("admin");

  return (
    <SettingsShell
      title="ตั้งค่า"
      description="เลือกหมวดการตั้งค่าที่ต้องการจัดการต่อได้จากหน้านี้"
      floatingSubmit={false}
    >
      <div className="grid gap-4 md:grid-cols-2 lg:gap-5 xl:grid-cols-5">
        {options.map((option) => {
          const Icon = option.icon;

          return (
            <Link
              key={option.href}
              href={option.href}
              className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-[#003366]/30 hover:shadow-[0_24px_60px_rgba(0,51,102,0.08)] sm:p-6"
            >
              <div className="flex items-center gap-4 sm:flex-col sm:items-start sm:gap-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#003366]/10 text-[#003366]">
                  <Icon className="h-6 w-6" strokeWidth={2.2} />
                </div>
                <h2 className="text-lg font-bold text-slate-950 sm:text-xl">{option.label}</h2>
              </div>

              <p className="mt-3 text-sm leading-7 text-slate-500 sm:mt-2">{option.description}</p>

              <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#003366] sm:mt-5">
                ไปยังหน้านี้
                <ArrowRight
                  className="h-4 w-4 transition group-hover:translate-x-1"
                  strokeWidth={2.2}
                />
              </span>
            </Link>
          );
        })}
      </div>
    </SettingsShell>
  );
}
