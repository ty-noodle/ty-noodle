import { Suspense } from "react";
import { AppSidebarLayout } from "@/components/app-sidebar";
import { BillingDashboardSkeleton } from "@/components/billing/billing-dashboard-skeleton";
import { requireAppRole } from "@/lib/auth/authorization";
import {
  getBillingCandidates,
  getCustomersForBilling,
} from "@/lib/billing/billing-statement";
import { BillingDashboardClient } from "./billing-dashboard-client";

export const metadata = { title: "ใบวางบิล | T&Y Noodles" };

type BillingPageProps = {
  searchParams: Promise<{ 
    from?: string; 
    to?: string;
  }>;
};

function todayISO() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
}

function daysAgoISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
}

function isValidDate(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function BillingPageContent({ searchParams }: BillingPageProps) {
  const session = await requireAppRole("admin");
  const params = await searchParams;
  
  const from = isValidDate(params.from) ? params.from : daysAgoISO(30);
  const to = isValidDate(params.to) ? params.to : todayISO();

  const [candidates, allCustomers] = await Promise.all([
    getBillingCandidates(session.organizationId, from, to),
    getCustomersForBilling(session.organizationId),
  ]);

  return (
    <BillingDashboardClient
      candidates={candidates}
      allCustomers={allCustomers}
      initialFrom={from}
      initialTo={to}
    />
  );
}

export default function BillingPage(props: BillingPageProps) {
  return (
    <AppSidebarLayout>
      <Suspense fallback={<BillingDashboardSkeleton />}>
        <BillingPageContent {...props} />
      </Suspense>
    </AppSidebarLayout>
  );
}
