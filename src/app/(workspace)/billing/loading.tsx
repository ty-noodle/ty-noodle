import { AppSidebarLayout } from "@/components/app-sidebar";
import { BillingDashboardSkeleton } from "@/components/billing/billing-dashboard-skeleton";

export default function BillingLoading() {
  return (
    <AppSidebarLayout>
      <BillingDashboardSkeleton />
    </AppSidebarLayout>
  );
}
