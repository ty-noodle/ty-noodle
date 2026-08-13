"use client";

import React, { memo, useDeferredValue, useMemo } from "react";
import Image from "next/image";
import { Minus, Plus, Search, X } from "lucide-react";
import type { ProductWithImage } from "@/app/order/customer/types";
import type { CustomerOrderRow } from "@/app/order/customer/order-client-types";
import {
  getEffectiveOrderMinimum,
  getEffectiveOrderStep,
  normalizeOrderQuantity,
} from "@/lib/orders/quantity-rules";

type OrderEditViewProps = {
  editCart: Record<string, number>;
  editingOrder: CustomerOrderRow | null;
  getDisplayUnit: (unit: string | null | undefined) => string;
  isPending: boolean;
  onBackToHistory: () => void;
  onOpenAddProductSheet: () => void;
  onSaveEditedOrder: () => void;
  onUpdateEditQuantity: (productId: string, nextQuantity: number) => void;
  productsById: Map<string, ProductWithImage>;
};

type EditOrderProductSheetProps = {
  addProductSearch: string;
  editCart: Record<string, number>;
  getDisplayUnit: (unit: string | null | undefined) => string;
  isOpen: boolean;
  onClose: () => void;
  onSetAddProductSearch: (value: string) => void;
  onUpdateEditQuantity: (productId: string, nextQuantity: number) => void;
  products: ProductWithImage[];
};

export const OrderEditView = memo(function OrderEditView({
  editCart,
  editingOrder,
  getDisplayUnit,
  isPending,
  onBackToHistory,
  onOpenAddProductSheet,
  onSaveEditedOrder,
  onUpdateEditQuantity,
  productsById,
}: OrderEditViewProps) {
  return (
    <section className="space-y-4 p-4">
      <div className="rounded-[2rem] border border-[#003366]/10 bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-5 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.04)]">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#003366]/60">
          แก้ไขคำสั่งซื้อ
        </div>
        <h2 className="mt-2 text-xl font-bold text-slate-900">
          {editingOrder?.order_number ?? "-"}
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          ปรับจำนวนหรือลบรายการได้ก่อนเวลา 17:00 น. แล้วกดบันทึกการแก้ไข
        </p>
      </div>

      {/* Action Buttons at Top */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onBackToHistory}
          className="flex items-center justify-center gap-2 rounded-2xl border border-[#003366]/15 bg-[#eef4fa] px-4 py-3 text-sm font-bold text-[#003366] transition-all active:scale-[0.98]"
        >
          <X className="h-4 w-4" />
          ยกเลิก
        </button>
        <button
          onClick={onSaveEditedOrder}
          disabled={isPending}
          className="flex items-center justify-center gap-2 rounded-2xl bg-[#003366] px-4 py-3 text-sm font-bold text-white shadow-[0_8px_16px_rgba(0,51,102,0.15)] transition-all active:scale-[0.98] disabled:opacity-60"
        >
          {isPending ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
        </button>
        <button
          onClick={onOpenAddProductSheet}
          className="col-span-2 flex items-center justify-center gap-2 rounded-2xl border border-[#003366]/20 bg-white px-4 py-3 text-sm font-bold text-[#003366] shadow-[0_4px_12px_rgba(0,51,102,0.06)] transition-all active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          เพิ่มสินค้าใหม่เข้าในออเดอร์นี้
        </button>
      </div>

      <div className="border-t border-slate-100 pt-2" />

      {Object.entries(editCart).length === 0 ? (
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.04)]">
          ไม่มีรายการสินค้าในคำสั่งซื้อนี้
        </div>
      ) : (
        Object.entries(editCart).map(([productId, quantity]) => {
          const product = productsById.get(productId);
          if (!product) return null;
          const imageUrl = product.product_images?.[0]?.public_url || "/placeholders/product-placeholder.svg";
          const configuredStepQty = product.step_order_qty ?? null;
          const minQty = getEffectiveOrderMinimum(product.min_order_qty ?? 1, configuredStepQty);
          const stepQty = getEffectiveOrderStep(configuredStepQty);

          return (
            <article key={product.id} className="flex gap-4 rounded-[2rem] border border-slate-50 bg-white p-4 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.04)]">
              <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-3xl bg-slate-100">
                <Image
                  src={imageUrl}
                  alt={product.name}
                  fill
                  sizes="96px"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex flex-1 flex-col justify-between py-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-bold leading-tight text-slate-900 line-clamp-2">{product.name}</h2>
                    <p className="mt-1 text-xs font-medium text-slate-400">
                      หน่วย {getDisplayUnit(product.sale_unit_label)}
                    </p>
                  </div>
                  <button
                    onClick={() => onUpdateEditQuantity(product.id, 0)}
                    className="text-sm font-bold text-red-500"
                  >
                    ลบ
                  </button>
                </div>
                <div className="mt-3 flex justify-end">
                  <div className="flex items-center rounded-2xl bg-[#F1F5F9] p-1">
                    <button
                      onClick={() => {
                        const nextQtyRaw = quantity - stepQty;
                        if (nextQtyRaw < minQty) {
                          onUpdateEditQuantity(product.id, 0);
                          return;
                        }
                        const nextQty = normalizeOrderQuantity(
                          nextQtyRaw,
                          minQty,
                          configuredStepQty,
                        );
                        onUpdateEditQuantity(product.id, nextQty);
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-600 transition-all hover:bg-white active:scale-90"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="min-w-12 px-3 text-center text-sm font-bold text-slate-800">{quantity}</span>
                    <button
                      onClick={() => onUpdateEditQuantity(
                        product.id,
                        quantity === 0
                          ? minQty
                          : normalizeOrderQuantity(quantity + stepQty, minQty, configuredStepQty),
                      )}
                      className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-600 transition-all hover:bg-white active:scale-90"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          );
        })
      )}
    </section>
  );
});

export const EditOrderProductSheet = memo(function EditOrderProductSheet({
  addProductSearch,
  editCart,
  getDisplayUnit,
  isOpen,
  onClose,
  onSetAddProductSearch,
  onUpdateEditQuantity,
  products,
}: EditOrderProductSheetProps) {
  const deferredSearch = useDeferredValue(addProductSearch);

  const filteredProducts = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    if (term === "") return products;
    return products.filter((product) =>
      product.name.toLowerCase().includes(term)
    );
  }, [products, deferredSearch]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex max-h-[85vh] flex-col rounded-t-[2rem] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 pb-4 pt-5">
          <h3 className="text-lg font-bold text-slate-900">เพิ่มสินค้า</h3>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-4 py-3">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5">
              <Search className="h-4 w-4 text-slate-400" />
            </span>
            <input
              type="text"
              value={addProductSearch}
              onChange={(e) => onSetAddProductSearch(e.target.value)}
              placeholder="ค้นหาสินค้า..."
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none transition-all focus:border-[#003366] focus:bg-white focus:ring-2 focus:ring-[#003366]/10"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-8">
          {filteredProducts.map((product) => {
              const imageUrl =
                product.product_images?.[0]?.public_url ??
                "/placeholders/product-placeholder.svg";
              const qty = editCart[product.id] ?? 0;
              const configuredStepQty = product.step_order_qty ?? null;
              const minQty = getEffectiveOrderMinimum(product.min_order_qty ?? 1, configuredStepQty);
              const stepQty = getEffectiveOrderStep(configuredStepQty);

              return (
                <article
                  key={product.id}
                  className="flex items-center gap-3 border-b border-slate-100 py-3 last:border-0"
                >
                  <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl bg-slate-100">
                    <Image
                      src={imageUrl}
                      alt={product.name}
                      fill
                      sizes="56px"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {product.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {getDisplayUnit(product.sale_unit_label)}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    {qty > 0 ? (
                      <div className="flex items-center rounded-2xl bg-[#F1F5F9] p-1">
                        <button
                          onClick={() => {
                            const nextRaw = qty - stepQty;
                            onUpdateEditQuantity(
                              product.id,
                              nextRaw < minQty
                                ? 0
                                : normalizeOrderQuantity(nextRaw, minQty, configuredStepQty),
                            );
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-600 transition-all hover:bg-white active:scale-90"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="min-w-10 text-center text-sm font-bold text-slate-800">
                          {qty}
                        </span>
                        <button
                          onClick={() => onUpdateEditQuantity(
                            product.id,
                            normalizeOrderQuantity(qty + stepQty, minQty, configuredStepQty),
                          )}
                          className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-600 transition-all hover:bg-white active:scale-90"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => onUpdateEditQuantity(product.id, minQty)}
                        className="flex h-9 items-center gap-1 rounded-full bg-[#003366] px-4 text-xs font-bold text-white transition-all active:scale-95"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        เพิ่ม
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
        </div>

        <div className="border-t border-slate-100 px-4 pb-6 pt-3">
          <button
            onClick={onClose}
            className="w-full rounded-2xl bg-[#003366] px-6 py-4 text-base font-bold text-white shadow-[0_12px_24px_rgba(0,51,102,0.2)] transition-all active:scale-[0.98]"
          >
            ยืนยันรายการที่เลือก
          </button>
        </div>
      </div>
    </div>
  );
});
