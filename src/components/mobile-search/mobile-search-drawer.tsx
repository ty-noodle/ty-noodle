"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useMobileSearch } from "./mobile-search-context";

interface MobileSearchDrawerProps {
  children: React.ReactNode;
  title?: string;
}

/**
 * Render this inside any page that has search.
 * It registers itself so the mobile top bar shows the search icon,
 * and renders a slide-down drawer with `children` as the search form.
 * Desktop: renders nothing (md:hidden).
 */
export function MobileSearchDrawer({ children, title = "ค้นหา" }: MobileSearchDrawerProps) {
  const { isOpen, close, _register } = useMobileSearch();

  useEffect(() => _register(), [_register]);

  return (
    <>
      {/* Backdrop — covers page content below header, not the header itself */}
      <div
        aria-hidden="true"
        onClick={close}
        className={`fixed inset-x-0 bottom-0 top-[68px] z-[35] bg-black/40 backdrop-blur-sm transition-opacity duration-300 md:hidden ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Drawer — slides down from just below the header */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`fixed inset-x-0 top-[68px] z-[38] max-h-[75vh] overflow-y-auto rounded-b-3xl bg-white shadow-[0_24px_64px_rgba(15,23,42,0.18)] transition-transform duration-300 ease-out md:hidden ${
          isOpen ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        {/* Drawer header */}
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
          <span className="text-base font-semibold text-slate-800">{title}</span>
          <button
            type="button"
            onClick={close}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 active:scale-95"
            aria-label="ปิด"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>

        {/* Search form content */}
        <div className="p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </>
  );
}
