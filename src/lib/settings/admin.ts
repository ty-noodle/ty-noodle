import "server-only";

import { unstable_cache } from "next/cache";
import { sortProductsByCategory } from "@/lib/products/sort-by-category";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getEffectiveSaleUnitCost,
  normalizeSaleUnitCostMode,
  type SaleUnitCostMode,
} from "@/lib/products/sale-unit-cost";

type SelectQueryResult = Promise<{ data: unknown; error: { message?: string } | null }>;

type SelectTable = {
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      order: (column: string, options: { ascending: boolean }) => SelectQueryResult;
    };
  };
};

export type SettingsProduct = {
  baseUnit: string;
  brand: string;
  category: string;
  categoryIds: string[];
  categoryNames: string[];
  costPrice: number;
  description: string;
  id: string;
  imageUrls: string[];
  isActive: boolean;
  name: string;
  pricingCount: number;
  saleUnits: {
    baseUnitQuantity: number;
    costMode: SaleUnitCostMode;
    effectiveCostPrice: number;
    fixedCostPrice: number | null;
    id: string;
    isDefault: boolean;
    label: string;
    minOrderQty: number;
    sortOrder: number;
    stepOrderQty: number | null;
  }[];
  sku: string;
  stockQuantity: number;
};

export type SettingsProductCategory = {
  id: string;
  isActive: boolean;
  name: string;
  productCount: number;
  productIds: string[];
  sortOrder: number;
};

export type SettingsCustomer = {
  address: string;
  code: string;
  defaultVehicleId: string | null;
  defaultVehicleName: string | null;
  id: string;
  name: string;
  pricingCount: number;
};

export type SettingsVehicle = {
  driverName: string | null;
  id: string;
  isActive: boolean;
  licensePlate: string | null;
  name: string;
  sortOrder: number;
};

export type SettingsPriceRow = {
  customerId: string;
  customerName: string;
  effectiveCostPrice: number;
  imageUrl: string | null;
  productId: string;
  productName: string;
  productSaleUnitId: string;
  saleUnitLabel: string;
  salePrice: number;
  sku: string;
};

export type SettingsSaleUnitOption = {
  effectiveCostPrice: number;
  id: string;
  label: string;
  productId: string;
  productName: string;
  sku: string;
};

export type SettingsData = {
  customers: SettingsCustomer[];
  nextCustomerCode: string;
  nextProductSku: string;
  prices: SettingsPriceRow[];
  productCategories: SettingsProductCategory[];
  products: SettingsProduct[];
  saleUnits: SettingsSaleUnitOption[];
  setupHint: string | null;
  vehicles: SettingsVehicle[];
};

export type SettingsProductsData = Pick<
  SettingsData,
  "nextProductSku" | "productCategories" | "products" | "setupHint"
>;

type ProductRow = {
  cost_price: number | string;
  id: string;
  is_active: boolean;
  metadata: Record<string, string> | null;
  name: string;
  organization_id: string;
  sku: string;
  stock_quantity: number | string;
  unit: string;
};

type ProductImageRow = {
  product_id: string;
  public_url: string;
  sort_order: number;
};

type ProductSaleUnitRow = {
  base_unit_quantity: number | string;
  cost_mode: string | null;
  fixed_cost_price: number | string | null;
  id: string;
  is_default: boolean;
  min_order_qty: number | string | null;
  product_id: string;
  sort_order: number | string;
  step_order_qty: number | string | null;
  unit_label: string;
};

type CustomerRow = {
  address: string;
  customer_code: string;
  default_vehicle_id: string | null;
  id: string;
  name: string;
};

type VehicleRow = {
  driver_name: string | null;
  id: string;
  is_active: boolean;
  license_plate: string | null;
  name: string;
  sort_order: number | string;
};

type PriceRow = {
  customer_id: string;
  product_id: string;
  product_sale_unit_id: string;
  sale_price: number | string;
};

type ProductCategoryRow = {
  id: string;
  is_active: boolean;
  name: string;
  sort_order: number | string;
};

type ProductCategoryItemRow = {
  product_category_id: string;
  product_id: string;
};

function isMissingTableError(message: string | undefined) {
  return Boolean(message?.includes('relation "public.'));
}

function getNextProductSku(skus: string[]) {
  const maxSequence = skus.reduce((max, sku) => {
    const match = /^TYN(\d+)$/i.exec(sku.trim());

    if (!match) {
      return max;
    }

    const sequence = Number.parseInt(match[1], 10);
    return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
  }, 0);

  return `TYN${String(maxSequence + 1).padStart(3, "0")}`;
}

function getNextCustomerCode(codes: string[]) {
  const maxSequence = codes.reduce((max, code) => {
    const match = /^TYS(\d+)$/i.exec(code.trim());

    if (!match) {
      return max;
    }

    const sequence = Number.parseInt(match[1], 10);
    return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
  }, 0);

  return `TYS${String(maxSequence + 1).padStart(3, "0")}`;
}

async function fetchSettingsData(organizationId: string): Promise<SettingsData> {
  const admin = getSupabaseAdmin();
  const productsTable = admin.from("products") as unknown as SelectTable;
  const imagesTable = admin.from("product_images") as unknown as SelectTable;
  const saleUnitsTable = admin.from("product_sale_units") as unknown as SelectTable;
  const pricesTable = admin.from("customer_product_prices") as unknown as SelectTable;
  const categoriesTable = admin.from("product_categories") as unknown as SelectTable;
  const categoryItemsTable = admin.from("product_category_items") as unknown as SelectTable;
  const vehiclesTable = admin.from("vehicles") as unknown as SelectTable;
  // Note: customersTable removed — admin used directly for multi-eq chain

  const [
    productsResult,
    imagesResult,
    saleUnitsResult,
    customersResult,
    pricesResult,
    categoriesResult,
    categoryItemsResult,
    vehiclesResult,
  ] =
    await Promise.all([
      productsTable
        .select("id, organization_id, sku, name, cost_price, stock_quantity, unit, is_active, metadata")
        .eq("organization_id", organizationId)
        .order("sku", { ascending: true }),
      imagesTable
        .select("product_id, public_url, sort_order")
        .eq("organization_id", organizationId)
        .order("sort_order", { ascending: true }),
      saleUnitsTable
        .select(
          "id, product_id, unit_label, base_unit_quantity, is_default, sort_order, cost_mode, fixed_cost_price, min_order_qty, step_order_qty",
        )
        .eq("organization_id", organizationId)
        .order("sort_order", { ascending: true }),
      admin
        .from("customers")
        .select("id, customer_code, name, address, default_vehicle_id")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("customer_code", { ascending: true }),
      pricesTable
        .select("customer_id, product_id, product_sale_unit_id, sale_price")
        .eq("organization_id", organizationId)
        .order("updated_at", { ascending: false }),
      categoriesTable
        .select("id, name, sort_order, is_active")
        .eq("organization_id", organizationId)
        .order("sort_order", { ascending: true }),
      categoryItemsTable
        .select("product_category_id, product_id")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true }),
      vehiclesTable
        .select("id, name, is_active, sort_order, license_plate, driver_name")
        .eq("organization_id", organizationId)
        .order("sort_order", { ascending: true }),
    ]);

  const errors = [
    productsResult.error,
    imagesResult.error,
    saleUnitsResult.error,
    customersResult.error,
    pricesResult.error,
    vehiclesResult.error,
  ].filter(Boolean);
  const categoryErrors = [categoriesResult.error, categoryItemsResult.error].filter(Boolean);

  if (errors.length > 0) {
    const firstError = errors[0];

    return {
      customers: [],
      nextCustomerCode: getNextCustomerCode([]),
      nextProductSku: getNextProductSku([]),
      prices: [],
      productCategories: [],
      products: [],
      saleUnits: [],
      setupHint: isMissingTableError(firstError?.message)
        ? "ยังไม่ได้รัน migration สำหรับหน้าตั้งค่า"
        : "ยังโหลดข้อมูลหน้าตั้งค่าไม่สำเร็จ",
      vehicles: [],
    };
  }

  const products = (productsResult.data ?? []) as ProductRow[];
  const images = (imagesResult.data ?? []) as ProductImageRow[];
  const saleUnits = (saleUnitsResult.data ?? []) as ProductSaleUnitRow[];
  const customers = (customersResult.data ?? []) as CustomerRow[];
  const prices = (pricesResult.data ?? []) as PriceRow[];
  const categories =
    categoryErrors.length > 0
      ? []
      : ((categoriesResult.data ?? []) as ProductCategoryRow[]);
  const categoryItems =
    categoryErrors.length > 0
      ? []
      : ((categoryItemsResult.data ?? []) as ProductCategoryItemRow[]);
  const vehicles = (vehiclesResult.data ?? []) as VehicleRow[];

  const imageMap = new Map<string, string[]>();
  for (const image of images) {
    const current = imageMap.get(image.product_id) ?? [];
    current.push(image.public_url);
    imageMap.set(image.product_id, current);
  }

  const productPricingCount = new Map<string, number>();
  const customerPricingCount = new Map<string, number>();
  const categoryIdsByProductId = new Map<string, string[]>();
  const categoryNamesByProductId = new Map<string, string[]>();
  const productIdsByCategoryId = new Map<string, string[]>();
  const saleUnitMap = new Map<
    string,
    {
      baseUnitQuantity: number;
      costMode: SaleUnitCostMode;
      effectiveCostPrice: number;
      fixedCostPrice: number | null;
      id: string;
      isDefault: boolean;
      label: string;
      minOrderQty: number;
      sortOrder: number;
      stepOrderQty: number | null;
    }[]
  >();

  for (const saleUnit of saleUnits) {
    const current = saleUnitMap.get(saleUnit.product_id) ?? [];
    const product = products.find((item) => item.id === saleUnit.product_id);
    const baseCostPrice = Number(product?.cost_price ?? 0);
    const baseUnitQuantity = Number(saleUnit.base_unit_quantity);
    const fixedCostPrice =
      saleUnit.fixed_cost_price === null ? null : Number(saleUnit.fixed_cost_price);
    const costMode = normalizeSaleUnitCostMode(saleUnit.cost_mode);

    current.push({
      baseUnitQuantity,
      costMode,
      effectiveCostPrice: getEffectiveSaleUnitCost({
        baseCostPrice,
        baseUnitQuantity,
        costMode,
        fixedCostPrice,
      }),
      fixedCostPrice,
      id: saleUnit.id,
      isDefault: saleUnit.is_default,
      label: saleUnit.unit_label,
      minOrderQty: Number(saleUnit.min_order_qty ?? 1),
      sortOrder: Number(saleUnit.sort_order),
      stepOrderQty: saleUnit.step_order_qty !== null && saleUnit.step_order_qty !== undefined
        ? Number(saleUnit.step_order_qty)
        : null,
    });
    saleUnitMap.set(saleUnit.product_id, current);
  }

  for (const row of prices) {
    productPricingCount.set(row.product_id, (productPricingCount.get(row.product_id) ?? 0) + 1);
    customerPricingCount.set(
      row.customer_id,
      (customerPricingCount.get(row.customer_id) ?? 0) + 1,
    );
  }

  const categoryNameMap = new Map(categories.map((category) => [category.id, category.name]));

  for (const item of categoryItems) {
    const productCategoryIds = categoryIdsByProductId.get(item.product_id) ?? [];
    productCategoryIds.push(item.product_category_id);
    categoryIdsByProductId.set(item.product_id, productCategoryIds);

    const categoryName = categoryNameMap.get(item.product_category_id);
    if (categoryName) {
      const productCategoryNames = categoryNamesByProductId.get(item.product_id) ?? [];
      productCategoryNames.push(categoryName);
      categoryNamesByProductId.set(item.product_id, productCategoryNames);
    }

    const categoryProductIds = productIdsByCategoryId.get(item.product_category_id) ?? [];
    categoryProductIds.push(item.product_id);
    productIdsByCategoryId.set(item.product_category_id, categoryProductIds);
  }

  const productMap = new Map(
    products.map((product) => [
      product.id,
      {
        imageUrl: imageMap.get(product.id)?.[0] ?? null,
        name: product.name,
        sku: product.sku,
      },
    ]),
  );
  const customerMap = new Map(customers.map((customer) => [customer.id, customer.name]));
  const vehicleMap = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle.name]));

  return {
    customers: customers.map((customer) => ({
      address: customer.address,
      code: customer.customer_code,
      defaultVehicleId: customer.default_vehicle_id,
      defaultVehicleName: customer.default_vehicle_id
        ? (vehicleMap.get(customer.default_vehicle_id) ?? null)
        : null,
      id: customer.id,
      name: customer.name,
      pricingCount: customerPricingCount.get(customer.id) ?? 0,
    })),
    nextCustomerCode: getNextCustomerCode(customers.map((customer) => customer.customer_code)),
    prices: prices.map((price) => ({
      customerId: price.customer_id,
      effectiveCostPrice:
        saleUnitMap
          .get(price.product_id)
          ?.find((saleUnit) => saleUnit.id === price.product_sale_unit_id)?.effectiveCostPrice ?? 0,
      customerName: customerMap.get(price.customer_id) ?? "ร้านค้าไม่ทราบชื่อ",
      imageUrl: productMap.get(price.product_id)?.imageUrl ?? null,
      productId: price.product_id,
      productSaleUnitId: price.product_sale_unit_id,
      productName: productMap.get(price.product_id)?.name ?? "สินค้าไม่ทราบชื่อ",
      salePrice: Number(price.sale_price),
      saleUnitLabel:
        saleUnitMap
          .get(price.product_id)
          ?.find((saleUnit) => saleUnit.id === price.product_sale_unit_id)?.label ?? "-",
      sku: productMap.get(price.product_id)?.sku ?? "-",
    })),
    nextProductSku: getNextProductSku(products.map((product) => product.sku)),
    productCategories: categories
      .toSorted((left, right) => {
        if (Number(left.sort_order) !== Number(right.sort_order)) {
          return Number(left.sort_order) - Number(right.sort_order);
        }

        return left.name.localeCompare(right.name, "th");
      })
      .map((category) => ({
        id: category.id,
        isActive: category.is_active,
        name: category.name,
        productCount: productIdsByCategoryId.get(category.id)?.length ?? 0,
        productIds: productIdsByCategoryId.get(category.id) ?? [],
        sortOrder: Number(category.sort_order),
      })),
    products: sortProductsByCategory(
      products.map((product) => {
      const meta = (product.metadata ?? {}) as Record<string, string>;
      const categoryNames = categoryNamesByProductId.get(product.id) ?? [];
      return {
        brand: meta.brand ?? "",
        category: categoryNames.join(", ") || meta.category || "",
        categoryIds: categoryIdsByProductId.get(product.id) ?? [],
        categoryNames,
        costPrice: Number(product.cost_price),
        description: meta.description ?? "",
        id: product.id,
        imageUrls: imageMap.get(product.id) ?? [],
        isActive: product.is_active,
        name: product.name,
        pricingCount: productPricingCount.get(product.id) ?? 0,
        saleUnits:
          saleUnitMap.get(product.id)?.toSorted((left, right) => {
            if (left.sortOrder !== right.sortOrder) {
              return left.sortOrder - right.sortOrder;
            }

            if (left.isDefault !== right.isDefault) {
              return left.isDefault ? -1 : 1;
            }

            return left.label.localeCompare(right.label, "th");
          }).map((u) => ({
            baseUnitQuantity: u.baseUnitQuantity,
            costMode: u.costMode,
            effectiveCostPrice: u.effectiveCostPrice,
            fixedCostPrice: u.fixedCostPrice,
            id: u.id,
            isDefault: u.isDefault,
            label: u.label,
            minOrderQty: u.minOrderQty,
            sortOrder: u.sortOrder,
            stepOrderQty: u.stepOrderQty,
          })) ?? [],
        sku: product.sku,
        stockQuantity: Number(product.stock_quantity),
        baseUnit: product.unit,
      };
      }),
      categories.map((c) => ({ id: c.id, sortOrder: Number(c.sort_order) })),
    ),
    saleUnits: saleUnits.map((saleUnit) => ({
      effectiveCostPrice:
        saleUnitMap
          .get(saleUnit.product_id)
          ?.find((u) => u.id === saleUnit.id)?.effectiveCostPrice ?? 0,
      id: saleUnit.id,
      label: saleUnit.unit_label,
      productId: saleUnit.product_id,
      productName: productMap.get(saleUnit.product_id)?.name ?? "สินค้าไม่ทราบชื่อ",
      sku: productMap.get(saleUnit.product_id)?.sku ?? "-",
    })),
    setupHint:
      categoryErrors.length > 0 && categoryErrors.every((error) => isMissingTableError(error?.message))
        ? "ระบบหมวดหมู่สินค้ายังไม่พร้อมใช้งาน"
        : null,
    vehicles: vehicles.map((vehicle) => ({
      driverName: vehicle.driver_name,
      id: vehicle.id,
      isActive: vehicle.is_active,
      licensePlate: vehicle.license_plate,
      name: vehicle.name,
      sortOrder: Number(vehicle.sort_order),
    })),
  };
}

export function getSettingsData(organizationId: string): Promise<SettingsData> {
  return unstable_cache(
    () => fetchSettingsData(organizationId),
    ["settings", organizationId],
    { tags: [`settings-${organizationId}`] },
  )();
}

async function fetchSettingsProductsData(organizationId: string): Promise<SettingsProductsData> {
  const admin = getSupabaseAdmin();
  const productsTable = admin.from("products") as unknown as SelectTable;
  const imagesTable = admin.from("product_images") as unknown as SelectTable;
  const saleUnitsTable = admin.from("product_sale_units") as unknown as SelectTable;
  const categoriesTable = admin.from("product_categories") as unknown as SelectTable;
  const categoryItemsTable = admin.from("product_category_items") as unknown as SelectTable;

  const [productsResult, imagesResult, saleUnitsResult, categoriesResult, categoryItemsResult] =
    await Promise.all([
      productsTable
        .select("id, organization_id, sku, name, cost_price, stock_quantity, unit, is_active, metadata")
        .eq("organization_id", organizationId)
        .order("sku", { ascending: true }),
      imagesTable
        .select("product_id, public_url, sort_order")
        .eq("organization_id", organizationId)
        .order("sort_order", { ascending: true }),
      saleUnitsTable
        .select(
          "id, product_id, unit_label, base_unit_quantity, is_default, sort_order, cost_mode, fixed_cost_price, min_order_qty, step_order_qty",
        )
        .eq("organization_id", organizationId)
        .order("sort_order", { ascending: true }),
      categoriesTable
        .select("id, name, sort_order, is_active")
        .eq("organization_id", organizationId)
        .order("sort_order", { ascending: true }),
      categoryItemsTable
        .select("product_category_id, product_id")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true }),
    ]);

  const errors = [productsResult.error, imagesResult.error, saleUnitsResult.error].filter(Boolean);
  const categoryErrors = [categoriesResult.error, categoryItemsResult.error].filter(Boolean);

  if (errors.length > 0) {
    const firstError = errors[0];
    return {
      nextProductSku: getNextProductSku([]),
      productCategories: [],
      products: [],
      setupHint: isMissingTableError(firstError?.message)
        ? "ยังไม่ได้รัน migration สำหรับหน้าตั้งค่า"
        : "ยังโหลดข้อมูลหน้าตั้งค่าไม่สำเร็จ",
    };
  }

  const products = (productsResult.data ?? []) as ProductRow[];
  const images = (imagesResult.data ?? []) as ProductImageRow[];
  const saleUnits = (saleUnitsResult.data ?? []) as ProductSaleUnitRow[];
  const categories =
    categoryErrors.length > 0
      ? []
      : ((categoriesResult.data ?? []) as ProductCategoryRow[]);
  const categoryItems =
    categoryErrors.length > 0
      ? []
      : ((categoryItemsResult.data ?? []) as ProductCategoryItemRow[]);

  const imageMap = new Map<string, string[]>();
  for (const image of images) {
    const current = imageMap.get(image.product_id) ?? [];
    current.push(image.public_url);
    imageMap.set(image.product_id, current);
  }

  const productCostMap = new Map<string, number>(
    products.map((product) => [product.id, Number(product.cost_price ?? 0)]),
  );

  const saleUnitMap = new Map<
    string,
    {
      baseUnitQuantity: number;
      costMode: SaleUnitCostMode;
      effectiveCostPrice: number;
      fixedCostPrice: number | null;
      id: string;
      isDefault: boolean;
      label: string;
      minOrderQty: number;
      sortOrder: number;
      stepOrderQty: number | null;
    }[]
  >();

  for (const saleUnit of saleUnits) {
    const current = saleUnitMap.get(saleUnit.product_id) ?? [];
    const baseCostPrice = productCostMap.get(saleUnit.product_id) ?? 0;
    const baseUnitQuantity = Number(saleUnit.base_unit_quantity);
    const fixedCostPrice =
      saleUnit.fixed_cost_price === null ? null : Number(saleUnit.fixed_cost_price);
    const costMode = normalizeSaleUnitCostMode(saleUnit.cost_mode);

    current.push({
      baseUnitQuantity,
      costMode,
      effectiveCostPrice: getEffectiveSaleUnitCost({
        baseCostPrice,
        baseUnitQuantity,
        costMode,
        fixedCostPrice,
      }),
      fixedCostPrice,
      id: saleUnit.id,
      isDefault: saleUnit.is_default,
      label: saleUnit.unit_label,
      minOrderQty: Number(saleUnit.min_order_qty ?? 1),
      sortOrder: Number(saleUnit.sort_order),
      stepOrderQty: saleUnit.step_order_qty !== null && saleUnit.step_order_qty !== undefined
        ? Number(saleUnit.step_order_qty)
        : null,
    });
    saleUnitMap.set(saleUnit.product_id, current);
  }

  const categoryIdsByProductId = new Map<string, string[]>();
  const categoryNamesByProductId = new Map<string, string[]>();
  const productIdsByCategoryId = new Map<string, string[]>();
  const categoryNameMap = new Map(categories.map((category) => [category.id, category.name]));

  for (const item of categoryItems) {
    const productCategoryIds = categoryIdsByProductId.get(item.product_id) ?? [];
    productCategoryIds.push(item.product_category_id);
    categoryIdsByProductId.set(item.product_id, productCategoryIds);

    const categoryName = categoryNameMap.get(item.product_category_id);
    if (categoryName) {
      const productCategoryNames = categoryNamesByProductId.get(item.product_id) ?? [];
      productCategoryNames.push(categoryName);
      categoryNamesByProductId.set(item.product_id, productCategoryNames);
    }

    const categoryProductIds = productIdsByCategoryId.get(item.product_category_id) ?? [];
    categoryProductIds.push(item.product_id);
    productIdsByCategoryId.set(item.product_category_id, categoryProductIds);
  }

  return {
    nextProductSku: getNextProductSku(products.map((product) => product.sku)),
    productCategories: categories
      .toSorted((left, right) => {
        if (Number(left.sort_order) !== Number(right.sort_order)) {
          return Number(left.sort_order) - Number(right.sort_order);
        }

        return left.name.localeCompare(right.name, "th");
      })
      .map((category) => ({
        id: category.id,
        isActive: category.is_active,
        name: category.name,
        productCount: productIdsByCategoryId.get(category.id)?.length ?? 0,
        productIds: productIdsByCategoryId.get(category.id) ?? [],
        sortOrder: Number(category.sort_order),
      })),
    products: sortProductsByCategory(
      products.map((product) => {
        const meta = (product.metadata ?? {}) as Record<string, string>;
        const categoryNames = categoryNamesByProductId.get(product.id) ?? [];
        return {
          baseUnit: product.unit,
          brand: meta.brand ?? "",
          category: categoryNames.join(", ") || meta.category || "",
          categoryIds: categoryIdsByProductId.get(product.id) ?? [],
          categoryNames,
          costPrice: Number(product.cost_price),
          description: meta.description ?? "",
          id: product.id,
          imageUrls: imageMap.get(product.id) ?? [],
          isActive: product.is_active,
          name: product.name,
          pricingCount: 0,
          saleUnits:
            saleUnitMap.get(product.id)?.toSorted((left, right) => {
              if (left.sortOrder !== right.sortOrder) {
                return left.sortOrder - right.sortOrder;
              }

              if (left.isDefault !== right.isDefault) {
                return left.isDefault ? -1 : 1;
              }

              return left.label.localeCompare(right.label, "th");
            }).map((u) => ({
              baseUnitQuantity: u.baseUnitQuantity,
              costMode: u.costMode,
              effectiveCostPrice: u.effectiveCostPrice,
              fixedCostPrice: u.fixedCostPrice,
              id: u.id,
              isDefault: u.isDefault,
              label: u.label,
              minOrderQty: u.minOrderQty,
              sortOrder: u.sortOrder,
              stepOrderQty: u.stepOrderQty,
            })) ?? [],
          sku: product.sku,
          stockQuantity: Number(product.stock_quantity),
        };
      }),
      categories.map((c) => ({ id: c.id, sortOrder: Number(c.sort_order) })),
    ),
    setupHint:
      categoryErrors.length > 0 && categoryErrors.every((error) => isMissingTableError(error?.message))
        ? "ระบบหมวดหมู่สินค้ายังไม่พร้อมใช้งาน"
        : null,
  };
}

export function getSettingsProductsData(organizationId: string): Promise<SettingsProductsData> {
  return unstable_cache(
    () => fetchSettingsProductsData(organizationId),
    ["settings-products", organizationId],
    { tags: [`settings-${organizationId}`] },
  )();
}
