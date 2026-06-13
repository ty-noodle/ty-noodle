import type { DeliveryNotePrintData } from "@/lib/delivery/print";
import {
  HALF_SHEET_HEIGHT_MM,
  NOTE_PADDING,
  PRINT_ORGANIZATION_NAME,
  PrintCustomerRow,
  PrintDocHeader,
  PrintSignatureBlock,
  PrintTotalRow,
  SHEET_WIDTH_MM,
  chunkItems,
  fmt,
  fmtQty,
} from "@/components/print/print-shared";

const ITEMS_PER_NOTE_PAGE = 10;
const THIN_LINE = "1px solid #000";
const THIN_MUTED_LINE = "1px solid #000";

type DeliveryNotePage = {
  key: string;
  dn: DeliveryNotePrintData;
  items: DeliveryNotePrintData["items"];
  pageIndex: number;
  totalPages: number;
  isLastPage: boolean;
};

type Props = {
  dns: DeliveryNotePrintData[];
  showIntermediateFooter?: boolean;
};

function buildNotePages(dns: DeliveryNotePrintData[]) {
  return dns.flatMap<DeliveryNotePage>((dn) => {
    const pages = chunkItems(dn.items, ITEMS_PER_NOTE_PAGE);
    const totalPages = pages.length;

    return pages.map((items, pageIndex) => ({
      key: `${dn.deliveryNumber}-${pageIndex + 1}`,
      dn,
      items,
      pageIndex,
      totalPages,
      isLastPage: pageIndex === totalPages - 1,
    }));
  });
}

function DeliveryNotePageView({
  notePage,
  showIntermediateFooter = false,
}: {
  notePage: DeliveryNotePage;
  showIntermediateFooter?: boolean;
}) {
  const { dn, items, pageIndex, totalPages, isLastPage } = notePage;
  const headerCellBase = {
    color: "black",
    borderBottom: THIN_LINE,
    whiteSpace: "nowrap" as const,
  };

  function renderHeaderLabel(label: string) {
    return (
      <span
        style={{
          display: "inline-block",
          paddingBottom: "0.2mm",
          lineHeight: 1.1,
        }}
      >
        {label}
      </span>
    );
  }

  return (
    <div
      className="note-slot__content"
      style={{
        fontFamily: "'Sarabun', sans-serif",
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <PrintDocHeader
        orgName={PRINT_ORGANIZATION_NAME}
        orgAddress={dn.organization.address}
        orgPhone={dn.organization.phone}
        title="ใบส่งของ"
        pageLabel={totalPages > 1 ? `หน้า ${pageIndex + 1}/${totalPages}` : undefined}
        dividerStyle="none"
        docMetaFontSize="11.8pt"
      />

      <PrintCustomerRow
        customer={dn.customer}
        docNumber={dn.deliveryNumber}
        docDate={dn.deliveryDate}
        docMetaFontSize="11.8pt"
      />

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "11.8pt",
          marginBottom: "1mm",
        }}
      >
        <thead>
          <tr>
            <th style={{ ...headerCellBase, borderTop: THIN_LINE, padding: "1mm 2mm", textAlign: "center", width: "6mm" }}>
              {renderHeaderLabel("ลำดับ")}
            </th>
            <th style={{ ...headerCellBase, borderTop: THIN_LINE, padding: "1mm 2mm", textAlign: "center", width: "20mm" }}>
              {renderHeaderLabel("รหัสสินค้า")}
            </th>
            <th style={{ ...headerCellBase, borderTop: THIN_LINE, padding: "1mm 1mm", textAlign: "left" }}>
              {renderHeaderLabel("รายการสินค้า")}
            </th>
            <th style={{ ...headerCellBase, borderTop: THIN_LINE, padding: "1mm 2mm", textAlign: "center", width: "12mm" }}>
              {renderHeaderLabel("จำนวน")}
            </th>
            <th style={{ ...headerCellBase, borderTop: THIN_LINE, padding: "1mm 2mm", textAlign: "center", width: "10mm" }}>
              {renderHeaderLabel("หน่วย")}
            </th>
            <th style={{ ...headerCellBase, borderTop: THIN_LINE, padding: "1mm 2mm", textAlign: "right", width: "22mm" }}>
              {renderHeaderLabel("ราคา/หน่วย")}
            </th>
            <th style={{ ...headerCellBase, borderTop: THIN_LINE, padding: "1mm 3mm", textAlign: "right", width: "28mm" }}>
              {renderHeaderLabel("จำนวนเงิน")}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const rowPaddingY = index === 0 ? "1.35mm" : "0.55mm";

            return (
            <tr key={item.id}>
              <td style={{ padding: `${rowPaddingY} 2mm 0.55mm`, textAlign: "center", color: "black", fontSize: "12.3pt", fontWeight: 600 }}>
                {item.lineNumber}
              </td>
              <td
                style={{
                  padding: `${rowPaddingY} 2mm 0.55mm`,
                  textAlign: "center",
                  fontFamily: "monospace",
                  color: "black",
                  fontSize: "12.3pt",
                  fontWeight: 600,
                }}
              >
                {item.productSku}
              </td>
              <td style={{ padding: `${rowPaddingY} 1mm 0.55mm`, fontWeight: 550, color: "black", fontSize: "12.3pt" }}>
                {item.productName}
              </td>
              <td style={{ padding: `${rowPaddingY} 2mm 0.55mm`, textAlign: "center", fontWeight: 600, color: "black", fontSize: "12.3pt" }}>
                {fmtQty(item.quantityDelivered)}
              </td>
              <td style={{ padding: `${rowPaddingY} 2mm 0.55mm`, textAlign: "center", color: "black", fontSize: "12.3pt", fontWeight: 550 }}>
                {item.saleUnitLabel}
              </td>
              <td style={{ padding: `${rowPaddingY} 2mm 0.55mm`, textAlign: "right", color: "black", fontSize: "12.3pt", fontWeight: 550 }}>
                {fmt(item.unitPrice)}
              </td>
              <td
                style={{
                  padding: `${rowPaddingY} 3mm 0.55mm`,
                  textAlign: "right",
                  fontWeight: 600,
                  color: "black",
                  whiteSpace: "nowrap",
                  fontSize: "12.3pt",
                }}
              >
                {fmt(item.lineTotal)}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ flex: 1 }} />

      {isLastPage ? (
        <>
          <PrintTotalRow totalAmount={dn.totalAmount} dividerStyle="solid" showBottomBorder={false} lineWidth="1px" />
          <PrintSignatureBlock
            notes={dn.notes}
            leftLabel="ผู้รับสินค้า"
            rightLabel="ผู้จัดสินค้า"
            lineStyle="solid"
            lineWidth="1px"
          />
        </>
      ) : null}

      {!isLastPage && showIntermediateFooter ? (
        <div style={{ borderTop: THIN_LINE, paddingTop: "2.5mm" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              gap: "6mm",
            }}
          >
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: "8.8pt", fontWeight: 700, color: "#1e3a5f" }}>
                มีรายการต่อหน้าถัดไป
              </p>
              <p style={{ marginTop: "1mm", fontSize: "7.8pt", color: "#64748b" }}>
                หน้านี้เป็นหน้ารายการต่อเนื่อง ยังไม่มีสรุปยอดรวม
              </p>
            </div>
            <div style={{ width: "48%", display: "flex", gap: "4mm" }}>
              <div style={{ flex: 1, textAlign: "center" }}>
                <p style={{ fontSize: "8.8pt", fontWeight: 700, color: "#1e3a5f", marginBottom: "6mm" }}>
                  ผู้รับสินค้า
                </p>
                <div style={{ borderTop: THIN_MUTED_LINE }} />
              </div>
              <div style={{ width: "1px", background: "#e2e8f0" }} />
              <div style={{ flex: 1, textAlign: "center" }}>
                <p style={{ fontSize: "8.8pt", fontWeight: 700, color: "#1e3a5f", marginBottom: "6mm" }}>
                  ผู้จัดสินค้า
                </p>
                <div style={{ borderTop: THIN_MUTED_LINE }} />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function DeliveryNoteLayout({ dns, showIntermediateFooter = false }: Props) {
  const notePages = buildNotePages(dns);

  return (
    <>
      <style>{`
        @page { size: ${SHEET_WIDTH_MM}mm ${HALF_SHEET_HEIGHT_MM}mm; margin: 0; }
        @media print {
          html, body {
            width: ${SHEET_WIDTH_MM}mm;
            height: ${HALF_SHEET_HEIGHT_MM}mm;
          }
          body {
            margin: 0;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          .no-print { display: none !important; }
          .note-page {
            box-shadow: none !important;
            border: none !important;
            page-break-after: always;
            break-after: page;
          }
          .note-page:last-child {
            page-break-after: avoid;
            break-after: auto;
          }
          .note-page, .note-page * {
            color: #000000 !important;
          }
        }
        @media screen {
          body {
            background: #e5e7eb;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 32px 16px;
            gap: 24px;
          }
        }
        .note-page {
          background: white;
          width: ${SHEET_WIDTH_MM}mm;
          height: ${HALF_SHEET_HEIGHT_MM}mm;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
          padding: ${NOTE_PADDING};
        }
        @media screen {
          .note-page {
            box-shadow: 0 4px 32px rgba(0,0,0,0.12);
          }
        }
        .note-page__content {
          width: 100%;
          height: 100%;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
      `}</style>

      {notePages.map((notePage) => (
        <div key={notePage.key} className="note-page">
          <div className="note-page__content">
            <DeliveryNotePageView
              notePage={notePage}
              showIntermediateFooter={showIntermediateFooter}
            />
          </div>
        </div>
      ))}
    </>
  );
}
