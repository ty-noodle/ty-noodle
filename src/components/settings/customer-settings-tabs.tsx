import Link from "next/link";

type CustomerSettingsTabsProps = {
  current: "customers" | "pricing";
};

const tabs = [
  {
    href: "/settings/customers",
    key: "customers",
    label: "รายชื่อร้านค้า",
  },
  {
    href: "/settings/customers/pricing",
    key: "pricing",
    label: "ผูกราคาสินค้า",
  },
] as const;

export function CustomerSettingsTabs({ current }: CustomerSettingsTabsProps) {
  return (
    <div className="flex rounded-2xl border border-slate-200 bg-white p-1 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
      {tabs.map((tab) => {
        const isActive = current === tab.key;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex-1 rounded-[1rem] px-4 py-2.5 text-center text-sm font-medium transition ${
              isActive
                ? "bg-[#003366] text-white shadow-[0_10px_24px_rgba(0,51,102,0.24)]"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
