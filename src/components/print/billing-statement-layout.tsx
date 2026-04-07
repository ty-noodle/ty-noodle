import type { BillingStatementData } from "@/lib/billing/billing-statement";
import {
  PRINT_ORGANIZATION_NAME,
  SHEET_WIDTH_MM,
  SHEET_HEIGHT_MM,
  HALF_SHEET_HEIGHT_MM,
  NOTE_PADDING,
  chunkItems,
  fmt,
  formatDateShort,
  PrintDocHeader,
  PrintCustomerRow,
  PrintTotalRow,
  PrintSignatureBlock,
} from "@/components/print/print-shared";

const ROWS_PER_BILL_PAGE = 10;

type BillPage = {
  key: string;
  rows: BillingStatementData["rows"];
  pageIndex: number;
  totalPages: number;
  isLastPage: boolean;
};

function buildBillPages(data: BillingStatementData): BillPage[] {
  const chunks = chunkItems(data.rows, ROWS_PER_BILL_PAGE);
  const pages = chunks.length > 0 ? chunks : [[]];
  const totalPages = pages.length;

  return pages.map((rows, pageIndex) => ({
    key: `bill-${pageIndex + 1}`,
    rows,
    pageIndex,
    totalPages,
    isLastPage: pageIndex === totalPages - 1,
  }));
}

function BillPageView({
  page,
  data,
  showIntermediateFooter = false,
}: {
  page: BillPage;
  data: BillingStatementData;
  showIntermediateFooter?: boolean;
}) {
  const { rows, pageIndex, totalPages, isLastPage } = page;

  return (
    <div className="note-slot__content" style={{ fontFamily: "'Sarabun', sans-serif", display: "flex", flexDirection: "column", height: "100%" }}>
      <PrintDocHeader
        orgName={PRINT_ORGANIZATION_NAME}
        orgAddress={data.organization.address}
        orgPhone={data.organization.phone}
        title="ใบวางบิล"
        docDate={data.billingDate}
        docNumber={data.billingNumber ?? undefined}
        pageLabel={totalPages > 1 ? `หน้า ${pageIndex + 1}/${totalPages}` : undefined}
      />

      <PrintCustomerRow customer={data.customer} />

      <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", fontSize: "8.5pt", marginBottom: "1mm" }}>
        <thead>
          <tr>
            <th style={{ padding: "1mm 2mm", textAlign: "center", width: "6%", color: "black", borderTop: "1.5px solid black", borderBottom: "1.5px solid black" }}>ลำดับ</th>
            <th style={{ padding: "1mm 2mm", textAlign: "center", width: "40%", color: "black", borderTop: "1.5px solid black", borderBottom: "1.5px solid black" }}>เล่มที่/เลขที่</th>
            <th style={{ padding: "1mm 2mm", textAlign: "center", width: "21%", color: "black", borderTop: "1.5px solid black", borderBottom: "1.5px solid black" }}>วันที่</th>
            <th style={{ padding: "1mm 2mm", textAlign: "right", width: "18%", color: "black", borderTop: "1.5px solid black", borderBottom: "1.5px solid black" }}>ยอดรวม</th>
            <th style={{ padding: "1mm 3mm", textAlign: "left", width: "15%", color: "black", borderTop: "1.5px solid black", borderBottom: "1.5px solid black" }}>หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.deliveryNumber}>
              <td style={{ padding: "0.8mm 2mm", textAlign: "center", color: "black" }}>{row.lineNumber}</td>
              <td style={{ padding: "0.8mm 2mm", textAlign: "center", fontFamily: "monospace", fontSize: "8pt", fontWeight: 700, color: "#003366" }}>{row.deliveryNumber}</td>
              <td style={{ padding: "0.8mm 2mm", textAlign: "center", color: "black" }}>{formatDateShort(row.deliveryDate)}</td>
              <td style={{ padding: "0.8mm 2mm", textAlign: "right", fontWeight: 700, color: "black" }}>{fmt(row.totalAmount)}</td>
              <td style={{ padding: "0.8mm 3mm", fontSize: "7.5pt", color: "#475569" }}>{row.notes ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ flex: 1 }} />

      {isLastPage && (
        <>
          <PrintTotalRow totalAmount={data.grandTotal} />
          <PrintSignatureBlock
            leftLabel="ผู้รับวางบิล"
            rightLabel="ผู้วางบิล"
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
                <p style={{ fontSize: "8pt", fontWeight: 700, color: "#1e3a5f", marginBottom: "6mm" }}>ผู้รับวางบิล</p>
                <div style={{ borderTop: "1px solid #334155" }} />
              </div>
              <div style={{ width: "1px", background: "#e2e8f0" }} />
              <div style={{ flex: 1, textAlign: "center" }}>
                <p style={{ fontSize: "8pt", fontWeight: 700, color: "#1e3a5f", marginBottom: "6mm" }}>ผู้วางบิล</p>
                <div style={{ borderTop: "1px solid #334155" }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type BillSlot = {
  key: string;
  page: BillPage;
  data: BillingStatementData;
};

function buildAllBillSlots(dataList: BillingStatementData[]): BillSlot[] {
  return dataList.flatMap((billData) =>
    buildBillPages(billData).map((page) => ({
      key: `${billData.customer.code}-${page.key}`,
      page,
      data: billData,
    }))
  );
}

export function BillingStatementLayout({
  data,
  showIntermediateFooter = false,
}: {
  data: BillingStatementData | BillingStatementData[];
  showIntermediateFooter?: boolean;
}) {
  const dataList = Array.isArray(data) ? data : [data];
  const allSlots = buildAllBillSlots(dataList);
  const sheets = chunkItems(allSlots, 2);

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
          {sheet.map((slot) => (
            <div key={slot.key} className="note-slot">
              <BillPageView
                page={slot.page}
                data={slot.data}
                showIntermediateFooter={showIntermediateFooter}
              />
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
