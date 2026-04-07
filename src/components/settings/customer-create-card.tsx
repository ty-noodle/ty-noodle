import Link from "next/link";
import { Plus } from "lucide-react";
import { SettingsPanel } from "@/components/settings/settings-ui";

export function CustomerCreateCard() {
  return (
    <SettingsPanel>
      <div className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">เพิ่มร้านค้า</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            สร้างข้อมูลร้านค้าใหม่ กำหนดที่อยู่ และตั้งค่ารถประจำร้านได้ในครั้งเดียว
          </p>
        </div>

        <Link
          href="/settings/customers?create=1"
          className="inline-flex items-center gap-2 rounded-full bg-[#003366] px-4 py-2.5 text-sm font-medium text-white shadow-[0_12px_28px_rgba(0,51,102,0.22)] transition hover:bg-[#002244]"
        >
          <Plus className="h-4 w-4" strokeWidth={2.2} />
          เพิ่มร้านค้า
        </Link>
      </div>
    </SettingsPanel>
  );
}
