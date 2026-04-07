"use server";

import { revalidatePath } from "next/cache";
import { requireAppRole } from "@/lib/auth/authorization";
import { normalizeSaleUnitCostMode } from "@/lib/products/sale-unit-cost";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database, Json } from "@/types/database";

const PRODUCT_IMAGES_BUCKET = "product-images";

type SettingsAdmin = ReturnType<typeof getSupabaseAdmin>;

function safeText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function safePrice(value: FormDataEntryValue | null) {
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : NaN;
}

function safeInteger(value: FormDataEntryValue | null) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function parseCategoryIds(formData: FormData) {
  const firstCategoryId = formData
    .getAll("categoryIds")
    .map((value) => String(value ?? "").trim())
    .find(Boolean);

  return firstCategoryId ? [firstCategoryId] : [];
}

function parseSaleUnits(formData: FormData, fallbackBaseUnit: string) {
  const unitIds = formData.getAll("saleUnitId").map((value) => String(value ?? "").trim());
  const labels = formData.getAll("saleUnitLabel").map((value) => String(value ?? "").trim());
  const costModes = formData
    .getAll("saleUnitCostMode")
    .map((value) => normalizeSaleUnitCostMode(String(value ?? "").trim()));
  const fixedCosts = formData.getAll("saleUnitFixedCostPrice").map((value) => {
    const normalized = String(value ?? "").replace(/,/g, "").trim();
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : NaN;
  });
  const ratios = formData.getAll("saleUnitRatio").map((value) =>
    Number(String(value ?? "").replace(/,/g, "").trim()),
  );
  const minOrderQtys = formData.getAll("saleUnitMinOrderQty").map((value) => {
    const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
  });
  const stepOrderQtys = formData.getAll("saleUnitStepOrderQty").map((value) => {
    const normalized = String(value ?? "").replace(/,/g, "").trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  });

  const saleUnits = labels
    .map((label, index) => ({
      baseUnitQuantity: Number.isFinite(ratios[index]) ? ratios[index] : NaN,
      costMode: costModes[index] ?? "derived",
      fixedCostPrice: fixedCosts[index] ?? null,
      id: unitIds[index] ?? "",
      label,
      minOrderQty: minOrderQtys[index] ?? 1,
      sortOrder: index,
      stepOrderQty: stepOrderQtys[index] ?? null,
    }))
    .filter((saleUnit) => saleUnit.label);

  if (saleUnits.length === 0 && fallbackBaseUnit) {
    return [
      {
        baseUnitQuantity: 1,
        costMode: "derived" as const,
        fixedCostPrice: null,
        id: "",
        label: fallbackBaseUnit,
        minOrderQty: 1,
        sortOrder: 0,
        stepOrderQty: null,
      },
    ];
  }

  return saleUnits;
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

async function generateProductSku(organizationId: string) {
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("products").select("sku").eq("organization_id", organizationId);

  return getNextProductSku((data ?? []).map((product) => product.sku));
}

async function ensureBucket() {
  const admin = getSupabaseAdmin();
  const storage = admin.storage;
  const { data: buckets } = await storage.listBuckets();

  if (
    (buckets as Array<{ name: string }> | undefined)?.some(
      (bucket) => bucket.name === PRODUCT_IMAGES_BUCKET,
    )
  ) {
    return;
  }

  await storage.createBucket(PRODUCT_IMAGES_BUCKET, {
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
    fileSizeLimit: "5MB",
    public: true,
  });
}

async function uploadProductImages(
  storage: ReturnType<typeof getSupabaseAdmin>["storage"],
  organizationId: string,
  productId: string,
  files: File[],
) {
  const uploadedRows = await Promise.all(
    files.map(async (file, index) => {
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${organizationId}/${productId}/${crypto.randomUUID()}.${extension}`;
      const buffer = Buffer.from(await file.arrayBuffer());

      const { error: uploadError } = await storage
        .from(PRODUCT_IMAGES_BUCKET)
        .upload(path, buffer, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });

      if (uploadError) {
        return null;
      }

      const {
        data: { publicUrl },
      } = storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);

      return {
        organization_id: organizationId,
        product_id: productId,
        public_url: publicUrl,
        sort_order: index,
        storage_path: path,
      };
    }),
  );

  return uploadedRows.filter((row): row is NonNullable<typeof row> => row !== null);
}

async function resolveCategorySelection(
  admin: ReturnType<typeof getSupabaseAdmin>,
  organizationId: string,
  requestedCategoryIds: string[],
) {
  if (requestedCategoryIds.length === 0) {
    return {
      categoryIds: [] as string[],
      categoryNames: [] as string[],
    };
  }

  const { data } = await admin
    .from("product_categories")
    .select("id, name")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .in("id", requestedCategoryIds)
    .order("sort_order", { ascending: true });

  const rows = ((data ?? []) as Array<{ id: string; name: string }>).slice(0, 1);

  return {
    categoryIds: rows.map((row) => row.id),
    categoryNames: rows.map((row) => row.name),
  };
}

async function syncProductCategoryAssignments(
  admin: ReturnType<typeof getSupabaseAdmin>,
  organizationId: string,
  productId: string,
  categoryIds: string[],
) {
  const table = admin.from("product_category_items");

  await table
    .delete()
    .eq("organization_id", organizationId)
    .eq("product_id", productId);

  const nextCategoryId = categoryIds[0];

  if (!nextCategoryId) {
    return;
  }

  await table.insert({
    organization_id: organizationId,
    product_category_id: nextCategoryId,
    product_id: productId,
  });
}

async function syncCategoryMetadataForProducts(
  admin: SettingsAdmin,
  organizationId: string,
  productIds: string[],
) {
  const uniqueProductIds = [...new Set(productIds.filter(Boolean))];
  if (uniqueProductIds.length === 0) {
    return;
  }

  const [productsResult, categoriesResult, categoryItemsResult] = await Promise.all([
    admin
      .from("products")
      .select("id, metadata")
      .eq("organization_id", organizationId)
      .in("id", uniqueProductIds),
    admin
      .from("product_categories")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("is_active", true),
    admin
      .from("product_category_items")
      .select("product_id, product_category_id")
      .eq("organization_id", organizationId)
      .in("product_id", uniqueProductIds),
  ]);

  const categoryNameById = new Map<string, string>(
    ((categoriesResult.data ?? []) as Array<{ id: string; name: string }>).map((row) => [
      row.id,
      row.name,
    ]),
  );
  const categoryNamesByProductId = new Map<string, string[]>();

  for (const item of (categoryItemsResult.data ?? []) as Array<{
    product_category_id: string;
    product_id: string;
  }>) {
    const categoryName = categoryNameById.get(item.product_category_id);
    if (!categoryName) {
      continue;
    }

    const current = categoryNamesByProductId.get(item.product_id) ?? [];
    current.push(categoryName);
    categoryNamesByProductId.set(item.product_id, current);
  }

  await Promise.all(
    ((productsResult.data ?? []) as Array<{ id: string; metadata: Database["public"]["Tables"]["products"]["Row"]["metadata"] | null }>).map(
      async (product) => {
        const nextMetadata = {
          ...((product.metadata ?? {}) as Record<string, unknown>),
        };
        const categoryNames = categoryNamesByProductId.get(product.id) ?? [];

        if (categoryNames.length > 0) {
          nextMetadata.category = categoryNames.join(", ");
        } else {
          delete nextMetadata.category;
        }

        await admin
          .from("products")
          .update({ metadata: nextMetadata as Json })
          .eq("organization_id", organizationId)
          .eq("id", product.id);
      },
    ),
  );
}

function revalidateSettingsCategorySurfaces() {
  revalidatePath("/settings/products");
  revalidatePath("/dashboard/settings", "layout");
  revalidatePath("/order");
  revalidatePath("/orders");
  revalidatePath("/reports/product-sales");
}

export async function createCustomer(formData: FormData) {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as SettingsAdmin;
  const customerCode = safeText(formData.get("customerCode"));
  const name = safeText(formData.get("name"));
  const addressLine = safeText(formData.get("addressLine"));
  const province = safeText(formData.get("province"));
  const district = safeText(formData.get("district"));
  const subdistrict = safeText(formData.get("subdistrict"));
  const postalCode = safeText(formData.get("postalCode"));

  if (
    !customerCode ||
    !name ||
    !addressLine ||
    !province ||
    !district ||
    !subdistrict ||
    !postalCode
  ) {
    return;
  }

  const address = `${addressLine} ตำบล/แขวง${subdistrict} อำเภอ/เขต${district} จังหวัด${province} ${postalCode}`;

  await admin.from("customers").upsert(
    {
      address,
      customer_code: customerCode,
      metadata: {
        addressLine,
        district,
        postalCode,
        province,
        subdistrict,
      },
      name,
      organization_id: session.organizationId,
    },
    {
      onConflict: "organization_id,customer_code",
    },
  );

  revalidatePath("/dashboard/settings", "layout");
}

export async function createProduct(formData: FormData) {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as SettingsAdmin;
  const name = safeText(formData.get("name"));
  const costPrice = safePrice(formData.get("costPrice"));
  const stockQuantity = safeInteger(formData.get("stockQuantity"));
  const baseUnit = safeText(formData.get("baseUnit"));
  const saleUnits = parseSaleUnits(formData, baseUnit);
  const files = formData
    .getAll("images")
    .filter((value): value is File => value instanceof File && value.size > 0);
  const brand = safeText(formData.get("brand")) ?? "";
  const requestedCategoryIds = parseCategoryIds(formData);
  const description = safeText(formData.get("description")) ?? "";

  if (
    !name ||
    Number.isNaN(costPrice) ||
    Number.isNaN(stockQuantity) ||
    !baseUnit ||
    saleUnits.length === 0 ||
    saleUnits.some(
      (saleUnit) =>
        !Number.isFinite(saleUnit.baseUnitQuantity) ||
        saleUnit.baseUnitQuantity <= 0 ||
        (saleUnit.costMode === "fixed" &&
          (saleUnit.fixedCostPrice === null ||
            !Number.isFinite(saleUnit.fixedCostPrice) ||
            saleUnit.fixedCostPrice < 0)),
    )
  ) {
    return;
  }

  const sku = await generateProductSku(session.organizationId);
  const { categoryIds, categoryNames } = await resolveCategorySelection(
    admin,
    session.organizationId,
    requestedCategoryIds,
  );
  const metadata: Record<string, string> = {};
  if (brand) metadata.brand = brand;
  if (categoryNames.length > 0) metadata.category = categoryNames.join(", ");
  if (description) metadata.description = description;

  const storage = admin.storage;
  const { data: product, error: productError } = await admin
    .from("products")
    .insert({
      cost_price: costPrice,
      metadata: metadata as Json,
      name,
      organization_id: session.organizationId,
      sku,
      stock_quantity: stockQuantity,
      unit: baseUnit,
    })
    .select("id")
    .single();

  if (productError || !product) {
    return;
  }

  await admin.from("product_sale_units").insert(
    saleUnits.map((saleUnit, index) => ({
      base_unit_quantity: saleUnit.baseUnitQuantity,
      cost_mode: saleUnit.costMode,
      fixed_cost_price: saleUnit.costMode === "fixed" ? saleUnit.fixedCostPrice : null,
      is_active: true,
      is_default: index === 0,
      min_order_qty: saleUnit.minOrderQty,
      organization_id: session.organizationId,
      product_id: product.id,
      sort_order: index,
      step_order_qty: saleUnit.stepOrderQty,
      unit_label: saleUnit.label,
    })),
  );

  await syncProductCategoryAssignments(admin, session.organizationId, product.id, categoryIds);

  if (files.length > 0) {
    await ensureBucket();
    const imageRows = await uploadProductImages(storage, session.organizationId, product.id, files);

    if (imageRows.length > 0) {
      await admin.from("product_images").insert(imageRows);
    }
  }

  revalidateSettingsCategorySurfaces();
}

export async function upsertStoreProductPrice(formData: FormData) {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as SettingsAdmin;
  const customerId = safeText(formData.get("customerId"));
  const productSaleUnitId = safeText(formData.get("productSaleUnitId"));
  const salePrice = safePrice(formData.get("salePrice"));

  if (!customerId || !productSaleUnitId || Number.isNaN(salePrice)) {
    return;
  }

  const saleUnitResult = await admin
    .from("product_sale_units")
    .select("product_id")
    .eq("id", productSaleUnitId)
    .single();

  if (saleUnitResult.error || !saleUnitResult.data) {
    return;
  }

  await admin.from("customer_product_prices").upsert(
    {
      customer_id: customerId,
      organization_id: session.organizationId,
      product_id: saleUnitResult.data.product_id,
      product_sale_unit_id: productSaleUnitId,
      sale_price: salePrice,
    },
    {
      onConflict: "organization_id,customer_id,product_sale_unit_id",
    },
  );

  revalidatePath("/dashboard/settings", "layout");
}

export async function deleteCustomerPrice(formData: FormData) {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as SettingsAdmin;
  const customerId = safeText(formData.get("customerId"));
  const productSaleUnitId = safeText(formData.get("productSaleUnitId"));

  if (!customerId || !productSaleUnitId) return;

  await admin
    .from("customer_product_prices")
    .delete()
    .eq("organization_id", session.organizationId)
    .eq("customer_id", customerId)
    .eq("product_sale_unit_id", productSaleUnitId);

  revalidatePath("/dashboard/settings", "layout");
}

export async function updateProduct(formData: FormData) {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as SettingsAdmin;
  const productId = safeText(formData.get("productId"));
  const sku = safeText(formData.get("sku"));
  const name = safeText(formData.get("name"));
  const costPrice = safePrice(formData.get("costPrice"));
  const stockQuantity = safeInteger(formData.get("stockQuantity"));
  const baseUnit = safeText(formData.get("baseUnit"));
  const saleUnits = parseSaleUnits(formData, baseUnit);
  const files = formData
    .getAll("images")
    .filter((value): value is File => value instanceof File && value.size > 0);
  const brand = safeText(formData.get("brand")) ?? "";
  const requestedCategoryIds = parseCategoryIds(formData);
  const description = safeText(formData.get("description")) ?? "";

  if (
    !productId ||
    !sku ||
    !name ||
    Number.isNaN(costPrice) ||
    Number.isNaN(stockQuantity) ||
    !baseUnit ||
    saleUnits.length === 0 ||
    saleUnits.some(
      (saleUnit) =>
        !Number.isFinite(saleUnit.baseUnitQuantity) ||
        saleUnit.baseUnitQuantity <= 0 ||
        (saleUnit.costMode === "fixed" &&
          (saleUnit.fixedCostPrice === null ||
            !Number.isFinite(saleUnit.fixedCostPrice) ||
            saleUnit.fixedCostPrice < 0)),
    )
  ) {
    return;
  }

  const { categoryIds, categoryNames } = await resolveCategorySelection(
    admin,
    session.organizationId,
    requestedCategoryIds,
  );
  const metadata: Record<string, string> = {};
  if (brand) metadata.brand = brand;
  if (categoryNames.length > 0) metadata.category = categoryNames.join(", ");
  if (description) metadata.description = description;

  const storage = admin.storage;

  // Snapshot old costs before updating
  const { data: oldProduct } = await admin.from("products")
    .select("cost_price")
    .eq("id", productId)
    .single();
  const { data: oldSaleUnits } = await admin.from("product_sale_units")
    .select("id, unit_label, cost_mode, fixed_cost_price, is_default")
    .eq("product_id", productId);

  const { data: existingSaleUnits } = await admin.from("product_sale_units")
    .select("id, unit_label, base_unit_quantity, is_default, sort_order")
    .eq("product_id", productId);

  await admin.from("products").update({
    cost_price: costPrice,
    metadata: metadata as Json,
    name,
    sku,
    stock_quantity: stockQuantity,
    unit: baseUnit,
  }).eq("id", productId);

  const submittedIds = new Set(saleUnits.map((saleUnit) => saleUnit.id).filter(Boolean));

  for (const [index, saleUnit] of saleUnits.entries()) {
    if (saleUnit.id) {
      await admin.from("product_sale_units").update({
        base_unit_quantity: saleUnit.baseUnitQuantity,
        cost_mode: saleUnit.costMode,
        fixed_cost_price: saleUnit.costMode === "fixed" ? saleUnit.fixedCostPrice : null,
        is_active: true,
        is_default: index === 0,
        min_order_qty: saleUnit.minOrderQty,
        sort_order: index,
        step_order_qty: saleUnit.stepOrderQty,
        unit_label: saleUnit.label,
      }).eq("id", saleUnit.id);
      continue;
    }

    await admin.from("product_sale_units").insert({
      base_unit_quantity: saleUnit.baseUnitQuantity,
      cost_mode: saleUnit.costMode,
      fixed_cost_price: saleUnit.costMode === "fixed" ? saleUnit.fixedCostPrice : null,
      is_active: true,
      is_default: index === 0,
      min_order_qty: saleUnit.minOrderQty,
      organization_id: session.organizationId,
      product_id: productId,
      sort_order: index,
      step_order_qty: saleUnit.stepOrderQty,
      unit_label: saleUnit.label,
    });
  }

  for (const existingSaleUnit of existingSaleUnits ?? []) {
    if (submittedIds.has(existingSaleUnit.id)) {
      continue;
    }

    await admin.from("product_sale_units").update({
      is_active: false,
      is_default: false,
    }).eq("id", existingSaleUnit.id);
  }

  // Log cost history for any changed values
  {
    const historyRows: Array<{
      organization_id: string;
      product_id: string;
      sale_unit_id: string | null;
      unit_label: string;
      cost_before: number | null;
      cost_after: number;
      changed_by_name: string;
    }> = [];

    const oldBaseCost = Number(oldProduct?.cost_price ?? 0);
    if (oldBaseCost !== costPrice) {
      historyRows.push({
        organization_id: session.organizationId,
        product_id: productId,
        sale_unit_id: null,
        unit_label: baseUnit,
        cost_before: oldBaseCost,
        cost_after: costPrice,
        changed_by_name: session.displayName,
      });
    }

    for (const saleUnit of saleUnits) {
      if (!saleUnit.id || saleUnit.costMode !== "fixed") continue;
      const oldUnit = (oldSaleUnits ?? []).find((u) => u.id === saleUnit.id);
      if (!oldUnit) continue;
      const oldCost = oldUnit.fixed_cost_price !== null ? Number(oldUnit.fixed_cost_price) : null;
      if (oldCost !== saleUnit.fixedCostPrice) {
        historyRows.push({
          organization_id: session.organizationId,
          product_id: productId,
          sale_unit_id: saleUnit.id,
          unit_label: saleUnit.label,
          cost_before: oldCost,
          cost_after: saleUnit.fixedCostPrice!,
          changed_by_name: session.displayName,
        });
      }
    }

    if (historyRows.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any).from("product_cost_history").insert(historyRows);
    }
  }

  await syncProductCategoryAssignments(admin, session.organizationId, productId, categoryIds);

  if (files.length > 0) {
    await ensureBucket();

    const { data: existingImages } = await admin.from("product_images")
      .select("storage_path")
      .eq("product_id", productId);

    const existingPaths = (existingImages ?? []).map((image) => image.storage_path).filter(Boolean);

    await admin.from("product_images").delete().eq("product_id", productId);

    if (existingPaths.length > 0) {
      await storage.from(PRODUCT_IMAGES_BUCKET).remove(existingPaths);
    }

    const imageRows = await uploadProductImages(storage, session.organizationId, productId, files);

    if (imageRows.length > 0) {
      await admin.from("product_images").insert(imageRows);
    }
  }

  revalidateSettingsCategorySurfaces();
}

export async function upsertProductCategory(input: {
  categoryId: string | null;
  name: string;
  productIds: string[];
}) {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as SettingsAdmin;
  const name = input.name.trim();
  const productIds = [...new Set(input.productIds.map((id) => id.trim()).filter(Boolean))];

  if (!name) {
    return { success: false as const, error: "กรุณาระบุชื่อหมวดหมู่" };
  }

  const categoriesTable = admin.from("product_categories");
  const categoryItemsTable = admin.from("product_category_items");
  const { data: movedCategoryItems } = productIds.length
    ? await categoryItemsTable
        .select("product_id")
        .eq("organization_id", session.organizationId)
        .in("product_id", productIds)
    : { data: [] as Array<{ product_id: string }> };

  let categoryId = input.categoryId;
  const { data: existingCategoryItems } = categoryId
    ? await categoryItemsTable
        .select("product_id")
        .eq("organization_id", session.organizationId)
        .eq("product_category_id", categoryId)
    : { data: [] as Array<{ product_id: string }> };

  if (categoryId) {
    const { error } = await categoriesTable
      .update({ name })
      .eq("organization_id", session.organizationId)
      .eq("id", categoryId);

    if (error) {
      return { success: false as const, error: error.message ?? "บันทึกหมวดหมู่ไม่สำเร็จ" };
    }
  } else {
    const { data, error } = await categoriesTable
      .insert({
        is_active: true,
        name,
        organization_id: session.organizationId,
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      return { success: false as const, error: error?.message ?? "สร้างหมวดหมู่ไม่สำเร็จ" };
    }

    categoryId = data.id;
  }

  await categoryItemsTable
    .delete()
    .eq("organization_id", session.organizationId)
    .eq("product_category_id", categoryId);

  if (productIds.length > 0) {
    await categoryItemsTable
      .delete()
      .eq("organization_id", session.organizationId)
      .in("product_id", productIds);

    await categoryItemsTable.insert(
      productIds.map((productId) => ({
        organization_id: session.organizationId,
        product_category_id: categoryId,
        product_id: productId,
      })),
    );
  }

  await syncCategoryMetadataForProducts(admin, session.organizationId, [
    ...productIds,
    ...((existingCategoryItems ?? []) as Array<{ product_id: string }>).map((row) => row.product_id),
    ...((movedCategoryItems ?? []) as Array<{ product_id: string }>).map((row) => row.product_id),
  ]);
  revalidateSettingsCategorySurfaces();

  return { success: true as const, categoryId };
}

export async function deleteProductCategory(categoryId: string) {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as SettingsAdmin;

  if (!categoryId.trim()) {
    return { success: false as const, error: "ไม่พบหมวดหมู่ที่ต้องการลบ" };
  }

  const categoryItemsTable = admin.from("product_category_items");
  const categoriesTable = admin.from("product_categories");

  const { data: existingCategoryItems } = await categoryItemsTable
    .select("product_id")
    .eq("organization_id", session.organizationId)
    .eq("product_category_id", categoryId);

  await categoryItemsTable
    .delete()
    .eq("organization_id", session.organizationId)
    .eq("product_category_id", categoryId);

  const { error } = await categoriesTable
    .delete()
    .eq("organization_id", session.organizationId)
    .eq("id", categoryId);

  if (error) {
    return { success: false as const, error: error.message ?? "ลบหมวดหมู่ไม่สำเร็จ" };
  }

  await syncCategoryMetadataForProducts(
    admin,
    session.organizationId,
    ((existingCategoryItems ?? []) as Array<{ product_id: string }>).map((row) => row.product_id),
  );
  revalidateSettingsCategorySurfaces();

  return { success: true as const };
}

export async function setProductActive(formData: FormData) {
  await requireAppRole("admin");
  const admin = getSupabaseAdmin() as SettingsAdmin;
  const productId = safeText(formData.get("productId"));
  const nextState = safeText(formData.get("nextState")) === "true";

  if (!productId) {
    return;
  }

  await admin.from("products").update({
    is_active: nextState,
  }).eq("id", productId);

  revalidatePath("/dashboard/settings", "layout");
}

export async function deleteProduct(formData: FormData) {
  await requireAppRole("admin");
  const admin = getSupabaseAdmin() as SettingsAdmin;
  const productId = safeText(formData.get("productId"));

  if (!productId) {
    return;
  }

  await admin.from("products").delete().eq("id", productId);

  revalidatePath("/dashboard/settings", "layout");
}

export type ProductCostHistoryRow = {
  id: string;
  unit_label: string;
  sale_unit_id: string | null;
  cost_before: number | null;
  cost_after: number;
  changed_by_name: string | null;
  changed_at: string;
};

export async function fetchProductCostHistory(productId: string): Promise<ProductCostHistoryRow[]> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .from("product_cost_history")
    .select("id, unit_label, sale_unit_id, cost_before, cost_after, changed_by_name, changed_at")
    .eq("organization_id", session.organizationId)
    .eq("product_id", productId)
    .order("changed_at", { ascending: false })
    .limit(50);

  return (data ?? []) as ProductCostHistoryRow[];
}
