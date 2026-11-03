import { requireAppRole } from "@/lib/auth/authorization";
import { getSettingsDataFresh } from "@/lib/settings/admin";
import { SettingsCustomersPageClient } from "./settings-customers-client";

export const metadata = {
  title: "จัดการร้านค้า",
};

type SettingsCustomersPageProps = {
  searchParams: Promise<{
    create?: string;
    edit?: string;
  }>;
};

export default async function SettingsCustomersPage({
  searchParams,
}: SettingsCustomersPageProps) {
  const session = await requireAppRole("admin");
  const data = await getSettingsDataFresh(session.organizationId);
  const params = await searchParams;
  const editingCustomer =
    data.customers.find((customer) => customer.id === params.edit) ?? null;

  return (
    <SettingsCustomersPageClient
      initialCustomers={data.customers}
      vehicles={data.vehicles}
      nextCustomerCode={data.nextCustomerCode}
      editingCustomer={editingCustomer}
      createParam={params.create}
    />
  );
}
