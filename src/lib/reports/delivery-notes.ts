import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeSearch } from "@/lib/utils/search";

export type DeliveryNoteReportLine = {
  id: string;
  productName: string;
  productSku: string;
  imageUrl: string | null;
  saleUnitLabel: string;
  quantityDelivered: number;
  lineTotal: number;
  lineCost: number;
  profit: number;
};

export type DeliveryNoteReportRow = {
  id: string;
  deliveryNumber: string;
  deliveryDate: string;
  customerId: string;
  customerName: string;
  customerCode: string;
  itemCount: number;
  totalQty: number;
  totalRevenue: number;
  totalCost: number;
  netProfit: number;
  marginPercent: number;
  billingNumber: string | null;
  lines: DeliveryNoteReportLine[];
};

export type DeliveryNoteReportSummary = {
  noteCount: number;
  totalQty: number;
  totalRevenue: number;
  totalCost: number;
  netProfit: number;
};

export type DeliveryReportCustomerOption = { id: string; name: string };

type RawDeliveryNote = {
  id: string;
  delivery_number: string;
  delivery_date: string;
  customer_id: string;
  total_amount: number | string;
  customers: {
    id: string;
    name: string;
    customer_code: string;
  };
};

type RawDeliveryLine = {
  id: string;
  delivery_note_id: string;
  quantity_delivered: number | string;
  quantity_in_base_unit: number | string | null;
  line_total: number | string;
  sale_unit_label: string;
  products: {
    name: string;
    sku: string;
    cost_price: number | string | null;
    product_images: Array<{
      public_url: string;
      sort_order: number;
    }> | null;
  } | null;
};

function toNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function getCustomersForDeliveryNoteReport(
  organizationId: string,
): Promise<DeliveryReportCustomerOption[]> {
  const supabase = getSupabaseAdmin();
    const { data } = await supabase
    .from("customers")
    .select("id, name")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  return ((data ?? []) as { id: string; name: string }[]).map((row) => ({
    id: row.id,
    name: row.name,
  }));
}

export async function getDeliveryNotesReport(params: {
  organizationId: string;
  fromDate: string;
  toDate: string;
  customerIds?: string[];
  keyword?: string;
  billedOnly?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<{
  rows: DeliveryNoteReportRow[];
  summary: DeliveryNoteReportSummary;
  total: number;
}> {
  const {
    organizationId,
    fromDate,
    toDate,
    customerIds = [],
    keyword = "",
    billedOnly = false,
    page = 1,
    pageSize = 20,
  } = params;

  const supabase = getSupabaseAdmin();
    let notesQuery = supabase
    .from("delivery_notes")
    .select(`
      id,
      delivery_number,
      delivery_date,
      customer_id,
      total_amount,
      customers!inner(id, name, customer_code)
    `)
    .eq("organization_id", organizationId)
    .eq("status", "confirmed")
    .gte("delivery_date", fromDate)
    .lte("delivery_date", toDate)
    .order("delivery_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (customerIds.length > 0) {
    notesQuery = notesQuery.in("customer_id", customerIds);
  }

  const { data: notesData, error: notesError } = await notesQuery;
  if (notesError) throw new Error(notesError.message);

  let notes = (notesData ?? []) as RawDeliveryNote[];
  const normalizedKeyword = normalizeSearch(keyword);
  if (normalizedKeyword) {
    notes = notes.filter((note) =>
      normalizeSearch(note.delivery_number).includes(normalizedKeyword) ||
      normalizeSearch(note.customers.name).includes(normalizedKeyword) ||
      normalizeSearch(note.customers.customer_code).includes(normalizedKeyword),
    );
  }

  if (notes.length === 0) {
    return {
      rows: [],
      summary: { noteCount: 0, totalQty: 0, totalRevenue: 0, totalCost: 0, netProfit: 0 },
      total: 0,
    };
  }

  const noteIds = notes.map((note) => note.id);

    const { data: linesData, error: linesError } = await supabase
    .from("delivery_note_items")
    .select(`
      id,
      delivery_note_id,
      quantity_delivered,
      quantity_in_base_unit,
      line_total,
      sale_unit_label,
      products!inner(name, sku, cost_price, product_images(public_url, sort_order))
    `)
    .eq("organization_id", organizationId)
    .in("delivery_note_id", noteIds)
    .order("created_at", { ascending: true });

  if (linesError) throw new Error(linesError.message);

  const lines = (linesData ?? []) as RawDeliveryLine[];
  const lineBucketsByNote = new Map<string, Map<string, DeliveryNoteReportLine>>();

  for (const line of lines) {
    const qty = toNum(line.quantity_in_base_unit) || toNum(line.quantity_delivered);
    const costPerUnit = toNum(line.products?.cost_price);
    const lineCost = costPerUnit * toNum(line.quantity_delivered);
    const sortedImages = [...(line.products?.product_images ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order,
    );
    const imageUrl = sortedImages[0]?.public_url ?? null;
    const noteBucket = lineBucketsByNote.get(line.delivery_note_id) ?? new Map<string, DeliveryNoteReportLine>();
    const lineKey = `${line.products?.sku ?? "-"}::${line.sale_unit_label}`;
    const existing = noteBucket.get(lineKey);

    if (existing) {
      existing.quantityDelivered += qty;
      existing.lineTotal += toNum(line.line_total);
      existing.lineCost += lineCost;
      existing.profit = existing.lineTotal - existing.lineCost;
    } else {
      noteBucket.set(lineKey, {
        id: line.id,
        productName: line.products?.name ?? "-",
        productSku: line.products?.sku ?? "-",
        imageUrl,
        saleUnitLabel: line.sale_unit_label,
        quantityDelivered: qty,
        lineTotal: toNum(line.line_total),
        lineCost,
        profit: toNum(line.line_total) - lineCost,
      });
    }

    lineBucketsByNote.set(line.delivery_note_id, noteBucket);
  }

  const customerIdsInNotes = Array.from(new Set(notes.map((note) => note.customer_id)));
  const billingByCustomer = new Map<string, Array<{ billing_number: string; from_date: string; to_date: string }>>();

  if (customerIdsInNotes.length > 0) {
        const { data: billingData } = await supabase
      .from("billing_records")
      .select("customer_id, billing_number, from_date, to_date")
      .eq("organization_id", organizationId)
      .in("customer_id", customerIdsInNotes)
      .lte("from_date", toDate)
      .gte("to_date", fromDate);

    for (const row of (billingData ?? []) as Array<{
      customer_id: string;
      billing_number: string;
      from_date: string;
      to_date: string;
    }>) {
      const bucket = billingByCustomer.get(row.customer_id) ?? [];
      bucket.push({
        billing_number: row.billing_number,
        from_date: row.from_date,
        to_date: row.to_date,
      });
      billingByCustomer.set(row.customer_id, bucket);
    }
  }

  let allRows = notes.map((note) => {
    const noteLines = Array.from((lineBucketsByNote.get(note.id) ?? new Map()).values()).sort((a, b) =>
      a.productName.localeCompare(b.productName, "th"),
    );
    const totalQty = noteLines.reduce((sum, line) => sum + line.quantityDelivered, 0);
    const totalCost = noteLines.reduce((sum, line) => sum + line.lineCost, 0);
    const totalRevenue = toNum(note.total_amount) || noteLines.reduce((sum, line) => sum + line.lineTotal, 0);
    const netProfit = totalRevenue - totalCost;
    const matchedBilling = (billingByCustomer.get(note.customer_id) ?? []).find(
      (record) => note.delivery_date >= record.from_date && note.delivery_date <= record.to_date,
    );

    return {
      id: note.id,
      deliveryNumber: note.delivery_number,
      deliveryDate: note.delivery_date,
      customerId: note.customer_id,
      customerName: note.customers.name,
      customerCode: note.customers.customer_code,
      itemCount: noteLines.length,
      totalQty,
      totalRevenue,
      totalCost,
      netProfit,
      marginPercent: totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0,
      billingNumber: matchedBilling?.billing_number ?? null,
      lines: noteLines,
    } satisfies DeliveryNoteReportRow;
  });

  if (billedOnly) {
    allRows = allRows.filter((row) => row.billingNumber !== null);
  }

  const summary = allRows.reduce(
    (acc, row) => {
      acc.noteCount += 1;
      acc.totalQty += row.totalQty;
      acc.totalRevenue += row.totalRevenue;
      acc.totalCost += row.totalCost;
      acc.netProfit += row.netProfit;
      return acc;
    },
    { noteCount: 0, totalQty: 0, totalRevenue: 0, totalCost: 0, netProfit: 0 } as DeliveryNoteReportSummary,
  );

  const total = allRows.length;
  const rows = allRows.slice((page - 1) * pageSize, page * pageSize);

  return { rows, summary, total };
}
