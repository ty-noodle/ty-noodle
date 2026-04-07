import type { DeliveryNotePrintData } from "@/lib/delivery/print";
import {
  PRINT_ORGANIZATION_NAME,
  SHEET_WIDTH_MM,
  SHEET_HEIGHT_MM,
  HALF_SHEET_HEIGHT_MM,
  NOTE_PADDING,
  chunkItems,
  fmtQty,
  fmt,
  PrintDocHeader,
  PrintCustomerRow,
  PrintTotalRow,
  PrintSignatureBlock,
} from "@/components/print/print-shared";

const ITEMS_PER_NOTE_PAGE = 12;

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

  return (
    <div className="note-slot__content" style={{ fontFamily: "'Sarabun', sans-serif", display: "flex", flexDirection: "column", height: "100%" }}>
      <PrintDocHeader
        orgName={PRINT_ORGANIZATION_NAME}
        orgAddress={dn.organization.address}
        orgPhone={dn.organization.phone}
        title="ใบส่งของ"
        docNumber={dn.deliveryNumber}
        docDate={dn.deliveryDate}
        pageLabel={totalPages > 1 ? `หน้า ${pageIndex + 1}/${totalPages}` : undefined}
      />

      <PrintCustomerRow customer={dn.customer} />

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "8.5pt", marginBottom: "1mm" }}>
        <thead>
          <tr>
            <th style={{ padding: "1mm 2mm", textAlign: "center", width: "6mm", color: "black", borderTop: "1.5px solid black", borderBottom: "1.5px solid black" }}>ลำดับ</th>
            <th style={{ padding: "1mm 2mm", textAlign: "center", width: "20mm", color: "black", borderTop: "1.5px solid black", borderBottom: "1.5px solid black" }}>รหัสสินค้า</th>
            <th style={{ padding: "1mm 1mm", textAlign: "left", color: "black", borderTop: "1.5px solid black", borderBottom: "1.5px solid black" }}>รายการสินค้า</th>
            <th style={{ padding: "1mm 2mm", textAlign: "center", width: "12mm", color: "black", borderTop: "1.5px solid black", borderBottom: "1.5px solid black" }}>จำนวน</th>
            <th style={{ padding: "1mm 2mm", textAlign: "center", width: "10mm", color: "black", borderTop: "1.5px solid black", borderBottom: "1.5px solid black" }}>หน่วย</th>
            <th style={{ padding: "1mm 2mm", textAlign: "right", width: "20mm", color: "black", borderTop: "1.5px solid black", borderBottom: "1.5px solid black" }}>ราคา/หน่วย</th>
            <th style={{ padding: "1mm 3mm", textAlign: "right", width: "26mm", color: "black", borderTop: "1.5px solid black", borderBottom: "1.5px solid black" }}>จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td style={{ padding: "0.8mm 2mm", textAlign: "center", color: "black" }}>{item.lineNumber}</td>
              <td style={{ padding: "0.8mm 2mm", textAlign: "center", fontFamily: "monospace", color: "black", fontSize: "8pt" }}>{item.productSku}</td>
              <td style={{ padding: "0.8mm 1mm", fontWeight: 600, color: "black" }}>{item.productName}</td>
              <td style={{ padding: "0.8mm 2mm", textAlign: "center", fontWeight: 700, color: "black" }}>{fmtQty(item.quantityDelivered)}</td>
              <td style={{ padding: "0.8mm 2mm", textAlign: "center", color: "black" }}>{item.saleUnitLabel}</td>
              <td style={{ padding: "0.8mm 2mm", textAlign: "right", color: "black" }}>{fmt(item.unitPrice)}</td>
              <td style={{ padding: "0.8mm 3mm", textAlign: "right", fontWeight: 700, color: "black", whiteSpace: "nowrap" }}>{fmt(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ flex: 1 }} />

      {isLastPage && (
        <>
          <PrintTotalRow totalAmount={dn.totalAmount} />
          <PrintSignatureBlock
            notes={dn.notes}
            leftLabel="ผู้รับสินค้า"
            rightLabel="ผู้จัดสินค้า"
          />
        </>
      )}

      {!isLastPage && showIntermediateFooter && (
        <div style={{ borderTop: "1.5px solid black", paddingTop: "2.5mm" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "6mm" }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: "8pt", fontWeight: 700, color: "#1e3a5f" }}>มีรายการต่อหน้าถัดไป</p>
              <p style={{ marginTop: "1mm", fontSize: "7pt", color: "#64748b" }}>
                หน้านี้เป็นหน้ารายการต่อเนื่อง ยังไม่มีสรุปยอดรวม
              </p>
            </div>
            <div style={{ width: "48%", display: "flex", gap: "4mm" }}>
              <div style={{ flex: 1, textAlign: "center" }}>
                <p style={{ fontSize: "8pt", fontWeight: 700, color: "#1e3a5f", marginBottom: "6mm" }}>ผู้รับสินค้า</p>
                <div style={{ borderTop: "1px solid #334155" }} />
              </div>
              <div style={{ width: "1px", background: "#e2e8f0" }} />
              <div style={{ flex: 1, textAlign: "center" }}>
                <p style={{ fontSize: "8pt", fontWeight: 700, color: "#1e3a5f", marginBottom: "6mm" }}>ผู้จัดสินค้า</p>
                <div style={{ borderTop: "1px solid #334155" }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function DeliveryNoteLayout({ dns, showIntermediateFooter = false }: Props) {
  const notePages = buildNotePages(dns);
  const sheets = chunkItems(notePages, 2);

  return (
    <>
      <style>{`
        @page { size: ${SHEET_WIDTH_MM}mm ${SHEET_HEIGHT_MM}mm; margin: 0; }
        @media print {
          html, body {
            width: ${SHEET_WIDTH_MM}mm;
            height: ${SHEET_HEIGHT_MM}mm;
          }
          body {
            margin: 0;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          .no-print { display: none !important; }
          .sheet-page {
            box-shadow: none !important;
            border: none !important;
            page-break-after: always;
          }
          .sheet-page:last-child {
            page-break-after: avoid;
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
        .sheet-page {
          background: white;
          width: ${SHEET_WIDTH_MM}mm;
          height: ${SHEET_HEIGHT_MM}mm;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        @media screen {
          .sheet-page {
            box-shadow: 0 4px 32px rgba(0,0,0,0.12);
          }
        }
        .note-slot {
          box-sizing: border-box;
          width: 100%;
          height: ${HALF_SHEET_HEIGHT_MM}mm;
          padding: ${NOTE_PADDING};
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .note-slot--empty {
          visibility: hidden;
        }
      `}</style>

      {sheets.map((sheet, sheetIndex) => (
        <div key={`sheet-${sheetIndex + 1}`} className="sheet-page">
          {sheet.map((notePage) => (
            <div key={notePage.key} className="note-slot">
              <DeliveryNotePageView notePage={notePage} showIntermediateFooter={showIntermediateFooter} />
            </div>
          ))}
          {sheet.length < 2 && (
            <div className="note-slot note-slot--empty" aria-hidden="true" />
          )}
        </div>
      ))}
    </>
  );
}
