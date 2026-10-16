import { redirect } from "next/navigation";

export default function LegacySettingsIndexPage() {
  redirect("/settings/products");
}
