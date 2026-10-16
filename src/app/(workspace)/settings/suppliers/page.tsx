import { requireAppRole } from "@/lib/auth/authorization";
import { getSettingsData } from "@/lib/settings/admin";
import { SettingsSuppliersPageClient } from "./settings-suppliers-client";

export const metadata = {
  title: "จัดการผู้ขาย",
};

type SettingsSuppliersPageProps = {
  searchParams: Promise<{
    create?: string;
    edit?: string;
  }>;
};

export default async function SettingsSuppliersPage({
  searchParams,
}: SettingsSuppliersPageProps) {
  const session = await requireAppRole("admin");
  const data = await getSettingsData(session.organizationId);
  const params = await searchParams;
  const editingSupplier = data.suppliers.find((s) => s.id === params.edit) ?? null;

  return (
    <SettingsSuppliersPageClient
      initialSuppliers={data.suppliers}
      nextSupplierCode={data.nextSupplierCode}
      editingSupplier={editingSupplier}
      createParam={params.create}
    />
  );
}
