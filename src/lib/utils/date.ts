/**
 * Format ISO date string (YYYY-MM-DD) as DD/MM/YYYY in Buddhist Era.
 * e.g. "2026-03-22" → "22/03/2569"
 */
export function fmtDateTH(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${parseInt(y, 10) + 543}`;
}

/**
 * Format ISO datetime string as "DD/MM/YYYY HH:mm" in Buddhist Era (Bangkok time).
 * e.g. "2026-03-22T07:30:00Z" → "22/03/2569 14:30"
 */
export function fmtDateTimeTH(isoDateTime: string): string {
  const date = new Date(isoDateTime);
  const datePart = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok" }).format(date);
  const [y, m, d] = datePart.split("-");
  const buddhistYear = parseInt(y, 10) + 543;
  const time = new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
    hour12: false,
  }).format(date);
  return `${d}/${m}/${buddhistYear} ${time}`;
}
