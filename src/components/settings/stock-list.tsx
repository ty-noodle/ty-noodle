import Image from "next/image";
import Link from "next/link";
import { Boxes, Package2, Plus } from "lucide-react";
import {
  SettingsEmptyState,
  SettingsPanel,
  SettingsPanelBody,
} from "@/components/settings/settings-ui";
import type { StockProductOption } from "@/lib/stock/admin";

type StockListProps = {
  baseHref?: string;
  products: StockProductOption[];
};

function formatMoney(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatQuantity(value: number) {
  return value.toLocaleString("th-TH", { maximumFractionDigits: 3 });
}


export function StockList({ products, baseHref = "/settings/stock" }: StockListProps) {
  return (
    <SettingsPanel>
      <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-950">สต็อกคงเหลือ</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            ดูของคงเหลือ จองแล้ว และกดรับเข้าสินค้าได้จากหน้านี้โดยตรง
          </p>
        </div>

        <Link
          href={`${baseHref}?receive=1`}
          className="inline-flex items-center gap-2 rounded-full bg-[#003366] px-4 py-2.5 text-sm font-medium text-white shadow-[0_12px_28px_rgba(0,51,102,0.22)] transition hover:bg-[#002244]"
        >
          <Plus className="h-4 w-4" strokeWidth={2.2} />
          รับสินค้าเข้า
        </Link>
      </div>

      <SettingsPanelBody className="p-0">
        {products.length > 0 ? (
          <>
            {/* Mobile cards */}
            <div className="grid gap-3 px-0 py-0 lg:hidden">
              {products.map((product) => {
                const availableQuantity = product.onHandQuantity - product.reservedQuantity;

                return (
                  <article
                    key={product.id}
                    className={`w-full border-x-0 border-y border-slate-200 bg-white px-4 py-4 shadow-none first:border-t-0 last:border-b-0 ${
                      product.isActive ? "" : "opacity-70"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100">
                        {product.imageUrl ? (
                          <Image
                            src={product.imageUrl}
                            alt={product.name}
                            fill
                            sizes="80px"
                            className="object-contain bg-white p-1"
                          />
                        ) : (
                          <Package2 className="h-7 w-7 text-slate-400" strokeWidth={2.2} />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-semibold leading-6 text-slate-950">
                          {product.name}
                        </p>
                        <p className="mt-0.5 text-sm font-medium text-slate-500">{product.sku}</p>

                        {/* Units and costs */}
                        <div className="mt-2 space-y-1">
                          {product.saleUnits.map((unit) => (
                            <div
                              key={unit.id}
                              className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm ${unit.isDefault ? "bg-blue-50" : "bg-slate-50"}`}
                            >
                              <span className="font-bold text-slate-700">
                                {unit.label}
                                {unit.isDefault && (
                                  <span className="ml-1.5 rounded-full bg-[#003366] px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                                    หลัก
                                  </span>
                                )}
                              </span>
                              <span className="font-bold text-slate-950">
                                {formatMoney(unit.effectiveCostPrice)} บาท
                              </span>
                            </div>
                          ))}
                        </div>

                        <span
                          className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${
                            product.isActive
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {product.isActive ? "ใช้งาน" : "ปิดใช้งาน"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <div className="rounded-xl bg-slate-50 px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                          คงเหลือ
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-950">
                          {formatQuantity(product.onHandQuantity)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                          จองแล้ว
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-950">
                          {formatQuantity(product.reservedQuantity)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                          พร้อมขาย
                        </p>
                        <p className="mt-1 text-sm font-semibold text-[#003366]">
                          {formatQuantity(availableQuantity)}
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-full border-collapse border border-slate-300 text-sm">
                <thead>
                  <tr style={{ backgroundColor: "#003366" }}>
                    {["รหัสสินค้า", "ชื่อสินค้า", "หน่วย", "ต้นทุน / หน่วย", "คงเหลือ", "จองแล้ว", "พร้อมขาย"].map((label, i, arr) => (
                      <th
                        key={label}
                        className={[
                          "whitespace-nowrap px-5 py-4 text-center text-base font-bold text-white",
                          i === 0 ? "border-l border-slate-300" : "",
                          i < arr.length - 1 ? "border-r border-white/60" : "border-r border-slate-300",
                        ].join(" ")}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.map((product, idx) => {
                    const availableQuantity = product.onHandQuantity - product.reservedQuantity;
                    const units = product.saleUnits.length > 0 ? product.saleUnits : [];
                    const rowBg = idx % 2 === 0 ? "bg-white" : "bg-slate-50";
                    const rowSpan = Math.max(units.length, 1);

                    const unitRowBorder = (unitIdx: number) =>
                      unitIdx === units.length - 1
                        ? "border-b border-slate-200"
                        : "border-b border-dashed border-slate-300";

                    return units.length > 0 ? units.map((unit, unitIdx) => (
                      <tr
                        key={`${product.id}-${unit.id}`}
                        className={`${rowBg} ${product.isActive ? "" : "opacity-60"}`}
                      >
                        {unitIdx === 0 && (
                          <>
                            {/* รหัสสินค้า */}
                            <td
                              rowSpan={rowSpan}
                              className="whitespace-nowrap border-b border-l border-r border-slate-300 px-5 py-4 text-center align-middle"
                            >
                              <span className="font-mono text-sm font-bold text-slate-600">
                                {product.sku}
                              </span>
                            </td>

                            {/* รูป + ชื่อสินค้า */}
                            <td
                              rowSpan={rowSpan}
                              className="border-b border-r border-slate-300 px-5 py-4 align-middle"
                            >
                              <div className="flex items-center gap-3">
                                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                                  {product.imageUrl ? (
                                    <Image
                                      src={product.imageUrl}
                                      alt={product.name}
                                      fill
                                      sizes="48px"
                                      className="object-contain bg-white p-1"
                                    />
                                  ) : (
                                    <Package2 className="h-5 w-5 text-slate-400" strokeWidth={2.2} />
                                  )}
                                </div>
                                <span className="whitespace-nowrap text-base font-bold text-slate-950">
                                  {product.name}
                                </span>
                              </div>
                            </td>
                          </>
                        )}

                        {/* หน่วย */}
                        <td className={`border-r border-slate-300 px-5 py-4 text-center align-middle ${unitRowBorder(unitIdx)}`}>
                          <div className="flex items-center gap-1.5 justify-center">
                            <span className="text-base font-bold text-slate-800">{unit.label}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {unit.isDefault
                              ? "หน่วยฐาน"
                              : `1 ${unit.label} = ${formatQuantity(unit.baseUnitQuantity)} ${product.unit}`}
                          </p>
                        </td>

                        {/* ต้นทุน */}
                        <td className={`whitespace-nowrap border-r border-slate-300 px-5 py-4 text-center align-middle ${unitRowBorder(unitIdx)}`}>
                          <span className="text-base font-bold text-slate-950">
                            {formatMoney(unit.effectiveCostPrice)} บาท
                          </span>
                        </td>

                        {unitIdx === 0 && (
                          <>
                            {/* คงเหลือ */}
                            <td
                              rowSpan={rowSpan}
                              className="whitespace-nowrap border-b border-r border-slate-300 px-5 py-4 text-center align-middle"
                            >
                              <span className="text-base font-bold text-slate-950">
                                {formatQuantity(product.onHandQuantity)}
                              </span>
                            </td>

                            {/* จองแล้ว */}
                            <td
                              rowSpan={rowSpan}
                              className="whitespace-nowrap border-b border-r border-slate-300 px-5 py-4 text-center align-middle"
                            >
                              <span className="text-base font-bold text-slate-600">
                                {formatQuantity(product.reservedQuantity)}
                              </span>
                            </td>

                            {/* พร้อมขาย */}
                            <td
                              rowSpan={rowSpan}
                              className="whitespace-nowrap border-b border-r border-slate-300 px-5 py-4 text-center align-middle"
                            >
                              <span
                                className={`text-base font-bold ${
                                  availableQuantity > 0 ? "text-[#003366]" : "text-red-700"
                                }`}
                              >
                                {formatQuantity(availableQuantity)}
                              </span>
                            </td>
                          </>
                        )}
                      </tr>
                    )) : (
                      <tr
                        key={product.id}
                        className={`${rowBg} ${product.isActive ? "" : "opacity-60"}`}
                      >
                        <td className="whitespace-nowrap border-b border-l border-r border-slate-300 px-5 py-4 text-center align-middle">
                          <span className="font-mono text-sm font-bold text-slate-600">{product.sku}</span>
                        </td>
                        <td className="border-b border-r border-slate-300 px-5 py-4 align-middle">
                          <span className="whitespace-nowrap text-base font-bold text-slate-950">{product.name}</span>
                        </td>
                        <td className="whitespace-nowrap border-b border-r border-slate-300 px-5 py-4 text-center align-middle">
                          <span className="text-base font-semibold text-slate-700">{product.unit}</span>
                        </td>
                        <td className="whitespace-nowrap border-b border-r border-slate-300 px-5 py-4 text-center align-middle">
                          <span className="text-base font-bold text-slate-950">—</span>
                        </td>
                        <td className="whitespace-nowrap border-b border-r border-slate-300 px-5 py-4 text-center align-middle">
                          <span className="text-base font-bold text-slate-950">{formatQuantity(product.onHandQuantity)}</span>
                        </td>
                        <td className="whitespace-nowrap border-b border-r border-slate-300 px-5 py-4 text-center align-middle">
                          <span className="text-base font-bold text-slate-600">{formatQuantity(product.reservedQuantity)}</span>
                        </td>
                        <td className="whitespace-nowrap border-b border-r border-slate-300 px-5 py-4 text-center align-middle">
                          <span className={`text-base font-bold ${availableQuantity > 0 ? "text-[#003366]" : "text-red-700"}`}>
                            {formatQuantity(availableQuantity)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="p-6">
            <SettingsEmptyState className="py-14">
              <div className="flex flex-col items-center gap-3">
                <Boxes className="h-8 w-8 text-slate-400" strokeWidth={2.2} />
                <p>ยังไม่มีสินค้าในระบบ เริ่มจากเพิ่มสินค้า แล้วค่อยกลับมารับเข้าสต็อกได้เลย</p>
              </div>
            </SettingsEmptyState>
          </div>
        )}
      </SettingsPanelBody>
    </SettingsPanel>
  );
}
