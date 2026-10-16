"use server";

import { requireAppRole } from "@/lib/auth/authorization";
import { getStockHistoryData, getStockMovementsData } from "@/lib/stock/admin";
import { getStockIssueHistoryData } from "@/lib/stock/issues";

export async function loadMoreStockHistoryAction(offset: number, limit = 50) {
  const session = await requireAppRole("admin");
  return getStockHistoryData(session.organizationId, limit, offset);
}

export async function loadMoreStockIssuesAction(offset: number, limit = 50) {
  const session = await requireAppRole("admin");
  return getStockIssueHistoryData(session.organizationId, limit, offset);
}

export async function loadMoreStockMovementsAction(offset: number, limit = 50) {
  const session = await requireAppRole("admin");
  return getStockMovementsData(session.organizationId, limit, offset);
}
