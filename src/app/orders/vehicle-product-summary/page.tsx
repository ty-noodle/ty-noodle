import { Suspense } from "react";
import { AutoPrint, PackingListPrintButton } from "@/app/orders/packing-list/preview/print-button";
import { PageLoader } from "@/components/page-loader";
import { MobilePinchZoom } from "@/components/print/mobile-pinch-zoom";
import { VehicleProductSummaryLayout } from "@/components/print/vehicle-product-summary-layout";
import { requireAnyRole } from "@/lib/auth/authorization";
import { getVehicleProductSummaryData } from "@/lib/orders/vehicle-product-summary";

export const metadata = { title: "สรุปสินค้าตามรถ" };

type Props = {
  searchParams: Promise<{
    date?: string;
    endDate?: string;
    autoprint?: string;
  }>;
};

export default async function VehicleProductSummaryWrapper({ searchParams }: Props) {
  return (
    <Suspense fallback={<PageLoader />}>
      <VehicleProductSummaryPage searchParams={searchParams} />
    </Suspense>
  );
}

async function VehicleProductSummaryPage({ searchParams }: Props) {
  const session = await requireAnyRole(["admin", "warehouse"]);
  const params = await searchParams;
  const date = params.date ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
  const endDate = params.endDate ?? date;
  const autoprint = params.autoprint === "1";

  const summaryData = await getVehicleProductSummaryData(session.organizationId, date, endDate);
  const hasData = summaryData.products.length > 0;

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
        <span style={{ fontSize: "15px", fontWeight: 800, color: "#003366" }}>สรุปสินค้าตามรถ</span>
        <span className="vehicle-summary-toolbar__meta" style={{ fontSize: "13px", color: "#64748b", fontWeight: 700 }}>
          {summaryData.dateLabel} · {summaryData.vehicles.length} รถ
        </span>
        <div className="vehicle-summary-toolbar__actions" style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "nowrap" }}>
          <PackingListPrintButton
            unassignedStores={[]}
            dateLabel={summaryData.dateLabel}
            hidePrintOnMobile={false}
            documentTitle="สรุปสินค้าตามรถ"
            printButtonText="พิมพ์ฟอร์มสรุปตามรถ"
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
            <VehicleProductSummaryLayout data={summaryData} />
          </MobilePinchZoom>
        </div>
      )}
    </>
  );
}
