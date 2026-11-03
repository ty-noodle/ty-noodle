"use client";

import { Loader2, ShoppingCart } from "lucide-react";
import type { ViewState } from "@/app/order/customer/order-client-types";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";

type OrderBottomShellProps = {
  currentView: ViewState;
  isPending: boolean;
  onCheckout: () => void;
  onGoCatalog: () => void;
  onGoCart: () => void;
  onGoHistory: () => void;
  onGoProfile: () => void;
  onScrollTop: () => void;
  showScrollTop: boolean;
  totalItems: number;
};

export function OrderBottomShell({
  currentView,
  isPending,
  onCheckout,
  onGoCatalog,
  onGoCart,
  onGoHistory,
  onGoProfile,
  onScrollTop,
  showScrollTop,
  totalItems,
}: OrderBottomShellProps) {
  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-30 pointer-events-none">
        {totalItems > 0 && currentView === "cart" && (
          <div className="pointer-events-auto border-t border-slate-100 bg-white/90 px-6 pb-4 pt-6 backdrop-blur-xl">
            <div className="mx-auto max-w-md">
              <button
                onClick={onCheckout}
                disabled={isPending}
                className="flex w-full items-center justify-center gap-2 rounded-[2rem] bg-[#003366] py-4 text-lg font-bold text-white shadow-[0_8px_30px_rgba(0,51,102,0.2)] transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    กำลังส่งคำสั่งซื้อ...
                  </>
                ) : (
                  <>
                    ยืนยันการสั่งซื้อ
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
        <nav className="pointer-events-auto border-t border-slate-100 bg-white px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_20px_rgba(0,0,0,0.03)] will-change-transform">
          <div className="mx-auto flex max-w-md items-center justify-between">
            <button
              onClick={onGoCatalog}
              className={`flex flex-1 flex-col items-center gap-1.5 transition-colors ${currentView === "catalog" ? "text-[#003366]" : "text-slate-400"}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span className="text-[11px] font-semibold">หน้าหลัก</span>
            </button>
            <button
              onClick={onGoCart}
              className={`flex flex-1 flex-col items-center gap-1.5 transition-colors ${currentView === "cart" ? "text-[#003366]" : "text-slate-400"}`}
            >
              <div className="relative">
                <ShoppingCart className="h-6 w-6" />
                {totalItems > 0 && currentView !== "cart" && (
                  <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-white bg-red-500" />
                )}
              </div>
              <span className="text-[11px] font-semibold">ตะกร้า</span>
            </button>
            <button
              onClick={onGoHistory}
              className={`flex flex-1 flex-col items-center gap-1.5 transition-colors ${currentView === "history" || currentView === "edit_order" ? "text-[#003366]" : "text-slate-400"}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-[11px] font-semibold">ประวัติ</span>
            </button>
            <button
              onClick={onGoProfile}
              className={`flex flex-1 flex-col items-center gap-1.5 transition-colors ${currentView === "profile" ? "text-[#003366]" : "text-slate-400"}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-[11px] font-semibold">โปรไฟล์</span>
            </button>
          </div>
        </nav>
      </div>

      <ScrollToTopButton
        onScrollTop={onScrollTop}
        show={showScrollTop && (currentView === "catalog" || currentView === "cart" || currentView === "history")}
      />
    </>
  );
}
