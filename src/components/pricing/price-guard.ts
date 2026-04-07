"use client";

export function isBelowCostPrice(
  salePrice: number | null | undefined,
  effectiveCostPrice: number | null | undefined,
) {
  return (
    Number.isFinite(salePrice) &&
    Number.isFinite(effectiveCostPrice) &&
    Number(salePrice) > 0 &&
    Number(salePrice) < Number(effectiveCostPrice)
  );
}

export function confirmBelowCostSave({
  productName,
  saleUnitLabel,
  salePrice,
  effectiveCostPrice,
}: {
  productName?: string;
  saleUnitLabel?: string;
  salePrice: number;
  effectiveCostPrice: number;
}) {
  if (typeof window === "undefined") return true;

  const formattedSalePrice = salePrice.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const formattedCostPrice = effectiveCostPrice.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const itemLabel = [productName, saleUnitLabel ? `(${saleUnitLabel})` : ""]
    .filter(Boolean)
    .join(" ")
    .trim();

  return window.confirm(
    [
      itemLabel ? `ราคาของ ${itemLabel} ต่ำกว่าทุน` : "ราคานี้ต่ำกว่าทุน",
      `ราคาขาย: ฿${formattedSalePrice}`,
      `ต้นทุน: ฿${formattedCostPrice}`,
      "",
      "คุณยังต้องการบันทึกราคานี้ใช่หรือไม่?",
    ].join("\n"),
  );
}
