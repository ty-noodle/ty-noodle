"use client";

import { useEffect, useRef, useState } from "react";
import type { BillingAttachmentData } from "@/lib/billing/attachments";
import type { DeliveryNotePrintData } from "@/lib/delivery/print";
import { paginateAttachmentNotes, type AttachmentNotePart, type AttachmentPair } from "@/lib/billing/attachment-pagination";
import { fmt, fmtQty, formatDateShort, PRINT_ORGANIZATION_NAME } from "./print-shared";
import "./billing-attachment.css";

function AttachmentHeader({ data }: { data: BillingAttachmentData }) {
  return (
    <header className="attachment-header">
      <div className="attachment-heading">
        <strong>{PRINT_ORGANIZATION_NAME}</strong>
        <h1>รายละเอียดใบส่งของประกอบใบวางบิล</h1>
      </div>
      <div className="attachment-customer">
        <div><strong>ลูกค้า {data.customer.code} {data.customer.name}</strong><p>{data.customer.address}</p></div>
        <div className="attachment-period">
          {data.billingNumber && <p>อ้างอิงใบวางบิล {data.billingNumber}</p>}
          <p>วันที่ {formatDateShort(data.fromDate)} – {formatDateShort(data.toDate)}</p>
        </div>
      </div>
    </header>
  );
}

function AttachmentNote({ note, part }: { note: DeliveryNotePrintData; part: AttachmentNotePart }) {
  return (
    <article className="attachment-note" data-note-index={part.noteIndex}>
      <div className="attachment-note-heading">
        <strong>{formatDateShort(note.deliveryDate)}{part.start > 0 ? " (ต่อ)" : ""}</strong>
        <span>เลขที่ {note.deliveryNumber}</span>
      </div>
      <table>
        <colgroup><col style={{ width: "15%" }} /><col style={{ width: "39%" }} /><col style={{ width: "16%" }} /><col style={{ width: "14%" }} /><col style={{ width: "16%" }} /></colgroup>
        <thead><tr><th>รหัส</th><th>รายการสินค้า</th><th>จำนวน</th><th>ราคา/หน่วย</th><th>จำนวนเงิน</th></tr></thead>
        <tbody>
          {note.items.slice(part.start, part.end).map(item => (
            <tr key={item.id} data-item-row>
              <td>{item.productSku}</td><td>{item.productName}</td>
              <td>{fmtQty(item.quantityDelivered)} {item.saleUnitLabel}</td>
              <td>{fmt(item.unitPrice)}</td><td>{fmt(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="attachment-note-total">
        {part.isLastPart ? <><span>รวม</span><strong>{fmt(note.totalAmount)}</strong></> : <span>มีรายการต่อหน้าถัดไป →</span>}
      </div>
    </article>
  );
}

function AttachmentFooter({ data, page = 1, totalPages = 1 }: { data: BillingAttachmentData; page?: number; totalPages?: number }) {
  const days = new Set(data.notes.map(note => note.deliveryDate)).size;
  return (
    <footer className="attachment-footer">
      <span>รวม {days} วัน / {data.notes.length} ใบส่งของ</span>
      <span>{page === totalPages ? <>รวมทั้งสิ้น <strong>{fmt(data.grandTotal)}</strong> บาท</> : "มีรายการต่อหน้าถัดไป"}</span>
      <span>หน้า {page}/{totalPages}</span>
    </footer>
  );
}

export function BillingAttachmentLayout({ groups, autoprint = false }: { groups: BillingAttachmentData[]; autoprint?: boolean }) {
  const measureRef = useRef<HTMLDivElement>(null);
  const printed = useRef(false);
  const [pages, setPages] = useState<AttachmentPair[][][] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function measure() {
      try {
        await Promise.all([document.fonts.load('9.5pt "Attachment Thai"'), document.fonts.load('700 11pt "Attachment Thai"')]);
        await document.fonts.ready;
        if (cancelled || !measureRef.current) return;
        const sheets = Array.from(measureRef.current.querySelectorAll<HTMLElement>(".attachment-sheet"));
        const nextPages = sheets.map(sheet => {
          const body = sheet.querySelector<HTMLElement>(".attachment-page-body")!;
          const measured = Array.from(body.querySelectorAll<HTMLElement>(".attachment-note")).map(note => {
            const itemHeights = Array.from(note.querySelectorAll<HTMLElement>("[data-item-row]")).map(row => row.getBoundingClientRect().height);
            return { baseHeight: note.getBoundingClientRect().height - itemHeights.reduce((a, b) => a + b, 0) + 1, itemHeights };
          });
          return paginateAttachmentNotes(measured, body.getBoundingClientRect().height - 2);
        });
        if (!cancelled) setPages(nextPages);
      } catch (cause) {
        if (!cancelled) {
          const message = cause instanceof Error ? cause.message : "จัดหน้าใบแนบไม่สำเร็จ กรุณาลองใหม่";
          setError(message);
          if (window.parent !== window) window.parent.postMessage({ type: "billing-attachment-print", status: "error", message }, window.location.origin);
        }
      }
    }
    void measure();
    return () => { cancelled = true; };
  }, [groups]);

  useEffect(() => {
    if (!pages || !autoprint || printed.current) return;
    const afterPrint = () => {
      if (window.parent !== window) window.parent.postMessage({ type: "billing-attachment-print", status: "done" }, window.location.origin);
    };
    window.addEventListener("afterprint", afterPrint);
    const frame = requestAnimationFrame(() => {
      printed.current = true;
      if (window.parent !== window) window.parent.postMessage({ type: "billing-attachment-print", status: "ready" }, window.location.origin);
      window.focus();
      window.print();
    });
    return () => { cancelAnimationFrame(frame); window.removeEventListener("afterprint", afterPrint); };
  }, [pages, autoprint]);

  return (
    <main className="billing-attachments">
      <div className="attachment-toolbar no-print">
        <a href="/billing">กลับหน้าใบวางบิล</a>
        <span role="status">{error || (pages ? "ใบแนบส่งของ · เลือกเครื่องพิมพ์ A4 · แนวนอน · ขนาดจริง 100%" : "กำลังจัดหน้าใบแนบส่งของ…")}</span>
        <button type="button" disabled={!pages || !!error} onClick={() => window.print()}>พิมพ์ใบแนบส่งของ</button>
      </div>
      {!pages && !error && <div ref={measureRef} className="attachment-measure" aria-hidden="true">
        {groups.map(data => <section className="attachment-sheet" key={data.customerId}>
          <AttachmentHeader data={data} />
          <div className="attachment-page-body">
            {data.notes.map((note, index) => <div className="attachment-measure-note" key={note.deliveryNumber}>
              <AttachmentNote note={note} part={{ noteIndex: index, start: 0, end: note.items.length, isLastPart: true }} />
            </div>)}
          </div>
          <AttachmentFooter data={data} />
        </section>)}
      </div>}
      {pages && groups.map((data, groupIndex) => pages[groupIndex].map((pairs, pageIndex, groupPages) => (
        <section className="attachment-sheet" key={`${data.customerId}-${pageIndex}`}>
          <AttachmentHeader data={data} />
          <div className="attachment-page-body">
            {pairs.map((pair, index) => <div className="attachment-pair" key={index}>
              {pair.map((part, side) => <div key={side}>{part && <AttachmentNote note={data.notes[part.noteIndex]} part={part} />}</div>)}
            </div>)}
          </div>
          <AttachmentFooter data={data} page={pageIndex + 1} totalPages={groupPages.length} />
        </section>
      )))}
    </main>
  );
}
