import { redirect } from "next/navigation";

export default function LegacyProductSettingsPage() {
  redirect("/settings/products");
}
