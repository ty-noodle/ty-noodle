"use client";

import { useEffect, useRef, useState } from "react";

export function PrintButton() {
  const [isPrinting, setIsPrinting] = useState(false);
  const fallbackTimerRef = useRef<number | null>(null);

  function handlePrint() {
    if (isPrinting) return;

    setIsPrinting(true);
    const done = () => {
      if (fallbackTimerRef.current) {
        window.clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      setIsPrinting(false);
      window.removeEventListener("afterprint", done);
    };

    window.addEventListener("afterprint", done, { once: true });
    fallbackTimerRef.current = window.setTimeout(done, 1000);
    window.print();
  }

  return (
    <button
      onClick={handlePrint}
      disabled={isPrinting}
      className="rounded-xl bg-[#003366] px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-[#002244] disabled:cursor-not-allowed disabled:opacity-70"
    >
      {isPrinting ? "กำลังพิมพ์..." : "พิมพ์ทั้งหมด"}
    </button>
  );
}

export function AutoPrint() {
  useEffect(() => {
    // Add a small delay to ensure hydration and layout are stable
    const timer = setTimeout(() => {
      window.print();
    }, 800);
    return () => clearTimeout(timer);
  }, []);
  return null;
}
