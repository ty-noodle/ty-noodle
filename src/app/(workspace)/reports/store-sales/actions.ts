"use server";

import { requireAppSession } from "@/lib/auth/authorization";
import { getStoreProductSales, type StoreProductRow } from "@/lib/reports/store-sales";

export async function fetchStoreProductSalesAction(params: {
  customerId: string;
  fromDate: string;
  toDate: string;
}): Promise<StoreProductRow[]> {
  const session = await requireAppSession();
  return getStoreProductSales({
    organizationId: session.organizationId,
    customerId: params.customerId,
    fromDate: params.fromDate,
    toDate: params.toDate,
  });
}
