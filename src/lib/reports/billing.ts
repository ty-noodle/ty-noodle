import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { compareCustomerOrder } from "@/lib/settings/customer-order";

export type BillingReportRow = {
  id: string;
  billingDate: string;
  customerCode: string;
  customerName: string;
  sortOrder?: number;
  totalAmount: number;
};

export type BillingReportData = {
  rows: BillingReportRow[];
  summary: {
    totalAmount: number;
    totalBills: number;
  };
};

type BillingRecord = {
  id: string;
  billing_date: string;
  total_amount: number | string | null;
  customer_id: string | null;
};

type CustomerRecord = {
  id: string;
  customer_code: string | null;
  name: string | null;
  sort_order: number | string;
};

export async function getBillingReport(fromDate: string, toDate: string): Promise<BillingReportData> {
  const supabase = getSupabaseAdmin();

  const { data: records, error: recordsError } = await supabase
    .from("billing_records")
    .select("id, billing_date, total_amount, customer_id")
    .gte("billing_date", fromDate)
    .lte("billing_date", toDate)
    .order("billing_date", { ascending: true });

  if (recordsError) {
    console.error("Error fetching billing records:", recordsError.message, recordsError.code);
    return { rows: [], summary: { totalAmount: 0, totalBills: 0 } };
  }

  const billingRecords = (records ?? []) as BillingRecord[];
  const customerIds = [
    ...new Set(billingRecords.map((r) => r.customer_id).filter((id): id is string => Boolean(id))),
  ];

  const customerResult =
    customerIds.length > 0
      ? await supabase
          .from("customers")
          .select("id, customer_code, name, sort_order")
          .in("id", customerIds)
      : { data: [] as CustomerRecord[], error: null };

  if (customerResult.error) {
    console.error("Error fetching customers for billing:", customerResult.error.message);
  }

  const customers = (customerResult.data ?? []) as unknown as CustomerRecord[];
  const customerMap = new Map(customers.map((c) => [c.id, c]));

  const rows: BillingReportRow[] = billingRecords.map((item) => {
    const customer = item.customer_id ? customerMap.get(item.customer_id) : undefined;
    return {
      id: item.id,
      billingDate: item.billing_date,
      customerCode: customer?.customer_code ?? "-",
      customerName: customer?.name ?? "ไม่ทราบชื่อ",
      sortOrder: customer ? Number(customer.sort_order) : undefined,
      totalAmount: Number(item.total_amount ?? 0),
    };
  }).sort((left, right) => {
    const customerOrder = compareCustomerOrder(left, right);
    if (customerOrder !== 0) return customerOrder;

    const dateOrder = left.billingDate.localeCompare(right.billingDate);
    if (dateOrder !== 0) return dateOrder;

    return left.id.localeCompare(right.id);
  });

  const totalAmount = rows.reduce((sum, row) => sum + row.totalAmount, 0);

  return {
    rows,
    summary: {
      totalAmount,
      totalBills: rows.length,
    },
  };
}
