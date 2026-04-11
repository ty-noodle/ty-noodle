import Image from "next/image";
import Link from "next/link";
import { Package2, Pencil, Plus, Power } from "lucide-react";
import { deleteProduct, setProductActive } from "@/app/dashboard/settings/actions";
import { DeleteProductButton } from "@/components/settings/delete-product-button";
import { ProductCostHistoryButton } from "@/components/settings/product-cost-history-button";
import {
  SettingsEmptyState,
  SettingsPanel,
  SettingsPanelBody,
} from "@/components/settings/settings-ui";
import type { SettingsProduct } from "@/lib/settings/admin";

type ProductListProps = {
  baseListHref?: string;
  products: SettingsProduct[];
};

function formatCost(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getCostNote(unit: SettingsProduct["saleUnits"][number]) {
  if (unit.isDefault) return "ต้นทุนฐาน";
  if (unit.costMode === "fixed") return "กำหนดเอง";
  return "คำนวณอัตโนมัติ";
}

export function ProductList({ products, baseListHref = "/settings/products" }: ProductListProps) {
  const createHref = `${baseListHref}${baseListHref.includes("?") ? "&" : "?"}create=1`;
  const editHref = (id: string) =>
    `${baseListHref}${baseListHref.includes("?") ? "&" : "?"}edit=${id}`;

  return (
    <>
    {/* Floating add button — always visible while scrolling */}
    <Link
      href={createHref}
      scroll={false}
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] right-4 z-50 inline-flex items-center gap-2 rounded-full bg-[#003366] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_8px_32px_rgba(0,51,102,0.35)] transition hover:bg-[#002244] active:scale-95 md:bottom-6 md:right-6"
    >
      <Plus className="h-4 w-4" strokeWidth={2.5} />
      เพิ่มสินค้า
    </Link>

    <SettingsPanel>
      <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-950">รายการสินค้า</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            ดูสินค้าและจัดการสินค้าได้ที่นี่
          </p>
        </div>
      </div>

      <SettingsPanelBody className="p-0">
        {products.length > 0 ? (
          <>
            {/* Mobile cards */}
            <div className="grid grid-cols-1 gap-3 px-0 py-0 sm:hidden">
              {products.map((product) => {
                const deleteFormId = `delete-product-${product.id}`;

                return (
                  <article
                    key={product.id}
                    className={`w-full border-x-0 border-y border-t-4 border-t-[#003366] border-y-slate-200 bg-white px-4 py-5 shadow-none first:border-t-4 last:border-b-0 ${
                      product.isActive ? "" : "opacity-70"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100">
                        {product.imageUrls[0] ? (
                          <Image
                            src={product.imageUrls[0]}
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
                        <p className="text-[11px] font-bold uppercase tracking-wider text-[#003366]">
                          {product.sku}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-base font-bold text-slate-950">
                          {product.name}
                        </p>
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
                                {formatCost(unit.effectiveCostPrice)} บาท
                              </span>
                            </div>
                          ))}
                        </div>
                        <span
                          className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${
                            product.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {product.isActive ? "ใช้งาน" : "ปิดใช้งาน"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-50 pt-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={editHref(product.id)}
                          scroll={false}
                          className="action-touch-safe inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                        >
                          <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                          แก้ไข
                        </Link>

                        <ProductCostHistoryButton productId={product.id} productName={product.name} />

                        <form action={setProductActive}>
                          <input type="hidden" name="productId" value={product.id} />
                          <input type="hidden" name="nextState" value={product.isActive ? "false" : "true"} />
                          <button
                            type="submit"
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                          >
                            <Power className="h-3.5 w-3.5" strokeWidth={2} />
                            {product.isActive ? "ปิด" : "เปิด"}
                          </button>
                        </form>
                      </div>

                      <div className="flex items-center">
                        <form id={deleteFormId} action={deleteProduct}>
                          <input type="hidden" name="productId" value={product.id} />
                        </form>
                        <DeleteProductButton formId={deleteFormId} productName={product.name} />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="min-w-full border-collapse border border-slate-300 text-left">
                <thead>
                  <tr style={{ backgroundColor: "#003366" }}>
                    <th
                      style={{ color: "white" }}
                      className="border-b border-r border-white/20 px-6 py-5 text-center text-base font-bold uppercase tracking-[0.16em]"
                    >
                      รหัสสินค้า
                    </th>
                    <th
                      style={{ color: "white" }}
                      className="border-b border-r border-white/20 px-6 py-5 text-center text-base font-bold uppercase tracking-[0.16em]"
                    >
                      รายการสินค้า
                    </th>
                    <th
                      style={{ color: "white" }}
                      className="border-b border-r border-white/20 px-6 py-5 text-center text-base font-bold uppercase tracking-[0.16em]"
                    >
                      หน่วยขาย
                    </th>
                    <th
                      style={{ color: "white" }}
                      className="border-b border-r border-white/20 px-6 py-5 text-center text-base font-bold uppercase tracking-[0.16em]"
                    >
                      ต้นทุน / หน่วย
                    </th>
                    <th
                      style={{ color: "white" }}
                      className="border-b border-r border-white/20 px-6 py-5 text-center text-base font-bold uppercase tracking-[0.16em]"
                    >
                      สถานะ
                    </th>
                    <th
                      style={{ color: "white" }}
                      className="border-b border-white/20 px-6 py-5 text-center text-base font-bold uppercase tracking-[0.16em]"
                    >
                      จัดการ
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {products.map((product) => {
                    const deleteFormId = `delete-product-table-${product.id}`;
                    const isMultiUnit = product.saleUnits.length > 1;

                    return (
                      <tr
                        key={product.id}
                        className={product.isActive ? "" : "bg-slate-50/60 opacity-60"}
                      >
                        {/* รหัสสินค้า */}
                        <td className="border-r border-slate-300 px-6 py-5 text-center align-middle text-base font-bold text-slate-900">
                          {product.sku}
                        </td>

                        {/* รายการสินค้า */}
                        <td className="border-r border-slate-300 px-6 py-5 align-middle">
                          <div className="flex items-center gap-4">
                            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                              {product.imageUrls[0] ? (
                                <Image
                                  src={product.imageUrls[0]}
                                  alt={product.name}
                                  fill
                                  sizes="64px"
                                  className="object-contain bg-white p-1"
                                />
                              ) : (
                                <Package2 className="h-7 w-7 text-slate-400" strokeWidth={2.2} />
                              )}
                            </div>
                            <p className="text-base font-bold text-slate-950">{product.name}</p>
                          </div>
                        </td>

                        {/* หน่วยขาย — stacked slots */}
                        <td className={`border-r border-slate-300 p-0 ${isMultiUnit ? "align-top" : "align-middle"}`}>
                          <div className="flex flex-col">
                            {product.saleUnits.map((unit, index) => (
                              <div
                                key={unit.id}
                                className={`flex min-h-[3.25rem] items-center px-5 py-2.5 ${index > 0 ? "border-t border-dashed border-slate-300" : ""}`}
                              >
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-base font-bold text-slate-800">{unit.label}</span>
                                  </div>
                                  <p className="mt-0.5 text-xs text-slate-400">
                                    {unit.isDefault
                                      ? "หน่วยฐาน"
                                      : `1 ${unit.label} = ${unit.baseUnitQuantity} ${product.baseUnit}`}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>

                        {/* ต้นทุน / หน่วย — stacked slots aligned with units */}
                        <td className={`border-r border-slate-300 p-0 ${isMultiUnit ? "align-top" : "align-middle"}`}>
                          <div className="flex flex-col">
                            {product.saleUnits.map((unit, index) => (
                              <div
                                key={unit.id}
                                className={`flex min-h-[3.25rem] items-center px-5 py-2.5 ${index > 0 ? "border-t border-dashed border-slate-300" : ""}`}
                              >
                                <div>
                                  <p className="text-base font-bold text-slate-950">
                                    {formatCost(unit.effectiveCostPrice)} บาท
                                  </p>
                                  <p className="mt-0.5 text-xs text-slate-400">
                                    {getCostNote(unit)}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>

                        {/* สถานะ */}
                        <td className="border-r border-slate-300 px-6 py-5 text-center align-middle">
                          <span
                            className={`inline-flex rounded-full px-4 py-1.5 text-xs font-bold leading-none ${
                              product.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {product.isActive ? "ใช้งาน" : "ปิดใช้งาน"}
                          </span>
                        </td>

                        {/* จัดการ */}
                        <td className="px-6 py-5 text-center align-middle">
                          <div className="flex items-center justify-center gap-2">
                            <Link
                              href={editHref(product.id)}
                              scroll={false}
                              className="action-touch-safe inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
                            >
                              <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                              แก้ไข
                            </Link>

                            <ProductCostHistoryButton productId={product.id} productName={product.name} />

                            <form action={setProductActive}>
                              <input type="hidden" name="productId" value={product.id} />
                              <input type="hidden" name="nextState" value={product.isActive ? "false" : "true"} />
                              <button
                                type="submit"
                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
                              >
                                <Power className="h-3.5 w-3.5" strokeWidth={2} />
                                {product.isActive ? "ปิด" : "เปิด"}
                              </button>
                            </form>

                            <div className="ml-1">
                              <form id={deleteFormId} action={deleteProduct}>
                                <input type="hidden" name="productId" value={product.id} />
                              </form>
                              <DeleteProductButton formId={deleteFormId} productName={product.name} />
                            </div>
                          </div>
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
              {'ยังไม่มีสินค้าในระบบ กดปุ่ม "เพิ่มสินค้า" เพื่อเริ่มสร้างรายการแรก'}
            </SettingsEmptyState>
          </div>
        )}
      </SettingsPanelBody>
    </SettingsPanel>
    </>
  );
}
