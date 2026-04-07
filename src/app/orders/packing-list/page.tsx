import { requireAnyRole } from "@/lib/auth/authorization";
import { getAllDeliveryNotesPrintDataForDate } from "@/lib/delivery/print";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { PackingListLayout, type PackingListData, type PackingListVehicle } from "@/components/print/packing-list-layout";
import { PackingListPrintButton } from "./preview/print-button";

export const metadata = { title: "ใบจัดของ" };

type Props = { searchParams: Promise<{ date?: string }> };

export default async function PackingListPage({ searchParams }: Props) {
  const session = await requireAnyRole(["admin", "warehouse"]);
  const params = await searchParams;
  const date = params.date ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });

  const dateLabel = new Intl.DateTimeFormat("th-TH", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok",
  }).format(new Date(date + "T00:00:00"));

  const [dns, vehicleRows] = await Promise.all([
    getAllDeliveryNotesPrintDataForDate(session.organizationId, date),
    getSupabaseAdmin()
      .from("vehicles")
      .select("id, name")
      .eq("organization_id", session.organizationId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  const vehicles: PackingListVehicle[] = (vehicleRows.data ?? []).map(
    (v: { id: string; name: string }) => ({ id: v.id, name: v.name })
  );

  // ─── Build matrix ──────────────────────────────────────────────────────────

  const stores = dns.map((dn) => ({
    id: dn.customer.code,
    name: dn.customer.name,
    vehicleId: dn.customer.vehicleId,
    vehicleName: dn.customer.vehicleName,
  }));

  // Collect unique products ordered by first appearance: key = "sku||unit"
  const productMap = new Map<string, { sku: string; name: string; unit: string }>();
  for (const dn of dns) {
    for (const item of dn.items) {
      const key = `${item.productSku.trim().toLowerCase()}||${item.saleUnitLabel.trim().toLowerCase()}`;
      if (!productMap.has(key)) {
        productMap.set(key, {
          sku: item.productSku,
          name: item.productName,
          unit: item.saleUnitLabel,
        });
      }
    }
  }

  const products = Array.from(productMap.entries()).map(([key, p]) => ({ key, ...p }));

  // Build qty matrix [productIdx][storeIdx]
  const qty: number[][] = products.map((product) =>
    dns.map((dn) => {
      const item = dn.items.find((it) => {
        const k = `${it.productSku.trim().toLowerCase()}||${it.saleUnitLabel.trim().toLowerCase()}`;
        return k === product.key;
      });
      return item?.quantityDelivered ?? 0;
    })
  );

  const unassignedStores = stores
    .filter((s) => s.vehicleId === null)
    .map((s) => s.name);

  const data: PackingListData = {
    date,
    dateLabel,
    organizationName: dns[0]?.organization.name ?? "T&Y Noodle",
    stores,
    products,
    qty,
    vehicles,
  };

  return (
    <>
      <div className="no-print" style={{
        display: "flex", gap: "12px", alignItems: "center",
        background: "white", padding: "10px 16px", borderRadius: "12px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        position: "fixed", top: "16px", left: "50%", transform: "translateX(-50%)",
        zIndex: 50, fontFamily: "Sarabun, sans-serif",
      }}>
        <span style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a5f" }}>
          ใบจัดของ
        </span>
        <span style={{ fontSize: "12px", color: "#64748b" }}>
          {dateLabel} · {stores.length} ร้าน · {products.length} รายการ
        </span>
        <PackingListPrintButton unassignedStores={unassignedStores} />
        <a href="/delivery" style={{ fontSize: "13px", color: "#475569", textDecoration: "none" }}>
          กลับ
        </a>
      </div>

      {dns.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", paddingTop: "80px", fontFamily: "Sarabun, sans-serif" }}>
          <p style={{ fontSize: "18px", fontWeight: 600, color: "#64748b" }}>ไม่มีข้อมูลการส่งในวันที่เลือก</p>
          <p style={{ fontSize: "14px", color: "#94a3b8" }}>{dateLabel}</p>
          <a href="/delivery" style={{ marginTop: "8px", color: "#1e3a5f", fontSize: "14px" }}>กลับหน้า Delivery</a>
        </div>
      ) : (
        <div style={{ marginTop: "72px" }}>
          <PackingListLayout data={data} />
        </div>
      )}
    </>
  );
}
