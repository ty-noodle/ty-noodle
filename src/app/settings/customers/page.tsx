import Link from "next/link";
import { PlusCircle, Store } from "lucide-react";
import { CustomerForm } from "@/components/settings/customer-form";
import { CustomerListPanel } from "@/components/settings/customer-list-panel";
import { CustomerSettingsTabs } from "@/components/settings/customer-settings-tabs";
import { SettingsShell } from "@/components/settings/settings-shell";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSettingsData } from "@/lib/settings/admin";

export const metadata = {
  title: "จัดการร้านค้า",
};

type SettingsCustomersPageProps = {
  searchParams: Promise<{
    create?: string;
  }>;
};

export default async function SettingsCustomersPage({
  searchParams,
}: SettingsCustomersPageProps) {
  const session = await requireAppRole("admin");
  const data = await getSettingsData(session.organizationId);
  const params = await searchParams;

  return (
    <SettingsShell
      current="customers"
      title="จัดการร้านค้า"
      titleIcon={Store}
      description="เพิ่มร้านค้า กำหนดที่อยู่ ผูกราคาขายเฉพาะราย และเลือกรถประจำร้านได้จากหน้านี้"
      floatingSubmit={false}
    >
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6">
        <CustomerSettingsTabs current="customers" />

        <CustomerListPanel customers={data.customers} vehicles={data.vehicles} />
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-end px-4 md:bottom-6 md:px-6">
        <Link
          href="/settings/customers?create=1"
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-[#003366] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(0,51,102,0.32)] transition hover:bg-[#002244]"
        >
          <PlusCircle className="h-4 w-4" strokeWidth={2.2} />
          เพิ่มร้านค้า
        </Link>
      </div>

      {params.create === "1" ? (
        <CustomerForm
          defaultCode={data.nextCustomerCode}
          returnHref="/settings/customers"
          vehicles={data.vehicles}
        />
      ) : null}
    </SettingsShell>
  );
}
