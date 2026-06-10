import type { CSSProperties } from "react";
import type { BillingStatementData } from "@/lib/billing/billing-statement";
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
  formatDateShort,
} from "@/components/print/print-shared";

const ROWS_PER_BILL_PAGE = 10;
const DOTTED_LINE = "4px dotted black";

type BillPage = {
  key: string;
  rows: BillingStatementData["rows"];
  pageIndex: number;
  totalPages: number;
  isLastPage: boolean;
};

type BillSlot = {
  key: string;
  page: BillPage;
  data: BillingStatementData;
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

function buildAllBillSlots(dataList: BillingStatementData[]): BillSlot[] {
  return dataList.flatMap((data) =>
    buildBillPages(data).map((page) => ({
      key: `${data.customer.code}-${page.key}`,
      page,
      data,
    })),
  );
}

function headerCellStyle(style: CSSProperties): CSSProperties {
  return {
    padding: "1mm 2mm",
    color: "black",
    ...style,
  };
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

  function renderHeaderLabel(label: string) {
    return (
      <span
        style={{
          display: "inline-block",
          paddingBottom: "0.2mm",
          borderBottom: DOTTED_LINE,
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
        fontFamily: "Tahoma, sans-serif",
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <PrintDocHeader
        orgName={PRINT_ORGANIZATION_NAME}
        orgAddress={data.organization.address}
        orgPhone={data.organization.phone}
        title="ใบวางบิล"
        docDate={data.billingDate}
        docNumber={data.billingNumber ?? undefined}
        pageLabel={totalPages > 1 ? `หน้า ${pageIndex + 1}/${totalPages}` : undefined}
        dividerStyle="none"
        docMetaFontSize="11.8pt"
        hideOrgDetails={true}
      />

      <PrintCustomerRow customer={{ ...data.customer, address: data.customer.address ?? "-" }} />

      <table
        style={{
          width: "100%",
          tableLayout: "fixed",
          borderCollapse: "collapse",
          fontSize: "11.8pt",
          marginBottom: "1mm",
        }}
      >
        <thead>
          <tr>
            <th style={headerCellStyle({ borderTop: DOTTED_LINE, width: "6%", textAlign: "center" })}>
              {renderHeaderLabel("ลำดับ")}
            </th>
            <th style={headerCellStyle({ borderTop: DOTTED_LINE, width: "34%", textAlign: "center" })}>
              {renderHeaderLabel("เลขที่ใบจัดส่ง")}
            </th>
            <th style={headerCellStyle({ borderTop: DOTTED_LINE, width: "20%", textAlign: "center" })}>
              {renderHeaderLabel("วันที่")}
            </th>
            <th style={headerCellStyle({ borderTop: DOTTED_LINE, width: "40%", textAlign: "right", paddingRight: "26mm" })}>
              {renderHeaderLabel("ยอดรวม")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.deliveryNumber}>
              <td style={{ padding: "0.8mm 2mm", textAlign: "center", color: "black" }}>
                {row.lineNumber}
              </td>
              <td
                className="monospace-font"
                style={{
                  padding: "0.8mm 2mm",
                  textAlign: "center",
                  fontFamily: "monospace",
                  fontSize: "11.8pt",
                  fontWeight: 700,
                  color: "black",
                }}
              >
                {row.deliveryNumber}
              </td>
              <td style={{ padding: "0.8mm 2mm", textAlign: "center", color: "black" }}>
                <span style={{ display: "inline-block", minWidth: "20mm", textAlign: "left" }}>
                  {formatDateShort(row.deliveryDate)}
                </span>
              </td>
              <td
                style={{
                  padding: "0.8mm 26mm 0.8mm 2mm",
                  textAlign: "right",
                  fontWeight: 700,
                  color: "black",
                }}
              >
                {fmt(row.totalAmount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ flex: 1 }} />

      {isLastPage ? (
        <>
          <PrintTotalRow totalAmount={data.grandTotal} dividerStyle="dotted" showBottomBorder={false} />
          <PrintSignatureBlock leftLabel="ผู้รับวางบิล" rightLabel="ผู้วางบิล" lineStyle="dotted" hideNotes={true} />
        </>
      ) : null}

      {!isLastPage && showIntermediateFooter ? null : null}
    </div>
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
        .note-page, .note-page * {
          font-family: Tahoma, 'Sarabun', sans-serif !important;
          color: #000000 !important;
        }
        .note-page .monospace-font {
          font-family: monospace !important;
        }
      `}</style>

      {allSlots.map((slot) => (
        <div key={slot.key} className="note-page">
          <div className="note-page__content">
            <BillPageView page={slot.page} data={slot.data} showIntermediateFooter={showIntermediateFooter} />
          </div>
        </div>
      ))}
    </>
  );
}
