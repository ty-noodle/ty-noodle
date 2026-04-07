import { Warehouse } from "lucide-react";
import { StockReceiveForm } from "@/components/settings/stock-receive-form";
import { StockList } from "@/components/settings/stock-list";
import { StockSummaryCards } from "@/components/settings/stock-summary-cards";
import { StockTabs } from "@/components/settings/stock-tabs";
import { SettingsShell } from "@/components/settings/settings-shell";
import { requireAppRole } from "@/lib/auth/authorization";
import { getStockDashboardData } from "@/lib/stock/admin";

export const metadata = {
  title: "จัดการสต็อก",
};

type StockPageProps = {
  searchParams: Promise<{
    receive?: string;
    product?: string;
  }>;
};

export default async function StockPage({ searchParams }: StockPageProps) {
  const session = await requireAppRole("admin");
  const data = await getStockDashboardData(session.organizationId);
  const params = await searchParams;

  return (
    <SettingsShell
      title="จัดการสต็อก"
      titleIcon={Warehouse}
      description="ดูของคงเหลือ รับเข้าสินค้าจากโรงงาน และติดตามข้อมูลสต็อกจากหน้ากลุ่มนี้"
      floatingSubmit={false}
    >
      {data.setupHint ? (
        <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          {data.setupHint} กรุณารัน migration `202603161100_inventory_stock_receipts_and_movements.sql`
          ก่อนใช้งานหน้าสต็อก
        </div>
      ) : null}

      <StockSummaryCards data={data} />
      <StockTabs current="stock" />

      <div className="mt-8">
        <div className="-mx-4 md:mx-0">
          <StockList products={data.products} baseHref="/stock" />
        </div>
      </div>

      {params.receive === "1" ? (
        <StockReceiveForm
          products={data.products}
          returnHref="/stock"
          defaultProductId={params.product ?? ""}
        />
      ) : null}
    </SettingsShell>
  );
}
