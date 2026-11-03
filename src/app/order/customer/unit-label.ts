const DEFAULT_UNIT_LABEL = "\u0e2b\u0e19\u0e48\u0e27\u0e22";
const THAI_KILOGRAM_LABEL = "\u0e01\u0e01.";
const THAI_KILOGRAM_LABEL_WITHOUT_DOT = "\u0e01\u0e01";

export function formatDisplayUnit(unit: string | null | undefined) {
  const normalizedUnit = unit?.trim();

  if (!normalizedUnit) return DEFAULT_UNIT_LABEL;

  if (
    normalizedUnit.toLowerCase() === "kg" ||
    normalizedUnit === THAI_KILOGRAM_LABEL ||
    normalizedUnit === THAI_KILOGRAM_LABEL_WITHOUT_DOT
  ) {
    return "Kg";
  }

  return normalizedUnit;
}
