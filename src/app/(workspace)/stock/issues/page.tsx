import { Suspense } from "react";
import { PageLoader } from "@/components/page-loader";
import { requireAppRole } from "@/lib/auth/authorization";
import { getStockIssueHistoryData } from "@/lib/stock/issues";
import { StockIssuesClient } from "./stock-issues-client";

export const metadata = {
  title: "เบิกสินค้าออก",
};

export default async function StockIssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await requireAppRole("admin");
  const resolvedParams = await searchParams;
  
  // Default to today's date in Thailand timezone if not provided
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
  const date = resolvedParams.date || today;
  
  const issues = await getStockIssueHistoryData(session.organizationId, 50, 0, date);

  return (
    <Suspense fallback={<PageLoader />}>
      <StockIssuesClient issues={issues} initialDate={date} />
    </Suspense>
  );
}
