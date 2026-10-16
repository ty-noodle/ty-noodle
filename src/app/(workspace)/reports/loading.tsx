import { AppSidebarLayout } from "@/components/app-sidebar";
import { ReportTableSkeleton } from "@/components/reports/report-table-skeleton";

export default function ReportsLoading() {
  return (
    <AppSidebarLayout>
      <ReportTableSkeleton />
    </AppSidebarLayout>
  );
}
