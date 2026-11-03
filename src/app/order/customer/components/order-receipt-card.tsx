import type { CSSProperties, RefObject } from "react";
import type { ReceiptItem } from "@/app/order/customer/order-client-types";

const RECEIPT_DISPLAY_MAX_WIDTH = 620;

function formatMoney(value: number) {
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getPricedTotal(items: ReceiptItem[], fallbackTotal: number) {
  const hasUnpricedItems = items.some((item) => item.unitPrice <= 0);
  const pricedTotal = items.reduce(
    (sum, item) => sum + (item.unitPrice > 0 ? item.lineTotal : 0),
    0,
  );

  return hasUnpricedItems ? pricedTotal : fallbackTotal || pricedTotal;
}

export function OrderReceiptCard({
  receiptRef,
  orderNumber,
  orderDate,
  storeName,
  items,
  totalAmount,
}: {
  receiptRef?: RefObject<HTMLDivElement | null>;
  orderNumber: string;
  orderDate: string;
  storeName: string;
  items: ReceiptItem[];
  totalAmount: number;
}) {
  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat("th-TH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Asia/Bangkok",
    }).format(new Date(iso));

  const fmtTime = (iso: string) =>
    new Intl.DateTimeFormat("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Bangkok",
      hour12: false,
    }).format(new Date(iso));

  const font = "'Sarabun','Noto Sans Thai',sans-serif";
  const columns = "1fr 58px 48px 76px";
  const sidePadding = "20px";
  const ruleMargin = "0 16px";
  const line: CSSProperties = { borderTop: "1px solid #cccccc", margin: ruleMargin };
  const lineThick: CSSProperties = { borderTop: "2px solid #000000", margin: ruleMargin };
  const displayTotal = getPricedTotal(items, totalAmount);

  return (
    <div
      ref={receiptRef}
      style={{
        width: "100%",
        minWidth: 0,
        maxWidth: `min(calc(100vw - 24px), ${RECEIPT_DISPLAY_MAX_WIDTH}px)`,
        flexShrink: 0,
        boxSizing: "border-box",
        backgroundColor: "#ffffff",
        fontFamily: font,
        color: "#000000",
        boxShadow: "0 4px 20px rgba(0,0,0,0.10)",
        margin: "0 auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 16px 0" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/ty-noodles-logo.png"
          alt="T&Y Noodle"
          style={{ objectFit: "contain", display: "inline-block", width: "56px", height: "56px" }}
        />
      </div>

      <div style={{ textAlign: "center", padding: `0 ${sidePadding} 10px` }}>
        <div style={{ fontSize: "12px", lineHeight: 1.6 }}>T&amp;Y Noodle - ใบยืนยันคำสั่งซื้อ</div>
        <div style={{ fontSize: "16px", fontWeight: 800, lineHeight: 1.3, marginTop: "2px" }}>
          เลขที่ใบจัดส่ง: {orderNumber}
        </div>
        <div style={{ fontSize: "13px", marginTop: "4px", lineHeight: 1.6 }}>
          {fmtDate(orderDate)} | {fmtTime(orderDate)}
        </div>
      </div>

      <div style={lineThick} />

      <div style={{ padding: `10px ${sidePadding} 12px` }}>
        <span style={{ fontWeight: 700, fontSize: "14px" }}>ร้านค้า:</span>
        <span style={{ fontSize: "14px" }}> {storeName}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: columns, padding: `6px ${sidePadding}`, gap: "0 8px" }}>
        {(["สินค้า", "จำนวน", "หน่วย", "รวม"] as const).map((label, index) => (
          <span
            key={label}
            style={{
              fontSize: "14px",
              fontWeight: 800,
              textAlign: index === 0 ? "left" : "right",
            }}
          >
            {label}
          </span>
        ))}
      </div>

      <div style={line} />

      {items.map((item, index) => (
        <div key={`${item.name}-${item.saleUnitLabel}-${index}`}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: columns,
              padding: `10px ${sidePadding}`,
              gap: "0 8px",
              alignItems: "center",
            }}
          >
            <div
              style={{
                fontSize: "13px",
                lineHeight: 1.4,
                whiteSpace: "normal",
                wordBreak: "break-word",
                overflow: "visible",
              }}
            >
              {item.name}
            </div>
            <div style={{ fontSize: "14px", textAlign: "right" }}>
              {item.quantity.toLocaleString("th-TH")}
            </div>
            <div style={{ fontSize: "14px", textAlign: "right" }}>
              {item.saleUnitLabel}
            </div>
            <div style={{ fontSize: "14px", fontWeight: 700, textAlign: "right" }}>
              {item.unitPrice > 0 ? formatMoney(item.lineTotal) : "-"}
            </div>
          </div>
          <div style={line} />
        </div>
      ))}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "12px",
          padding: `14px ${sidePadding} 0`,
        }}
      >
        <span style={{ fontSize: "14px", fontWeight: 800 }}>รวมทั้งหมด</span>
        <span style={{ fontSize: "16px", fontWeight: 800 }}>
          {displayTotal > 0 ? formatMoney(displayTotal) : "-"}
        </span>
      </div>

      <div style={{ padding: `36px ${sidePadding} 32px`, textAlign: "center" }}>
        <div style={{ fontSize: "14px", fontWeight: 800, lineHeight: 1.6 }}>T&amp;Y Noodle</div>
        <div style={{ fontSize: "13px", marginTop: "2px", lineHeight: 1.6 }}>ขอบคุณสำหรับการสั่งซื้อครับ</div>
      </div>
    </div>
  );
}
