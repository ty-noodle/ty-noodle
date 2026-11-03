"use client";

import Image from "next/image";
import {
  useCallback,
  useState,
  useTransition,
  type RefObject,
  type TouchEventHandler,
  type UIEventHandler,
} from "react";
import {
  BadgeCheck,
  Gem,
  Info,
  Link2,
  Loader2,
  MessageCircle,
  Package,
  Share2,
  ShoppingCart,
  Stamp,
  Star,
  Truck,
  X,
} from "lucide-react";
import { ModalAddToCartFooter as CustomerModalAddToCartFooter } from "@/app/order/customer/components/modal-add-to-cart-footer";
import { sendPriceInquiry } from "@/app/order/actions";
import type {
  ProductImage,
  ProductWithImage,
} from "@/app/order/customer/types";

type ProductImageSlide = {
  id: string;
  public_url: string;
};

type ProductDetailModalProps = {
  favorites: Record<string, boolean>;
  getDisplayUnit: (unit: string | null | undefined) => string;
  isModalOpen: boolean;
  isOrderOpen: boolean;
  isShareMenuOpen: boolean;
  loadedModalImageKeys: Record<string, true>;
  modalCartBtnRef: RefObject<HTMLButtonElement | null>;
  modalImageTrackRef: RefObject<HTMLDivElement | null>;
  modalImageViewportRef: RefObject<HTMLDivElement | null>;
  modalRecommendationIndex: number;
  modalRecommendationPageCount: number;
  modalRecommendations: ProductWithImage[];
  modalRecommendationsRef: RefObject<HTMLDivElement | null>;
  modalStepperRef: RefObject<HTMLDivElement | null>;
  onAddToCart: (productId: string, quantityToAdd: number) => void;
  onCloseModal: () => void;
  onCopyShareLink: () => void;
  onJumpToProduct: (productId: string) => void;
  onMarkModalImageLoaded: (loadKey: string) => void;
  onOpenCart: () => void;
  onRecommendationScroll: UIEventHandler<HTMLDivElement>;
  onSelectImage: (imageIndex: number) => void;
  onShareFacebook: () => void;
  onShareLine: () => void;
  onToggleFavorite: () => void;
  onToggleShareMenu: () => void;
  onTouchEnd: TouchEventHandler<HTMLDivElement>;
  onTouchMove: TouchEventHandler<HTMLDivElement>;
  onTouchStart: TouchEventHandler<HTMLDivElement>;
  organizationId: string;
  selectedProduct: ProductWithImage;
  selectedProductImageIndex: number;
  selectedProductImageSlides: ProductImageSlide[];
  selectedProductImages: ProductImage[];
  shareFeedback: string;
  shareMenuRef: RefObject<HTMLDivElement | null>;
  totalItems: number;
};

export function ProductDetailModal({
  favorites,
  getDisplayUnit,
  isModalOpen,
  isOrderOpen,
  isShareMenuOpen,
  loadedModalImageKeys,
  modalCartBtnRef,
  modalImageTrackRef,
  modalImageViewportRef,
  modalRecommendationIndex,
  modalRecommendationPageCount,
  modalRecommendations,
  modalRecommendationsRef,
  modalStepperRef,
  onAddToCart,
  onCloseModal,
  onCopyShareLink,
  onJumpToProduct,
  onMarkModalImageLoaded,
  onOpenCart,
  onRecommendationScroll,
  onSelectImage,
  onShareFacebook,
  onShareLine,
  onToggleFavorite,
  onToggleShareMenu,
  onTouchEnd,
  onTouchMove,
  onTouchStart,
  organizationId,
  selectedProduct,
  selectedProductImageIndex,
  selectedProductImageSlides,
  selectedProductImages,
  shareFeedback,
  shareMenuRef,
  totalItems,
}: ProductDetailModalProps) {
  const meta = (selectedProduct.metadata ?? {}) as Record<string, string>;
  const brand = meta.brand ?? "";
  const category = selectedProduct.categoryNames.join(", ") || meta.category || "";
  const description = meta.description ?? "";
  const hasMinimumOrder = selectedProduct.min_order_qty > 1;
  const hasContent = brand || category || description;

  const [isInquiryPending, startInquiryTransition] = useTransition();
  const [inquirySent, setInquirySent] = useState(false);

  const handlePriceInquiry = useCallback(() => {
    if (isInquiryPending || inquirySent) return;

    startInquiryTransition(async () => {
      try {
        const result = await sendPriceInquiry({
          organizationId,
          productName: selectedProduct.name,
        });

        if (result.success) {
          setInquirySent(true);
        } else {
          alert(result.error || "ไม่สามารถส่งคำถามได้ในขณะนี้");
        }
      } catch (error) {
        console.error("[ProductDetailModal:handlePriceInquiry]", error);
        alert("เกิดข้อผิดพลาดในการส่งข้อมูล");
      }
    });
  }, [organizationId, selectedProduct.name, isInquiryPending, inquirySent]);

  return (
    <div
      className="fixed inset-0 z-[100] flex min-h-0 flex-col bg-white"
      style={{
        animation: isModalOpen
          ? "modalSlideIn 320ms cubic-bezier(0.25,1,0.5,1) forwards"
          : "modalSlideOut 280ms cubic-bezier(0.4,0,1,1) forwards",
        willChange: "transform",
      }}
    >
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-[#00264d] bg-[#003366] px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white shadow-[0_10px_30px_rgba(0,51,102,0.22)]">
        <button
          onClick={onCloseModal}
          className="flex h-10 w-10 items-center justify-center rounded-full text-white/90 transition-all active:scale-90 hover:bg-white/10"
        >
          <X className="h-6 w-6" strokeWidth={2} />
        </button>
        <h2 className="max-w-[200px] truncate text-[15px] font-bold text-white">
          รายละเอียดสินค้า
        </h2>
        <div ref={shareMenuRef} className="relative flex gap-1">
          <button
            onClick={onToggleShareMenu}
            className="flex h-10 w-10 items-center justify-center rounded-full text-white/85 transition-all active:scale-90 hover:bg-white/10"
            aria-label="แชร์สินค้า"
          >
            <Share2 className="h-5.5 w-5.5" strokeWidth={2} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full text-white/75 transition-all active:scale-90 hover:bg-white/10"
          >
            <Star
              className="h-5.5 w-5.5"
              fill={favorites[selectedProduct.id] ? "#f59e0b" : "none"}
              stroke={favorites[selectedProduct.id] ? "#f59e0b" : "currentColor"}
              strokeWidth={2}
            />
          </button>
          <button
            ref={modalCartBtnRef}
            onClick={onOpenCart}
            className="relative flex h-10 w-10 items-center justify-center rounded-full text-white transition-all active:scale-90 hover:bg-white/10"
          >
            <ShoppingCart className="h-5.5 w-5.5" strokeWidth={2} />
            {totalItems > 0 && (
              <span className="absolute top-1 right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-[#003366] text-[9px] font-black text-white shadow-sm ring-2 ring-white">
                {totalItems}
              </span>
            )}
          </button>
          {isShareMenuOpen && (
            <div className="absolute right-0 top-12 z-30 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 text-slate-700 shadow-[0_20px_40px_rgba(15,23,42,0.18)]">
              <button
                type="button"
                onClick={onCopyShareLink}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-slate-50"
              >
                <Link2 className="h-4.5 w-4.5 text-[#003366]" strokeWidth={2} />
                <span>คัดลอกลิงก์</span>
              </button>
              <button
                type="button"
                onClick={onShareLine}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-slate-50"
              >
                <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-[#06C755] text-[9px] font-black text-white">
                  L
                </span>
                <span>แชร์ไป LINE</span>
              </button>
              <button
                type="button"
                onClick={onShareFacebook}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-slate-50"
              >
                <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-[#1877F2] text-[9px] font-black text-white">
                  f
                </span>
                <span>แชร์ไป Facebook</span>
              </button>
            </div>
          )}
        </div>
      </div>
      {shareFeedback ? (
        <div className="border-b border-[#d9e4f0] bg-[#eef4fa] px-4 py-2 text-center text-xs font-semibold text-[#003366]">
          {shareFeedback}
        </div>
      ) : null}

      <div
        id="product-modal-carousel"
        className="relative min-h-0 flex-1 overflow-y-auto bg-slate-50 pb-6 no-scrollbar"
      >
        <div
          key={selectedProduct.id}
          className="min-h-full"
          style={{ contentVisibility: "auto", containIntrinsicSize: "900px" }}
        >
          <div className="bg-white px-4 pb-6 pt-4 shadow-[0_16px_38px_rgba(15,23,42,0.10)]">
            <div className="mx-auto flex max-w-[520px] flex-col gap-3">
              <div className="relative overflow-hidden rounded-[1.5rem]">
                <div
                  ref={modalImageViewportRef}
                  className="relative aspect-square w-full overflow-hidden"
                  onTouchStart={onTouchStart}
                  onTouchMove={onTouchMove}
                  onTouchEnd={onTouchEnd}
                  style={{ touchAction: "pan-y" }}
                >
                  <div
                    ref={modalImageTrackRef}
                    className="flex h-full"
                    style={{ width: `${Math.max(selectedProductImageSlides.length, 1) * 100}%` }}
                  >
                    {selectedProductImageSlides.map((image, imageIndex) => {
                      const loadKey = `${selectedProduct.id}:${image.id}:${imageIndex}`;
                      const isLoaded = Boolean(loadedModalImageKeys[loadKey]);
                      const isNearActive = Math.abs(imageIndex - selectedProductImageIndex) <= 1;
                      return (
                        <div
                          key={loadKey}
                          className="relative h-full shrink-0"
                          style={{ width: `${100 / Math.max(selectedProductImageSlides.length, 1)}%` }}
                        >
                          {!isLoaded && (
                            <div className="absolute inset-0 animate-pulse bg-slate-200" />
                          )}
                          <Image
                            src={image.public_url}
                            alt={`${selectedProduct.name} - ${imageIndex + 1}`}
                            fill
                            priority={imageIndex === selectedProductImageIndex}
                            fetchPriority={imageIndex === selectedProductImageIndex ? "high" : "auto"}
                            loading={isNearActive ? "eager" : "lazy"}
                            decoding="async"
                            sizes="(max-width: 767px) 100vw, 520px"
                            className={`object-contain transition-opacity duration-100 ${
                              isLoaded ? "opacity-100" : "opacity-0"
                            }`}
                            onLoad={() => onMarkModalImageLoaded(loadKey)}
                            onError={() => onMarkModalImageLoaded(loadKey)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="absolute right-3 top-3 rounded-full bg-slate-950/70 px-3 py-1 text-xs font-bold text-white">
                  {selectedProductImageIndex + 1}/{Math.max(selectedProductImages.length, 1)}
                </div>
              </div>

              {selectedProductImages.length > 1 && (
                <div
                  className="flex gap-2 overflow-x-auto pb-1"
                  onTouchStart={(e) => e.stopPropagation()}
                  onTouchMove={(e) => e.stopPropagation()}
                  onTouchEnd={(e) => e.stopPropagation()}
                >
                  {selectedProductImages.map((img, imageIndex) => {
                    const isActiveImage = imageIndex === selectedProductImageIndex;
                    return (
                      <button
                        key={img.id}
                        type="button"
                        onClick={() => onSelectImage(imageIndex)}
                        className={`relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-2xl border-2 bg-white transition ${
                          isActiveImage
                            ? "border-[#003366] shadow-[0_12px_24px_rgba(0,51,102,0.16)]"
                            : "border-slate-200"
                        }`}
                        aria-label={`ดูรูปที่ ${imageIndex + 1}`}
                      >
                        <Image
                          src={img.public_url}
                          alt={`${selectedProduct.name} ${imageIndex + 1}`}
                          fill
                          sizes="72px"
                          className="object-cover"
                        />
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-col gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-2 text-[13px] font-bold text-slate-800">
                  <Package className="h-4 w-4 text-[#003366]" strokeWidth={2.2} />
                  <span>ชื่อสินค้า</span>
                  <span className="h-4 w-px bg-slate-300" aria-hidden="true" />
                  <span className="text-[12px] font-semibold text-slate-500">
                    หน่วย: {getDisplayUnit(selectedProduct.sale_unit_label)}
                  </span>
                  {hasMinimumOrder ? (
                    <>
                      <span className="h-4 w-px bg-slate-300" aria-hidden="true" />
                      <span className="text-[12px] font-semibold text-slate-500">
                        สั่งซื้อขั้นต่ำ: {selectedProduct.min_order_qty}{" "}
                        {getDisplayUnit(selectedProduct.sale_unit_label)}
                      </span>
                    </>
                  ) : null}
                </div>
                <h1 className="text-[22px] font-extrabold leading-tight text-slate-900">
                  {selectedProduct.name}
                </h1>

                {/* Price Inquiry Button */}
                <div className="mt-2.5">
                  <button
                    type="button"
                    onClick={handlePriceInquiry}
                    disabled={isInquiryPending || inquirySent}
                    className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-black transition-all active:scale-[0.98] ${
                      inquirySent
                        ? "bg-slate-100 text-slate-400 cursor-default"
                        : "bg-[#00A86B] text-white shadow-[0_6px_16px_rgba(0,168,107,0.22)] hover:brightness-105"
                    }`}
                  >
                    {isInquiryPending ? (
                      <Loader2 className="h-4.5 w-4.5 animate-spin" />
                    ) : inquirySent ? (
                      <BadgeCheck className="h-4.5 w-4.5 text-emerald-500" />
                    ) : (
                      <MessageCircle className="h-4.5 w-4.5" strokeWidth={2.8} />
                    )}
                    <span>{inquirySent ? "ส่งคำถามแล้ว" : `สอบถามราคา ${selectedProduct.name}`}</span>
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <TrustBadge icon={Truck} label="พร้อมส่ง" />
                  <TrustBadge icon={Gem} label="คัดคุณภาพ" />
                  <TrustBadge icon={Stamp} label="มาตรฐานร้านค้า" />
                </div>
              </div>
            </div>
          </div>

          {hasContent ? (
            <div className="mt-2 bg-white px-6 py-5 shadow-[0_16px_38px_rgba(15,23,42,0.10)]">
              <h3 className="mb-3 flex items-center gap-2 text-[13px] font-bold text-slate-800">
                <Info className="h-4 w-4 text-[#003366]" strokeWidth={2.2} />
                <span>รายละเอียดสินค้า</span>
              </h3>
              <div className="space-y-3">
                {(brand || category) && (
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
                    {brand && (
                      <p className="text-[13px] font-semibold text-[#003366] underline decoration-[#003366] decoration-1 underline-offset-1 [text-decoration-skip-ink:auto]">
                        <span>แบรนด์:</span>{" "}
                        {brand}
                      </p>
                    )}
                    {brand && category ? (
                      <span className="h-4 w-px bg-[#003366]/55" aria-hidden="true" />
                    ) : null}
                    {category && (
                      <p className="text-[13px] font-semibold text-[#003366] underline decoration-[#003366] decoration-1 underline-offset-1 [text-decoration-skip-ink:auto]">
                        <span>หมวดหมู่:</span>{" "}
                        {category}
                      </p>
                    )}
                  </div>
                )}
                {description ? (
                  <div>
                    <p className="whitespace-pre-line text-[14px] leading-relaxed text-slate-600">
                      {description}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {modalRecommendations.length > 0 && (
            <div className="mt-2 bg-white px-6 py-5 shadow-[0_16px_38px_rgba(15,23,42,0.10)]">
              <h3 className="mb-5 flex items-center gap-2 text-[13px] font-bold text-slate-800">
                <Package className="h-4 w-4 text-[#003366]" strokeWidth={2.2} />
                <span>สินค้าเพิ่มเติม</span>
              </h3>
              <div
                ref={modalRecommendationsRef}
                onScroll={onRecommendationScroll}
                className="-mx-2 flex gap-4 overflow-x-auto px-2 pb-4 no-scrollbar"
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
              >
                {modalRecommendations.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => onJumpToProduct(product.id)}
                    className="group w-28 flex-shrink-0"
                  >
                    <div className="relative mb-2 aspect-square w-full overflow-hidden rounded-xl border border-slate-100 bg-white p-1">
                      <Image
                        src={
                          product.product_images?.[0]?.public_url ||
                          "/placeholders/product-placeholder.svg"
                        }
                        alt={product.name}
                        fill
                        sizes="112px"
                        className="object-contain object-center"
                      />
                    </div>
                    <p className="line-clamp-2 text-[11px] font-bold leading-tight text-slate-700">
                      {product.name}
                    </p>
                  </button>
                ))}
              </div>
              {modalRecommendationPageCount > 1 && (
                <div className="mt-1 flex items-center justify-center gap-2">
                  {Array.from({ length: modalRecommendationPageCount }).map((_, index) => {
                    const isActive = index === modalRecommendationIndex;
                    return (
                      <span
                        key={`recommendation-page-${index}`}
                        aria-hidden="true"
                        className={`h-1.5 rounded-full transition-all ${
                          isActive ? "w-6 bg-[#003366]" : "w-3 bg-[#003366]/20"
                        }`}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <CustomerModalAddToCartFooter
        key={selectedProduct.id}
        isOrderOpen={isOrderOpen}
        modalStepperRef={modalStepperRef}
        modalCartBtnRef={modalCartBtnRef}
        onAddToCart={onAddToCart}
        onCloseModal={onCloseModal}
        organizationId={organizationId}
        productId={selectedProduct.id}
        productName={selectedProduct.name}
        minOrderQty={selectedProduct.min_order_qty ?? 1}
        stepOrderQty={selectedProduct.step_order_qty ?? null}
        primaryImageUrl={
          selectedProduct.product_images?.[0]?.public_url ??
          "/placeholders/product-placeholder.svg"
        }
        unitLabel={getDisplayUnit(selectedProduct.sale_unit_label)}
        openLabel="เพิ่มเข้าตะกร้า"
        closedLabel="ปิดรับออเดอร์"
      />
    </div>
  );
}

function TrustBadge({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
}) {
  return (
    <span className="inline-flex h-8 min-w-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-bold leading-none text-slate-700 shadow-[0_5px_14px_rgba(15,23,42,0.05)]">
      <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] bg-[#003366] text-white">
        <Icon className="h-3 w-3" strokeWidth={2.4} />
      </span>
      <span className="min-w-0 whitespace-nowrap">{label}</span>
    </span>
  );
}
