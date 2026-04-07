"use client";

import { useEffect } from "react";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-xl bg-[#003366] px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-[#002244]"
    >
      พิมพ์ทั้งหมด
    </button>
  );
}

export function AutoPrint() {
  useEffect(() => {
    window.print();
  }, []);
  return null;
}
