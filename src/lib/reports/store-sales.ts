import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { compareCustomerOrder } from "@/lib/settings/customer-order";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StoreSalesRow = {
  customerId: string;
  customerCode: string;
  customerName: string;
  sortOrder: number;
  totalRevenue: number;
  totalCost: number;
  totalQty: number;
  totalOrders: number;
};

export type StoreSalesSummary = {
  totalRevenue: number;
  totalCost: number;
  totalOrders: number;
  totalStores: number;
};

export type StoreProductRow = {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  imageUrl: string | null;
  totalQty: number;
  totalRevenue: number;
  totalCost: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// ─── Store ranking ────────────────────────────────────────────────────────────

export async function getStoreSalesRanking(params: {
  organizationId: string;
  fromDate: string;
  toDate: string;
  customerIds?: string[];
  page?: number;
  pageSize?: number;
}): Promise<{ rows: StoreSalesRow[]; allRows: StoreSalesRow[]; summary: StoreSalesSummary; total: number }> {
  const { organizationId, fromDate, toDate, customerIds = [], page = 1, pageSize = 25 } = params;
  const supabase = getSupabaseAdmin();

    let query = supabase
    .from("delivery_notes")
    .select(`
      id,
      customer_id,
      customers!inner(id, customer_code, name, sort_order),
      delivery_note_items(
        quantity_delivered,
        quantity_in_base_unit,
        line_total,
        cost_price
      )
    `)
    .eq("organization_id", organizationId)
    .eq("status", "confirmed")
    .gte("delivery_date", fromDate)
    .lte("delivery_date", toDate);

  if (customerIds.length > 0) {
    query = query.in("customer_id", customerIds);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  type RawNote = {
    id: string;
    customer_id: string;
    customers: { id: string; customer_code: string; name: string; sort_order: number | string };
    delivery_note_items: Array<{
      quantity_delivered: unknown;
      quantity_in_base_unit: unknown;
      line_total: unknown;
      cost_price: unknown;
    }>;
  };

  const rawNotes = (data ?? []) as unknown as RawNote[];

  const storeMap = new Map<
    string,
    {
      customerCode: string;
      customerName: string;
      sortOrder: number;
      totalRevenue: number;
      totalCost: number;
      totalQty: number;
      orderIds: Set<string>;
    }
  >();

  for (const note of rawNotes) {
    const c = note.customers;
    if (!c) continue;

    const existing = storeMap.get(c.id) ?? {
      customerCode: c.customer_code,
      customerName: c.name,
      sortOrder: Number(c.sort_order),
      totalRevenue: 0,
      totalCost: 0,
      totalQty: 0,
      orderIds: new Set<string>(),
    };

    existing.orderIds.add(note.id);

    for (const item of note.delivery_note_items ?? []) {
      const qty = toNum(item.quantity_in_base_unit) || toNum(item.quantity_delivered);
      const costPerUnit = toNum(item.cost_price);
      existing.totalRevenue += toNum(item.line_total);
      existing.totalCost += costPerUnit * toNum(item.quantity_delivered);
      existing.totalQty += qty;
    }

    storeMap.set(c.id, existing);
  }

  const allRows: StoreSalesRow[] = [...storeMap.entries()]
    .map(([customerId, v]) => ({
      customerId,
      customerCode: v.customerCode,
      customerName: v.customerName,
      sortOrder: v.sortOrder,
      totalRevenue: v.totalRevenue,
      totalCost: v.totalCost,
      totalQty: v.totalQty,
      totalOrders: v.orderIds.size,
    }))
    .sort(compareCustomerOrder);

  const summary: StoreSalesSummary = {
    totalRevenue: allRows.reduce((s, r) => s + r.totalRevenue, 0),
    totalCost: allRows.reduce((s, r) => s + r.totalCost, 0),
    totalOrders: allRows.reduce((s, r) => s + r.totalOrders, 0),
    totalStores: allRows.length,
  };

  const total = allRows.length;
  const rows = allRows.slice((page - 1) * pageSize, page * pageSize);
  return { rows, allRows, summary, total };
}

// ─── Products sold to a single store ─────────────────────────────────────────

export async function getStoreProductSales(params: {
  organizationId: string;
  customerId: string;
  fromDate: string;
  toDate: string;
}): Promise<StoreProductRow[]> {
  const { organizationId, customerId, fromDate, toDate } = params;
  const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
    .from("delivery_notes")
    .select(`
      delivery_note_items(
        quantity_delivered,
        quantity_in_base_unit,
        line_total,
        sale_unit_label,
        cost_price,
        products!inner(id, name, sku, unit, product_images(public_url, sort_order))
      )
    `)
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .eq("status", "confirmed")
    .gte("delivery_date", fromDate)
    .lte("delivery_date", toDate);

  if (error) throw new Error(error.message);

  type RawNote = {
    delivery_note_items: Array<{
      quantity_delivered: unknown;
      quantity_in_base_unit: unknown;
      line_total: unknown;
      sale_unit_label: string;
      cost_price: unknown;
      products: {
        id: string;
        name: string;
        sku: string;
        unit: string;
        product_images: Array<{ public_url: string; sort_order: number }>;
      } | null;
    }>;
  };

  const rawNotes = (data ?? []) as RawNote[];
  const productMap = new Map<
    string,
    {
      sku: string;
      name: string;
      unit: string;
      imageUrl: string | null;
      totalQty: number;
      totalRevenue: number;
      totalCost: number;
    }
  >();

  for (const note of rawNotes) {
    for (const item of note.delivery_note_items ?? []) {
      const product = item.products;
      if (!product) continue;

      const sortedImages = [...(product.product_images ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order,
      );
      const imageUrl = sortedImages[0]?.public_url ?? null;
      const qty = toNum(item.quantity_in_base_unit) || toNum(item.quantity_delivered);
      const cost = toNum(item.cost_price) * toNum(item.quantity_delivered);
      const revenue = toNum(item.line_total);

      const existing = productMap.get(product.id);
      if (!existing) {
        productMap.set(product.id, {
          sku: product.sku,
          name: product.name,
          unit: product.unit,
          imageUrl,
          totalQty: qty,
          totalRevenue: revenue,
          totalCost: cost,
        });
      } else {
        productMap.set(product.id, {
          ...existing,
          totalQty: existing.totalQty + qty,
          totalRevenue: existing.totalRevenue + revenue,
          totalCost: existing.totalCost + cost,
        });
      }
    }
  }

  return [...productMap.entries()]
    .map(([productId, v]) => ({ productId, ...v }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);
}
