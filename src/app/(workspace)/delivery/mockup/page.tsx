/**
 * Mockup: Compact delivery board with a single sticky column header.
 * Store-level column headers are removed — one global header is pinned instead.
 * No auth required. Preview only.
 */

import { FileText } from "lucide-react";

function fmtMoney(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQty(n: number) {
  return n.toLocaleString("th-TH", { maximumFractionDigits: 3 });
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

type MockLine = {
  sku: string;
  name: string;
  unit: string;
  ordered: number;
  delivered: number;
  unitPrice: number;
};

type MockStore = {
  code: string;
  name: string;
  deliveryNumber: string;
  billingNumber: string | null;
  lines: MockLine[];
};

const STORES: MockStore[] = [
  {
    code: "TYS-0001",
    name: "ร้านก๋วยเตี๋ยวเจ้าเก่า",
    deliveryNumber: "DN20260401001",
    billingNumber: null,
    lines: [
      { sku: "TYN-0001", name: "เส้นก๋วยเตี๋ยวเล็ก (เส้นขาว)", unit: "ลัง", ordered: 10, delivered: 10, unitPrice: 250 },
      { sku: "TYN-0002", name: "เส้นหมี่ขาวใหญ่ พรีเมียม", unit: "ลัง", ordered: 5, delivered: 5, unitPrice: 280 },
      { sku: "TYN-0008", name: "วุ้นเส้น (ห่อเล็ก 200g)", unit: "ห่อ", ordered: 20, delivered: 17, unitPrice: 25 },
      { sku: "TYN-0015", name: "เส้นบะหมี่เหลือง สด", unit: "ถุง", ordered: 3, delivered: 3, unitPrice: 141.67 },
    ],
  },
  {
    code: "TYS-0002",
    name: "ร้านต้มยำปลาทู",
    deliveryNumber: "DN20260401002",
    billingNumber: "BL-2026-0042",
    lines: [
      { sku: "TYN-0003", name: "เส้นใหญ่ (เส้นขาว)", unit: "ลัง", ordered: 8, delivered: 8, unitPrice: 120 },
      { sku: "TYN-0010", name: "เส้นเล็กแห้ง 400g", unit: "ห่อ", ordered: 20, delivered: 20, unitPrice: 35 },
    ],
  },
  {
    code: "TYS-0003",
    name: "ร้านข้าวต้มเปิดใหม่",
    deliveryNumber: "DN20260401003",
    billingNumber: null,
    lines: [
      { sku: "TYN-0012", name: "บะหมี่กึ่งสำเร็จรูป รสหมู", unit: "ลัง", ordered: 4, delivered: 4, unitPrice: 180 },
      { sku: "TYN-0020", name: "เส้นหมี่เหลือง (แห้ง 500g)", unit: "ห่อ", ordered: 12, delivered: 10, unitPrice: 45 },
      { sku: "TYN-0025", name: "เส้นก๋วยจั๊บ (แห้ง)", unit: "ถุง", ordered: 6, delivered: 6, unitPrice: 90 },
      { sku: "TYN-0031", name: "เส้นขนมจีน สด (แพ็ค 1kg)", unit: "แพ็ค", ordered: 2, delivered: 2, unitPrice: 320 },
      { sku: "TYN-0040", name: "เส้นโซบะญี่ปุ่น", unit: "ลัง", ordered: 3, delivered: 3, unitPrice: 350 },
    ],
  },
  {
    code: "TYS-0004",
    name: "ร้านหมูกระทะริมทาง",
    deliveryNumber: "DN20260401004",
    billingNumber: null,
    lines: [
      { sku: "TYN-0041", name: "หมี่กรอบ (ถุงใหญ่)", unit: "ห่อ", ordered: 15, delivered: 15, unitPrice: 28 },
      { sku: "TYN-0042", name: "เส้นอูด้ง สด", unit: "ถุง", ordered: 5, delivered: 5, unitPrice: 95 },
      { sku: "TYN-0045", name: "เส้นใหญ่แห้ง 500g", unit: "แพ็ค", ordered: 7, delivered: 7, unitPrice: 88 },
    ],
  },
  {
    code: "TYS-0005",
    name: "ครัวป้าแดง",
    deliveryNumber: "DN20260401005",
    billingNumber: "BL-2026-0039",
    lines: [
      { sku: "TYN-0048", name: "บะหมี่ไข่ สด", unit: "ถุง", ordered: 9, delivered: 9, unitPrice: 72 },
      { sku: "TYN-0051", name: "เส้นเล็กอบแห้ง 1kg", unit: "ห่อ", ordered: 4, delivered: 4, unitPrice: 110 },
      { sku: "TYN-0054", name: "เส้นหมี่ขาวพิเศษ", unit: "ลัง", ordered: 6, delivered: 4, unitPrice: 210 },
      { sku: "TYN-0059", name: "เส้นจันท์แห้ง", unit: "ห่อ", ordered: 8, delivered: 8, unitPrice: 58 },
      { sku: "TYN-0062", name: "เส้นบะหมี่หยก", unit: "ถุง", ordered: 5, delivered: 5, unitPrice: 94 },
      { sku: "TYN-0068", name: "เส้นหมี่ฮ่องกง", unit: "ห่อ", ordered: 11, delivered: 11, unitPrice: 43 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function StoreGroupHeader({ store }: { store: MockStore }) {
  const total = store.lines.reduce((s, l) => s + l.delivered * l.unitPrice, 0);
  const short = store.lines.some((l) => l.delivered < l.ordered);

  return (
    <tr>
      <td
        colSpan={10}
        className="border-t-2 border-[#0a2340] bg-[#0f2f56] px-4 py-2"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-white/70">{store.code}</span>
            <span className="h-3.5 w-px bg-white/20" />
            <span className="text-base font-bold text-white">{store.name}</span>
            <span className="h-3.5 w-px bg-white/20" />
            <span className="font-mono text-sm font-bold text-white">{store.deliveryNumber}</span>
            <span className="h-3.5 w-px bg-white/20" />
            {store.billingNumber ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                <FileText className="h-3 w-3 shrink-0" strokeWidth={2.2} />
                วางบิลแล้ว · {store.billingNumber}
              </span>
            ) : short ? (
              <span className="inline-flex items-center rounded-full bg-rose-600 px-2.5 py-0.5 text-xs font-bold text-white">ขาด</span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-emerald-500 px-2.5 py-0.5 text-xs font-bold text-white">ครบ</span>
            )}
          </div>
          <span className="text-sm font-bold text-white/80 tabular-nums">
            รวม {fmtMoney(total)} บาท
          </span>
        </div>
      </td>
    </tr>
  );
}

function ProductRow({ line, rowNum }: { line: MockLine; rowNum: number }) {
  const lineTotal = line.delivered * line.unitPrice;
  const short = line.delivered < line.ordered;
  const shortQty = line.ordered - line.delivered;

  return (
    <tr className={`border-t border-slate-100 text-sm ${short ? "bg-rose-50/50" : "hover:bg-slate-50/40"}`}>
      <td className="border-r border-slate-100 px-3 py-2 text-center text-xs text-slate-400 tabular-nums">{rowNum}</td>
      <td className="border-r border-slate-100 px-3 py-2 text-left">
        <span className="font-mono text-xs text-slate-500">{line.sku}</span>
      </td>
      <td className="border-r border-slate-100 px-3 py-2 text-left font-semibold text-slate-800">{line.name}</td>
      <td className="border-r border-slate-100 px-3 py-2 text-center text-slate-600">{line.unit}</td>
      <td className="border-r border-slate-100 px-3 py-2 text-center tabular-nums font-semibold text-slate-600">
        {fmtQty(line.ordered)}
      </td>
      <td className="border-r border-slate-100 px-3 py-2 text-center tabular-nums font-semibold text-slate-900">
        {fmtQty(line.delivered)}
      </td>
      <td className="border-r border-slate-100 px-3 py-2 text-center">
        {short ? (
          <span className="tabular-nums font-semibold text-rose-600">{fmtQty(shortQty)}</span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
      <td className="border-r border-slate-100 px-3 py-2 text-right tabular-nums text-slate-600">
        {fmtMoney(line.unitPrice)}
      </td>
      <td className="border-r border-slate-100 px-3 py-2 text-right tabular-nums font-bold text-slate-900">
        {fmtMoney(lineTotal)}
      </td>
      <td className="px-3 py-2 text-center">
        <span className="text-xs font-semibold text-[#0f2f56] underline decoration-slate-300 underline-offset-2 cursor-pointer">แก้ไข</span>
      </td>
    </tr>
  );
}

function StoreTotalRow({ store }: { store: MockStore }) {
  const total = store.lines.reduce((s, l) => s + l.delivered * l.unitPrice, 0);
  const totalOrdered = store.lines.reduce((s, l) => s + l.ordered * l.unitPrice, 0);
  const shortAmt = Math.max(0, totalOrdered - total);

  return (
    <tr className="border-t border-slate-200 bg-slate-50">
      <td
        colSpan={8}
        className="border-r border-slate-200 px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500"
      >
        ยอดรวม — {store.name}
        {shortAmt > 0 && (
          <span className="ml-3 text-rose-600">ขาด {fmtMoney(shortAmt)} บาท</span>
        )}
      </td>
      <td className="border-r border-slate-200 px-3 py-2 text-right tabular-nums font-bold text-slate-900">
        {fmtMoney(total)}
      </td>
      <td className="px-3 py-2" />
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const metadata = { title: "Mockup — หน้าจัดส่ง (Sticky Header)" };

export default function DeliveryMockupPage() {
  // grand totals
  const grandTotal = STORES.reduce(
    (s, store) => s + store.lines.reduce((ss, l) => ss + l.delivered * l.unitPrice, 0),
    0,
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* Page title + notice */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">หน้าจัดส่ง — Mockup</h1>
          <p className="mt-1 text-sm text-slate-500">
            ทดสอบ layout: หัวคอลัมน์เดียว ตรึงบนหน้าจอ · ไม่มีหัวคอลัมน์ซ้ำในแต่ละร้าน
          </p>
        </div>
        <div className="flex gap-2">
          <span className="rounded-xl bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-800">
            Mockup — ข้อมูลจำลอง
          </span>
          <a
            href="/delivery"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            กลับหน้าจัดส่งจริง
          </a>
        </div>
      </div>

      {/* Summary strip */}
      <section className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid divide-y divide-slate-100 md:grid-cols-4 md:divide-x md:divide-y-0">
          <article className="px-5 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">ร้านค้า</p>
            <p className="mt-1 text-xl font-bold text-slate-950">{STORES.length}</p>
          </article>
          <article className="px-5 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">รายการรวม</p>
            <p className="mt-1 text-xl font-bold text-slate-950">
              {STORES.reduce((s, st) => s + st.lines.length, 0)}
            </p>
          </article>
          <article className="px-5 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">ยอดจัดส่ง</p>
            <p className="mt-1 text-xl font-bold text-slate-950">{fmtMoney(grandTotal)} บาท</p>
          </article>
          <article className="px-5 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">วันที่</p>
            <p className="mt-1 text-xl font-bold text-slate-950">01/04/2569</p>
          </article>
        </div>
      </section>

      {/*
        Main table — sticky header แยกออกจาก overflow-x container
        เหตุผล: overflow-x: auto บน ancestor ทำให้ position:sticky ไม่ทำงาน
        วิธีแก้: แยก thead ออกเป็น sticky div ข้างนอก overflow container
        ใช้ table-fixed + colgroup เดียวกันทั้งสองตาราง ให้ความกว้างคอลัมน์ตรงกัน
      */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">

        {/* ── Sticky header (ไม่อยู่ใน overflow container) ── */}
        <div className="sticky top-0 z-10 rounded-t-2xl overflow-hidden border-b border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm table-fixed">
              <colgroup>
                <col style={{ width: 40 }} />
                <col style={{ width: 112 }} />
                <col />
                <col style={{ width: 64 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 64 }} />
                <col style={{ width: 112 }} />
                <col style={{ width: 112 }} />
                <col style={{ width: 64 }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-100 text-xs font-semibold uppercase tracking-[0.09em]">
                  <th className="border-r border-slate-200 px-3 py-2.5 text-center text-slate-600">#</th>
                  <th className="border-r border-slate-200 px-3 py-2.5 text-left text-slate-600">รหัสสินค้า</th>
                  <th className="border-r border-slate-200 px-3 py-2.5 text-left text-slate-600">ชื่อสินค้า</th>
                  <th className="border-r border-slate-200 px-3 py-2.5 text-center text-slate-600">หน่วย</th>
                  <th className="border-r border-slate-200 px-3 py-2.5 text-center text-slate-600">สั่ง</th>
                  <th className="border-r border-slate-200 px-3 py-2.5 text-center text-slate-600">ส่งจริง</th>
                  <th className="border-r border-slate-200 px-3 py-2.5 text-center text-slate-600">ขาด</th>
                  <th className="border-r border-slate-200 px-3 py-2.5 text-right text-slate-600">ราคา/หน่วย</th>
                  <th className="border-r border-slate-200 px-3 py-2.5 text-right text-slate-600">ยอดเงิน</th>
                  <th className="px-3 py-2.5 text-center text-slate-600">จัดการ</th>
                </tr>
              </thead>
            </table>
          </div>
        </div>

        {/* ── Body (overflow-x แยกต่างหาก ไม่กระทบ sticky header) ── */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm table-fixed">
            <colgroup>
              <col style={{ width: 40 }} />
              <col style={{ width: 112 }} />
              <col />
              <col style={{ width: 64 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 64 }} />
              <col style={{ width: 112 }} />
              <col style={{ width: 112 }} />
              <col style={{ width: 64 }} />
            </colgroup>
            <tbody>
              {STORES.map((store) => {
                let rowNum = 0;
                return (
                  <>
                    <StoreGroupHeader key={`hdr-${store.code}`} store={store} />
                    {store.lines.map((line) => {
                      rowNum += 1;
                      return (
                        <ProductRow
                          key={`${store.code}-${line.sku}`}
                          line={line}
                          rowNum={rowNum}
                        />
                      );
                    })}
                    <StoreTotalRow key={`tot-${store.code}`} store={store} />
                  </>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-100">
                <td
                  colSpan={8}
                  className="border-r border-slate-200 px-4 py-3 text-right text-sm font-bold uppercase tracking-wide text-slate-700"
                >
                  ยอดรวมทั้งวัน ({STORES.length} ร้านค้า)
                </td>
                <td className="border-r border-slate-200 px-3 py-3 text-right tabular-nums text-base font-bold text-slate-950">
                  {fmtMoney(grandTotal)}
                </td>
                <td className="px-3 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Footer note */}
      <p className="mt-4 text-center text-xs text-slate-400">
        Mockup เปรียบเทียบ layout · ไม่ใช่ข้อมูลจริง
      </p>
    </div>
  );
}
