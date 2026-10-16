"use client";

import { useState } from "react";
import Link from "next/link";
import { PlusCircle, Search, Store } from "lucide-react";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";
import { CustomerForm } from "@/components/settings/customer-form";
import { CustomerListPanel } from "@/components/settings/customer-list-panel";
import { CustomerSettingsTabs } from "@/components/settings/customer-settings-tabs";
import { SettingsShell } from "@/components/settings/settings-shell";
import type { SettingsCustomer, SettingsVehicle } from "@/lib/settings/admin";

type SettingsCustomersPageClientProps = {
  initialCustomers: SettingsCustomer[];
  vehicles: SettingsVehicle[];
  nextCustomerCode: string;
  editingCustomer: SettingsCustomer | null;
  createParam?: string;
};

type CustomerSearchBoxProps = {
  onSearch: (value: string) => void;
  value: string;
};

function CustomerSearchBox({ onSearch, value }: CustomerSearchBoxProps) {
  return (
    <label className="relative block">
      <span className="sr-only">ค้นหาร้านค้า</span>
      <Search
        className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
        strokeWidth={2.2}
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onSearch(event.target.value)}
        placeholder="ค้นหาชื่อร้าน รหัส หรือที่อยู่..."
        className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-12 pr-4 text-base font-medium text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#003366]/30 focus:ring-4 focus:ring-[#003366]/10"
      />
    </label>
  );
}

export function SettingsCustomersPageClient({
  initialCustomers,
  vehicles,
  nextCustomerCode,
  editingCustomer,
  createParam,
}: SettingsCustomersPageClientProps) {
  const [searchTerm, setSearchTerm] = useState("");

  return (
    <SettingsShell
      current="customers"
      title="จัดการร้านค้า"
      titleIcon={Store}
      description="เพิ่มร้านค้า กำหนดที่อยู่ ผูกราคาขายเฉพาะราย และเลือกรถประจำร้านได้จากหน้านี้"
      floatingSubmit={false}
      searchPlaceholder="ค้นหาชื่อร้าน, รหัส หรือที่อยู่..."
      onSearch={setSearchTerm}
	    >
	      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6">
	        <CustomerSettingsTabs current="customers" />

	        <div className="hidden md:block">
	          <CustomerSearchBox value={searchTerm} onSearch={setSearchTerm} />
	        </div>
	
	        <CustomerListPanel 
	          customers={initialCustomers} 
          vehicles={vehicles} 
          reorderEnabled={true}
	          searchTerm={searchTerm}
	        />
	      </div>

	      <MobileSearchDrawer title="ค้นหาร้านค้า">
	        <CustomerSearchBox value={searchTerm} onSearch={setSearchTerm} />
	      </MobileSearchDrawer>
	
	      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+6.75rem)] z-30 flex justify-start px-4 md:bottom-8 md:justify-end md:px-8">
        <Link
          href="/settings/customers?create=1"
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-[#003366] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(0,51,102,0.32)] transition hover:bg-[#002244]"
        >
          <PlusCircle className="h-4 w-4" strokeWidth={2.2} />
          เพิ่มร้านค้า
        </Link>
      </div>

      {createParam === "1" ? (
        <CustomerForm
          defaultCode={nextCustomerCode}
          returnHref="/settings/customers"
          vehicles={vehicles}
        />
      ) : null}
      {editingCustomer ? (
        <CustomerForm
          initialCustomer={editingCustomer}
          returnHref="/settings/customers"
          vehicles={vehicles}
        />
      ) : null}
    </SettingsShell>
  );
}
