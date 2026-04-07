"use client";

import { startTransition, useActionState, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CirclePlus, Save, Truck, X } from "lucide-react";
import { receiveStockAction } from "@/app/settings/stock/actions";
import type { ReceiveStockActionState } from "@/app/settings/stock/actions";
import { StockProductSelect } from "@/components/settings/stock-product-select";
import {
  SettingsPanel,
  SettingsPanelBody,
  SettingsPanelHeader,
  settingsFieldLabelClass,
  settingsInputClass,
} from "@/components/settings/settings-ui";
import type { StockProductOption } from "@/lib/stock/admin";

type StockReceiveFormProps = {
  products: StockProductOption[];
  returnHref: string;
  defaultProductId?: string;
};

const initialReceiveStockState: ReceiveStockActionState = {
  fieldErrors: {},
  message: "",
  status: "idle",
};

function toLocalDatetimeValue(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(), "-",
    pad(date.getMonth() + 1), "-",
    pad(date.getDate()), "T",
    pad(date.getHours()), ":",
    pad(date.getMinutes()),
  ].join("");
}

function formatMoney(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatQty(value: number, unit: string) {
  return `${value.toLocaleString("th-TH", { maximumFractionDigits: 3 })} ${unit}`;
}

export function StockReceiveForm({ products, returnHref, defaultProductId = "" }: StockReceiveFormProps) {
  const router = useRouter();
  const [actionState, formAction, isPending] = useActionState(
    receiveStockAction,
    initialReceiveStockState,
  );
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(defaultProductId);
  const [unitQtys, setUnitQtys] = useState<Record<string, string>>({});
  const hasSubmittedRef = useRef(false);
  const [receivedAtDefault] = useState(() => toLocalDatetimeValue());

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) ?? null,
    [products, selectedProductId],
  );

  const handleSuccess = useEffectEvent(() => {
    startTransition(() => {
      router.replace(returnHref);
      router.refresh();
    });
  });

  useEffect(() => {
    if (actionState.status === "success") handleSuccess();
  }, [actionState.status]);

  function closeModal() {
    router.replace(returnHref);
  }

  function handleProductChange(productId: string) {
    setSelectedProductId(productId);
    setUnitQtys({});
  }

  function handleQtyChange(unitId: string, value: string) {
    setUnitQtys((prev) => ({ ...prev, [unitId]: value }));
  }

  const baseUnitLabel = selectedProduct?.saleUnits.find((u) => u.isDefault)?.label ?? selectedProduct?.unit ?? "";

  // คำนวณยอดรวมในหน่วยฐาน + ต้นทุนเฉลี่ยถ่วงน้ำหนัก
  const totals = useMemo(() => {
    if (!selectedProduct || selectedProduct.saleUnits.length === 0) {
      return { avgCostPerBase: 0, totalBaseQty: 0, totalCost: 0 };
    }

    let totalBaseQty = 0;
    let totalCost = 0;

    for (const unit of selectedProduct.saleUnits) {
      const qty = parseFloat(unitQtys[unit.id] ?? "") || 0;
      if (qty <= 0) continue;
      totalBaseQty += qty * unit.baseUnitQuantity;
      totalCost += qty * unit.effectiveCostPrice;
    }

    return {
      avgCostPerBase: totalBaseQty > 0 ? totalCost / totalBaseQty : 0,
      totalBaseQty,
      totalCost,
    };
  }, [selectedProduct, unitQtys]);

  const availableQuantity = selectedProduct
    ? selectedProduct.onHandQuantity - selectedProduct.reservedQuantity
    : null;

  const showFeedback = hasSubmitted && actionState.status !== "idle";
  const showFieldErrors = hasSubmitted && actionState.status === "error";
  const canSubmit = !isPending && !!selectedProductId && totals.totalBaseQty > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 sm:p-4">
      <div className="flex max-h-[96dvh] w-full max-w-4xl flex-col overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
              รับสินค้าเข้า
            </p>
            <div className="mt-1 flex items-center gap-2 text-slate-950">
              <CirclePlus className="h-6 w-6 text-[#003366]" strokeWidth={2.2} />
              <h3 className="text-2xl font-semibold tracking-[-0.02em]">บันทึกรับสินค้าจากโรงงาน</h3>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              เลือกสินค้า แล้วกรอกจำนวนที่รับมาตามแต่ละหน่วย ระบบคำนวณยอดรวมให้อัตโนมัติ
            </p>
          </div>

          <button
            type="button"
            onClick={closeModal}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
            aria-label="ปิด"
          >
            <X className="h-5 w-5" strokeWidth={2.2} />
          </button>
        </div>

        <form
          id="receive-stock"
          action={formAction}
          onSubmit={() => {
            if (!hasSubmittedRef.current) {
              hasSubmittedRef.current = true;
              setHasSubmitted(true);
            }
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          {/* hidden fields — computed totals ส่งไป server action */}
          <input type="hidden" name="productId" value={selectedProductId} />
          <input type="hidden" name="totalQuantity" value={totals.totalBaseQty} />
          <input type="hidden" name="baseUnit" value={selectedProduct?.unit ?? ""} />
          <input type="hidden" name="avgUnitCost" value={totals.avgCostPerBase} />

          {showFeedback ? (
            <div className="shrink-0 px-5 pt-5 sm:px-6 sm:pt-6">
              <div
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  actionState.status === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {actionState.message}
              </div>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
            <div className="space-y-6">

              {/* เลือกสินค้า */}
              <SettingsPanel>
                <SettingsPanelHeader
                  icon="inventory"
                  title="เลือกรายการสินค้า"
                  description="ดึงจากสินค้าที่มีอยู่ในระบบ พร้อมรูปสินค้าเล็ก ๆ เพื่อให้หาได้ง่ายขึ้น"
                />
                <SettingsPanelBody className="space-y-5">
                  <div>
                    <label className={settingsFieldLabelClass} htmlFor="receive-product">
                      สินค้า
                    </label>
                    <StockProductSelect
                      id="receive-product"
                      products={products}
                      value={selectedProductId}
                      onChange={handleProductChange}
                    />
                    {showFieldErrors && actionState.fieldErrors.productId ? (
                      <p className="mt-2 text-sm text-red-600">{actionState.fieldErrors.productId}</p>
                    ) : null}
                  </div>

                  {selectedProduct ? (
                    <div className="grid grid-cols-3 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">คงเหลือ</p>
                        <p className="mt-1 text-lg font-semibold text-slate-950">
                          {formatQty(selectedProduct.onHandQuantity, selectedProduct.unit)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">จองแล้ว</p>
                        <p className="mt-1 text-lg font-semibold text-slate-950">
                          {formatQty(selectedProduct.reservedQuantity, selectedProduct.unit)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">พร้อมขาย</p>
                        <p className="mt-1 text-lg font-semibold text-[#003366]">
                          {availableQuantity !== null ? formatQty(availableQuantity, selectedProduct.unit) : "—"}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </SettingsPanelBody>
              </SettingsPanel>

              {/* hidden fields — วันที่ใช้วันปัจจุบัน, ผู้ขาย default โรงงานหลัก */}
              <input type="hidden" name="receivedAt" value={receivedAtDefault} />
              <input type="hidden" name="supplierName" value="โรงงานหลัก" />

              {/* จำนวนรับเข้าตามหน่วย */}
              {selectedProduct ? (
                <SettingsPanel>
                  <SettingsPanelHeader
                    icon="inventory"
                    title="จำนวนรับเข้าตามหน่วย"
                    description="กรอกจำนวนที่รับมาในแต่ละหน่วย ไม่รับหน่วยใดก็เว้นว่างได้"
                  />
                  <SettingsPanelBody className="space-y-3">

                    {/* rows ต่อหน่วย */}
                    {selectedProduct.saleUnits.map((unit) => {
                      const qty = parseFloat(unitQtys[unit.id] ?? "") || 0;
                      const baseQty = qty * unit.baseUnitQuantity;
                      const hasQty = qty > 0;

                      return (
                        <div
                          key={unit.id}
                          className="rounded-2xl border border-slate-200 bg-slate-50/70 px-5 py-4"
                        >
                          <div className="grid grid-cols-[1fr_auto] items-center gap-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                              {/* qty input */}
                              <div>
                                <div className="mb-1.5 flex items-center gap-2">
                                  <label
                                    className={settingsFieldLabelClass}
                                    htmlFor={`unit-qty-${unit.id}`}
                                  >
                                    จำนวน ({unit.label})
                                  </label>
                                  {unit.isDefault && (
                                    <span className="rounded-full bg-[#003366] px-2 py-0.5 text-[10px] font-bold leading-none text-white">
                                      หลัก
                                    </span>
                                  )}
                                </div>
                                <input
                                  id={`unit-qty-${unit.id}`}
                                  type="number"
                                  min="0"
                                  step="0.001"
                                  value={unitQtys[unit.id] ?? ""}
                                  onChange={(e) => handleQtyChange(unit.id, e.target.value)}
                                  className={settingsInputClass}
                                  placeholder="0"
                                />
                              </div>

                              {/* ต้นทุน — read only จาก settings */}
                              <div>
                                <p className={`${settingsFieldLabelClass} mb-1.5`}>
                                  ต้นทุน / {unit.label}
                                </p>
                                <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-base font-bold text-slate-950">
                                  {formatMoney(unit.effectiveCostPrice)} บาท
                                </div>
                                {!unit.isDefault ? (
                                  <p className="mt-1 text-xs text-slate-400">
                                    1 {unit.label} = {unit.baseUnitQuantity} {selectedProduct.unit}
                                  </p>
                                ) : null}
                              </div>
                            </div>

                            {/* conversion preview */}
                            <div className="min-w-[5rem] text-right">
                              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                                = {selectedProduct.unit}
                              </p>
                              <p className={`mt-0.5 text-lg font-bold tabular-nums ${hasQty ? "text-slate-950" : "text-slate-300"}`}>
                                {hasQty
                                  ? baseQty.toLocaleString("th-TH", { maximumFractionDigits: 3 })
                                  : "—"}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* สรุปยอดรวม */}
                    {totals.totalBaseQty > 0 ? (
                      <div className="rounded-2xl border border-[#003366]/25 bg-blue-50 px-5 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#003366]">
                          ยอดรวมที่จะรับเข้า
                        </p>
                        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
                          <div>
                            <p className="text-2xl font-bold text-slate-950">
                              {formatQty(totals.totalBaseQty, baseUnitLabel)}
                            </p>
                            <p className="mt-0.5 text-sm text-slate-500">
                              ต้นทุนเฉลี่ย {formatMoney(totals.avgCostPerBase)} บาท / {baseUnitLabel}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                              ต้นทุนรวม
                            </p>
                            <p className="text-xl font-bold text-slate-950">
                              {formatMoney(totals.totalCost)} บาท
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-400">
                        กรอกจำนวนอย่างน้อยหนึ่งหน่วยเพื่อดูยอดรวม
                      </div>
                    )}

                    {showFieldErrors && actionState.fieldErrors.totalQuantity ? (
                      <p className="text-sm text-red-600">{actionState.fieldErrors.totalQuantity}</p>
                    ) : null}

                    <div>
                      <label className={settingsFieldLabelClass} htmlFor="receive-notes">
                        หมายเหตุ
                      </label>
                      <textarea
                        id="receive-notes"
                        name="notes"
                        rows={3}
                        className={`${settingsInputClass} min-h-28 resize-y`}
                        placeholder="เช่น รับเข้าเพิ่มสำหรับรอบส่งวันพรุ่งนี้"
                      />
                    </div>
                  </SettingsPanelBody>
                </SettingsPanel>
              ) : null}

              <div className="rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-4 text-sm leading-6 text-sky-800">
                <div className="flex items-start gap-3">
                  <Truck className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={2.2} />
                  <p>
                    เมื่อบันทึกรับเข้า ระบบจะเพิ่มจำนวนคงเหลือสินค้า อัปเดตต้นทุนเฉลี่ย
                    และเก็บประวัติการเคลื่อนไหวสต็อกให้อัตโนมัติ
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-100 bg-white px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
            <button
              type="button"
              onClick={closeModal}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 rounded-xl bg-[#003366] px-5 py-3 text-sm font-medium text-white shadow-[0_12px_30px_rgba(0,51,102,0.22)] transition hover:bg-[#002244] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" strokeWidth={2.2} />
              บันทึกรับเข้า
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
