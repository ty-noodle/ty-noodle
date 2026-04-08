import type { Metadata } from "next";
import { cache } from "react";
import OrderClient from "./order-client";
import { getSiteUrl } from "@/lib/site-url";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrderCustomerSession } from "@/lib/auth/order-session";

// Cache product catalog for 60 seconds — product data changes infrequently
// Dramatically reduces TTFB and LCP for repeat requests
export const revalidate = 60;
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

type SearchParams = Record<string, string | string[] | undefined>;

type InitialOrderCustomer = {
  customerCode: string | null;
  id: string;
  name: string;
};

type InitialOrderAuth = {
  customer: InitialOrderCustomer | null;
  lineUserId: string | null;
};

const siteUrl = getSiteUrl();

const getCatalogData = cache(async () => {
  const supabaseAdmin = getSupabaseAdmin();
  const getOrgPhone = async (orgId: string): Promise<string> => {
    if (!orgId) return "";
    const { data } = await supabaseAdmin
      .from("organizations")
      .select("metadata")
      .eq("id", orgId)
      .maybeSingle();
    const meta = (data?.metadata ?? {}) as Record<string, string>;
    return meta.phone ?? "";
  };

  const { data: products, error } = await supabaseAdmin
    .from("products")
    .select("*, product_images(*), product_sale_units(*)")
    .eq("is_active", true)
    .order("name");

  if (error) {
    console.error("Failed to load catalog:", error);
  }

  const rawProducts = (products ?? []) as ProductWithRelations[];
  const organizationId = rawProducts[0]?.organization_id ?? "";
  const [categoriesResult, categoryItemsResult] = organizationId
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
      ])
    : [{ data: [] as ProductCategoryRow[] }, { data: [] as ProductCategoryItemRow[] }];
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

  const catalogProducts: CatalogProduct[] = rawProducts.flatMap((product) => {
    const activeSaleUnits =
      product.product_sale_units?.filter((saleUnit) => saleUnit.is_active) ?? [];
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

    return saleUnits.map((saleUnit) => ({
      ...product,
      categoryIds: categoryIdsByProductId.get(product.id) ?? [],
      categoryNames: categoryNamesByProductId.get(product.id) ?? [],
      id: `${product.id}:${saleUnit.id}`,
      min_order_qty: Number(saleUnit.min_order_qty ?? 1),
      product_id: product.id,
      product_images: product.product_images ?? [],
      product_sale_unit_id: saleUnit.id,
      sale_unit_label: saleUnit.unit_label,
      sale_unit_ratio: Number(saleUnit.base_unit_quantity),
      step_order_qty:
        saleUnit.step_order_qty !== null && saleUnit.step_order_qty !== undefined
          ? Number(saleUnit.step_order_qty)
          : null,
    }));
  });

  const orgPhone = await getOrgPhone(organizationId);

  return {
    catalogProducts,
    organizationId,
    orgPhone,
  };
});

function getSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function getInitialOrderAuth(
  organizationId: string,
): Promise<InitialOrderAuth> {
  const session = await getOrderCustomerSession();

  if (!session?.lineUserId) {
    return { customer: null, lineUserId: null };
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data } = await supabaseAdmin
    .from("customers")
    .select("id, name, customer_code, organization_id")
    .eq("line_user_id", session.lineUserId)
    .eq("is_active", true)
    .maybeSingle();

  if (!data) {
    return {
      customer: null,
      lineUserId: session.lineUserId,
    };
  }

  if (organizationId && data.organization_id !== organizationId) {
    return { customer: null, lineUserId: null };
  }

  return {
    customer: {
      customerCode: data.customer_code,
      id: data.id,
      name: data.name,
    },
    lineUserId: session.lineUserId,
  };
}

function getProductShareMetadata(productId: string | undefined, products: CatalogProduct[]) {
  const selectedProduct = productId
    ? products.find((product) => product.id === productId)
    : undefined;

  if (!selectedProduct) {
    return {
      title: "สั่งสินค้า",
      description: "ระบบสั่งสินค้าสำหรับลูกค้า T&Y Noodle",
      url: `${siteUrl}/order`,
      image: `${siteUrl}/brand/1200x630.png`,
    };
  }

  const metadata = (selectedProduct.metadata ?? {}) as Record<string, unknown>;
  const rawDescription =
    typeof metadata.description === "string" ? metadata.description.trim() : "";
  const description =
    rawDescription.replace(/\s*\n+\s*/g, " ").trim() ||
    `สั่งซื้อ ${selectedProduct.name} หน่วย ${selectedProduct.sale_unit_label} กับ T&Y Noodle`;

  return {
    title: `${selectedProduct.name} | สั่งสินค้า`,
    description,
    url: `${siteUrl}/order?product=${encodeURIComponent(selectedProduct.id)}`,
    image:
      selectedProduct.product_images[0]?.public_url ||
      `${siteUrl}/brand/1200x630.png`,
  };
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}): Promise<Metadata> {
  const resolvedSearchParams = (await searchParams) ?? {};
  const productId = getSearchParamValue(resolvedSearchParams.product);
  const { catalogProducts } = await getCatalogData();
  const shareMeta = getProductShareMetadata(productId, catalogProducts);

  return {
    title: shareMeta.title,
    description: shareMeta.description,
    alternates: {
      canonical: shareMeta.url,
    },
    openGraph: {
      type: "website",
      locale: "th_TH",
      siteName: "T&Y Noodle",
      title: shareMeta.title,
      description: shareMeta.description,
      url: shareMeta.url,
      images: [
        {
          url: shareMeta.image,
          alt: shareMeta.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: shareMeta.title,
      description: shareMeta.description,
      images: [shareMeta.image],
    },
  };
}

export default async function OrderPage() {
  const { catalogProducts, organizationId, orgPhone } = await getCatalogData();
  const initialAuth = await getInitialOrderAuth(organizationId);

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <OrderClient
        initialProducts={catalogProducts}
        initialSessionCustomer={initialAuth.customer}
        initialSessionLineUserId={initialAuth.lineUserId}
        organizationId={organizationId}
        orgPhone={orgPhone}
      />
    </main>
  );
}
