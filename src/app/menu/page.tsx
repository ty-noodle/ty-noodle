import { cache, Suspense } from "react";
import MenuClient from "./menu-client";
import { PageLoader } from "@/components/page-loader";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import type { Database } from "@/types/database";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type ProductImageRow = Database["public"]["Tables"]["product_images"]["Row"];
type ProductSaleUnitRow = Database["public"]["Tables"]["product_sale_units"]["Row"];
type ProductCategoryRow = {
  id: string;
  name: string;
};
type ProductCategoryItemRow = {
  product_category_id: string;
  product_id: string;
};

type ProductWithRelations = ProductRow & {
  product_images?: ProductImageRow[];
  product_sale_units?: ProductSaleUnitRow[];
};

type CatalogProduct = ProductWithRelations & {
  categoryIds: string[];
  categoryNames: string[];
  id: string;
  min_order_qty: number;
  product_id: string;
  product_images: ProductImageRow[];
  product_sale_unit_id: string;
  sale_unit_label: string;
  sale_unit_ratio: number;
  step_order_qty: number | null;
};

const PRODUCT_SELECT = `
  id,
  organization_id,
  name,
  sku,
  unit,
  metadata,
  created_at,
  updated_at,
  product_images (
    public_url,
    sort_order
  ),
  product_sale_units (
    id,
    organization_id,
    product_id,
    unit_label,
    base_unit_quantity,
    is_active,
    is_default,
    min_order_qty,
    step_order_qty,
    sort_order,
    cost_mode,
    fixed_cost_price,
    created_at,
    updated_at
  )
`;

const getCatalogData = cache(async () => {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: products, error } = await supabaseAdmin
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    // During Next.js prerendering with PPR, fetch() may be aborted when a dynamic boundary is reached.
    // We suppress these expected errors to keep the build output clean.
    const isPrerenderAbort =
      error.message?.includes("prerender") ||
      (typeof error.details === "string" && error.details.includes("prerender"));

    if (!isPrerenderAbort) {
      console.error("Failed to load catalog for menu:", error);
    }
  }

  const rawProducts = (products ?? []) as ProductWithRelations[];
  const organizationId = rawProducts[0]?.organization_id ?? "";
  const [categoriesResult, categoryItemsResult, orgResult] = organizationId
    ? await Promise.all([
        supabaseAdmin.from("product_categories")
          .select("id, name")
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        supabaseAdmin.from("product_category_items")
          .select("product_category_id, product_id")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: true }),
        supabaseAdmin.from("organizations")
          .select("metadata")
          .eq("id", organizationId)
          .maybeSingle(),
      ])
    : [
        { data: [] as ProductCategoryRow[] },
        { data: [] as ProductCategoryItemRow[] },
        { data: null },
      ];

  const categoryNameById = new Map<string, string>(
    (((categoriesResult.data ?? []) as ProductCategoryRow[]) ?? []).map((category) => [
      category.id,
      category.name,
    ]),
  );
  
  const categoryIdsByProductId = new Map<string, string[]>();
  const categoryNamesByProductId = new Map<string, string[]>();

  for (const item of ((categoryItemsResult.data ?? []) as ProductCategoryItemRow[]) ?? []) {
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

  const catalogProducts: CatalogProduct[] = rawProducts.map((product) => {
    const activeSaleUnits =
      (product.product_sale_units?.filter((saleUnit) => saleUnit.is_active) ?? []).map((saleUnit) => ({
        ...saleUnit,
        unit_label: product.unit,
      }));
    const saleUnits =
      activeSaleUnits.length > 0
        ? activeSaleUnits.toSorted((left, right) => {
            if (left.sort_order !== right.sort_order) {
              return left.sort_order - right.sort_order;
            }

            if (left.is_default !== right.is_default) {
              return left.is_default ? -1 : 1;
            }

            return left.unit_label.localeCompare(right.unit_label, "th");
          })
        : [
            {
              base_unit_quantity: 1,
              cost_mode: "derived",
              created_at: product.created_at,
              fixed_cost_price: null,
              id: `${product.id}-default`,
              is_active: true,
              is_default: true,
              min_order_qty: 1,
              organization_id: product.organization_id,
              product_id: product.id,
              sort_order: 0,
              step_order_qty: null,
              unit_label: product.unit,
              updated_at: product.updated_at,
            } satisfies ProductSaleUnitRow,
          ];

    const defaultSaleUnit = saleUnits.find((u) => u.is_default) ?? saleUnits[0];

    return {
      ...product,
      categoryIds: categoryIdsByProductId.get(product.id) ?? [],
      categoryNames: categoryNamesByProductId.get(product.id) ?? [],
      id: product.id,
      product_id: product.id,
      product_images: [...(product.product_images ?? [])].sort(
        (left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0),
      ),
      product_sale_unit_id: defaultSaleUnit.id,
      sale_unit_label: defaultSaleUnit.unit_label,
      sale_unit_ratio: Number(defaultSaleUnit.base_unit_quantity),
      min_order_qty: Number(defaultSaleUnit.min_order_qty ?? 1),
      step_order_qty:
        defaultSaleUnit.step_order_qty !== null && defaultSaleUnit.step_order_qty !== undefined
          ? Number(defaultSaleUnit.step_order_qty)
          : null,
      product_sale_units: saleUnits,
    };
  });

  const orgMeta = (orgResult?.data?.metadata ?? {}) as Record<string, string>;
  const orgPhone = orgMeta.phone ?? "081-903-4686";

  return {
    catalogProducts,
    organizationId,
    orgPhone,
    categories: (categoriesResult.data ?? []) as ProductCategoryRow[],
  };
});

export default async function MenuPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <MenuContent />
    </Suspense>
  );
}

async function MenuContent() {
  const { catalogProducts, orgPhone, categories } = await getCatalogData();

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <MenuClient
        initialProducts={catalogProducts}
        orgPhone={orgPhone}
        categories={categories}
      />
    </main>
  );
}
