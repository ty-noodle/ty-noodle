/**
 * Normalize a string for fuzzy search: lowercase + strip all whitespace.
 * "ผัดโล A" → "ผัดโลa", so "ผัดโลA" still matches.
 */
export function normalizeSearch(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}
