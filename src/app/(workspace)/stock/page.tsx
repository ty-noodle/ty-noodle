import { StockList } from "@/components/settings/stock-list";
import { requireAppRole } from "@/lib/auth/authorization";
import { getStockDashboardData } from "@/lib/stock/admin";

export const metadata = {
  title: "จัดการสต็อก",
};

export default async function StockPage() {
  const session = await requireAppRole("admin");
  const data = await getStockDashboardData(session.organizationId);

  return (
    <>
      {data.setupHint ? (
        <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          {data.setupHint} กรุณารัน migration `202603161100_inventory_stock_receipts_and_movements.sql`
          ก่อนใช้งานหน้าสต็อก
        </div>
      ) : null}

      <div className="mt-8">
        <div className="-mx-3 md:mx-0">
          <StockList 
            products={data.products} 
            suppliers={data.suppliers}
            baseHref="/stock" 
          />
        </div>
      </div>
    </>
  );
}
