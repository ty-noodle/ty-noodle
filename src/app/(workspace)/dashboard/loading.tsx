import { AppSidebarLayout } from "@/components/app-sidebar";
import { DashboardLoadingShell } from "@/components/dashboard/dashboard-loading-shell";

export default function DashboardLoading() {
  return (
    <AppSidebarLayout>
      <DashboardLoadingShell />
    </AppSidebarLayout>
  );
}
