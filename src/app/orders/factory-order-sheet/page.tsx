import { Suspense } from "react";
import { AutoPrint, PackingListPrintButton } from "@/app/orders/packing-list/preview/print-button";
import { PageLoader } from "@/components/page-loader";
import { FactoryOrderSheetLayout } from "@/components/print/factory-order-sheet-layout";
import { MobilePinchZoom } from "@/components/print/mobile-pinch-zoom";
import { requireAnyRole } from "@/lib/auth/authorization";
import { getVehicleProductSummaryData, VehicleSummaryProduct } from "@/lib/orders/vehicle-product-summary";

export const metadata = { title: "พิมพ์ใบสั่งของ (โรงงานอนามัย)" };

type Props = {
  searchParams: Promise<{
    date?: string;
    endDate?: string;
    autoprint?: string;
  }>;
};

export default async function FactoryOrderSheetWrapper({ searchParams }: Props) {
  return (
    <Suspense fallback={<PageLoader />}>
      <FactoryOrderSheetPage searchParams={searchParams} />
    </Suspense>
  );
}

async function FactoryOrderSheetPage({ searchParams }: Props) {
  const session = await requireAnyRole(["admin", "warehouse"]);
  const params = await searchParams;
  const date = params.date ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
  const endDate = params.endDate ?? date;
  const autoprint = params.autoprint === "1";

  // Fetch full vehicle summary data
  const summaryData = await getVehicleProductSummaryData(session.organizationId, date, endDate);

  // Target product SKUs for the factory order sheet
  const TARGET_SKUS = new Set([
    "TYN036",
    "TYN037",
    "TYN014",
    "TYN015",
    "TYN010",
    "TYN011",
    "TYN012",
    "TYN006",
    "TYN013",
    "TYN056",
    "TYN057",
  ]);

  // Filter products and their matching quantity rows
  const filteredProducts: VehicleSummaryProduct[] = [];
  const filteredQty: number[][] = [];

  summaryData.products.forEach((product, index) => {
    if (product.sku && TARGET_SKUS.has(product.sku.trim().toUpperCase())) {
      filteredProducts.push(product);
      filteredQty.push(summaryData.qty[index]);
    }
  });

  const filteredSummaryData = {
    ...summaryData,
    products: filteredProducts,
    qty: filteredQty,
  };

  const hasData = filteredSummaryData.products.length > 0;

  return (
    <>
      {autoprint ? <AutoPrint /> : null}

      <style>{`
        @media screen and (max-width: 767px) {
          .vehicle-summary-toolbar {
            position: sticky !important;
            top: 8px !important;
            left: auto !important;
            transform: none !important;
            z-index: 80 !important;
            width: calc(100vw - 12px) !important;
            max-width: calc(100vw - 12px) !important;
            margin: 8px 6px 0 !important;
            padding: 8px 10px !important;
            gap: 8px !important;
            justify-content: space-between !important;
          }

          .vehicle-summary-toolbar__meta {
            display: none !important;
          }

          .vehicle-summary-toolbar__actions {
            min-width: 0;
          }

          .vehicle-summary-page .packing-print-container {
            padding-top: 8px !important;
          }
        }
      `}</style>

      <div
        className="no-print vehicle-summary-toolbar"
        style={{
          display: "flex",
          gap: "12px",
          alignItems: "center",
          background: "white",
          padding: "10px 14px",
          borderRadius: "14px",
          boxShadow: "0 10px 26px rgba(0,0,0,0.12)",
          position: "fixed",
          top: "12px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 100,
          fontFamily: 'var(--font-sukhumvit), "Sukhumvit Set", "Noto Sans Thai", sans-serif',
          width: "max-content",
          maxWidth: "calc(100vw - 24px)",
          border: "1px solid rgba(15,23,42,0.06)",
        }}
      >
        <span style={{ fontSize: "15px", fontWeight: 800, color: "#003366" }}>ใบสั่งของ (โรงงานอนามัย)</span>
        <span className="vehicle-summary-toolbar__meta" style={{ fontSize: "13px", color: "#64748b", fontWeight: 700 }}>
          {filteredSummaryData.dateLabel} · {filteredSummaryData.vehicles.length} รถ
        </span>
        <div className="vehicle-summary-toolbar__actions" style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "nowrap" }}>
          <PackingListPrintButton
            unassignedStores={[]}
            dateLabel={filteredSummaryData.dateLabel}
            hidePrintOnMobile={false}
            documentTitle="ใบสั่งของ"
            printButtonText="พิมพ์ใบสั่งของ"
          />
        </div>
        <a
          href="/orders/incoming"
          style={{
            fontSize: "13px",
            fontWeight: 700,
            color: "#ef4444",
            textDecoration: "none",
            marginLeft: "4px",
            padding: "6px 12px",
            borderRadius: "8px",
            background: "#fef2f2",
          }}
        >
          กลับ
        </a>
      </div>

      {!hasData ? (
        <div
          className="vehicle-summary-page"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
            paddingTop: "120px",
            fontFamily: 'var(--font-sukhumvit), "Sukhumvit Set", "Noto Sans Thai", sans-serif',
          }}
        >
          <p style={{ fontSize: "18px", fontWeight: 600, color: "#64748b" }}>ไม่มีข้อมูลสินค้าสำหรับการแสดงฟอร์มนี้</p>
          <a href="/orders/incoming" style={{ marginTop: "8px", color: "#1e3a5f", fontSize: "14px" }}>
            กลับหน้ารายการออเดอร์
          </a>
        </div>
      ) : (
        <div className="vehicle-summary-page">
          <MobilePinchZoom className="packing-print-container">
            <FactoryOrderSheetLayout data={filteredSummaryData} />
          </MobilePinchZoom>
        </div>
      )}
    </>
  );
}
