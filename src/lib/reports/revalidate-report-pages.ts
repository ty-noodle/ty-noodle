import { revalidatePath } from "next/cache";

const REPORT_PATHS = [
  "/reports",
  "/reports/sales-overview",
  "/reports/profit-sales",
  "/reports/product-sales",
  "/reports/billing",
  "/reports/store-sales",
  "/reports/delivery-notes",
] as const;

export function revalidateReportPages() {
  for (const path of REPORT_PATHS) {
    revalidatePath(path);
  }
}
