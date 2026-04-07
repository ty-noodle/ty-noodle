import { ClipboardList } from "lucide-react";
import { OrderDailyTable } from "@/components/orders/order-daily-table";
import { StoreDetailModal } from "@/components/orders/store-detail-modal";
import { SettingsShell } from "@/components/settings/settings-shell";
import { requireAppRole } from "@/lib/auth/authorization";
import { getOrderDailyData } from "@/lib/orders/admin";
import { getDeliveryList } from "@/lib/delivery/delivery-list";
import { normalizeOrderDate } from "@/lib/orders/date";
import type { DeliveredTodayRow } from "@/components/orders/delivered-today-section";

export const metadata = {
  title: "สรุปออเดอร์",
};

type OrdersPageProps = {
  searchParams: Promise<{
    date?: string;
    expanded?: string;
    q?: string;
  }>;
};

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const session = await requireAppRole("admin");
  const params = await searchParams;

  const orderDate = normalizeOrderDate(params.date);
  const q = params.q?.trim() ?? "";
  const expandedIds = params.expanded ? params.expanded.split(",").filter(Boolean) : [];
  // Mobile modal shows one store at a time
  const mobileExpandedId = expandedIds[0] ?? "";

  const [data, deliveredTodayData] = await Promise.all([
    getOrderDailyData(session.organizationId, {
      expandedIds,
      orderDate,
      searchTerm: q || null,
    }),
    getDeliveryList(session.organizationId, orderDate, orderDate, q || ""),
  ]);

  const deliveredToday: DeliveredTodayRow[] = deliveredTodayData.map((row) => ({
    customerId: row.customerId,
    customerName: row.customerName,
    customerCode: row.customerCode,
    deliveryDate: row.deliveryDate,
    deliveryNumbers: row.deliveryNotes.map((note) => note.deliveryNumber),
    deliveredAmount: row.deliveredAmount,
    itemCount: row.itemCount,
    orderNumbers: row.orderNumbers,
    notes: row.notes,
    lines: row.lines,
  }));

  return (
    <>
      <SettingsShell
        title="ออเดอร์"
        titleIcon={ClipboardList}
        description="สรุปออเดอร์รายร้านต่อวัน ดูรอบออเดอร์ รายการสินค้า และสต็อกได้ในหน้าเดียว"
        floatingSubmit={false}
      >
        <OrderDailyTable
          data={data}
          date={orderDate}
          expanded={expandedIds}
          q={q}
          deliveredToday={deliveredToday}
        />
      </SettingsShell>

      {/* Mobile full-screen store detail modal */}
      {mobileExpandedId && (
        <StoreDetailModal
          allStores={data.stores}
          date={orderDate}
          detail={data.expandedDetails[mobileExpandedId] ?? null}
          expandedId={mobileExpandedId}
          q={q}
        />
      )}
    </>
  );
}
