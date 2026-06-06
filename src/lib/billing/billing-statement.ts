"server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { PRINT_ORGANIZATION_NAME } from "@/components/print/print-shared";

export type SnapshotRow = {
  lineNumber: number;
  deliveryNumber: string;
  deliveryDate: string;
  totalAmount: number;
  notes: string | null;
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
};

export type BillingCandidate = {
  customerId: string;
  customerName: string;
  customerCode: string;
  deliveryCount: number;
  totalAmount: number;
  latestDeliveryDate: string;
  deliveries: {
    number: string;
    date: string;
    amount: number;
    isAlreadyBilled: boolean;
    billingNumber: string | null;
    billingFrom?: string;
    billingTo?: string;
  }[];
};

export type BillingStatementData = {
  customer: {
    id: string;
    code: string;
    name: string;
    address: string | null;
    phone: string | null;
  };
  organization: {
    name: string;
    address: string;
    phone: string;
  };
  billingDate: string;
  fromDate: string;
  toDate: string;
  grandTotal: number;
  billingNumber: string | null;
  isLocked: boolean;
  rows: {
    lineNumber: number;
    deliveryNumber: string;
    deliveryDate: string;
    totalAmount: number;
    notes: string | null;
  }[];
};

type DeliveryNoteRow = {
  id: string;
  customer_id: string;
  delivery_number: string;
  delivery_date: string;
  total_amount: number;
  notes: string | null;
};

function toNum(v: number | string | null | undefined) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function chunkIds<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

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

async function getDeliveryNoteActualTotals(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  noteIds: string[],
) {
  if (noteIds.length === 0) {
    return new Map<string, number>();
  }

  const noteChunks = chunkIds(noteIds, 100);
  const deliveryNoteItemsPromises = noteChunks.map((chunk) =>
    supabase
      .from("delivery_note_items")
      .select("delivery_note_id, order_item_id")
      .in("delivery_note_id", chunk)
  );

  let results;
  try {
    results = await Promise.all(deliveryNoteItemsPromises);
  } catch (error) {
    console.error("[billing] failed to load delivery note items in parallel", error);
    return new Map<string, number>();
  }

  const deliveryNoteItems: Array<{ delivery_note_id: string; order_item_id: string | null }> = [];
  for (const res of results) {
    if (res.error) {
      console.error("[billing] failed to load delivery note items", res.error);
      return new Map<string, number>();
    }
    if (res.data) {
      deliveryNoteItems.push(...(res.data as Array<{ delivery_note_id: string; order_item_id: string | null }>));
    }
  }

  const orderItemIds = Array.from(
    new Set(deliveryNoteItems.map((item) => item.order_item_id).filter(Boolean) as string[]),
  );
  const orderItems: Array<{ id: string; line_total: number | null }> = [];
  if (orderItemIds.length > 0) {
    const orderChunks = chunkIds(orderItemIds, 100);
    const orderItemsPromises = orderChunks.map((chunk) =>
      supabase
        .from("order_items")
        .select("id, line_total")
        .in("id", chunk)
    );

    let orderResults;
    try {
      orderResults = await Promise.all(orderItemsPromises);
    } catch (error) {
      console.error("[billing] failed to load order item totals in parallel", error);
      return new Map<string, number>();
    }

    for (const res of orderResults) {
      if (res.error) {
        console.error("[billing] failed to load order item totals", res.error);
        return new Map<string, number>();
      }
      if (res.data) {
        orderItems.push(...(res.data as Array<{ id: string; line_total: number | null }>));
      }
    }
  }

  const orderItemTotalMap = new Map(
    orderItems.map((item) => [item.id, toNum(item.line_total)]),
  );
  const deliveryTotals = new Map<string, number>();

  const seenPairs = new Set<string>();
  for (const item of deliveryNoteItems) {
    if (!item.order_item_id) continue;
    const dedupeKey = `${item.delivery_note_id}:${item.order_item_id}`;
    if (seenPairs.has(dedupeKey)) continue;
    seenPairs.add(dedupeKey);
    const currentTotal = deliveryTotals.get(item.delivery_note_id) ?? 0;
    deliveryTotals.set(
      item.delivery_note_id,
      currentTotal + (orderItemTotalMap.get(item.order_item_id) ?? 0),
    );
  }

  return deliveryTotals;
}

function sortByCustomerCode<T extends { customerCode: string; customerName: string }>(rows: T[]) {
  return rows.sort((a, b) => {
    const codeCompare = a.customerCode.localeCompare(b.customerCode, "th");
    if (codeCompare !== 0) return codeCompare;
    return a.customerName.localeCompare(b.customerName, "th");
  });
}

async function resolveBillingSyncActorUserId(organizationId: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("app_users")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data?.id ?? null;
}

async function ensureConfirmedDeliveryNotesForRange(
  organizationId: string,
  fromDate: string,
  toDate: string,
) {
  const supabase = getSupabaseAdmin();
  let orders: Array<{ id: string; customer_id: string | null; order_date: string; created_at: string }> = [];
  let notes: Array<{ customer_id: string | null; delivery_date: string }> = [];
  try {
    const [ordersResult, notesResult] = await Promise.all([
      fetchAllPaged((from, to) =>
        supabase
          .from("orders")
          .select("id, customer_id, order_date, created_at")
          .eq("organization_id", organizationId)
          .gte("order_date", fromDate)
          .lte("order_date", toDate)
          .neq("status", "cancelled")
          .not("customer_id", "is", null)
          .order("order_date", { ascending: true })
          .order("created_at", { ascending: true })
          .range(from, to)
      ),
      fetchAllPaged((from, to) =>
        supabase
          .from("delivery_notes")
          .select("customer_id, delivery_date")
          .eq("organization_id", organizationId)
          .eq("status", "confirmed")
          .gte("delivery_date", fromDate)
          .lte("delivery_date", toDate)
          .range(from, to)
      ),
    ]);
    orders = ordersResult;
    notes = notesResult;
  } catch (err) {
    console.error("[billing] failed to load data for delivery-note repair", err);
    return;
  }

  if (orders.length === 0) {
    return;
  }

  const existingKeys = new Set(
    (notes ?? []).map((note) => `${note.customer_id}::${note.delivery_date}`),
  );
  const ordersToSync = new Map<string, string>();

  for (const order of orders) {
    if (!order.customer_id) continue;
    const key = `${order.customer_id}::${order.order_date}`;
    if (existingKeys.has(key) || ordersToSync.has(key)) {
      continue;
    }
    ordersToSync.set(key, order.id);
  }

  if (ordersToSync.size === 0) {
    return;
  }

  const actorUserId = await resolveBillingSyncActorUserId(organizationId);
  if (!actorUserId) {
    console.error("[billing] no active app user found for delivery-note repair");
    return;
  }

  const { syncDeliveryNoteForOrder } = await import("@/lib/orders/sync-delivery-note");

  for (const [key, orderId] of ordersToSync) {
    const syncResult = await syncDeliveryNoteForOrder(supabase as never, {
      orderId,
      organizationId,
      userId: actorUserId,
      skipRevalidate: true,
    });

    if ("error" in syncResult) {
      console.error("[billing] failed to repair delivery note before billing", {
        error: syncResult.error,
        key,
        orderId,
      });
      continue;
    }

    existingKeys.add(key);
  }
}

export async function getBillingCandidates(
  organizationId: string,
  fromDate: string,
  toDate: string
): Promise<BillingCandidate[]> {
  await ensureConfirmedDeliveryNotesForRange(organizationId, fromDate, toDate);
  const supabase = getSupabaseAdmin();
  
  interface DeliveryNoteCandidate {
    id: string;
    customer_id: string;
    delivery_number: string;
    delivery_date: string;
    total_amount: number;
    notes: string | null;
    customers: {
      id: string;
      name: string;
      customer_code: string;
    };
  }
  let notes: DeliveryNoteCandidate[] = [];
  try {
    notes = await fetchAllPaged((from, to) =>
      supabase
        .from("delivery_notes")
        .select(`
          id,
          customer_id,
          delivery_number,
          delivery_date,
          total_amount,
          notes,
          customers!inner (
            id,
            name,
            customer_code
          )
        `)
        .eq("organization_id", organizationId)
        .eq("status", "confirmed")
        .gte("delivery_date", fromDate)
        .lte("delivery_date", toDate)
        .range(from, to)
    );
  } catch (notesError) {
    console.error("[billing] failed to load delivery notes for candidates", notesError);
    return [];
  }

  const deliveryTotals = await getDeliveryNoteActualTotals(
    supabase,
    (notes as { id: string }[]).map((note) => note.id),
  );

  const grouped = new Map<string, BillingCandidate>();

  for (const note of (notes as {
    id: string;
    customer_id: string;
    total_amount: number;
    delivery_number: string;
    delivery_date: string;
    customers: { name: string; customer_code: string };
  }[])) {
    const current = grouped.get(note.customer_id) ?? {
      customerId: note.customer_id,
      customerName: note.customers.name,
      customerCode: note.customers.customer_code,
      deliveryCount: 0,
      totalAmount: 0,
      latestDeliveryDate: note.delivery_date,
      deliveries: [] as BillingCandidate["deliveries"],
    };

    const actualAmount = deliveryTotals.has(note.id)
      ? (deliveryTotals.get(note.id) ?? 0)
      : toNum(note.total_amount);

    current.deliveryCount += 1;
    current.totalAmount += actualAmount;
    if (note.delivery_date > current.latestDeliveryDate) {
      current.latestDeliveryDate = note.delivery_date;
    }
    current.deliveries.push({
      number: note.delivery_number,
      date: note.delivery_date,
      amount: actualAmount,
      isAlreadyBilled: false,
      billingNumber: null,
    });
    grouped.set(note.customer_id, current);
  }

  const candidates = Array.from(grouped.values());
  if (candidates.length === 0) return [];

  const lookbackDate = new Date(fromDate);
  lookbackDate.setMonth(lookbackDate.getMonth() - 3);
  const lookbackISO = lookbackDate.toISOString().split("T")[0];

  interface BillingRecordLookup {
    customer_id: string;
    billing_number: string;
    snapshot_rows: Array<{ deliveryNumber: string }> | null;
    from_date: string;
    to_date: string;
  }
  let billingRecords: BillingRecordLookup[] = [];
  try {
    billingRecords = (await fetchAllPaged((from, to) =>
      supabase
        .from("billing_records")
        .select("customer_id, billing_number, snapshot_rows, from_date, to_date")
        .eq("organization_id", organizationId)
        .gte("from_date", lookbackISO)
        .in("customer_id", candidates.map((candidate) => candidate.customerId))
        .range(from, to)
    )) as unknown as BillingRecordLookup[];
  } catch (error) {
    console.error("[billing] failed to load billing records for candidates", error);
  }

  if (billingRecords && billingRecords.length > 0) {
    for (const record of (billingRecords as {
      customer_id: string;
      billing_number: string;
      snapshot_rows: { deliveryNumber: string }[];
      from_date: string;
      to_date: string;
    }[])) {
      const candidate = candidates.find(c => c.customerId === record.customer_id);
      if (!candidate) continue;

      const snapshot = record.snapshot_rows || [];
      const billedNumbers = new Set(snapshot.map(s => s.deliveryNumber));

      for (const delivery of candidate.deliveries) {
        if (billedNumbers.has(delivery.number)) {
          delivery.isAlreadyBilled = true;
          delivery.billingNumber = record.billing_number;
          delivery.billingFrom = record.from_date;
          delivery.billingTo = record.to_date;
        }
      }
    }
  }

  return sortByCustomerCode(candidates);
}

export async function getBilledDeliveryNumbersForRange(
  organizationId: string,
  fromDate: string,
  toDate: string,
): Promise<Set<string>> {
  const supabase = getSupabaseAdmin();
  let data: Array<{ snapshot_rows: SnapshotRow[] | null }> = [];
  try {
    data = (await fetchAllPaged((from, to) =>
      supabase
        .from("billing_records")
        .select("snapshot_rows")
        .eq("organization_id", organizationId)
        .lte("from_date", toDate)
        .gte("to_date", fromDate)
        .range(from, to)
    )) as unknown as Array<{ snapshot_rows: SnapshotRow[] | null }>;
  } catch (error) {
    console.error("[billing] failed to load billing records for range", error);
    return new Set();
  }

  const billedDeliveryNumbers = new Set<string>();

  for (const row of data as Array<{ snapshot_rows: SnapshotRow[] | null }>) {
    const snapshotRows = Array.isArray(row.snapshot_rows) ? row.snapshot_rows : [];
    for (const snapshot of snapshotRows) {
      if (snapshot.deliveryNumber) {
        billedDeliveryNumbers.add(snapshot.deliveryNumber);
      }
    }
  }

  return billedDeliveryNumbers;
}

export async function getCustomersForBilling(organizationId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, customer_code")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("customer_code", { ascending: true });
  
  if (error || !data) return [];
  return data;
}

export async function getBillingHistory(
  organizationId: string,
  options: {
    from?: string;
    to?: string;
    query?: string;
    customerIds?: string[];
    limit?: number;
  } = {}
): Promise<BillingRecord[]> {
  const supabase = getSupabaseAdmin();
  let queryBuilder = supabase
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
      customers!inner(name, customer_code)
    `)
    .eq("organization_id", organizationId);

  if (options.from) queryBuilder = queryBuilder.gte("billing_date", options.from);
  if (options.to) queryBuilder = queryBuilder.lte("billing_date", options.to);
  if (options.query) {
    const q = `%${options.query}%`;
    queryBuilder = queryBuilder.or(`billing_number.ilike.${q},customer_code.ilike.${q},name.ilike.${q}`, {
      referencedTable: "customers"
    });
  }
  if (options.customerIds && options.customerIds.length > 0) {
    queryBuilder = queryBuilder.in("customer_id", options.customerIds);
  }

  queryBuilder = queryBuilder.order("created_at", { ascending: false });
  if (options.limit) {
    queryBuilder = queryBuilder.limit(options.limit);
  }

  const { data, error } = await queryBuilder;

  if (error || !data) return [];

  const records = data as unknown as {
    id: string;
    billing_number: string;
    customer_id: string;
    billing_date: string;
    total_amount: number;
    from_date: string;
    to_date: string;
    created_at: string;
    snapshot_rows: SnapshotRow[];
    customers: { name: string; customer_code: string } | null;
  }[];

  const result: BillingRecord[] = [];
  if (records.length === 0) return result;

  // Gather all unique customer IDs and boundary dates for bulk querying
  const customerIds = Array.from(new Set(records.map((r) => r.customer_id)));
  const fromDates = records.map((r) => r.from_date).filter(Boolean);
  const toDates = records.map((r) => r.to_date).filter(Boolean);

  let activeNotes: Array<{
    id: string;
    customer_id: string;
    delivery_number: string;
    delivery_date: string;
    total_amount: number;
    notes: string | null;
  }> = [];

  if (customerIds.length > 0 && fromDates.length > 0 && toDates.length > 0) {
    const minFromDate = fromDates.sort()[0];
    const maxToDate = toDates.sort().reverse()[0];

    try {
      activeNotes = await fetchAllPaged((from, to) =>
        supabase
          .from("delivery_notes")
          .select("id, customer_id, delivery_number, delivery_date, total_amount, notes")
          .in("customer_id", customerIds)
          .gte("delivery_date", minFromDate)
          .lte("delivery_date", maxToDate)
          .eq("status", "confirmed")
          .range(from, to)
      );
    } catch (notesError) {
      console.error("[billing] failed to load delivery notes for history", notesError);
    }
  }

  for (const row of records) {
    const originalSnapshot = (row.snapshot_rows as SnapshotRow[]) || [];
    const originalNumbers = originalSnapshot.map((n) => n.deliveryNumber);

    if (originalNumbers.length === 0) {
      result.push({
        id: row.id,
        billing_number: row.billing_number,
        customer_id: row.customer_id,
        customer_name: row.customers?.name ?? "ไม่ทราบชื่อร้าน",
        customer_code: row.customers?.customer_code ?? "-",
        billing_date: row.billing_date,
        total_amount: row.total_amount,
        from_date: row.from_date,
        to_date: row.to_date,
        created_at: row.created_at,
        snapshot_rows: originalSnapshot,
      });
      continue;
    }

    // Filter notes matching customer and date range in-memory (0 database hits!)
    const matchingNotes = activeNotes.filter(
      (n) =>
        n.customer_id === row.customer_id &&
        n.delivery_date >= row.from_date &&
        n.delivery_date <= row.to_date
    );

    if (matchingNotes.length === 0) {
      // Skip this record if all delivery notes are deleted/unconfirmed to match original logic
      continue;
    }

    const totalAmount = matchingNotes.reduce((sum, n) => sum + Number(n.total_amount || 0), 0);

    const snapshot_rows = matchingNotes.map((n, idx) => ({
      lineNumber: idx + 1,
      deliveryNumber: n.delivery_number,
      deliveryDate: n.delivery_date,
      totalAmount: Number(n.total_amount || 0),
      notes: n.notes,
    }));

    result.push({
      id: row.id,
      billing_number: row.billing_number,
      customer_id: row.customer_id,
      customer_name: row.customers?.name ?? "ไม่ทราบชื่อร้าน",
      customer_code: row.customers?.customer_code ?? "-",
      billing_date: row.billing_date,
      total_amount: totalAmount,
      from_date: row.from_date,
      to_date: row.to_date,
      created_at: row.created_at,
      snapshot_rows,
    });
  }

  return result;
}

export async function getBillingStatementData(
  organizationId: string,
  customerId: string,
  fromDate: string,
  toDate: string,
  billingDate: string,
  deliveryNumbers?: string[],
  skipRepair?: boolean,
): Promise<BillingStatementData | null> {
  if (!skipRepair) {
    await ensureConfirmedDeliveryNotesForRange(organizationId, fromDate, toDate);
  }
  const supabase = getSupabaseAdmin();

  let notesQuery = supabase
    .from("delivery_notes")
    .select("id, customer_id, delivery_number, delivery_date, total_amount, notes")
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .eq("status", "confirmed")
    .gte("delivery_date", fromDate)
    .lte("delivery_date", toDate)
    .order("delivery_date", { ascending: true });

  if (deliveryNumbers && deliveryNumbers.length > 0) {
    notesQuery = notesQuery.in("delivery_number", deliveryNumbers);
  }

  const [orgResult, custResult, notesResult, historyResult] = await Promise.all([
    supabase.from("organizations").select("name, metadata").eq("id", organizationId).single(),
    supabase.from("customers").select("id, name, customer_code, address, phone").eq("id", customerId).single(),
    notesQuery,
    supabase.from("billing_records")
      .select("billing_number")
      .eq("organization_id", organizationId)
      .eq("customer_id", customerId)
      .eq("from_date", fromDate)
      .eq("to_date", toDate)
      .limit(1)
      .maybeSingle()
  ]);

  if (!orgResult.data || !custResult.data || !notesResult.data || notesResult.data.length === 0) {
    return null;
  }
  const deliveryTotals = await getDeliveryNoteActualTotals(
    supabase,
    (notesResult.data as DeliveryNoteRow[]).map((note) => note.id),
  );

  const orgMeta = (orgResult.data.metadata as Record<string, string>) || {};
  const orgInfo = {
    name: orgResult.data.name || PRINT_ORGANIZATION_NAME,
    address: orgMeta.address || "จังหวัดเชียงใหม่",
    phone: orgMeta.phone || "-",
  };

  const rows = (notesResult.data as DeliveryNoteRow[]).map((note, idx) => ({
    lineNumber: idx + 1,
    deliveryNumber: note.delivery_number,
    deliveryDate: note.delivery_date,
    totalAmount: deliveryTotals.has(note.id)
      ? (deliveryTotals.get(note.id) ?? 0)
      : toNum(note.total_amount),
    notes: note.notes,
  }));

  return {
    customer: {
      id: custResult.data.id,
      code: custResult.data.customer_code,
      name: custResult.data.name,
      address: custResult.data.address,
      phone: custResult.data.phone,
    },
    organization: orgInfo,
    billingDate,
    fromDate,
    toDate,
    grandTotal: rows.reduce((sum, row) => sum + row.totalAmount, 0),
    billingNumber: historyResult.data?.billing_number ?? null,
    isLocked: !!historyResult.data?.billing_number,
    rows,
  };
}

export async function getBatchBillingData(
  organizationId: string,
  fromDate: string,
  toDate: string,
  billingDate: string,
  customerIds?: string[],
  deliveryNumbers?: string[],
): Promise<BillingStatementData[]> {
  await ensureConfirmedDeliveryNotesForRange(organizationId, fromDate, toDate);
  const supabase = getSupabaseAdmin();

  let targetIds = customerIds;
  if (!targetIds || targetIds.length === 0) {
    let notes: Array<{ customer_id: string }> = [];
    try {
      notes = await fetchAllPaged((from, to) => {
        let query = supabase
          .from("delivery_notes")
          .select("customer_id")
          .eq("organization_id", organizationId)
          .eq("status", "confirmed")
          .gte("delivery_date", fromDate)
          .lte("delivery_date", toDate);

        if (deliveryNumbers && deliveryNumbers.length > 0) {
          query = query.in("delivery_number", deliveryNumbers);
        }

        return query.range(from, to);
      });
    } catch (error) {
      console.error("[billing] failed to load delivery notes for batch billing", error);
      return [];
    }
    targetIds = Array.from(new Set(notes.map((note) => note.customer_id)));
  }
  if (targetIds.length === 0) return [];

  const results = await Promise.all(
    targetIds.map((id) => {
      const customerDeliveryNumbers = deliveryNumbers;
            return getBillingStatementData(
        organizationId,
        id,
        fromDate,
        toDate,
        billingDate,
        customerDeliveryNumbers,
        true,
      );
    }),
  );

  return results.filter((r): r is BillingStatementData => r !== null);
}
