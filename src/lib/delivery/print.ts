import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type DeliveryNotePrintData = {
  deliveryNumber: string;
  deliveryDate: string;
  orderNumber: string | null;
  totalAmount: number;
  notes: string | null;
  organization: {
    name: string;
    logoUrl: string | null;
    address: string | null;
    phone: string | null;
  };
  customer: {
    name: string;
    code: string;
    address: string;
    vehicleId: string | null;
    vehicleName: string | null;
  };
  items: Array<{
    id: string;
    lineNumber: number;
    productSku: string;
    productName: string;
    quantityDelivered: number;
    saleUnitLabel: string;
    unitPrice: number;
    lineTotal: number;
  }>;
};

/** One merged document per store for all DNs on a given date. */
export async function getAllDeliveryNotesPrintDataForDate(
  organizationId: string,
  date: string,
): Promise<DeliveryNotePrintData[]> {
  const supabase = getSupabaseAdmin();

  // Fetch all confirmed DN ids for the date, ordered by customer then created_at
  const { data: dns } = await supabase
    .from("delivery_notes")
    .select("id, customer_id")
    .eq("organization_id", organizationId)
    .eq("delivery_date", date)
    .eq("status", "confirmed")
    .order("customer_id", { ascending: true })
    .order("created_at", { ascending: true });

  if (!dns || (dns as { id: string; customer_id: string }[]).length === 0) return [];

  // Group DN ids by customer
  const byCustomer = new Map<string, string[]>();
  for (const dn of dns as { id: string; customer_id: string }[]) {
    const arr = byCustomer.get(dn.customer_id) ?? [];
    arr.push(dn.id);
    byCustomer.set(dn.customer_id, arr);
  }

  const results = await Promise.all(
    Array.from(byCustomer.values()).map((ids) =>
      getMergedDeliveryPrintData(organizationId, ids),
    ),
  );

  return results.filter((r): r is DeliveryNotePrintData => r !== null);
}

/** Merge all delivery notes (by ids) into a single printable document. */
export async function getMergedDeliveryPrintData(
  organizationId: string,
  deliveryNoteIds: string[],
): Promise<DeliveryNotePrintData | null> {
  if (deliveryNoteIds.length === 0) return null;

  // Fetch all DNs in parallel
  const parts = await Promise.all(
    deliveryNoteIds.map((id) => getDeliveryNotePrintData(organizationId, id)),
  );
  const valid = parts.filter((p): p is DeliveryNotePrintData => p !== null);
  if (valid.length === 0) return null;

  // Merge: first DN metadata, sum amounts, concatenate items & notes
  const base = valid[0];

  // Merge items with same product SKU + sale unit — sum qty and line total
  const itemMap = new Map<string, DeliveryNotePrintData["items"][0]>();
  for (const item of valid.flatMap((p) => p.items)) {
    const normalizedSku = item.productSku.trim().toLowerCase();
    const normalizedUnit = item.saleUnitLabel.trim().toLowerCase();
    const normalizedName = item.productName.trim().toLowerCase();
    const key = `${normalizedSku || normalizedName}||${normalizedUnit}`;
    const existing = itemMap.get(key);
    if (existing) {
      existing.quantityDelivered += item.quantityDelivered;
      existing.lineTotal += item.lineTotal;
      existing.unitPrice =
        existing.quantityDelivered > 0 ? existing.lineTotal / existing.quantityDelivered : existing.unitPrice;
    } else {
      itemMap.set(key, { ...item });
    }
  }
  const mergedItems = Array.from(itemMap.values());
  // Re-number lines sequentially
  mergedItems.forEach((item, i) => { item.lineNumber = i + 1; });

  const mergedNotes = valid
    .map((p) => p.notes)
    .filter(Boolean)
    .join(" / ") || null;

  const totalAmount = valid.reduce((s, p) => s + p.totalAmount, 0);

  // Delivery number: first one (or "DN-001 + 1 more")
  const deliveryNumber =
    valid.length > 1
      ? `${base.deliveryNumber} +${valid.length - 1}`
      : base.deliveryNumber;

  return {
    ...base,
    deliveryNumber,
    totalAmount,
    notes: mergedNotes,
    items: mergedItems,
  };
}

export async function getDeliveryNotePrintData(
  organizationId: string,
  deliveryNoteId: string,
): Promise<DeliveryNotePrintData | null> {
  const supabase = getSupabaseAdmin();
  const headerSelect = `
      id, delivery_number, delivery_date, total_amount, notes,
      customers!inner(name, customer_code, address, default_vehicle_id, vehicles(id, name)),
      organizations!inner(name, metadata),
      orders(order_number)
    `;

  const fetchHeaderBy = async (field: "id" | "delivery_number") =>
    supabase.from("delivery_notes")
      .select(headerSelect)
      .eq(field, deliveryNoteId)
      .eq("organization_id", organizationId)
      .maybeSingle();

  // 1. DN header + customer + org
  const { data: dnById, error: dnByIdError } = await fetchHeaderBy("id");
  let dn = dnById;
  let dnError = dnByIdError;

  if (!dn) {
    const { data: dnByNumber, error: dnByNumberError } = await fetchHeaderBy("delivery_number");
    dn = dnByNumber;
    dnError = dnByNumberError;
  }

  if (dnError || !dn) return null;

  // 2. DN items with product details
  const { data: items, error: itemsError } = await supabase
    .from("delivery_note_items")
    .select(`
      id, quantity_delivered, sale_unit_label, unit_price, line_total,
      products!inner(name, sku)
    `)
    .eq("delivery_note_id", dn.id)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (itemsError || !items) return null;

  type RawItem = {
    id: string;
    quantity_delivered: number | string;
    sale_unit_label: string;
    unit_price: number | string;
    line_total: number | string;
    products: { name: string; sku: string };
  };

  const toNum = (v: number | string | null | undefined) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  };

  const meta =
    typeof dn.organizations?.metadata === "object" && dn.organizations.metadata !== null
      ? (dn.organizations.metadata as Record<string, unknown>)
      : {} as Record<string, unknown>;

  const logoUrl = (meta.logo_url as string) ?? null;
  const orgAddress = (meta.address as string) ?? null;
  const orgPhone = (meta.phone as string) ?? null;

  return {
    deliveryNumber: dn.delivery_number,
    deliveryDate: dn.delivery_date,
    orderNumber: dn.orders?.order_number ?? null,
    totalAmount: toNum(dn.total_amount),
    notes: dn.notes ?? null,
    organization: {
      name: dn.organizations.name,
      logoUrl,
      address: orgAddress,
      phone: orgPhone,
    },
    customer: {
      name: dn.customers.name,
      code: dn.customers.customer_code,
      address: dn.customers.address,
      vehicleId: (dn.customers.default_vehicle_id as string | null) ?? null,
      vehicleName: (dn.customers.vehicles as { id: string; name: string } | null)?.name ?? null,
    },
    items: (items as RawItem[]).map((item, idx) => ({
      id: item.id,
      lineNumber: idx + 1,
      productSku: item.products.sku,
      productName: item.products.name,
      quantityDelivered: toNum(item.quantity_delivered),
      saleUnitLabel: item.sale_unit_label,
      unitPrice: toNum(item.unit_price),
      lineTotal: toNum(item.line_total),
    })),
  };
}
