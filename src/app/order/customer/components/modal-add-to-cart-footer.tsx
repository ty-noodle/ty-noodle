"use client";

import { memo, useCallback, useState, type MutableRefObject } from "react";
import { Lock, Minus, Plus, ShoppingCart } from "lucide-react";
import {
  getEffectiveOrderMinimum,
  getDefaultOrderQuantity,
  stepOrderQuantity,
} from "@/lib/orders/quantity-rules";

const ModalQuantityStepper = memo(function ModalQuantityStepper({
  quantity,
  unitLabel,
  onDecrease,
  onIncrease,
}: {
  quantity: number;
  unitLabel: string;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div className="flex items-center rounded-xl border border-white/10 bg-white/5 p-1 touch-manipulation">
      <button
        onClick={onDecrease}
        className={`flex h-10 w-10 items-center justify-center rounded-lg transition-all active:scale-95 ${
          quantity > 0
            ? "bg-[#EF4444] text-white shadow-sm shadow-red-500/10"
            : "pointer-events-none text-white/20 bg-white/5 border border-white/5"
        }`}
        aria-label="decrease quantity"
      >
        <Minus className="h-4.5 w-4.5" strokeWidth={3} />
      </button>

      <div className="flex w-[60px] select-none flex-col items-center justify-center">
        <span className="text-[18px] font-black leading-none text-white [font-variant-numeric:tabular-nums]">
          {quantity}
        </span>
        <span className="mt-1 text-[9px] font-black uppercase tracking-[0.06em] text-white/50 truncate max-w-full px-1">
          {unitLabel}
        </span>
      </div>

      <button
        onClick={onIncrease}
        className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-[#003366] shadow-md transition-all active:scale-95 touch-manipulation hover:bg-white/90"
        aria-label="increase quantity"
      >
        <Plus className="h-4.5 w-4.5" strokeWidth={3} />
      </button>
    </div>
  );
});

export const ModalAddToCartFooter = memo(function ModalAddToCartFooter({
  isOrderOpen,
  modalCartBtnRef,
  modalStepperRef,
  onAddToCart,
  onCloseModal,
  productId,
  minOrderQty,
  primaryImageUrl,
  stepOrderQty,
  unitLabel,
  closedLabel,
  openLabel,
}: {
  isOrderOpen: boolean;
  modalCartBtnRef: MutableRefObject<HTMLButtonElement | null>;
  modalStepperRef: MutableRefObject<HTMLDivElement | null>;
  onAddToCart: (productId: string, quantity: number) => void;
  onCloseModal: () => void;
  organizationId: string;
  productId: string;
  productName: string;
  minOrderQty: number;
  primaryImageUrl: string;
  stepOrderQty: number | null;
  unitLabel: string;
  closedLabel: string;
  openLabel: string;
}) {
  const [pendingQty, setPendingQty] = useState(0);

  const handleDecrease = useCallback(() => {
    const minQty = getEffectiveOrderMinimum(minOrderQty ?? 1, stepOrderQty);
    setPendingQty((prev) => {
      if (prev <= minQty) return 0;
      return stepOrderQuantity(prev, -1, minOrderQty ?? 1, stepOrderQty);
    });
  }, [minOrderQty, stepOrderQty]);

  const handleIncrease = useCallback(() => {
    if (!isOrderOpen) return;
    const defaultQty = getDefaultOrderQuantity(minOrderQty ?? 1, stepOrderQty);
    setPendingQty((prev) =>
      prev === 0 ? defaultQty : stepOrderQuantity(prev, 1, minOrderQty ?? 1, stepOrderQty),
    );
  }, [isOrderOpen, minOrderQty, stepOrderQty]);

  const handleAddToCart = useCallback(() => {
    if (!isOrderOpen || pendingQty === 0) return;
    onAddToCart(productId, pendingQty);
    setPendingQty(0);

    const closeWithSlide = () => {
      window.requestAnimationFrame(() => {
        onCloseModal();
      });
    };

    const stepperEl = modalStepperRef.current;
    const cartEl = modalCartBtnRef.current;
    if (!stepperEl || !cartEl) {
      closeWithSlide();
      return;
    }

    const stepperRect = stepperEl.getBoundingClientRect();
    const cartRect = cartEl.getBoundingClientRect();
    const size = 48;
    const startX = stepperRect.left + stepperRect.width / 2 - size / 2;
    const startY = stepperRect.top + stepperRect.height / 2 - size / 2;
    const endX = cartRect.left + cartRect.width / 2 - size / 2;
    const endY = cartRect.top + cartRect.height / 2 - size / 2;

    const flyEl = document.createElement("div");
    flyEl.style.cssText = [
      "position:fixed",
      `left:${startX}px`,
      `top:${startY}px`,
      `width:${size}px`,
      `height:${size}px`,
      "border-radius:14px",
      "overflow:hidden",
      "box-shadow:0 12px 32px rgba(0,0,0,0.25)",
      "pointer-events:none",
      "z-index:9999",
    ].join(";");

    const imageNode = document.createElement("img");
    imageNode.src = primaryImageUrl;
    imageNode.style.cssText = "width:100%;height:100%;object-fit:cover";
    flyEl.appendChild(imageNode);
    document.body.appendChild(flyEl);

    const dx = endX - startX;
    const dy = endY - startY;
    flyEl
      .animate(
        [
          { transform: "translate(0,0) scale(1)", opacity: "1", offset: 0 },
          {
            transform: `translate(${dx * 0.6}px,${dy * 0.4}px) scale(0.85)`,
            opacity: "1",
            offset: 0.4,
          },
          {
            transform: `translate(${dx}px,${dy}px) scale(0.2)`,
            opacity: "0",
            offset: 1,
          },
        ],
        { duration: 550, easing: "cubic-bezier(0.4,0,0.2,1)", fill: "forwards" },
      )
      .addEventListener("finish", () => {
        document.body.removeChild(flyEl);
      });
    closeWithSlide();
  }, [isOrderOpen, modalCartBtnRef, modalStepperRef, onAddToCart, onCloseModal, pendingQty, primaryImageUrl, productId]);

  return (
    <div className="z-30 border-t border-white/10 bg-[#003366] px-4 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-10px_40px_rgba(0,0,0,0.3)]">
      <div className="mx-auto max-w-lg flex flex-row items-center gap-3">
        {/* Quantity Stepper Line */}
        <div ref={modalStepperRef} className="flex-shrink-0">
          <ModalQuantityStepper
            quantity={pendingQty}
            unitLabel={unitLabel}
            onDecrease={handleDecrease}
            onIncrease={handleIncrease}
          />
        </div>

        {/* Add to Cart Button Line */}
        <button
          disabled={!isOrderOpen || pendingQty === 0}
          onClick={handleAddToCart}
          className={`flex-1 flex items-center justify-center gap-2 h-12 rounded-xl font-black transition-all active:scale-[0.97] px-4 ${      
            !isOrderOpen
              ? "bg-white/10 text-white/30 cursor-not-allowed"
              : pendingQty > 0
                ? "bg-white text-[#003366] shadow-[0_8px_20px_rgba(255,255,255,0.15)] hover:bg-white/95"
                : "bg-white/10 text-white/40 cursor-not-allowed"
          }`}
        >
          <div className="flex items-center gap-1.5 justify-center w-full min-w-0">
            {!isOrderOpen ? (
              <Lock className="h-4.5 w-4.5 shrink-0" strokeWidth={2.5} />
            ) : (
              <ShoppingCart className="h-4.5 w-4.5 shrink-0" strokeWidth={2.5} />
            )}
            <span className="text-[14px] xs:text-[15px] tracking-wide font-black truncate">
              {!isOrderOpen ? closedLabel : openLabel}
            </span>
          </div>
        </button>
      </div>
    </div>
  );
});
