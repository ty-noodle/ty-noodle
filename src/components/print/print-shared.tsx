import { bahtText } from "@/lib/format/baht-text";

// ─── Constants ────────────────────────────────────────────────────────────────

export const PRINT_ORGANIZATION_NAME = "เส้นรังนก (T&Y Noodle)";
export const SHEET_WIDTH_MM = 228.6;
export const SHEET_HEIGHT_MM = 279.4;
export const HALF_SHEET_HEIGHT_MM = 139.7;
export const NOTE_PADDING = "6mm 8mm";

// ─── Utilities ────────────────────────────────────────────────────────────────

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(new Date(iso));
}

export function formatDateShort(iso: string) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(new Date(iso));
}

export function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtQty(n: number) {
  return n.toLocaleString("th-TH", { maximumFractionDigits: 3 });
}

export function chunkItems<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ─── Shared print sub-components ─────────────────────────────────────────────

type RightMetaItem = { label: string; value: string };

/**
 * Document header: org info (left) | centered title | doc number + date (right).
 * Used by both delivery note and billing statement.
 */
export function PrintDocHeader({
  orgName,
  orgAddress,
  orgPhone,
  title,
  docNumber,
  docDate,
  pageLabel,
  extraMeta,
}: {
  orgName: string;
  orgAddress?: string | null;
  orgPhone?: string | null;
  title: string;
  docNumber?: string;
  docDate: string;
  pageLabel?: string;
  extraMeta?: RightMetaItem[];
}) {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5mm", paddingBottom: "3mm", borderBottom: "1.5px solid black" }}>
      <div>
        <p style={{ fontWeight: 800, fontSize: "12pt", color: "#1e3a5f", lineHeight: 1.2 }}>{orgName}</p>
        {orgAddress && (
          <p style={{ fontSize: "7.5pt", color: "#64748b", marginTop: "1px" }}>{orgAddress}</p>
        )}
        {orgPhone && (
          <p style={{ fontSize: "7.5pt", color: "#64748b", marginTop: "1px" }}>โทร {orgPhone}</p>
        )}
      </div>

      <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", textAlign: "center", pointerEvents: "none" }}>
        <p style={{ fontSize: "15pt", fontWeight: 900, color: "#1e3a5f", letterSpacing: "0.05em" }}>{title}</p>
      </div>

      <div style={{ textAlign: "right", minWidth: "95px" }}>
        {docNumber && (
          <p style={{ fontSize: "8pt", color: "#1e3a5f" }}>
            <span style={{ color: "#64748b" }}>เลขที่ </span>
            <span style={{ fontWeight: 800, fontFamily: "monospace" }}>{docNumber}</span>
          </p>
        )}
        <p style={{ fontSize: "8pt", color: "#1e3a5f", marginTop: docNumber ? "2px" : undefined }}>
          <span style={{ color: "#64748b" }}>วันที่ </span>
          <span style={{ fontWeight: 700 }}>{formatDate(docDate)}</span>
        </p>
        {extraMeta?.map((m) => (
          <p key={m.label} style={{ fontSize: "7.5pt", color: "#1e3a5f", marginTop: "2px" }}>
            <span style={{ color: "#64748b" }}>{m.label} </span>
            <span style={{ fontWeight: 700 }}>{m.value}</span>
          </p>
        ))}
        {pageLabel && (
          <p style={{ fontSize: "7pt", color: "#94a3b8", marginTop: "2px" }}>{pageLabel}</p>
        )}
      </div>
    </div>
  );
}

/** Customer code + name + address row. */
export function PrintCustomerRow({
  customer,
}: {
  customer: { name: string; code: string; address: string };
}) {
  return (
    <div style={{ marginBottom: "1.5mm", padding: "0" }}>
      <div style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
        <span style={{ fontSize: "7.5pt", color: "#64748b", flexShrink: 0 }}>ลูกค้า</span>
        <span style={{ fontFamily: "monospace", fontSize: "8pt", color: "#003366", fontWeight: 700 }}>{customer.code}</span>
        <span style={{ fontWeight: 700, fontSize: "9.5pt", color: "#0f172a" }}>{customer.name}</span>
      </div>
      <div style={{ display: "flex", gap: "8px", alignItems: "baseline", marginTop: "1px" }}>
        <span style={{ fontSize: "7.5pt", color: "#64748b", flexShrink: 0 }}>ที่อยู่</span>
        <span style={{ fontSize: "8pt", color: "#334155" }}>{customer.address}</span>
      </div>
    </div>
  );
}

/** Grand total row: baht text (left) + label + amount (right). */
export function PrintTotalRow({ totalAmount }: { totalAmount: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: "1.5px solid black", borderBottom: "1.5px solid black", paddingTop: "2mm", paddingBottom: "2mm", marginBottom: "2mm" }}>
      <p style={{ fontSize: "8.5pt", color: "black" }}>{bahtText(totalAmount)}</p>
      <div style={{ display: "flex", alignItems: "baseline", gap: "6mm" }}>
        <p style={{ fontSize: "8.5pt", fontWeight: 700, color: "black" }}>รวมทั้งสิ้น</p>
        <p style={{ fontSize: "10pt", fontWeight: 800, color: "black", fontFamily: "monospace" }}>{fmt(totalAmount)}</p>
      </div>
    </div>
  );
}

/** Signature block: optional notes box (left) + two signature lines (right). */
export function PrintSignatureBlock({
  notes,
  leftLabel,
  rightLabel,
}: {
  notes?: string | null;
  leftLabel: string;
  rightLabel: string;
}) {
  return (
    <div style={{ display: "flex", gap: "6mm", alignItems: "flex-start" }}>
      <div style={{ flex: 1 }}>
        {notes && (
          <div style={{ padding: "1.5mm 2.5mm", border: "1px dashed #cbd5e1", borderRadius: "3px", fontSize: "7.5pt", color: "#475569" }}>
            <span style={{ fontWeight: 700 }}>หมายเหตุ: </span>{notes}
          </div>
        )}
      </div>
      <div style={{ width: "1px", background: "#e2e8f0", alignSelf: "stretch" }} />
      <div style={{ flex: 1, display: "flex", gap: "4mm" }}>
        <div style={{ flex: 1, textAlign: "center" }}>
          <p style={{ fontSize: "8pt", fontWeight: 700, color: "#1e3a5f", marginBottom: "6mm" }}>{leftLabel}</p>
          <div style={{ borderTop: "1px solid #334155" }} />
        </div>
        <div style={{ width: "1px", background: "#e2e8f0" }} />
        <div style={{ flex: 1, textAlign: "center" }}>
          <p style={{ fontSize: "8pt", fontWeight: 700, color: "#1e3a5f", marginBottom: "6mm" }}>{rightLabel}</p>
          <div style={{ borderTop: "1px solid #334155" }} />
        </div>
      </div>
    </div>
  );
}
