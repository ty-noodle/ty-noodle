"use client";

import Image from "next/image";
import { useState } from "react";
import { RotateCcw, ShoppingCart, Star } from "lucide-react";
import { CatalogProductGrid } from "@/app/order/customer/components/catalog-product-grid";
import type { ProductWithImage } from "@/app/order/customer/types";

type FrequentProductCard = {
  product: ProductWithImage;
};

type RepeatOrderCard = {
  product: ProductWithImage;
  quantity: number;
};

export function CatalogView({
  activeCategory,
  cart,
  favorites,
  frequentProductCards,
  getDisplayUnit,
  gridProducts,
  isOrderOpen,
  onAddFrequentProduct,
  onOpenProduct,
  onRepeatOrderAll,
  onToggleFavorite,
  repeatOrderCards,
}: {
  activeCategory: "all" | "favorites" | "recent";
  cart: Record<string, number>;
  favorites: Record<string, boolean>;
  frequentProductCards: FrequentProductCard[];
  getDisplayUnit: (unit: string | null | undefined) => string;
  gridProducts: ProductWithImage[];
  isOrderOpen: boolean;
  onAddFrequentProduct: (
    productId: string,
    minOrderQty: number,
    sourceImage: HTMLImageElement | null,
  ) => void;
  onOpenProduct: (productId: string) => void;
  onRepeatOrderAll: () => void;
  onToggleFavorite: (productId: string) => void;
  repeatOrderCards: RepeatOrderCard[];
}) {
  const [showAllRepeatItems, setShowAllRepeatItems] = useState(false);
  const isRepeatTab = activeCategory === "recent";
  const shouldShowFrequent = false;
  const visibleRepeatOrderCards = repeatOrderCards;
  const repeatPreviewCards = showAllRepeatItems
    ? visibleRepeatOrderCards
    : visibleRepeatOrderCards.slice(0, 3);
  const isEmpty = isRepeatTab
    ? visibleRepeatOrderCards.length === 0 && gridProducts.length === 0
    : gridProducts.length === 0;

  return (
    <>
      {isEmpty ? (
        <div className="py-10 text-center text-slate-500">ไม่พบสินค้าที่คุณค้นหา</div>
      ) : (
        <div>
          {isRepeatTab && visibleRepeatOrderCards.length > 0 ? (
            <section className="mb-5">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
                <div className="border-b border-slate-100 px-4 pb-4 pt-4">
                  <button
                    type="button"
                    onClick={onRepeatOrderAll}
                    disabled={!isOrderOpen}
                    className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#003366] px-4 py-3.5 text-base font-extrabold text-white shadow-[0_10px_24px_rgba(0,51,102,0.22)] transition hover:bg-[#00264d] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                  >
                    <ShoppingCart className="h-4 w-4" strokeWidth={2.4} />
                    {isOrderOpen ? "สั่งซ้ำทั้งหมดจากออเดอร์ล่าสุด" : "ปิดรับออเดอร์"}
                  </button>

                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#003366]/10 text-[#003366]">
                      <RotateCcw className="h-5 w-5" strokeWidth={2.4} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-extrabold leading-tight text-slate-950">
                        รายละเอียดรายการล่าสุด
                      </h2>
                      <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
                        แสดงสินค้าที่สั่งในครั้งที่ผ่านมา คุณสามารถกด &quot;สั่งซ้ำทั้งหมด&quot; เพื่อเริ่มออเดอร์ใหม่ได้ทันที
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                    <span className="text-xs font-bold text-slate-500">จำนวนรายการ</span>
                    <span className="text-sm font-extrabold text-[#003366]">
                      {visibleRepeatOrderCards.length.toLocaleString("th-TH")} รายการ
                    </span>
                  </div>

                  <p className="mt-2 text-center text-[11px] font-medium text-slate-400">
                    กดแล้วไปหน้าตะกร้าเพื่อปรับจำนวนได้
                  </p>
                </div>

                <div className="divide-y divide-slate-100 px-4">
                {repeatPreviewCards.map(({ product, quantity }) => {
                  const imageUrl =
                    product.product_images?.[0]?.public_url ||
                    "/placeholders/product-placeholder.svg";

                  return (
                    <button
                      key={`repeat-${product.id}`}
                      type="button"
                      onClick={() => onOpenProduct(product.id)}
                      className="flex w-full items-center gap-3 py-3 text-left"
                    >
                      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white">
                        <Image
                          src={imageUrl}
                          alt={product.name}
                          fill
                          sizes="48px"
                          className="object-contain"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-bold text-slate-900">
                          {product.name}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-400">
                          {quantity.toLocaleString("th-TH")} {getDisplayUnit(product.sale_unit_label)}
                        </p>
                      </div>
                    </button>
                  );
                })}
                {visibleRepeatOrderCards.length > 3 ? (
                  <button
                    type="button"
                    onClick={() => setShowAllRepeatItems((current) => !current)}
                    className="w-full py-3 text-center text-xs font-bold text-[#003366] transition hover:text-[#00264d]"
                  >
                    {showAllRepeatItems
                      ? "ย่อรายการ"
                      : `+ อีก ${(visibleRepeatOrderCards.length - 3).toLocaleString("th-TH")} รายการ`}
                  </button>
                ) : null}
                </div>
              </div>
            </section>
          ) : null}

          {shouldShowFrequent ? (
            <section className="-mx-3 space-y-2 px-3 py-0.5 md:mx-0 md:px-0">
              <div className="px-1 md:px-0">
                <h2 className="text-base font-bold text-slate-900">สินค้าที่สั่งซื้อบ่อย</h2>
              </div>
              <div className="overflow-x-auto pb-1 snap-x snap-mandatory [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
                <div className="flex gap-0">
                  {frequentProductCards.map(({ product }) => {
                    const imageUrl =
                      product.product_images?.[0]?.public_url ||
                      "/placeholders/product-placeholder.svg";

                    return (
                      <article
                        key={`frequent-${product.id}`}
                        className="-mr-5 relative flex h-[5.1rem] w-[17.5rem] shrink-0 snap-start items-center pr-0 last:mr-0"
                      >
                        <div className="absolute inset-y-0 left-[2.3rem] right-8 rounded-lg bg-slate-100/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]" />
                        <div className="relative z-10 h-[5.1rem] w-[5.1rem] shrink-0 overflow-hidden rounded-lg bg-white p-1.5">
                          <div className="absolute left-1.5 top-1.5 z-10 inline-flex items-center gap-1 rounded-full bg-[#003366] px-1.5 py-0.5 text-[8px] font-bold text-white shadow-[0_8px_16px_rgba(0,51,102,0.22)]">
                            <Star className="h-2.5 w-2.5 fill-current" strokeWidth={2.3} />
                            ซื้อบ่อย
                          </div>
                          <Image
                            src={imageUrl}
                            alt={product.name}
                            fill
                            sizes="82px"
                            className="object-contain"
                          />
                        </div>
                        <div className="relative z-10 ml-[-0.1rem] min-w-0 flex-1 self-stretch px-3 pt-2 pb-1.5">
                          <div className="flex h-full min-w-0 flex-col justify-between gap-2 pr-10">
                            <div className="min-w-0">
                              <p className="truncate pt-0.5 text-[0.82rem] font-semibold leading-[1.25rem] text-slate-900">
                                {product.name}
                              </p>
                              <p className="mt-1 text-[11px] font-medium text-slate-500">
                                หน่วย {getDisplayUnit(product.sale_unit_label)}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={(event) =>
                              onAddFrequentProduct(
                                product.id,
                                product.min_order_qty ?? 1,
                                (event.currentTarget.closest("article")?.querySelector("img") as HTMLImageElement | null) ?? null,
                              )
                            }
                            aria-label={`เพิ่ม ${product.name} ใส่ตะกร้า`}
                            className="absolute bottom-2 right-11 flex h-8 w-8 items-center justify-center rounded-lg bg-[#003366] text-white shadow-[0_8px_18px_rgba(0,51,102,0.22)] transition-all hover:bg-[#0a437d] active:scale-[0.95]"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-3.5 w-3.5"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.6} d="M12 5v14M5 12h14" />
                            </svg>
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </section>
          ) : null}

          {isRepeatTab && visibleRepeatOrderCards.length > 0 ? null : (
            <CatalogProductGrid
              products={gridProducts}
              cart={cart}
              favorites={favorites}
              onOpenProduct={onOpenProduct}
              onToggleFavorite={onToggleFavorite}
              priorityCount={4}
            />
          )}
        </div>
      )}
    </>
  );
}
