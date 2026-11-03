"use client";

import Image from "next/image";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import type { ProductWithImage } from "@/app/order/customer/types";

type OrderCartViewProps = {
  cart: Record<string, number>;
  onBackToCatalog: () => void;
  onUpdateQuantity: (productId: string, direction: "increase" | "decrease" | "remove") => void;
  productsById: Map<string, ProductWithImage>;
};

export function OrderCartView({
  cart,
  onBackToCatalog,
  onUpdateQuantity,
  productsById,
}: OrderCartViewProps) {
  return (
    <section className="space-y-4 p-4">
      {Object.entries(cart).length === 0 ? (
        <div className="rounded-[2.5rem] border border-slate-50 bg-white py-10 text-center text-slate-500 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.04)]">
          <ShoppingCart className="mx-auto mb-3 h-12 w-12 text-slate-300" />
          <p className="font-medium">ตะกร้าสินค้าว่างเปล่า</p>
          <button
            onClick={onBackToCatalog}
            className="mt-4 rounded-full bg-[#eef4fa] px-6 py-2 text-sm font-bold text-[#003366]"
          >
            กลับไปเลือกสินค้า
          </button>
        </div>
      ) : (
        Object.entries(cart).map(([productId, quantity]) => {
          const product = productsById.get(productId);
          if (!product) return null;
          const imageUrl = product.product_images?.[0]?.public_url || "/placeholders/product-placeholder.svg";

          return (
            <article key={product.id} className="flex gap-4 rounded-[2.5rem] border border-slate-50 bg-white p-4 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.04)]">
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
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="pr-2 font-bold leading-tight text-slate-900 line-clamp-2">{product.name}</h2>
                    <p className="mt-1 text-xs font-medium text-slate-400">{product.sku}</p>
                  </div>
                  <button
                    onClick={() => onUpdateQuantity(product.id, "remove")}
                    aria-label="Remove item"
                    className="text-slate-300 transition-colors hover:text-red-500"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                <div className="flex justify-end">
                  <div className="flex items-center rounded-2xl bg-[#F1F5F9] p-1">
                    <button
                      onClick={() => onUpdateQuantity(product.id, "decrease")}
                      className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-600 transition-all hover:bg-white active:scale-90"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-10 px-3 text-center text-sm font-bold text-slate-800">{quantity}</span>
                    <button
                      onClick={() => onUpdateQuantity(product.id, "increase")}
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
}
