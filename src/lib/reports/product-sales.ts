import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProductSalesRow = {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  imageUrl: string | null;
  totalQty: number;
  costPerUnit: number;
  avgUnitPrice: number;
  totalRevenue: number;
  totalCost: number;
};

export type ProductSalesSummary = {
  totalRevenue: number;
  totalQty: number;
  totalCost: number;
  netProfit: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// ─── Customer list for filter ─────────────────────────────────────────────────

export type CustomerOption = { id: string; name: string };
export type ProductFilterOption = {
  categoryNames: string[];
  id: string;
  name: string;
  sku: string;
  imageUrl: string | null;
};

export async function getCustomersForFilter(
  organizationId: string,
): Promise<CustomerOption[]> {
  const supabase = getSupabaseAdmin();
    const { data } = await supabase
    .from("customers")
    .select("id, name")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  return ((data ?? []) as { id: string; name: string }[]).map((c) => ({
    id: c.id,
    name: c.name,
  }));
}

export async function getProductsForFilter(
  organizationId: string,
): Promise<ProductFilterOption[]> {
  const supabase = getSupabaseAdmin();
  const [productsResult, categoriesResult, categoryItemsResult] = await Promise.all([
        supabase.from("products")
      .select("id, name, sku, product_images(public_url, sort_order)")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name", { ascending: true }),
        supabase.from("product_categories")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
        supabase.from("product_category_items")
      .select("product_category_id, product_id")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true }),
  ]);

  const categoryNameById = new Map<string, string>(
    (((categoriesResult.data ?? []) as Array<{ id: string; name: string }>) ?? []).map(
      (category) => [category.id, category.name],
    ),
  );
  const categoryNamesByProductId = new Map<string, string[]>();

  for (const item of ((categoryItemsResult.data ?? []) as Array<{
    product_category_id: string;
    product_id: string;
  }>) ?? []) {
    const categoryName = categoryNameById.get(item.product_category_id);
    if (!categoryName) {
      continue;
    }

    const current = categoryNamesByProductId.get(item.product_id) ?? [];
    current.push(categoryName);
    categoryNamesByProductId.set(item.product_id, current);
  }

  return ((productsResult.data ?? []) as Array<{
    id: string;
    name: string;
    sku: string;
    product_images: Array<{ public_url: string; sort_order: number }> | null;
  }>).map((product) => {
    const sortedImages = [...(product.product_images ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order,
    );

    return {
      categoryNames: categoryNamesByProductId.get(product.id) ?? [],
      id: product.id,
      name: product.name,
      sku: product.sku,
      imageUrl: sortedImages[0]?.public_url ?? null,
    };
  });
}

// ─── Main ranking query (source: delivered delivery_notes) ────────────────────

export async function getProductSalesRanking(params: {
  organizationId: string;
  fromDate: string;
  toDate: string;
  productSearch?: string;
  productIds?: string[];
  customerIds?: string[];
  page?: number;
  pageSize?: number;
}): Promise<{
  rows: ProductSalesRow[];
  summary: ProductSalesSummary;
  total: number;
}> {
  const {
    organizationId,
    fromDate,
    toDate,
    productSearch = "",
    productIds = [],
    customerIds = [],
    page = 1,
    pageSize = 20,
  } = params;

  const supabase = getSupabaseAdmin();

    let query = supabase
    .from("delivery_notes")
    .select(`
      customer_id,
      delivery_note_items(
        quantity_delivered,
        quantity_in_base_unit,
        unit_price,
        line_total,
        products!inner(id, name, sku, unit, cost_price, product_images(public_url, sort_order))
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

  type RawDeliveryNote = {
    customer_id: string;
    delivery_note_items: Array<{
      quantity_delivered: unknown;
      quantity_in_base_unit: unknown;
      unit_price: unknown;
      line_total: unknown;
      products: {
        id: string;
        name: string;
        sku: string;
        unit: string;
        cost_price: unknown;
        product_images: Array<{ public_url: string; sort_order: number }>;
      };
    }>;
  };

  const rawNotes = (data ?? []) as RawDeliveryNote[];

  // Aggregate by product_id
  const productMap = new Map<
    string,
    {
      sku: string;
      name: string;
      unit: string;
      imageUrl: string | null;
      costPerUnit: number;
      totalQty: number;
      totalRevenue: number;
      totalCost: number;
      unitPriceSum: number;
      unitPriceCount: number;
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
      // delivery_note_items has no cost_price column — derive from product
      const costPerUnit = toNum(product.cost_price);
      const cost = costPerUnit * toNum(item.quantity_delivered);

      const existing = productMap.get(product.id);
      if (!existing) {
        productMap.set(product.id, {
          sku: product.sku,
          name: product.name,
          unit: product.unit,
          costPerUnit,
          imageUrl,
          totalQty: qty,
          totalRevenue: toNum(item.line_total),
          totalCost: cost,
          unitPriceSum: toNum(item.unit_price),
          unitPriceCount: 1,
        });
      } else {
        productMap.set(product.id, {
          ...existing,
          totalQty: existing.totalQty + qty,
          totalRevenue: existing.totalRevenue + toNum(item.line_total),
          totalCost: existing.totalCost + cost,
          unitPriceSum: existing.unitPriceSum + toNum(item.unit_price),
          unitPriceCount: existing.unitPriceCount + 1,
        });
      }
    }
  }

  // Convert to sorted array
  let allRows: ProductSalesRow[] = [...productMap.entries()]
    .map(([productId, v]) => ({
      productId,
      sku: v.sku,
      name: v.name,
      unit: v.unit,
      imageUrl: v.imageUrl,
      costPerUnit: v.costPerUnit,
      totalQty: v.totalQty,
      avgUnitPrice: v.unitPriceCount > 0 ? v.unitPriceSum / v.unitPriceCount : 0,
      totalRevenue: v.totalRevenue,
      totalCost: v.totalCost,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  // Product name / SKU filter
  if (productSearch) {
    const term = productSearch.toLowerCase();
    allRows = allRows.filter(
      (r) => r.name.toLowerCase().includes(term) || r.sku.toLowerCase().includes(term),
    );
  }

  if (productIds.length > 0) {
    const selectedProductIds = new Set(productIds);
    allRows = allRows.filter((row) => selectedProductIds.has(row.productId));
  }

  // Summary from all filtered rows
  const totalRevenue = allRows.reduce((s, r) => s + r.totalRevenue, 0);
  const totalQty = allRows.reduce((s, r) => s + r.totalQty, 0);
  const totalCost = allRows.reduce((s, r) => s + r.totalCost, 0);

  const summary: ProductSalesSummary = {
    totalRevenue,
    totalQty,
    totalCost,
    netProfit: totalRevenue - totalCost,
  };

  const total = allRows.length;
  const rows = allRows.slice((page - 1) * pageSize, page * pageSize);

  return { rows, summary, total };
}
