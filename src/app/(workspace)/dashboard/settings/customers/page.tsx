import { redirect } from "next/navigation";

export default function LegacyCustomerSettingsPage() {
  redirect("/settings/customers");
}
