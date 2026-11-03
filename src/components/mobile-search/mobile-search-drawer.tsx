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
      <div
        aria-hidden="true"
        onClick={close}
        className={`fixed inset-x-0 bottom-0 top-0 z-[45] bg-black/40 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${
          isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`fixed inset-x-0 top-0 z-50 max-h-[85vh] overflow-visible rounded-b-3xl bg-white shadow-[0_24px_64px_rgba(15,23,42,0.18)] transition-transform duration-300 ease-out lg:hidden ${
          isOpen ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        {/* Spacer for TopBar */}
        <div className="h-[68px] shrink-0" />

        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
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

        <div className="overflow-y-auto max-h-[calc(75vh-60px)] p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </>
  );
}
