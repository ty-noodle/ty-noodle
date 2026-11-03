export const CUSTOMER_CODE_FORMAT_ERROR =
  "รหัสร้านต้องขึ้นต้นด้วย TYS และตามด้วยตัวเลขเท่านั้น";
export const CUSTOMER_CODE_REQUIRED_ERROR = "กรอกรหัสร้านก่อนบันทึก";

export function normalizeCustomerCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

export function validateCustomerCode(value: unknown) {
  const code = normalizeCustomerCode(value);

  if (!code) {
    return CUSTOMER_CODE_REQUIRED_ERROR;
  }

  return /^TYS\d+$/.test(code) ? null : CUSTOMER_CODE_FORMAT_ERROR;
}

export function getNextCustomerCode(codes: string[]) {
  const maxSequence = codes.reduce((max, code) => {
    const match = /^TYS(\d+)$/i.exec(code.trim());

    if (!match) {
      return max;
    }

    const sequence = Number.parseInt(match[1], 10);
    return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
  }, 0);

  return `TYS${String(maxSequence + 1).padStart(3, "0")}`;
}
