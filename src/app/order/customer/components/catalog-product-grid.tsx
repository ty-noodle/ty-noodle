"use client";

import Image from "next/image";
import { memo } from "react";
import { Plus, Star } from "lucide-react";
import type { ProductWithImage } from "@/app/order/customer/types";

const CatalogProductCard = memo(function CatalogProductCard({
  isFavorite,
  onOpenProduct,
  onToggleFavorite,
  priority,
  product,
  qty,
}: {
  isFavorite: boolean;
  onOpenProduct: (productId: string) => void;
  onToggleFavorite: (productId: string) => void;
  priority: boolean;
  product: ProductWithImage;
  qty: number;
}) {
  const imageUrl = product.product_images?.[0]?.public_url || "/placeholders/product-placeholder.svg";

  const handlePointerDown = () => {
    if (!imageUrl.startsWith("/") && typeof window !== "undefined") {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const steps = [320, 375, 414, 640, 750, 828, 1080, 1200, 1440, 1920];
      const w = steps.find((s) => s >= Math.round(window.innerWidth * dpr)) ?? 1920;
      const img = new window.Image();
      img.decoding = "async";
      img.src = `/_next/image?url=${encodeURIComponent(imageUrl)}&w=${w}&q=75`;
    }
  };

  return (
    <article
      className="flex flex-col overflow-hidden rounded-lg bg-white shadow-[0_10px_28px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/5 transition-transform active:scale-98 md:rounded-xl"
      onPointerDown={handlePointerDown}
      onClick={() => onOpenProduct(product.id)}
      style={{
        contain: "layout paint",
        contentVisibility: "auto",
        containIntrinsicSize: "320px 420px",
      }}
    >
      <div className="relative aspect-square w-full shrink-0 overflow-hidden rounded-t-lg bg-white px-2 pb-2 pt-3 md:rounded-t-xl md:px-2.5 md:pb-2.5 md:pt-3.5">
        <div className="relative h-full w-full">
          <Image
            src={imageUrl}
            alt={product.name}
            fill
            sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, (max-width: 1535px) 25vw, 17vw"
            className="object-contain object-center"
            priority={priority}
          />
        </div>

        {qty > 0 && (
          <div className="absolute left-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-[#003366] px-1.5 text-[10px] font-bold text-white shadow-lg ring-2 ring-white md:h-[1.65rem] md:min-w-[1.65rem]">
            {qty}
          </div>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(product.id);
          }}
          className={`absolute right-2 top-2 rounded-xl bg-white/95 p-2 shadow-sm transition-colors active:scale-90 md:p-1.5 ${
            isFavorite ? "text-amber-500" : "text-slate-400 hover:text-amber-400"
          }`}
          aria-label={`toggle favorite ${product.name}`}
        >
          <Star
            className="h-4 w-4 md:h-3.5 md:w-3.5"
            fill={isFavorite ? "currentColor" : "none"}
            strokeWidth={2}
          />
        </button>
      </div>

      <div className="flex min-w-0 flex-grow items-start justify-between gap-2 px-3 pb-3 pt-3 md:gap-2.5 md:px-3.5 md:pt-3.5">
        <div className="min-h-[2.5rem] flex-1 md:min-h-[2.75rem]">
          <h3 className="text-left text-[0.84rem] font-bold leading-5 text-slate-900 line-clamp-2 md:text-[0.82rem] md:leading-[1.35rem]">
            {product.name}
          </h3>
        </div>
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#003366] text-white shadow-md transition-transform active:scale-90 md:h-8 md:w-8">
          <Plus className="h-4 w-4 md:h-4 md:w-4" strokeWidth={3} />
        </div>
      </div>
    </article>
  );
});

export const CatalogProductGrid = memo(function CatalogProductGrid({
  products,
  cart,
  favorites,
  onOpenProduct,
  onToggleFavorite,
  priorityCount = 0,
}: {
  products: ProductWithImage[];
  cart: Record<string, number>;
  favorites: Record<string, boolean>;
  onOpenProduct: (productId: string) => void;
  onToggleFavorite: (productId: string) => void;
  priorityCount?: number;
}) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-3.5 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-5 lg:grid-cols-4 lg:gap-x-5 xl:grid-cols-5 2xl:grid-cols-6">
      {products.map((product, productIndex) => (
        <CatalogProductCard
          key={product.id}
          product={product}
          qty={cart[product.id] || 0}
          isFavorite={Boolean(favorites[product.id])}
          priority={productIndex < priorityCount}
          onOpenProduct={onOpenProduct}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </div>
  );
});
