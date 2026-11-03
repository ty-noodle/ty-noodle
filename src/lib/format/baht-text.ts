/**
 * Convert a number to Thai baht text.
 * e.g. 1500.50 → "หนึ่งพันห้าร้อยบาทห้าสิบสตางค์"
 */

const ONES = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const POS  = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

function convertBelow1M(n: number): string {
  if (n === 0) return "";
  const digits = String(Math.floor(n)).split("").map(Number);
  const len = digits.length;
  let text = "";
  for (let i = 0; i < len; i++) {
    const d = digits[i];
    const pos = len - 1 - i; // 0 = ones, 1 = tens, 2 = hundreds …
    if (d === 0) continue;
    if (pos === 1) {
      if (d === 1) text += "สิบ";
      else if (d === 2) text += "ยี่สิบ";
      else text += ONES[d] + "สิบ";
    } else if (pos === 0) {
      text += d === 1 && n >= 10 ? "เอ็ด" : ONES[d];
    } else {
      text += ONES[d] + POS[pos];
    }
  }
  return text;
}

export function bahtText(amount: number): string {
  if (!isFinite(amount) || amount < 0) return "";
  if (amount === 0) return "ศูนย์บาทถ้วน";

  const baht    = Math.floor(amount);
  const satang  = Math.round((amount - baht) * 100);

  let result = "";

  if (baht >= 1_000_000) {
    result += convertBelow1M(Math.floor(baht / 1_000_000)) + "ล้าน";
    const rem = baht % 1_000_000;
    if (rem > 0) result += convertBelow1M(rem);
  } else {
    result += convertBelow1M(baht);
  }

  result += "บาท";
  result += satang === 0 ? "ถ้วน" : convertBelow1M(satang) + "สตางค์";

  return result;
}
