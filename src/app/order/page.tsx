import type { Metadata } from "next";
import { cache, Suspense } from "react";
import OrderClient from "./order-client";
import { PageLoader } from "@/components/page-loader";
import { parseOrderWindowSettings } from "@/lib/order-window";
import { maskLineUserId } from "@/lib/order-debug";
import { getLinkedCustomerByLineUserId } from "@/lib/orders/line-pending";
import { getSiteUrl } from "@/lib/site-url";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrderCustomerSession } from "@/lib/auth/order-session";

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
type ProductShareCandidate = {
  id: string;
  metadata: Database["public"]["Tables"]["products"]["Row"]["metadata"];
  name: string;
  product_id?: string;
  product_images?: Array<Pick<ProductImageRow, "public_url" | "sort_order">>;
  sale_unit_label?: string;
  unit: string | null;
};

type SearchParams = Record<string, string | string[] | undefined>;

type InitialOrderCustomer = {
  customerCode: string | null;
  id: string;
  linePictureUrl: string | null;
  name: string;
};

type InitialOrderAuth = {
  customer: InitialOrderCustomer | null;
  lineUserId: string | null;
};

const siteUrl = getSiteUrl();
const DEFAULT_ORDER_SHARE_METADATA = {
  description: "ระบบสั่งสินค้าสำหรับลูกค้า T&Y Noodle",
  image: `${siteUrl}/brand/1200x630.png`,
  title: "สั่งสินค้า",
  url: `${siteUrl}/order`,
} as const;
const ORDER_PRODUCT_SELECT = `
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
const ORDER_PRODUCT_SHARE_SELECT = `
  id,
  name,
  unit,
  metadata,
  product_images (
    public_url,
    sort_order
  )
`;

const getCatalogData = cache(async () => {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: products, error } = await supabaseAdmin
    .from("products")
    .select(ORDER_PRODUCT_SELECT)
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
      console.error("Failed to load catalog:", error);
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
      // Set default sale unit info for the initial view
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
  const orgPhone = orgMeta.phone ?? "";
  const orderWindowSettings = parseOrderWindowSettings(orgResult?.data?.metadata);

  return {
    allowOrderAfterCutoff: orderWindowSettings.allowOrderAfterCutoff,
    catalogProducts,
    orderCloseTime: orderWindowSettings.closeTime,
    orderOpenTime: orderWindowSettings.openTime,
    organizationId,
    orgPhone,
  };
});

function getSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function extractLinePictureUrl(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const lineProfile = "lineProfile" in metadata ? metadata.lineProfile : null;
  if (!lineProfile || typeof lineProfile !== "object" || Array.isArray(lineProfile)) {
    return null;
  }

  const pictureUrl = "pictureUrl" in lineProfile ? lineProfile.pictureUrl : null;
  return typeof pictureUrl === "string" && pictureUrl.trim() ? pictureUrl.trim() : null;
}

async function getInitialOrderAuth(
  organizationId: string,
): Promise<InitialOrderAuth> {
  const session = await getOrderCustomerSession();
  const startedAt = Date.now();

  if (!session?.lineUserId) {
    return { customer: null, lineUserId: null };
  }

  const data = organizationId
    ? await getLinkedCustomerByLineUserId(organizationId, session.lineUserId)
    : null;

  if (!data) {
    console.info("[order-auth:session-unlinked]", {
      durationMs: Date.now() - startedAt,
      lineUserId: maskLineUserId(session.lineUserId),
      organizationId,
    });
    return {
      customer: null,
      lineUserId: session.lineUserId,
    };
  }

  if (organizationId && data.organization_id !== organizationId) {
    console.warn("[order-auth:organization-mismatch]", {
      durationMs: Date.now() - startedAt,
      lineUserId: maskLineUserId(session.lineUserId),
      linkedOrganizationId: data.organization_id,
      organizationId,
    });
    return { customer: null, lineUserId: null };
  }

  const durationMs = Date.now() - startedAt;
  if (durationMs >= 800) {
    console.info("[order-auth:session-linked]", {
      customerId: data.id,
      durationMs,
      lineUserId: maskLineUserId(session.lineUserId),
      organizationId,
    });
  }

  return {
    customer: {
      customerCode: data.customer_code,
      id: data.id,
      linePictureUrl: extractLinePictureUrl(data.metadata),
      name: data.name,
    },
    lineUserId: session.lineUserId,
  };
}

function getProductShareMetadata(
  idWithOptionalUnit: string | undefined,
  products: ProductShareCandidate[],
) {
  const productId = idWithOptionalUnit?.includes(":")
    ? idWithOptionalUnit.split(":")[0]
    : idWithOptionalUnit;

  const selectedProduct = productId
    ? products.find((product) => product.id === productId || product.product_id === productId)
    : undefined;

  if (!selectedProduct) {
    return DEFAULT_ORDER_SHARE_METADATA;
  }

  const metadata = (selectedProduct.metadata ?? {}) as Record<string, unknown>;
  const rawDescription =
    typeof metadata.description === "string" ? metadata.description.trim() : "";
  const description =
    rawDescription.replace(/\s*\n+\s*/g, " ").trim() ||
    `สั่งซื้อ ${selectedProduct.name} หน่วย ${selectedProduct.unit ?? selectedProduct.sale_unit_label} กับ T&Y Noodle`;

  return {
    title: `${selectedProduct.name} | สั่งสินค้า`,
    description,
    url: `${siteUrl}/order?product=${encodeURIComponent(selectedProduct.id)}`,
    image:
      selectedProduct.product_images?.[0]?.public_url ||
      `${siteUrl}/brand/1200x630.png`,
  };
}

const getProductShareMetadataById = cache(async (idWithOptionalUnit: string | undefined) => {
  if (!idWithOptionalUnit) {
    return DEFAULT_ORDER_SHARE_METADATA;
  }

  const productId = idWithOptionalUnit.includes(":")
    ? idWithOptionalUnit.split(":")[0]
    : idWithOptionalUnit;

  if (!productId) {
    return DEFAULT_ORDER_SHARE_METADATA;
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: product } = await supabaseAdmin
    .from("products")
    .select(ORDER_PRODUCT_SHARE_SELECT)
    .eq("id", productId)
    .eq("is_active", true)
    .maybeSingle();

  if (!product) {
    return DEFAULT_ORDER_SHARE_METADATA;
  }

  const shareMeta = getProductShareMetadata(productId, [
    {
      ...product,
      product_id: product.id,
      sale_unit_label: product.unit,
    },
  ]);
  return shareMeta;
});

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}): Promise<Metadata> {
  const resolvedSearchParams = (await searchParams) ?? {};
  const productId = getSearchParamValue(resolvedSearchParams.product);
  const shareMeta = productId
    ? await getProductShareMetadataById(productId)
    : DEFAULT_ORDER_SHARE_METADATA;

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

export default async function OrderPage(props: {
  searchParams?: Promise<SearchParams>;
}) {
  return (
    <Suspense fallback={<PageLoader />}>
      <OrderContent searchParams={props.searchParams} />
    </Suspense>
  );
}

async function OrderContent({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  console.info("[order-render:start]");
  const resolvedSearchParamsPromise: Promise<SearchParams> =
    searchParams ?? Promise.resolve({});
  const catalogDataPromise = getCatalogData();
  const resolvedSearchParams = await resolvedSearchParamsPromise;
  console.info("[order-render:search-params-ready]", {
    hasPreview: Boolean(resolvedSearchParams.preview),
    hasProduct: Boolean(resolvedSearchParams.product),
  });
  const {
    allowOrderAfterCutoff,
    catalogProducts,
    orderCloseTime,
    orderOpenTime,
    organizationId,
    orgPhone,
  } = await catalogDataPromise;
  console.info("[order-render:catalog-ready]", {
    organizationId,
    productCount: catalogProducts.length,
  });
  const previewView = getSearchParamValue(resolvedSearchParams.preview);
  const isMock = process.env.NEXT_PUBLIC_LIFF_MOCK === "true";
  const initialAuth =
    isMock && previewView
      ? { customer: null, lineUserId: null }
      : await getInitialOrderAuth(organizationId);
  console.info("[order-render:auth-ready]", {
    hasInitialCustomer: Boolean(initialAuth.customer),
    hasInitialLineUserId: Boolean(initialAuth.lineUserId),
    isMock,
    previewView: previewView ?? null,
  });

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <OrderClient
        allowOrderAfterCutoff={allowOrderAfterCutoff}
        initialProducts={catalogProducts}
        initialSessionCustomer={initialAuth.customer}
        initialSessionLineUserId={initialAuth.lineUserId}
        organizationId={organizationId}
        orderCloseTime={orderCloseTime}
        orderOpenTime={orderOpenTime}
        orgPhone={orgPhone}
        previewView={isMock ? previewView : undefined}
      />
    </main>
  );
}
