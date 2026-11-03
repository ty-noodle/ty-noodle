import { requireAppRole } from "@/lib/auth/authorization";
import type { CustomerPriceGroup } from "@/components/settings/customer-price-panel";
import { getSettingsDataFresh } from "@/lib/settings/admin";
import { SettingsCustomerPricingPageClient } from "./settings-pricing-client";

export const metadata = {
  title: "ผูกราคาสินค้า",
};

export default async function SettingsCustomerPricingPage() {
  const session = await requireAppRole("admin");
  const data = await getSettingsDataFresh(session.organizationId);

  const priceGroups: CustomerPriceGroup[] = data.customers.map((customer) => ({
    customerId: customer.id,
    customerCode: customer.code,
    customerName: customer.name,
    sortOrder: customer.sortOrder,
    prices: data.prices.filter((p) => p.customerId === customer.id),
  }));

  return (
    <SettingsCustomerPricingPageClient
      priceGroups={priceGroups}
      saleUnits={data.saleUnits}
      totalPricesCount={data.prices.length}
    />
  );
}
