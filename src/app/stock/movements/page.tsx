import { Warehouse } from "lucide-react";
import { StockMovementTable } from "@/components/settings/stock-movement-table";
import { StockReceiveForm } from "@/components/settings/stock-receive-form";
import { StockSummaryCards } from "@/components/settings/stock-summary-cards";
import { StockTabs } from "@/components/settings/stock-tabs";
import { SettingsShell } from "@/components/settings/settings-shell";
import { requireAppRole } from "@/lib/auth/authorization";
import { getStockDashboardData } from "@/lib/stock/admin";

export const metadata = {
  title: "เคลื่อนไหวสต็อก",
};

type StockMovementsPageProps = {
  searchParams: Promise<{
    receive?: string;
  }>;
};

export default async function StockMovementsPage({
  searchParams,
}: StockMovementsPageProps) {
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
      <StockTabs current="movements" />

      <div className="mt-8">
        <StockMovementTable movementRows={data.movementRows} />
      </div>

      {params.receive === "1" ? (
        <StockReceiveForm products={data.products} returnHref="/stock/movements" />
      ) : null}
    </SettingsShell>
  );
}
