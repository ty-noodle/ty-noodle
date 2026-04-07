import Link from "next/link";

type AdminSettingsNavProps = {
  current: "customers" | "products";
};

const links = [
  {
    description: "จัดการสินค้า รูปสินค้า และต้นทุนในหน้าเดียว",
    href: "/settings/products",
    id: "products",
    label: "สินค้า",
  },
  {
    description: "จัดการร้านค้า พร้อมตั้งราคาขายเฉพาะรายร้าน",
    href: "/settings/customers",
    id: "customers",
    label: "ร้านค้า",
  },
] as const;

export function AdminSettingsNav({ current }: AdminSettingsNavProps) {
  return (
    <nav className="grid gap-4 lg:grid-cols-2">
      {links.map((link) => {
        const active = link.id === current;

        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-3xl border px-5 py-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)] transition ${
              active
                ? "border-accent-500 bg-[linear-gradient(135deg,#f8fbff_0%,#eef4ff_100%)]"
                : "border-slate-200 bg-white hover:border-accent-300 hover:bg-slate-50"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-base font-bold text-slate-950">{link.label}</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">{link.description}</p>
              </div>
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                  active ? "bg-accent-600 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {active ? "หน้าปัจจุบัน" : "เปิดหน้า"}
              </span>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
