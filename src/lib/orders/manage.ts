import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sortProductsByCategory } from "@/lib/products/sort-by-category";

// Row types

type CustomerRow = { id: string; customer_code: string; name: string };
type ProductRow = {
  id: string;
  name: string;
  sku: string;
  stock_quantity: number | string;
  unit: string;
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
  id: string;
  is_default: boolean;
  product_id: string;
  unit_label: string;
};

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
};

// Exported types

export type OrderCustomerOption = { code: string; id: string; name: string };

export type OrderProductOption = {
  categoryIds: string[];
  categoryNames: string[];
  id: string;
  imageUrl: string | null;
  name: string;
  saleUnits: { baseUnitQuantity: number; id: string; isDefault: boolean; label: string }[];
  sku: string;
  stockQuantity: number;
  unit: string;
};

// Queries

export async function getCustomersForOrder(orgId: string): Promise<OrderCustomerOption[]> {
  const admin = getSupabaseAdmin() as unknown as ManageAdmin;
  const { data } = await admin
    .from("customers")
    .select("id, customer_code, name")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  return (data ?? []).map((c) => ({ code: c.customer_code, id: c.id, name: c.name }));
}

export async function getProductsForOrder(orgId: string): Promise<OrderProductOption[]> {
  const admin = getSupabaseAdmin();

  const [productsRes, saleUnitsRes, productImagesRes, categoriesRes, categoryItemsRes] =
    await Promise.all([
    admin
      .from("products")
      .select("id, name, sku, unit, stock_quantity")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    admin
      .from("product_sale_units")
      .select("id, product_id, unit_label, base_unit_quantity, is_default")
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

  const byProduct = new Map<string, OrderProductOption["saleUnits"]>();
  for (const u of saleUnitsRes.data ?? []) {
    const list = byProduct.get(u.product_id) ?? [];
    list.push({
      baseUnitQuantity: Number(u.base_unit_quantity),
      id: u.id,
      isDefault: u.is_default,
      label: u.unit_label,
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
  const categorySortOrderById = new Map<string, number>(
    (((categoriesRes.data ?? []) as ProductCategoryRow[]) ?? []).map((category) => [
      category.id,
      Number(category.sort_order),
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

  const mapped = (productsRes.data ?? []).map((p) => ({
    categoryIds: categoryIdsByProductId.get(p.id) ?? [],
    categoryNames: categoryNamesByProductId.get(p.id) ?? [],
    id: p.id,
    imageUrl: firstImageByProductId.get(p.id) ?? null,
    name: p.name,
    saleUnits: byProduct.get(p.id) ?? [],
    sku: p.sku,
    stockQuantity: Number(p.stock_quantity),
    unit: p.unit,
  }));

  return sortProductsByCategory(
    mapped,
    Array.from(categorySortOrderById.entries()).map(([id, sortOrder]) => ({ id, sortOrder })),
  );
}
