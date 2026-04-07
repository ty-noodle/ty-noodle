import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

// billing_records / billing_number_counters ยังไม่อยู่ใน database.ts types
// run `npm run gen:types` หลัง apply migration เพื่อเอา cast ออก
const billingTable = (supabase: ReturnType<typeof getSupabaseAdmin>) => supabase;

export type SnapshotRow = {
  lineNumber: number;
  deliveryNumber: string;
  deliveryDate: string;
  totalAmount: number;
  notes: string | null;
};

export type BillingStatementData = {
  billingNumber: string | null;
  billingDate: string;
  fromDate: string;
  toDate: string;
  isLocked: boolean; // true = ยอดมาจาก snapshot (ล็อกแล้ว)
  customer: {
    id: string;
    name: string;
    code: string;
    address: string;
  };
  organization: {
    name: string;
    address: string | null;
    phone: string | null;
  };
  rows: SnapshotRow[];
  grandTotal: number;
};

export type BillingRecord = {
  id: string;
  billing_number: string;
  customer_id: string;
  customer_name: string;
  customer_code: string;
  billing_date: string;
  total_amount: number;
  from_date: string;
  to_date: string;
  created_at: string;
  snapshot_rows: SnapshotRow[];
  /** true = ข้อมูลจาก snapshot ที่ล็อกไว้ตอนออกใบ / false = ข้อมูลสดจากใบส่งของปัจจุบัน */
  isSnapshotLocked: boolean;
};

export type BillingCustomer = {
  id: string;
  name: string;
  code: string;
};

export async function getBillingCustomers(
  organizationId: string,
): Promise<BillingCustomer[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("customers")
    .select("id, name, customer_code")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("customer_code", { ascending: true });

  if (!data) return [];
  return (data as { id: string; name: string; customer_code: string }[]).map((c) => ({
    id: c.id,
    name: c.name,
    code: c.customer_code,
  }));
}

export async function getBillingHistory(
  organizationId: string,
  limit: number = 20,
): Promise<BillingRecord[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await billingTable(supabase)
    .from("billing_records")
    .select(`
      id,
      billing_number,
      customer_id,
      billing_date,
      total_amount,
      from_date,
      to_date,
      created_at,
      snapshot_rows,
      customers(name, customer_code)
    `)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!data) return [];

  const records: BillingRecord[] = (data as Array<Record<string, unknown>>).map((d) => ({
    id: d.id as string,
    billing_number: d.billing_number as string,
    customer_id: d.customer_id as string,
    billing_date: d.billing_date as string,
    total_amount: Number(d.total_amount),
    from_date: d.from_date as string,
    to_date: d.to_date as string,
    created_at: d.created_at as string,
    snapshot_rows: Array.isArray(d.snapshot_rows) && d.snapshot_rows.length > 0
      ? (d.snapshot_rows as unknown as SnapshotRow[])
      : [],
    isSnapshotLocked: Array.isArray(d.snapshot_rows) && d.snapshot_rows.length > 0,
    customer_name: (d.customers as { name: string } | null)?.name ?? "N/A",
    customer_code: (d.customers as { customer_code: string } | null)?.customer_code ?? "N/A",
  }));

  // Fallback: ดึง delivery_notes สดมาแทนสำหรับ records ที่ไม่มี snapshot
  // (records ที่ออกก่อนระบบ snapshot_rows ถูกเพิ่ม)
  const missing = records.filter((r) => r.snapshot_rows.length === 0);
  if (missing.length > 0) {
    const customerIds = [...new Set(missing.map((r) => r.customer_id))];
    const minDate = missing.reduce(
      (min, r) => (r.from_date < min ? r.from_date : min),
      missing[0].from_date,
    );
    const maxDate = missing.reduce(
      (max, r) => (r.to_date > max ? r.to_date : max),
      missing[0].to_date,
    );

    const { data: dnsData } = await supabase
      .from("delivery_notes")
      .select("delivery_number, delivery_date, total_amount, notes, customer_id")
      .eq("organization_id", organizationId)
      .in("customer_id", customerIds)
      .gte("delivery_date", minDate)
      .lte("delivery_date", maxDate)
      .eq("status", "confirmed")
      .order("delivery_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (dnsData) {
      type RawDN = {
        delivery_number: string;
        delivery_date: string;
        total_amount: number | string;
        notes: string | null;
        customer_id: string;
      };

      // Group delivery notes by customer_id for fast lookup
      const dnsByCustomer = new Map<string, RawDN[]>();
      for (const dn of dnsData as RawDN[]) {
        const list = dnsByCustomer.get(dn.customer_id) ?? [];
        list.push(dn);
        dnsByCustomer.set(dn.customer_id, list);
      }

      for (const record of records) {
        if (record.snapshot_rows.length > 0) continue;
        const customerDns = dnsByCustomer.get(record.customer_id) ?? [];
        const inRange = customerDns.filter(
          (dn) => dn.delivery_date >= record.from_date && dn.delivery_date <= record.to_date,
        );
        record.snapshot_rows = inRange.map((dn, idx) => ({
          lineNumber: idx + 1,
          deliveryNumber: dn.delivery_number,
          deliveryDate: dn.delivery_date,
          totalAmount: Number(dn.total_amount),
          notes: dn.notes ?? null,
        }));
      }
    }
  }

  return records;
}

export async function getBillingStatementData(
  organizationId: string,
  customerId: string,
  fromDate: string,
  toDate: string,
  billingDate: string,
  options: { saveHistory?: boolean; existingBillingNumber?: string } = {},
): Promise<BillingStatementData | null> {
  const supabase = getSupabaseAdmin();
  const db = billingTable(supabase);

  // 1. ตรวจสอบว่าเคยออกใบวางบิลช่วงนี้ไว้แล้วไหม
  const { data: existingRecord } = await db
    .from("billing_records")
    .select("billing_number, snapshot_rows")
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .eq("from_date", fromDate)
    .eq("to_date", toDate)
    .maybeSingle();

  const locked = existingRecord as {
    billing_number: string;
    snapshot_rows: SnapshotRow[] | null;
  } | null;

  // 2. ดึงข้อมูลลูกค้าและบริษัทเสมอ (header ของใบ)
  const [{ data: customerData }, { data: orgData }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, customer_code, address")
      .eq("id", customerId)
      .single(),
    supabase
      .from("organizations")
      .select("name, metadata")
      .eq("id", organizationId)
      .single(),
  ]);

  if (!customerData || !orgData) return null;

  const meta =
    typeof orgData.metadata === "object" && orgData.metadata !== null
      ? (orgData.metadata as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  type CustomerRow = { id: string; name: string; customer_code: string; address: string | null };
  const c = customerData as unknown as CustomerRow;

  const toNum = (v: number | string | null | undefined) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  };

  // 3. ถ้ามี snapshot → ใช้ข้อมูลที่ล็อกไว้ (ยอดไม่เปลี่ยนแม้แก้ DN ย้อนหลัง)
  if (locked?.snapshot_rows && locked.snapshot_rows.length > 0) {
    const rows = locked.snapshot_rows;
    return {
      billingNumber: locked.billing_number,
      billingDate,
      fromDate,
      toDate,
      isLocked: true,
      customer: { id: c.id, name: c.name, code: c.customer_code, address: c.address ?? "" },
      organization: {
        name: orgData.name,
        address: (meta.address as string) ?? null,
        phone: (meta.phone as string) ?? null,
      },
      rows,
      grandTotal: rows.reduce((s, r) => s + r.totalAmount, 0),
    };
  }

  // 4. ยังไม่มี snapshot → ดึงข้อมูล DN สด
  const { data: dns, error } = await supabase
    .from("delivery_notes")
    .select("delivery_number, delivery_date, total_amount, notes")
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .gte("delivery_date", fromDate)
    .lte("delivery_date", toDate)
    .eq("status", "confirmed")
    .order("delivery_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error || !dns || (dns as unknown[]).length === 0) return null;

  type RawDN = {
    delivery_number: string;
    delivery_date: string;
    total_amount: number | string;
    notes: string | null;
  };

  const rows: SnapshotRow[] = (dns as RawDN[]).map((row, idx) => ({
    lineNumber: idx + 1,
    deliveryNumber: row.delivery_number,
    deliveryDate: row.delivery_date,
    totalAmount: toNum(row.total_amount),
    notes: row.notes ?? null,
  }));

  return {
    billingNumber: locked?.billing_number ?? options.existingBillingNumber ?? null,
    billingDate,
    fromDate,
    toDate,
    isLocked: false,
    customer: { id: c.id, name: c.name, code: c.customer_code, address: c.address ?? "" },
    organization: {
      name: orgData.name,
      address: (meta.address as string) ?? null,
      phone: (meta.phone as string) ?? null,
    },
    rows,
    grandTotal: rows.reduce((s, r) => s + r.totalAmount, 0),
  };
}

export async function getBatchBillingData(
  organizationId: string,
  fromDate: string,
  toDate: string,
  billingDate: string,
  options: { saveHistory?: boolean } = {},
): Promise<BillingStatementData[]> {
  const supabase = getSupabaseAdmin();

  const { data: dns } = await supabase
    .from("delivery_notes")
    .select("customer_id")
    .eq("organization_id", organizationId)
    .gte("delivery_date", fromDate)
    .lte("delivery_date", toDate)
    .eq("status", "confirmed")
    .order("customer_id");

  if (!dns || dns.length === 0) return [];

  const uniqueIds = Array.from(new Set(dns.map((d) => d.customer_id)));
  const results: BillingStatementData[] = [];

  for (const customerId of uniqueIds) {
    const data = await getBillingStatementData(
      organizationId,
      customerId,
      fromDate,
      toDate,
      billingDate,
      options,
    );
    if (data) results.push(data);
  }

  return results;
}
