"use client";

export function PackingListPrintButton({
  unassignedStores = [],
}: {
  unassignedStores?: string[];
}) {
  function handleClick() {
    if (unassignedStores.length > 0) {
      const storeList = unassignedStores.map((s) => `  • ${s}`).join("\n");
      const confirmed = window.confirm(
        `⚠️ ร้านค้าต่อไปนี้ยังไม่ได้ผูกกับรถ (${unassignedStores.length} ร้าน)\n\n${storeList}\n\nต้องการพิมพ์ต่อไหม?`
      );
      if (!confirmed) return;
    }
    window.print();
  }

  return (
    <button
      onClick={handleClick}
      style={{
        background: "#1e3a5f",
        color: "white",
        border: "none",
        padding: "6px 16px",
        borderRadius: "8px",
        cursor: "pointer",
        fontWeight: 700,
        fontSize: "13px",
        fontFamily: "Sarabun, sans-serif",
      }}
    >
      พิมพ์
    </button>
  );
}
