/**
 * Design preview for delivery note print layout.
 * Uses mock data - no auth required for preview.
 * Remove or protect this route before production.
 */

import type { DeliveryNotePrintData } from "@/lib/delivery/print";
import { DeliveryNoteLayout } from "@/components/print/delivery-note-layout";
import { PrintButton } from "./print-button";

export const metadata = { title: "Preview - ใบส่งของ" };

const MOCK: DeliveryNotePrintData = {
  deliveryNumber: "DN20260322001",
  deliveryDate: "2026-03-22",
  orderNumber: null,
  totalAmount: 9795,
  notes: "ส่งรอบเช้า ก่อน 09:00 น.",
  organization: {
    name: "ห้างหุ้นส่วนจำกัด ที.วาย.นู้ดเดิ้ล",
    logoUrl: null,
    address: "99/9 ถนนสุขุมวิท ตำบลบางปู อำเภอเมือง สมุทรปราการ 10280",
    phone: "081-234-5678",
  },
  customer: {
    name: "ร้านก๋วยเตี๋ยวเจ้าเก่า",
    code: "TYS-0042",
    address: "99/1 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110",
    vehicleId: null,
    vehicleName: null,
  },
  items: [
    { id: "mock-item-01", lineNumber: 1, productSku: "TYN-0001", productName: "เส้นก๋วยเตี๋ยวเล็ก (เส้นขาว)", quantityDelivered: 10, saleUnitLabel: "ลัง", unitPrice: 250, lineTotal: 2500 },
    { id: "mock-item-02", lineNumber: 2, productSku: "TYN-0002", productName: "เส้นหมี่ขาวใหญ่ พรีเมียม", quantityDelivered: 5, saleUnitLabel: "ลัง", unitPrice: 280, lineTotal: 1400 },
    { id: "mock-item-03", lineNumber: 3, productSku: "TYN-0008", productName: "วุ้นเส้น (ห่อเล็ก 200g)", quantityDelivered: 17, saleUnitLabel: "ห่อ", unitPrice: 25, lineTotal: 425 },
    { id: "mock-item-04", lineNumber: 4, productSku: "TYN-0015", productName: "เส้นบะหมี่เหลือง สด", quantityDelivered: 3, saleUnitLabel: "ถุง", unitPrice: 141.67, lineTotal: 425 },
    { id: "mock-item-05", lineNumber: 5, productSku: "TYN-0003", productName: "เส้นใหญ่ (เส้นขาว)", quantityDelivered: 8, saleUnitLabel: "ลัง", unitPrice: 120, lineTotal: 960 },
    { id: "mock-item-06", lineNumber: 6, productSku: "TYN-0010", productName: "เส้นเล็กแห้ง 400g", quantityDelivered: 20, saleUnitLabel: "ห่อ", unitPrice: 35, lineTotal: 700 },
    { id: "mock-item-07", lineNumber: 7, productSku: "TYN-0012", productName: "บะหมี่กึ่งสำเร็จรูป รสหมู", quantityDelivered: 4, saleUnitLabel: "ลัง", unitPrice: 180, lineTotal: 720 },
    { id: "mock-item-08", lineNumber: 8, productSku: "TYN-0020", productName: "เส้นหมี่เหลือง (แห้ง 500g)", quantityDelivered: 12, saleUnitLabel: "ห่อ", unitPrice: 45, lineTotal: 540 },
    { id: "mock-item-09", lineNumber: 9, productSku: "TYN-0025", productName: "เส้นก๋วยจั๊บ (แห้ง)", quantityDelivered: 6, saleUnitLabel: "ถุง", unitPrice: 90, lineTotal: 540 },
    { id: "mock-item-10", lineNumber: 10, productSku: "TYN-0031", productName: "เส้นขนมจีน สด (แพ็ค 1kg)", quantityDelivered: 2, saleUnitLabel: "แพ็ค", unitPrice: 320, lineTotal: 640 },
    { id: "mock-item-11", lineNumber: 11, productSku: "TYN-0040", productName: "เส้นโซบะญี่ปุ่น", quantityDelivered: 3, saleUnitLabel: "ลัง", unitPrice: 350, lineTotal: 1050 },
    { id: "mock-item-12", lineNumber: 12, productSku: "TYN-0041", productName: "หมี่กรอบ (ถุงใหญ่)", quantityDelivered: 15, saleUnitLabel: "ห่อ", unitPrice: 28, lineTotal: 420 },
    { id: "mock-item-13", lineNumber: 13, productSku: "TYN-0042", productName: "เส้นอูด้ง สด", quantityDelivered: 5, saleUnitLabel: "ถุง", unitPrice: 95, lineTotal: 475 },
    { id: "mock-item-14", lineNumber: 14, productSku: "TYN-0045", productName: "เส้นใหญ่แห้ง 500g", quantityDelivered: 7, saleUnitLabel: "แพ็ค", unitPrice: 88, lineTotal: 616 },
    { id: "mock-item-15", lineNumber: 15, productSku: "TYN-0048", productName: "บะหมี่ไข่ สด", quantityDelivered: 9, saleUnitLabel: "ถุง", unitPrice: 72, lineTotal: 648 },
    { id: "mock-item-16", lineNumber: 16, productSku: "TYN-0051", productName: "เส้นเล็กอบแห้ง 1kg", quantityDelivered: 4, saleUnitLabel: "ห่อ", unitPrice: 110, lineTotal: 440 },
    { id: "mock-item-17", lineNumber: 17, productSku: "TYN-0054", productName: "เส้นหมี่ขาวพิเศษ", quantityDelivered: 6, saleUnitLabel: "ลัง", unitPrice: 210, lineTotal: 1260 },
    { id: "mock-item-18", lineNumber: 18, productSku: "TYN-0059", productName: "เส้นจันท์แห้ง", quantityDelivered: 8, saleUnitLabel: "ห่อ", unitPrice: 58, lineTotal: 464 },
    { id: "mock-item-19", lineNumber: 19, productSku: "TYN-0062", productName: "เส้นบะหมี่หยก", quantityDelivered: 5, saleUnitLabel: "ถุง", unitPrice: 94, lineTotal: 470 },
    { id: "mock-item-20", lineNumber: 20, productSku: "TYN-0068", productName: "เส้นหมี่ฮ่องกง", quantityDelivered: 11, saleUnitLabel: "ห่อ", unitPrice: 43, lineTotal: 473 },
    { id: "mock-item-21", lineNumber: 21, productSku: "TYN-0070", productName: "วุ้นเส้นอบแห้ง", quantityDelivered: 13, saleUnitLabel: "ห่อ", unitPrice: 31, lineTotal: 403 },
    { id: "mock-item-22", lineNumber: 22, productSku: "TYN-0074", productName: "บะหมี่ผักรวม", quantityDelivered: 10, saleUnitLabel: "ถุง", unitPrice: 67, lineTotal: 670 },
    { id: "mock-item-23", lineNumber: 23, productSku: "TYN-0078", productName: "เส้นราเมงสด", quantityDelivered: 6, saleUnitLabel: "แพ็ค", unitPrice: 125, lineTotal: 750 },
    { id: "mock-item-24", lineNumber: 24, productSku: "TYN-0080", productName: "เส้นก๋วยจั๊บญวน", quantityDelivered: 7, saleUnitLabel: "ถุง", unitPrice: 82, lineTotal: 574 },
  ],
};

export default function DeliveryNotePreviewPage() {
  const totalPages = Math.ceil(MOCK.items.length / 12);

  return (
    <>
      <div className="no-print flex items-center gap-3">
        <div className="rounded-xl bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-800">
          Preview Mode - {MOCK.items.length} รายการ / {totalPages} หน้า
        </div>
        <PrintButton />
        <a href="/orders" className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
          กลับ
        </a>
      </div>

      <DeliveryNoteLayout dns={[MOCK]} showIntermediateFooter />
    </>
  );
}
