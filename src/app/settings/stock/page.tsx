import { redirect } from "next/navigation";

type LegacySettingsStockPageProps = {
  searchParams: Promise<{
    receive?: string;
  }>;
};

export default async function LegacySettingsStockPage({
  searchParams,
}: LegacySettingsStockPageProps) {
  const params = await searchParams;
  const nextUrl = params.receive === "1" ? "/stock?receive=1" : "/stock";

  redirect(nextUrl);
}
