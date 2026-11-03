import type { Json } from "@/types/database";

export const DEFAULT_ORDER_OPEN_TIME = "00:00";
export const DEFAULT_ORDER_CLOSE_TIME = "17:00";

export type OrderWindowSettings = {
  allowOrderAfterCutoff: boolean;
  closeTime: string;
  openTime: string;
};

export const DEFAULT_ORDER_WINDOW_SETTINGS: OrderWindowSettings = {
  allowOrderAfterCutoff: false,
  closeTime: DEFAULT_ORDER_CLOSE_TIME,
  openTime: DEFAULT_ORDER_OPEN_TIME,
};

function isJsonObject(value: Json | null | undefined): value is Record<string, Json | undefined> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isValidTimeString(value: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

export function timeStringToMinutes(value: string) {
  const [hourText, minuteText] = value.split(":");
  return Number(hourText) * 60 + Number(minuteText);
}

export function formatOrderCutoffLabel(orderDate: string, closeTime: string) {
  return `${orderDate.split("-").reverse().join("/")} ${closeTime}`;
}

export function parseOrderWindowSettings(metadata: Json | null | undefined): OrderWindowSettings {
  if (!isJsonObject(metadata)) {
    return DEFAULT_ORDER_WINDOW_SETTINGS;
  }

  const rawOrderSettings = metadata.orderSettings;
  if (!isJsonObject(rawOrderSettings)) {
    return DEFAULT_ORDER_WINDOW_SETTINGS;
  }

  const openTime =
    typeof rawOrderSettings.openTime === "string" && isValidTimeString(rawOrderSettings.openTime)
      ? rawOrderSettings.openTime
      : DEFAULT_ORDER_OPEN_TIME;
  const closeTime =
    typeof rawOrderSettings.closeTime === "string" && isValidTimeString(rawOrderSettings.closeTime)
      ? rawOrderSettings.closeTime
      : DEFAULT_ORDER_CLOSE_TIME;

  return {
    allowOrderAfterCutoff: rawOrderSettings.allowOrderAfterCutoff === true,
    closeTime,
    openTime,
  };
}

export function buildOrderWindowMetadata(
  metadata: Json | null | undefined,
  settings: OrderWindowSettings,
): Json {
  const nextMetadata = isJsonObject(metadata) ? { ...metadata } : {};
  const previousOrderSettings = isJsonObject(nextMetadata.orderSettings)
    ? nextMetadata.orderSettings
    : {};

  return {
    ...nextMetadata,
    orderSettings: {
      ...previousOrderSettings,
      allowOrderAfterCutoff: settings.allowOrderAfterCutoff,
      closeTime: settings.closeTime,
      openTime: settings.openTime,
    },
  };
}

export function isOrderOpenAtMinutes({
  allowOrderAfterCutoff,
  closeTime,
  currentMinutes,
  openTime,
}: {
  allowOrderAfterCutoff: boolean;
  closeTime: string;
  currentMinutes: number;
  openTime: string;
}) {
  const openMinutes = timeStringToMinutes(openTime);
  const closeMinutes = timeStringToMinutes(closeTime);

  return currentMinutes >= openMinutes && (allowOrderAfterCutoff || currentMinutes < closeMinutes);
}

function normalizeDate(d: string): string {
  if (!d) return "";
  const part = d.includes("T") ? d.split("T")[0] : d.includes(" ") ? d.split(" ")[0] : d;
  return part.trim();
}

export function isCustomerOrderEditableAtTime({
  allowOrderAfterCutoff,
  closeTime,
  currentDate,
  currentMinutes,
  orderDate,
  status,
}: {
  allowOrderAfterCutoff: boolean;
  closeTime: string;
  currentDate: string;
  currentMinutes: number;
  orderDate: string;
  status: string | null | undefined;
}) {
  if (status !== "submitted" && status !== "confirmed") return false;
  if (normalizeDate(orderDate) !== normalizeDate(currentDate)) return false;
  return allowOrderAfterCutoff || currentMinutes < timeStringToMinutes(closeTime);
}
