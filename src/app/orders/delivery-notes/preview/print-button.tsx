"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-xl bg-[#003366] px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-[#002244]"
    >
      ทดสอบพิมพ์
    </button>
  );
}
