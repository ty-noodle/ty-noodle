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

type JoinedCustomer = {
  id: string;
  customer_code: string | null;
  name: string | null;
};

type JoinedBillingRecord = {
  id: string;
  billing_date: string;
  total_amount: number | string | null;
  customer_id: string | null;
  customers: JoinedCustomer | JoinedCustomer[] | null;
};

async function fetchAllPaged<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) {
      throw error;
    }
    if (!data || data.length === 0) {
      break;
    }
    all.push(...data);
    if (data.length < pageSize) {
      break;
    }
    from += pageSize;
  }
  return all;
}

export async function getBillingReport(
  fromDate: string,
  toDate: string,
  organizationId?: string
): Promise<BillingReportData> {
  const supabase = getSupabaseAdmin();

  let billingRecords: JoinedBillingRecord[] = [];
  try {
    billingRecords = (await fetchAllPaged((from, to) => {
      let query = supabase
        .from("billing_records")
        .select(`
          id,
          billing_date,
          total_amount,
          customer_id,
          customers (
            id,
            customer_code,
            name
          )
        `)
        .gte("billing_date", fromDate)
        .lte("billing_date", toDate)
        .order("billing_date", { ascending: true })
        .order("id", { ascending: true });

      if (organizationId) {
        query = query.eq("organization_id", organizationId);
      }

      return query.range(from, to);
    })) as unknown as JoinedBillingRecord[];
  } catch (recordsError) {
    const err = recordsError as { message?: string; code?: string };
    console.error("Error fetching billing records:", err?.message, err?.code);
    return { rows: [], summary: { totalAmount: 0, totalBills: 0 } };
  }

  const rows: BillingReportRow[] = billingRecords
    .map((item) => {
      const rawCustomer = item.customers;
      const customer = Array.isArray(rawCustomer) ? rawCustomer[0] : rawCustomer;
      return {
        id: item.id,
        billingDate: item.billing_date,
        customerCode: customer?.customer_code ?? "-",
        customerName: customer?.name ?? "ไม่ทราบชื่อ",
        sortOrder: undefined,
        totalAmount: Number(item.total_amount ?? 0),
      };
    })
    .sort((left, right) => {
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
