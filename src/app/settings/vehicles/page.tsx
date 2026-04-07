import Link from "next/link";
import { Plus, Truck } from "lucide-react";
import { VehicleForm } from "@/components/settings/vehicle-form";
import { VehicleListPanel } from "@/components/settings/vehicle-list-panel";
import { SettingsShell } from "@/components/settings/settings-shell";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSettingsData } from "@/lib/settings/admin";

export const metadata = {
  title: "จัดการรถ",
};

type SettingsVehiclesPageProps = {
  searchParams: Promise<{
    create?: string;
    edit?: string;
  }>;
};

export default async function SettingsVehiclesPage({
  searchParams,
}: SettingsVehiclesPageProps) {
  const session = await requireAppRole("admin");
  const data = await getSettingsData(session.organizationId);
  const params = await searchParams;
  const editingVehicle = params.edit
    ? (data.vehicles.find((vehicle) => vehicle.id === params.edit) ?? null)
    : null;

  return (
    <SettingsShell
      current="vehicles"
      title="จัดการรถ"
      titleIcon={Truck}
      description="เพิ่มรถส่งของแบบง่ายสำหรับผูกเป็นรถประจำร้าน และเตรียมต่อยอดไปงานจัดส่งในอนาคต"
      floatingSubmit={false}
    >
      <div className="mx-auto flex w-full max-w-[1024px] flex-col gap-8">
        <section className="rounded-[1.75rem] border border-slate-200 bg-white px-6 py-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">เพิ่มรถส่งของ</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                บันทึกชื่อรถไว้ครั้งเดียว แล้วเลือกผูกเป็นรถประจำร้านได้จากหน้าจัดการร้านค้า
              </p>
            </div>

            <Link
              href="/settings/vehicles?create=1"
              className="inline-flex items-center gap-2 rounded-full bg-[#003366] px-4 py-2.5 text-sm font-medium text-white shadow-[0_12px_28px_rgba(0,51,102,0.22)] transition hover:bg-[#002244]"
            >
              <Plus className="h-4 w-4" strokeWidth={2.2} />
              เพิ่มรถ
            </Link>
          </div>
        </section>

        <VehicleListPanel vehicles={data.vehicles} />
      </div>

      {params.create === "1" ? <VehicleForm returnHref="/settings/vehicles" /> : null}
      {editingVehicle ? (
        <VehicleForm initialVehicle={editingVehicle} returnHref="/settings/vehicles" />
      ) : null}
    </SettingsShell>
  );
}
