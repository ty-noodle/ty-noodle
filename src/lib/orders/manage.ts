import "server-only";
import { cacheLife, cacheTag } from "next/cache";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { compareCustomerOrder } from "@/lib/settings/customer-order";

// Row types

type CustomerRow = { id: string; customer_code: string; name: string; sort_order: number | string };
type ProductRow = {
  cost_price: number | string;
  id: string;
  name: string;
  sku: string;
  stock_quantity: number | string;
  unit: string;
  display_order?: number;
};
type ProductImageRow = {
  product_id: string;
  public_url: string;
  sort_order: number;
};
type ProductCategoryRow = { id: string; name: string; sort_order: number };
type ProductCategoryItemRow = { product_category_id: string; product_id: string };
type SaleUnitRow = {
  base_unit_quantity: number | string;
  cost_mode: string | null;
  fixed_cost_price: number | string | null;
  id: string;
  is_default: boolean;
  min_order_qty: number | string;
  product_id: string;
  step_order_qty: number | string | null;
  unit_label: string;
};
type VehicleRow = { id: string; name: string };

// Typed admin client

type SelectChain<T> = {
  eq: (col: string, val: string | boolean) => SelectChain<T>;
  order: (
    col: string,
    opts: { ascending: boolean },
  ) => Promise<{ data: T[] | null; error: { message?: string } | null }>;
};

type ManageAdmin = ReturnType<typeof getSupabaseAdmin> & {
  from(table: "customers"): { select: (cols: string) => SelectChain<CustomerRow> };
  from(table: "products"): { select: (cols: string) => SelectChain<ProductRow> };
  from(table: "product_sale_units"): { select: (cols: string) => SelectChain<SaleUnitRow> };
  from(table: "vehicles"): { select: (cols: string) => SelectChain<VehicleRow> };
};

const codeCollator = new Intl.Collator("th", {
  numeric: true,
  sensitivity: "base",
});

function getCodeSequence(code: string) {
  const match = code.trim().match(/(\d+)/);
  return match ? Number.parseInt(match[1], 10) : Number.POSITIVE_INFINITY;
}

function compareProductSku(left: OrderProductOption, right: OrderProductOption) {
  const leftSequence = getCodeSequence(left.sku);
  const rightSequence = getCodeSequence(right.sku);

  if (leftSequence !== rightSequence) {
    return leftSequence - rightSequence;
  }

  const skuComparison = codeCollator.compare(left.sku.trim(), right.sku.trim());

  if (skuComparison !== 0) {
    return skuComparison;
  }

  return left.name.localeCompare(right.name, "th");
}

// Exported types

export type OrderCustomerOption = { code: string; id: string; name: string; sortOrder: number };

export type OrderVehicleOption = { id: string; name: string };

export type OrderProductOption = {
  baseCostPrice: number;
  categoryIds: string[];
  categoryNames: string[];
  id: string;
  imageUrl: string | null;
  name: string;
  saleUnits: {
    baseUnitQuantity: number;
    costMode: string | null;
    fixedCostPrice: number | null;
    id: string;
    isDefault: boolean;
    label: string;
    minOrderQty: number;
    stepOrderQty: number | null;
  }[];
  sku: string;
  stockQuantity: number;
  unit: string;
  display_order?: number;
};

// Queries

export async function getCustomersForOrder(orgId: string): Promise<OrderCustomerOption[]> {
  "use cache";
  cacheTag(`orders-${orgId}`);
  cacheTag(`settings-${orgId}`);
  cacheLife("max");
  const admin = getSupabaseAdmin() as unknown as ManageAdmin;
  const { data } = await admin
    .from("customers")
    .select("id, customer_code, name, sort_order")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  return (data ?? [])
    .map((c: CustomerRow) => ({ code: c.customer_code, id: c.id, name: c.name, sortOrder: Number(c.sort_order) }))
    .toSorted(compareCustomerOrder);
}

export async function getVehiclesForOrder(orgId: string): Promise<OrderVehicleOption[]> {
  "use cache";
  cacheTag(`orders-${orgId}`);
  cacheTag(`settings-${orgId}`);
  cacheLife("max");
  const admin = getSupabaseAdmin() as unknown as ManageAdmin;
  const { data } = await admin
    .from("vehicles")
    .select("id, name")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  return (data ?? []).map((vehicle) => ({
    id: vehicle.id,
    name: vehicle.name,
  }));
}

export async function getProductsForOrder(orgId: string): Promise<OrderProductOption[]> {
  "use cache";
  cacheTag(`orders-${orgId}`);
  cacheTag(`settings-${orgId}`);
  cacheTag(`stock-${orgId}`);
  cacheLife("max");
  const admin = getSupabaseAdmin();

  const [productsRes, saleUnitsRes, productImagesRes, categoriesRes, categoryItemsRes] =
    await Promise.all([
      admin
        .from("products")
        .select("id, name, sku, unit, stock_quantity, cost_price, display_order")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true }),
      admin
        .from("product_sale_units")
        .select(
          "id, product_id, unit_label, base_unit_quantity, is_active, is_default, sort_order, cost_mode, fixed_cost_price, min_order_qty, step_order_qty",
        )
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      admin
        .from("product_images")
        .select("product_id, public_url, sort_order")
        .eq("organization_id", orgId)
        .order("sort_order", { ascending: true }),
      admin
        .from("product_categories")
        .select("id, name, sort_order")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      admin
        .from("product_category_items")
        .select("product_category_id, product_id")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: true }),
    ]);

  if (productsRes.error) {
    console.error("[getProductsForOrder] Database Error:", productsRes.error);
    return [];
  }

  const productUnitMap = new Map((productsRes.data ?? []).map(p => [p.id, p.unit]));
  const byProduct = new Map<string, OrderProductOption["saleUnits"]>();
  for (const u of saleUnitsRes.data ?? []) {
    const list = byProduct.get(u.product_id) ?? [];
    list.push({
      baseUnitQuantity: Number(u.base_unit_quantity),
      costMode: u.cost_mode ?? null,
      fixedCostPrice:
        u.fixed_cost_price === null || u.fixed_cost_price === undefined
          ? null
          : Number(u.fixed_cost_price),
      id: u.id,
      isDefault: u.is_default,
      label: productUnitMap.get(u.product_id) ?? u.unit_label,
      minOrderQty: Number(u.min_order_qty ?? 1),
      stepOrderQty:
        u.step_order_qty === null || u.step_order_qty === undefined
          ? null
          : Number(u.step_order_qty),
    });
    byProduct.set(u.product_id, list);
  }

  const firstImageByProductId = new Map<string, string>();
  for (const image of ((productImagesRes.data ?? []) as ProductImageRow[]) ?? []) {
    if (!firstImageByProductId.has(image.product_id)) {
      firstImageByProductId.set(image.product_id, image.public_url);
    }
  }

  const categoryNameById = new Map<string, string>(
    (((categoriesRes.data ?? []) as ProductCategoryRow[]) ?? []).map((category) => [
      category.id,
      category.name,
    ]),
  );
  const categoryIdsByProductId = new Map<string, string[]>();
  const categoryNamesByProductId = new Map<string, string[]>();

  for (const item of ((categoryItemsRes.data ?? []) as ProductCategoryItemRow[]) ?? []) {
    const currentIds = categoryIdsByProductId.get(item.product_id) ?? [];
    currentIds.push(item.product_category_id);
    categoryIdsByProductId.set(item.product_id, currentIds);

    const categoryName = categoryNameById.get(item.product_category_id);
    if (!categoryName) {
      continue;
    }

    const currentNames = categoryNamesByProductId.get(item.product_id) ?? [];
    currentNames.push(categoryName);
    categoryNamesByProductId.set(item.product_id, currentNames);
  }

  const mapped = (productsRes.data ?? []).map((p) => {
    const baseCostPrice = Number(p.cost_price ?? 0);
    return {
      baseCostPrice,
      categoryIds: categoryIdsByProductId.get(p.id) ?? [],
      categoryNames: categoryNamesByProductId.get(p.id) ?? [],
      id: p.id,
      imageUrl: firstImageByProductId.get(p.id) ?? null,
      name: p.name,
      saleUnits: byProduct.get(p.id) ?? [],
      sku: p.sku,
      stockQuantity: Number(p.stock_quantity),
      unit: p.unit,
      display_order: p.display_order ?? undefined,
    };
  });

  return mapped.toSorted((left, right) => {
    const orderA = left.display_order ?? 0;
    const orderB = right.display_order ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    return compareProductSku(left, right);
  });
}
