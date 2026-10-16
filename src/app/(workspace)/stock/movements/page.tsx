import { StockMobileReceiveButton } from "@/components/settings/stock-list";
import { StockMovementTable } from "@/components/settings/stock-movement-table";
import { StockReceiveForm } from "@/components/settings/stock-receive-form";

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
  const data = await getStockDashboardData(session.organizationId, 50);
  const params = await searchParams;

  return (
    <>
      {data.setupHint ? (
        <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          {data.setupHint} กรุณารัน migration `202603161100_inventory_stock_receipts_and_movements.sql`
          ก่อนใช้งานหน้าสต็อก
        </div>
      ) : null}



      <div className="mt-8">
        <StockMovementTable initialMovementRows={data.movementRows} />
      </div>

      <StockMobileReceiveButton baseHref="/stock/movements" />
      <div className="h-20 sm:hidden" />

      {params.receive === "1" ? (
        <StockReceiveForm 
          products={data.products} 
          suppliers={data.suppliers}
          returnHref="/stock/movements" 
        />
      ) : null}
    </>
  );
}
