export const ORDER_QUANTITY_SCALE = 1000;
export const FREE_ORDER_MINIMUM = 0.001;
export const FREE_ORDER_STEP = 0.1;

function roundToScale(value: number, scale: number) {
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function toQuantityScale(value: number) {
  return Math.round(value * ORDER_QUANTITY_SCALE);
}

export function getEffectiveOrderMinimum(
  minOrderQty: number,
  stepOrderQty: number | null,
) {
  if (stepOrderQty === null) return FREE_ORDER_MINIMUM;
  return Number.isFinite(minOrderQty) && minOrderQty > 0 ? minOrderQty : 1;
}

export function getEffectiveOrderStep(stepOrderQty: number | null) {
  if (stepOrderQty === null) return FREE_ORDER_STEP;
  return Number.isFinite(stepOrderQty) && stepOrderQty > 0 ? stepOrderQty : 1;
}

export function normalizeOrderQuantity(
  value: number,
  minOrderQty: number,
  stepOrderQty: number | null,
) {
  const minimum = getEffectiveOrderMinimum(minOrderQty, stepOrderQty);
  if (!Number.isFinite(value)) return minimum;

  const clamped = Math.max(value, minimum);
  if (stepOrderQty === null) return roundToScale(clamped, ORDER_QUANTITY_SCALE);

  const minimumScaled = toQuantityScale(minimum);
  const stepScaled = Math.max(1, toQuantityScale(getEffectiveOrderStep(stepOrderQty)));
  const valueScaled = toQuantityScale(clamped);
  const snapped = minimumScaled + Math.round((valueScaled - minimumScaled) / stepScaled) * stepScaled;
  return Math.max(minimumScaled, snapped) / ORDER_QUANTITY_SCALE;
}

export function isValidOrderQuantity(
  value: number,
  minOrderQty: number,
  stepOrderQty: number | null,
) {
  const minimum = getEffectiveOrderMinimum(minOrderQty, stepOrderQty);
  if (!Number.isFinite(value) || value < minimum) return false;

  const scaledValue = value * ORDER_QUANTITY_SCALE;
  if (Math.abs(scaledValue - Math.round(scaledValue)) > 1e-9) return false;
  if (stepOrderQty === null) return true;

  const offset = toQuantityScale(value) - toQuantityScale(minimum);
  const stepScaled = Math.max(1, toQuantityScale(getEffectiveOrderStep(stepOrderQty)));
  return offset % stepScaled === 0;
}

export function stepOrderQuantity(
  current: number,
  direction: -1 | 1,
  minOrderQty: number,
  stepOrderQty: number | null,
) {
  const normalized = normalizeOrderQuantity(current, minOrderQty, stepOrderQty);
  return normalizeOrderQuantity(
    normalized + direction * getEffectiveOrderStep(stepOrderQty),
    minOrderQty,
    stepOrderQty,
  );
}

export function calculateBaseQuantity(quantity: number, baseUnitQuantity: number) {
  return roundToScale(quantity * baseUnitQuantity, ORDER_QUANTITY_SCALE);
}

export function calculateLineTotal(quantity: number, unitPrice: number) {
  return roundToScale(quantity * unitPrice, 100);
}
