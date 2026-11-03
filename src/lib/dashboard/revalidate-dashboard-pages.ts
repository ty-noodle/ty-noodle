import { revalidatePath } from "next/cache";

const DASHBOARD_PATHS = ["/dashboard"] as const;

export function revalidateDashboardPages() {
  for (const path of DASHBOARD_PATHS) {
    revalidatePath(path);
  }
}
