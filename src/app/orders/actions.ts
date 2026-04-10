"use server";

import { revalidateTag } from "next/cache";
import { requireAppRole } from "@/lib/auth/authorization";
import { getEffectiveSaleUnitCost, normalizeSaleUnitCostMode } from "@/lib/products/sale-unit-cost";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type OrderActionsAdmin = ReturnType<typeof getSupabaseAdmin> & {
  from: (table: string) => unknown;
};

type SaleUnitsSelectTable = {
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      eq: (column: string, value: string) => {
        order: (
          column: string,
          options: { ascending: boolean },
        ) => Promise<{
          data: Array<{ id: string; is_default: boolean }> | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };
};

type UpsertPricesTable = {
  upsert: (
    values: unknown,
    options: { onConflict: string },
  ) => Promise<unknown>;
};

type CostSnapshotInput = {
  productId: string;
  productSaleUnitId: string | null;
};

type StorePriceInput = {
  productId: string;
  productSaleUnitId: string | null;
  salePrice: number;
};

function safeText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function safePrice(value: FormDataEntryValue | null) {
  const parsed = parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function resolveProductSaleUnitId(
  admin: OrderActionsAdmin,
  organizationId: string,
  productId: string,
  rawProductSaleUnitId: string | null,
) {
  if (rawProductSaleUnitId) {
    return rawProductSaleUnitId;
  }

  const saleUnitsTable = admin.from("product_sale_units") as unknown as SaleUnitsSelectTable;
  const { data: saleUnits, error } = await saleUnitsTable
    .select("id, is_default")
    .eq("organization_id", organizationId)
    .eq("product_id", productId)
    .order("sort_order", { ascending: true });

  if (error || !saleUnits || saleUnits.length === 0) {
    return null;
  }

  const defaultUnit = saleUnits.find((unit) => unit.is_default) ?? saleUnits[0];
  return defaultUnit.id;
}

async function backfillOrderItemPrices(
  admin: OrderActionsAdmin,
  customerId: string,
  productSaleUnitId: string,
  salePrice: number,
) {
  const { data: customerOrders } = await admin
    .from("orders")
    .select("id")
    .eq("customer_id", customerId)
    .neq("status", "cancelled");

  if (!customerOrders || customerOrders.length === 0) {
    return;
  }

  const orderIds = (customerOrders as Array<{ id: string }>).map((order) => order.id);
  const { data: unpricedItems } = await admin
    .from("order_items")
    .select("id, order_id, quantity")
    .in("order_id", orderIds)
    .eq("product_sale_unit_id", productSaleUnitId)
    .eq("unit_price", 0);

  if (!unpricedItems || unpricedItems.length === 0) {
    return;
  }

  for (const item of unpricedItems as Array<{ id: string; order_id: string; quantity: number }>) {
    await admin
      .from("order_items")
      .update({
        unit_price: salePrice,
        line_total: Number(item.quantity) * salePrice,
      })
      .eq("id", item.id);
  }

  const affectedOrderIds = [
    ...new Set((unpricedItems as Array<{ order_id: string }>).map((item) => item.order_id)),
  ];

  for (const orderId of affectedOrderIds) {
    const { data: allItems } = await admin
      .from("order_items")
      .select("line_total")
      .eq("order_id", orderId);

    const total = ((allItems as Array<{ line_total: number }>) ?? []).reduce(
      (sum, item) => sum + Number(item.line_total),
      0,
    );

    await admin
      .from("orders")
      .update({ total_amount: total, subtotal_amount: total })
      .eq("id", orderId);
  }
}

async function upsertStorePriceBatch(
  admin: OrderActionsAdmin,
  organizationId: string,
  customerId: string,
  items: StorePriceInput[],
) {
  const normalizedItems = items.filter(
    (item) => item.productId && Number.isFinite(item.salePrice) && item.salePrice >= 0,
  );

  if (normalizedItems.length === 0) {
    return;
  }

  const resolvedItems = await Promise.all(
    normalizedItems.map(async (item) => {
      const productSaleUnitId = await resolveProductSaleUnitId(
        admin,
        organizationId,
        item.productId,
        item.productSaleUnitId,
      );

      if (!productSaleUnitId) {
        return null;
      }

      return {
        customer_id: customerId,
        organization_id: organizationId,
        product_id: item.productId,
        product_sale_unit_id: productSaleUnitId,
        sale_price: item.salePrice,
      };
    }),
  );

  const upsertRows = resolvedItems.filter((item) => item !== null);
  if (upsertRows.length === 0) {
    return;
  }

  const pricesTable = admin.from("customer_product_prices") as unknown as UpsertPricesTable;
  await pricesTable.upsert(upsertRows, {
    onConflict: "organization_id,customer_id,product_sale_unit_id",
  });

  await Promise.all(
    upsertRows.map((item) =>
      backfillOrderItemPrices(admin, customerId, item.product_sale_unit_id, item.sale_price),
    ),
  );
}

export async function getStoreItemCostSnapshots(items: CostSnapshotInput[]) {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();
  const normalizedItems = items.filter((item) => item.productId);

  if (normalizedItems.length === 0) {
    return [] as Array<CostSnapshotInput & { effectiveCostPrice: number | null }>;
  }

  const productIds = Array.from(new Set(normalizedItems.map((item) => item.productId)));

  const [{ data: products }, { data: saleUnits }] = await Promise.all([
    admin
      .from("products")
      .select("id, cost_price")
      .eq("organization_id", session.organizationId)
      .in("id", productIds),
    admin
      .from("product_sale_units")
      .select("id, product_id, is_default, sort_order, base_unit_quantity, cost_mode, fixed_cost_price")
      .eq("organization_id", session.organizationId)
      .in("product_id", productIds)
      .order("sort_order", { ascending: true }),
  ]);

  const productMap = new Map(
    ((products as Array<{ cost_price: number | string; id: string }> | null) ?? []).map((product) => [
      product.id,
      Number(product.cost_price ?? 0),
    ]),
  );

  type SaleUnitRow = {
    id: string;
    product_id: string;
    is_default: boolean;
    base_unit_quantity: number;
    cost_mode: string;
    fixed_cost_price: number | null;
  };

  const saleUnitsByProduct = new Map<string, Array<SaleUnitRow>>();
  const saleUnitById = new Map<string, SaleUnitRow>();

  for (const saleUnit of (saleUnits as unknown as SaleUnitRow[] | null) ?? []) {
    saleUnitById.set(saleUnit.id, saleUnit);
    const existing = saleUnitsByProduct.get(saleUnit.product_id) ?? [];
    existing.push(saleUnit);
    saleUnitsByProduct.set(saleUnit.product_id, existing);
  }

  return normalizedItems.map((item) => {
    const productCostPrice = productMap.get(item.productId) ?? 0;
    const productSaleUnits = saleUnitsByProduct.get(item.productId) ?? [];
    const saleUnit =
      (item.productSaleUnitId ? saleUnitById.get(item.productSaleUnitId) : null) ??
      productSaleUnits.find((candidate) => candidate.is_default) ??
      productSaleUnits[0] ??
      null;

    if (!saleUnit) {
      return {
        ...item,
        effectiveCostPrice: productCostPrice,
      };
    }

    return {
      ...item,
      effectiveCostPrice: getEffectiveSaleUnitCost({
        baseCostPrice: productCostPrice,
        baseUnitQuantity: Number(saleUnit.base_unit_quantity ?? 1),
        costMode: normalizeSaleUnitCostMode(String(saleUnit.cost_mode ?? "derived")),
        fixedCostPrice:
          saleUnit.fixed_cost_price === null || saleUnit.fixed_cost_price === undefined
            ? null
            : Number(saleUnit.fixed_cost_price),
      }),
    };
  });
}

export async function setStoreItemPrice(formData: FormData): Promise<void> {
  const customerId = safeText(formData.get("customerId"));
  const productId = safeText(formData.get("productId"));
  const rawProductSaleUnitId = safeText(formData.get("productSaleUnitId"));
  const salePrice = safePrice(formData.get("salePrice"));

  if (!customerId || !productId || salePrice === null) {
    return;
  }

  await setStoreItemPrices(customerId, [
    {
      productId,
      productSaleUnitId: rawProductSaleUnitId || null,
      salePrice,
    },
  ]);
}

export async function setStoreItemPrices(
  customerId: string,
  items: StorePriceInput[],
): Promise<void> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as OrderActionsAdmin;

  if (!customerId || items.length === 0) {
    return;
  }

  await upsertStorePriceBatch(admin, session.organizationId, customerId, items);
  revalidateTag(`orders-${session.organizationId}`, "max");
}
