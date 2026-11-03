"use client";

import { useState } from "react";
import {
  BarChart3,
  FileSpreadsheet,
  FileText,
  Layers,
  Printer,
  Settings,
  Truck,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import {
  PackingListSummaryButton,
  type PackingListSummaryProduct,
  type PackingListSummaryStore,
} from "./packing-list-summary-button";
import { IncomingOrdersDeliveryActions } from "./incoming-orders-delivery-actions";
import { PrintFactoryOrderSheetButton } from "./print-factory-order-sheet-button";
import { PrintPackingListButton } from "./print-packing-list-button";
import { PrintVehicleProductSummaryButton } from "./print-vehicle-product-summary-button";

type VisibleOrderStore = {
  customerId: string;
  customerName: string;
  customerCode: string;
  orderDate: string;
  orderIds?: string[];
  orderNumbers?: string[];
  deliveryNoteIds?: string[];
  orderRounds: number;
  totalAmount: number;
  vehicleId?: string | null;
  vehicleName?: string | null;
};

type MobilePrintActionsProps = {
  date: string;
  endDate: string;
  dateLabel: string;
  summaryProducts: PackingListSummaryProduct[];
  summaryStores: PackingListSummaryStore[];
  visibleOrderStores: VisibleOrderStore[];
};

type ActionCardProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  action: React.ReactNode;
};

function ActionCard({ icon, title, description, action }: ActionCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 transition-all hover:bg-slate-50">
      <div className="flex items-start gap-3">
        {icon}
        <div>
          <h4 className="text-sm font-black text-slate-900">{title}</h4>
          <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{description}</p>
        </div>
      </div>
      <div className="mt-1 flex justify-end border-t border-slate-100/80 pt-3">{action}</div>
    </div>
  );
}

export function MobilePrintActions({
  date,
  endDate,
  dateLabel,
  summaryProducts,
  summaryStores,
  visibleOrderStores,
}: MobilePrintActionsProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#003366] px-5 py-4 text-base font-black text-white shadow-[0_12px_24px_rgba(0,51,102,0.2)] transition active:scale-[0.98] sm:hidden"
      >
        <Printer className="h-5 w-5" strokeWidth={2.5} />
        พิมพ์และจัดการเอกสารออเดอร์
      </button>

      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="animate-in fixed inset-0 z-[500] flex items-end justify-center bg-black/40 backdrop-blur-sm fade-in duration-200"
              onClick={() => setIsOpen(false)}
            >
              <div
                className="animate-in relative z-[510] flex max-h-[85vh] w-full flex-col rounded-t-[28px] bg-white shadow-2xl slide-in-from-bottom duration-300"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">พิมพ์และจัดการเอกสาร</h3>
                    <p className="mt-0.5 text-xs font-semibold text-slate-400">
                      เลือกเอกสารหรือรายงานสรุปออเดอร์ที่ต้องการ
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="rounded-full bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200 active:scale-95"
                    aria-label="ปิด"
                  >
                    <X className="h-5 w-5" strokeWidth={2.5} />
                  </button>
                </div>

                <div className="scrollbar-hide flex-1 space-y-4 overflow-y-auto px-5 py-6 pb-12">
                  <ActionCard
                    icon={
                      <div className="flex shrink-0 items-center justify-center rounded-xl bg-blue-50 p-2.5 text-blue-600">
                        <BarChart3 className="h-5 w-5" strokeWidth={2.5} />
                      </div>
                    }
                    title="สรุปยอดรวมสินค้า (ใบจัดของ)"
                    description="ดูรายงานสรุปยอดรวมจำนวนสินค้าและข้อมูลร้านค้าทั้งหมด เพื่อความสะดวกในการตรวจนับก่อนส่ง"
                    action={
                      <PackingListSummaryButton
                        dateLabel={dateLabel}
                        products={summaryProducts}
                        stores={summaryStores}
                      />
                    }
                  />

                  <ActionCard
                    icon={
                      <div className="flex shrink-0 items-center justify-center rounded-xl bg-indigo-50 p-2.5 text-indigo-600">
                        <FileText className="h-5 w-5" strokeWidth={2.5} />
                      </div>
                    }
                    title="พิมพ์ใบจัดของ (ตารางมาตรฐาน)"
                    description="พิมพ์ใบจัดชุดสินค้าตามออเดอร์ในรูปแบบตารางมาตรฐาน เหมาะสำหรับการบรรจุทั่วไป"
                    action={<PrintPackingListButton date={date} endDate={endDate} />}
                  />

                  <ActionCard
                    icon={
                      <div className="flex shrink-0 items-center justify-center rounded-xl bg-violet-50 p-2.5 text-violet-600">
                        <Layers className="h-5 w-5" strokeWidth={2.5} />
                      </div>
                    }
                    title="พิมพ์ใบจัดของ (สลับตาราง)"
                    description="พิมพ์ตารางใบจัดสินค้าแบบสลับแกนข้อมูล ช่วยประหยัดหน้ากระดาษและเช็กของง่ายขึ้นในกรณีที่ออเดอร์จำนวนมาก"
                    action={
                      <PrintPackingListButton
                        date={date}
                        endDate={endDate}
                        layout="transposed"
                        label="พิมพ์ใบจัดของ (สลับตาราง)"
                      />
                    }
                  />

                  <ActionCard
                    icon={
                      <div className="flex shrink-0 items-center justify-center rounded-xl bg-amber-50 p-2.5 text-amber-600">
                        <Truck className="h-5 w-5" strokeWidth={2.5} />
                      </div>
                    }
                    title="พิมพ์ใบสรุปรายการแยกตามรถ"
                    description="พิมพ์เอกสารใบสรุปของขึ้นขนส่ง แยกรายละเอียดสินค้าตามรถจัดส่งแต่ละคัน"
                    action={<PrintVehicleProductSummaryButton date={date} endDate={endDate} />}
                  />

                  <ActionCard
                    icon={
                      <div className="flex shrink-0 items-center justify-center rounded-xl bg-rose-50 p-2.5 text-rose-600">
                        <FileSpreadsheet className="h-5 w-5" strokeWidth={2.5} />
                      </div>
                    }
                    title="พิมพ์ใบสั่งของโรงงาน (A5 Landscape)"
                    description="พิมพ์ใบสั่งผลิตสินค้าบะหมี่และแผ่นเกี๊ยว ขนาด A5 แนวนอน ส่งโรงงานอนามัยโดยตรง"
                    action={<PrintFactoryOrderSheetButton date={date} endDate={endDate} />}
                  />

                  <ActionCard
                    icon={
                      <div className="flex shrink-0 items-center justify-center rounded-xl bg-emerald-50 p-2.5 text-emerald-600">
                        <Settings className="h-5 w-5" strokeWidth={2.5} />
                      </div>
                    }
                    title="จัดการใบส่งของ / พิมพ์เอกสารขนส่ง"
                    description="จัดการ ออก หรือสั่งพิมพ์ใบส่งของของร้านค้าทั้งหมดในรอบจัดส่งพร้อมกัน"
                    action={
                      <IncomingOrdersDeliveryActions
                        date={date}
                        endDate={endDate}
                        stores={visibleOrderStores}
                      />
                    }
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
