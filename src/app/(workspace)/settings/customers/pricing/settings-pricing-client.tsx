"use client";

import { useState } from "react";
import {
  CustomerPricePanel,
  type CustomerPriceGroup,
} from "@/components/settings/customer-price-panel";
import { CustomerSettingsTabs } from "@/components/settings/customer-settings-tabs";
import { SettingsShell } from "@/components/settings/settings-shell";
import { SettingsPanel, SettingsPanelBody } from "@/components/settings/settings-ui";
import { PackageSearch } from "lucide-react";
import type { SettingsSaleUnitOption } from "@/lib/settings/admin";

type SettingsCustomerPricingPageClientProps = {
  priceGroups: CustomerPriceGroup[];
  saleUnits: SettingsSaleUnitOption[];
  totalPricesCount: number;
};

export function SettingsCustomerPricingPageClient({
  priceGroups,
  saleUnits,
  totalPricesCount,
}: SettingsCustomerPricingPageClientProps) {
  const [searchTerm, setSearchTerm] = useState("");

  return (
    <SettingsShell
      current="customers"
      title="ผูกราคาสินค้า"
      titleIcon={PackageSearch}
      description="ตั้งค่าราคาขายเฉพาะรายร้านได้จากที่นี่ กดที่ร้านค้าเพื่อดูและจัดการราคา"
      floatingSubmit={false}
      showSearch={true}
      searchPlaceholder="ค้นหาร้านค้า หรือ สินค้า..."
      onSearch={setSearchTerm}
    >
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6">
        <CustomerSettingsTabs current="pricing" />

        <SettingsPanel>
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <PackageSearch className="h-5 w-5 text-[#003366]" strokeWidth={2.2} />
              <h2 className="text-xl font-semibold text-slate-900">สินค้าที่ผูกราคากับร้าน</h2>
              <span className="ml-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-slate-500">
                {totalPricesCount}
              </span>
            </div>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              ตั้งค่าราคาขายเฉพาะรายร้านได้จากที่นี่ กดที่ร้านค้าเพื่อดูและจัดการราคา
            </p>
          </div>
          <SettingsPanelBody className="p-4 md:p-6">
            <CustomerPricePanel 
              groups={priceGroups} 
              saleUnits={saleUnits} 
              externalSearch={searchTerm}
            />
          </SettingsPanelBody>
        </SettingsPanel>
      </div>
    </SettingsShell>
  );
}
