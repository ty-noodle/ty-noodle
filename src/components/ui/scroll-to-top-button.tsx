"use client";

import { useEffect, useState } from "react";
import { ChevronUp } from "lucide-react";

type ScrollToTopButtonProps = {
  enabled?: boolean;
  onScrollTop?: () => void;
  show?: boolean;
  threshold?: number;
};

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ScrollToTopButton({
  enabled = true,
  onScrollTop,
  show,
  threshold = 300,
}: ScrollToTopButtonProps) {
  const [autoShow, setAutoShow] = useState(false);
  const isControlled = show !== undefined;
  const visible = enabled && (isControlled ? show : autoShow);

  useEffect(() => {
    if (!enabled || isControlled) return;

    const onScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;
      setAutoShow(scrollY > threshold);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [enabled, isControlled, threshold]);

  if (!visible) return null;

  return (
    <button
      type="button"
      aria-label="กลับขึ้นด้านบน"
      onClick={() => {
        if (onScrollTop) {
          onScrollTop();
          return;
        }

        window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
      }}
      className="fixed bottom-24 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-[#003366] text-white shadow-[0_4px_16px_rgba(0,51,102,0.35)] transition-all active:scale-90 hover:bg-[#00264d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#003366]"
    >
      <ChevronUp className="h-5 w-5" strokeWidth={2.5} />
    </button>
  );
}
