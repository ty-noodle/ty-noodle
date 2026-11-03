export type SaleUnitCostMode = "derived" | "fixed";

type EffectiveSaleUnitCostInput = {
  baseCostPrice: number;
  baseUnitQuantity: number;
  costMode?: string | null;
  fixedCostPrice?: number | null;
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function normalizeSaleUnitCostMode(value: string | null | undefined): SaleUnitCostMode {
  return value === "fixed" ? "fixed" : "derived";
}

export function getEffectiveSaleUnitCost({
  baseCostPrice,
  baseUnitQuantity,
  costMode,
  fixedCostPrice,
}: EffectiveSaleUnitCostInput) {
  const normalizedMode = normalizeSaleUnitCostMode(costMode);
  const normalizedBaseCost = Number.isFinite(baseCostPrice) ? baseCostPrice : 0;
  const normalizedRatio = Number.isFinite(baseUnitQuantity) ? baseUnitQuantity : 0;
  const normalizedFixedCost =
    fixedCostPrice !== null && fixedCostPrice !== undefined && Number.isFinite(fixedCostPrice)
      ? fixedCostPrice
      : null;

  if (normalizedMode === "fixed" && normalizedFixedCost !== null) {
    return roundMoney(normalizedFixedCost);
  }

  return roundMoney(normalizedBaseCost * normalizedRatio);
}
