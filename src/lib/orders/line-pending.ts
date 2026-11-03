import "server-only";

import { revalidatePath, revalidateTag, updateTag } from "next/cache";
import { getEffectiveSaleUnitCost, normalizeSaleUnitCostMode } from "@/lib/products/sale-unit-cost";
import { generateUploadAndNotifyCustomerReceiptImage } from "@/lib/line/customer-receipt-image";
import { mergeItemsIntoOrder, type MergeableOrderItemInput } from "@/lib/orders/merge-order-items";
import { syncDeliveryNoteForOrder } from "@/lib/orders/sync-delivery-note";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type QueryError = { message?: string } | null;
type QueryMany<T> = Promise<{ data: T[] | null; error: QueryError }>;
type QuerySingle<T> = Promise<{ data: T | null; error: QueryError }>;

type GenericSelect<T> = {
  eq: (column: string, value: string | number | boolean) => GenericSelect<T>;
  gte: (column: string, value: string | number) => GenericSelect<T>;
  lte: (column: string, value: string | number) => GenericSelect<T>;
  in: (column: string, values: string[]) => GenericSelect<T>;
  order: (column: string, options: { ascending: boolean }) => GenericSelect<T>;
  select: (columns: string) => GenericSelect<T>;
  limit: (count: number) => GenericSelect<T>;
  maybeSingle: () => QuerySingle<T>;
  single: () => QuerySingle<T>;
  then: QueryMany<T>["then"];
};

type GenericMutation<T> = {
  eq: (column: string, value: string | number | boolean) => GenericMutation<T>;
  select: (columns: string) => { single: () => QuerySingle<T> };
  then: QueryMany<T>["then"];
};

type GenericTable<T> = {
  insert: (values: Record<string, unknown> | Record<string, unknown>[]) => GenericMutation<T>;
  select: (columns: string) => GenericSelect<T>;
  update: (values: Record<string, unknown>) => GenericMutation<T>;
  upsert: (
    values: Record<string, unknown>,
    options: { onConflict: string },
  ) => GenericMutation<T>;
};

type GenericRpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: QueryError }>;

type GenericAdmin = {
  from: <T>(table: string) => GenericTable<T>;
  rpc: GenericRpc;
};

type LineOrderCustomerRow = {
  customer_id: string | null;
  id: string;
  line_display_name: string | null;
  line_picture_url: string | null;
  line_user_id: string;
  organization_id: string;
};

type CustomerRow = {
  customer_code: string | null;
  default_vehicle_id: string | null;
  id: string;
  line_user_id: string | null;
  metadata: unknown;
  name: string;
  organization_id: string;
};

type PendingOrderRow = {
  converted_order_id: string | null;
  created_at: string;
  id: string;
  line_display_name: string | null;
  line_order_customer_id: string;
  line_picture_url: string | null;
  line_user_id: string;
  order_date: string;
  status: "pending_link" | "converted" | "cancelled";
};

function invalidateOrderCaches(organizationId: string) {
  revalidateTag(`orders-${organizationId}`, "max");
  revalidateTag(`settings-${organizationId}`, "max");
  revalidateTag(`stock-${organizationId}`, "max");
  updateTag(`orders-${organizationId}`);
  updateTag(`settings-${organizationId}`);
  updateTag(`stock-${organizationId}`);
}

type PendingItemRow = {
  id: string;
  pending_order_id: string;
  product_id: string;
  product_sale_unit_id: string;
  quantity: number | string;
  quantity_in_base_unit: number | string;
  sale_unit_label: string;
  sale_unit_ratio: number | string;
  sort_order: number;
};

type ProductRow = {
  cost_price: number | string;
  id: string;
  name: string;
  reserved_quantity: number | string;
  sku: string;
  stock_quantity: number | string;
  unit: string;
};

type SaleUnitRow = {
  base_unit_quantity: number | string;
  cost_mode: string | null;
  fixed_cost_price: number | string | null;
  id: string;
  product_id: string;
  unit_label: string;
};

type PriceRow = {
  product_id: string;
  product_sale_unit_id: string | null;
  sale_price: number | string;
};

type NewOrderRow = {
  created_at: string;
  id: string;
  order_date: string;
  order_number: string;
};

export type PendingLineOrderItem = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  saleUnitLabel: string;
  sku: string;
};

export type PendingLineOrderListItem = {
  createdAt: string;
  id: string;
  items: PendingLineOrderItem[];
  lineDisplayName: string;
  linePictureUrl: string | null;
  lineUserId: string;
  orderDate: string;
};

export type PendingOrderCreateItem = {
  productId: string;
  productSaleUnitId: string;
  quantity: number;
};

function getAdmin() {
  return getSupabaseAdmin() as unknown as GenericAdmin;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function mergeLineProfileMetadata(
  metadata: unknown,
  profile: { displayName: string | null; pictureUrl: string | null },
) {
  const current = isRecord(metadata) ? { ...metadata } : {};
  const currentLineProfile = isRecord(current.lineProfile) ? current.lineProfile : {};
  const nextLineProfile = { ...currentLineProfile };
  if (profile.displayName) {
    nextLineProfile.displayName = profile.displayName;
  }
  if (profile.pictureUrl) {
    nextLineProfile.pictureUrl = profile.pictureUrl;
  }

  if (!profile.displayName && !profile.pictureUrl && Object.keys(currentLineProfile).length === 0) {
    return current;
  }

  return {
    ...current,
    lineProfile: {
      ...nextLineProfile,
      syncedAt: new Date().toISOString(),
    },
  };
}

function removeLineProfileMetadata(metadata: unknown) {
  const current = isRecord(metadata) ? { ...metadata } : {};
  delete current.lineProfile;
  return current;
}

export async function getLinkedCustomerByLineUserId(
  organizationId: string,
  lineUserId: string,
) {
  const admin = getAdmin();
  const { data: lineCustomer } = await admin
    .from<LineOrderCustomerRow>("line_order_customers")
    .select("id, organization_id, line_user_id, line_display_name, line_picture_url, customer_id")
    .eq("organization_id", organizationId)
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (lineCustomer?.customer_id) {
    const { data: mappedCustomer } = await admin
      .from<CustomerRow>("customers")
      .select("id, name, customer_code, organization_id, line_user_id, metadata")
      .eq("organization_id", organizationId)
      .eq("id", lineCustomer.customer_id)
      .eq("is_active", true)
      .maybeSingle();

    if (mappedCustomer) {
      return mappedCustomer;
    }
  }

  const { data: legacyCustomer } = await admin
    .from<CustomerRow>("customers")
    .select("id, name, customer_code, organization_id, line_user_id, metadata")
    .eq("organization_id", organizationId)
    .eq("line_user_id", lineUserId)
    .eq("is_active", true)
    .maybeSingle();

  return legacyCustomer;
}

export async function ensureLineOrderCustomer(input: {
  displayName?: string | null;
  lineUserId: string;
  organizationId: string;
  pictureUrl?: string | null;
}) {
  const admin = getAdmin();
  const displayName = optionalText(input.displayName);
  const pictureUrl = optionalText(input.pictureUrl);
  const linkedCustomer = await getLinkedCustomerByLineUserId(
    input.organizationId,
    input.lineUserId,
  );
  const { data: existingLineCustomer } = await admin
    .from<LineOrderCustomerRow>("line_order_customers")
    .select("id, organization_id, line_user_id, line_display_name, line_picture_url, customer_id")
    .eq("organization_id", input.organizationId)
    .eq("line_user_id", input.lineUserId)
    .maybeSingle();

  const { data, error } = await admin
    .from<LineOrderCustomerRow>("line_order_customers")
    .upsert(
      {
        customer_id: linkedCustomer?.id ?? null,
        line_display_name: displayName ?? optionalText(existingLineCustomer?.line_display_name),
        line_picture_url: pictureUrl ?? optionalText(existingLineCustomer?.line_picture_url),
        line_user_id: input.lineUserId,
        onboarding_choice: "existing",
        organization_id: input.organizationId,
      },
      { onConflict: "organization_id,line_user_id" },
    )
    .select("id, organization_id, line_user_id, line_display_name, line_picture_url, customer_id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to prepare LINE customer.");
  }

  return {
    customer: linkedCustomer,
    lineCustomer: data,
  };
}

export async function hasExistingLineOrderCustomerChoice(
  organizationId: string,
  lineUserId: string,
) {
  const admin = getAdmin();
  const { data } = await admin
    .from<LineOrderCustomerRow>("line_order_customers")
    .select("id, organization_id, line_user_id, line_display_name, line_picture_url, customer_id")
    .eq("organization_id", organizationId)
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  return Boolean(data);
}

export async function createPendingLineOrder(input: {
  displayName?: string | null;
  items: PendingOrderCreateItem[];
  lineUserId: string;
  organizationId: string;
  pictureUrl?: string | null;
}) {
  const admin = getAdmin();
  const { customer, lineCustomer } = await ensureLineOrderCustomer(input);

  if (customer) {
    return {
      linkedCustomer: customer,
      pendingOrderId: null,
    };
  }

  const productSaleUnitIds = Array.from(new Set(input.items.map((item) => item.productSaleUnitId)));
  const { data: saleUnits, error: saleUnitError } = await admin
    .from<SaleUnitRow>("product_sale_units")
    .select("id, product_id, unit_label, base_unit_quantity, cost_mode, fixed_cost_price")
    .eq("organization_id", input.organizationId)
    .eq("is_active", true)
    .in("id", productSaleUnitIds);

  if (saleUnitError || !saleUnits) {
    throw new Error(saleUnitError?.message ?? "Failed to load sale units.");
  }

  const saleUnitById = new Map(saleUnits.map((saleUnit) => [saleUnit.id, saleUnit]));
  for (const item of input.items) {
    const saleUnit = saleUnitById.get(item.productSaleUnitId);
    if (!saleUnit || saleUnit.product_id !== item.productId) {
      throw new Error("รายการสินค้าที่ส่งมาไม่ถูกต้อง");
    }
  }

  const { data: pendingOrder, error: pendingError } = await admin
    .from<PendingOrderRow>("line_pending_orders")
    .insert({
      line_display_name: optionalText(input.displayName),
      line_order_customer_id: lineCustomer.id,
      line_picture_url: optionalText(input.pictureUrl),
      line_user_id: input.lineUserId,
      organization_id: input.organizationId,
      status: "pending_link",
    })
    .select("id, line_order_customer_id, line_user_id, line_display_name, line_picture_url, order_date, created_at, status, converted_order_id")
    .single();

  if (pendingError || !pendingOrder) {
    throw new Error(pendingError?.message ?? "Failed to create pending order.");
  }

  const itemPayload = input.items.map((item, index) => {
    const saleUnit = saleUnitById.get(item.productSaleUnitId);
    const ratio = Number(saleUnit?.base_unit_quantity ?? 1) || 1;
    return {
      organization_id: input.organizationId,
      pending_order_id: pendingOrder.id,
      product_id: item.productId,
      product_sale_unit_id: item.productSaleUnitId,
      quantity: item.quantity,
      quantity_in_base_unit: item.quantity * ratio,
      sale_unit_label: saleUnit?.unit_label ?? "-",
      sale_unit_ratio: ratio,
      sort_order: index,
    };
  });

  const { error: itemError } = await admin
    .from<PendingItemRow>("line_pending_order_items")
    .insert(itemPayload);

  if (itemError) {
    await admin
      .from<PendingOrderRow>("line_pending_orders")
      .update({ status: "cancelled" })
      .eq("id", pendingOrder.id);
    throw new Error(itemError.message ?? "Failed to create pending order items.");
  }

  revalidatePath("/orders/incoming");
  invalidateOrderCaches(input.organizationId);

  return {
    linkedCustomer: null,
    pendingOrderId: pendingOrder.id,
  };
}

export async function getPendingLineOrders(
  organizationId: string,
  opts: { orderDate: string; endDate?: string; searchTerm?: string },
): Promise<PendingLineOrderListItem[]> {
  const admin = getAdmin();
  let query = admin
    .from<PendingOrderRow>("line_pending_orders")
    .select(
      "id, line_order_customer_id, line_user_id, line_display_name, line_picture_url, order_date, created_at, status, converted_order_id",
    )
    .eq("organization_id", organizationId)
    .eq("status", "pending_link");

  // If searchTerm is provided, search across all dates (Global Search)
  if (!opts.searchTerm) {
    if (opts.endDate && opts.endDate !== opts.orderDate) {
      query = query.gte("order_date", opts.orderDate).lte("order_date", opts.endDate);
    } else {
      query = query.eq("order_date", opts.orderDate);
    }
  } else {
    // Limit global search for performance
    query = query.limit(50);
  }

  const { data: pendingOrders, error } = await query.order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message ?? "Failed to load pending LINE orders.");
  }

  const rows = pendingOrders ?? [];
  if (rows.length === 0) {
    return [];
  }

  const pendingIds = rows.map((row) => row.id);
  const { data: items } = await admin
    .from<PendingItemRow>("line_pending_order_items")
    .select("id, pending_order_id, product_id, product_sale_unit_id, sale_unit_label, sale_unit_ratio, quantity, quantity_in_base_unit, sort_order")
    .in("pending_order_id", pendingIds)
    .order("sort_order", { ascending: true });

  const productIds = Array.from(new Set((items ?? []).map((item) => item.product_id)));
  const { data: products } = productIds.length
    ? await admin
        .from<ProductRow>("products")
        .select("id, name, sku, unit, cost_price, reserved_quantity, stock_quantity")
        .in("id", productIds)
    : { data: [] as ProductRow[] | null };

  const productById = new Map((products ?? []).map((product) => [product.id, product]));
  const itemsByPendingId = new Map<string, PendingLineOrderItem[]>();
  for (const item of items ?? []) {
    const product = productById.get(item.product_id);
    const list = itemsByPendingId.get(item.pending_order_id) ?? [];
    list.push({
      id: item.id,
      productId: item.product_id,
      productName: product?.name ?? "-",
      quantity: Number(item.quantity) || 0,
      saleUnitLabel: product?.unit ?? item.sale_unit_label,
      sku: product?.sku ?? "-",
    });
    itemsByPendingId.set(item.pending_order_id, list);
  }

  const search = opts.searchTerm?.trim().toLocaleLowerCase("th") ?? "";
  return rows
    .map((row) => ({
      createdAt: row.created_at,
      id: row.id,
      items: itemsByPendingId.get(row.id) ?? [],
      lineDisplayName: row.line_display_name || "ลูกค้า LINE",
      linePictureUrl: row.line_picture_url,
      lineUserId: row.line_user_id,
      orderDate: row.order_date,
    }))
    .filter((row) => {
      if (!search) return true;
      return [
        row.lineDisplayName,
        row.lineUserId,
        ...row.items.flatMap((item) => [item.productName, item.sku]),
      ].some((value) => value.toLocaleLowerCase("th").includes(search));
    });
}

async function convertSinglePendingOrder(input: {
  admin: GenericAdmin;
  customer: CustomerRow;
  lineUserId: string;
  order: PendingOrderRow;
  organizationId: string;
  userId: string;
}) {
  const { data: items } = await input.admin
    .from<PendingItemRow>("line_pending_order_items")
    .select("id, pending_order_id, product_id, product_sale_unit_id, sale_unit_label, sale_unit_ratio, quantity, quantity_in_base_unit, sort_order")
    .eq("pending_order_id", input.order.id)
    .order("sort_order", { ascending: true });

  const pendingItems = items ?? [];
  if (pendingItems.length === 0) {
    return null;
  }

  const productIds = Array.from(new Set(pendingItems.map((item) => item.product_id)));
  const saleUnitIds = Array.from(new Set(pendingItems.map((item) => item.product_sale_unit_id)));
  const [{ data: products }, { data: saleUnits }, { data: prices }] = await Promise.all([
    input.admin
      .from<ProductRow>("products")
      .select("id, name, sku, unit, cost_price, reserved_quantity, stock_quantity")
      .in("id", productIds),
    input.admin
      .from<SaleUnitRow>("product_sale_units")
      .select("id, product_id, unit_label, base_unit_quantity, cost_mode, fixed_cost_price")
      .in("id", saleUnitIds),
    input.admin
      .from<PriceRow>("customer_product_prices")
      .select("product_id, product_sale_unit_id, sale_price")
      .eq("organization_id", input.organizationId)
      .eq("customer_id", input.customer.id)
      .in("product_sale_unit_id", saleUnitIds),
  ]);

  const productById = new Map((products ?? []).map((product) => [product.id, product]));
  const saleUnitById = new Map((saleUnits ?? []).map((saleUnit) => [saleUnit.id, saleUnit]));
  const priceBySaleUnitId = new Map(
    (prices ?? []).map((price) => [price.product_sale_unit_id ?? price.product_id, Number(price.sale_price)]),
  );

  const orderItems: MergeableOrderItemInput[] = pendingItems.map((item) => {
    const product = productById.get(item.product_id);
    const saleUnit = saleUnitById.get(item.product_sale_unit_id);
    const unitPrice = priceBySaleUnitId.get(item.product_sale_unit_id) ?? 0;
    const ratio = Number(saleUnit?.base_unit_quantity ?? item.sale_unit_ratio ?? 1) || 1;
    const quantity = Number(item.quantity) || 0;
    const costPrice = getEffectiveSaleUnitCost({
      baseCostPrice: Number(product?.cost_price ?? 0),
      baseUnitQuantity: ratio,
      costMode: normalizeSaleUnitCostMode(String(saleUnit?.cost_mode ?? "derived")),
      fixedCostPrice:
        saleUnit?.fixed_cost_price === null || saleUnit?.fixed_cost_price === undefined
          ? null
          : Number(saleUnit.fixed_cost_price),
    });

    return {
      costPrice,
      productId: item.product_id,
      productSaleUnitId: item.product_sale_unit_id,
      quantity,
      quantityInBaseUnit: quantity * ratio,
      saleUnitLabel: product?.unit ?? item.sale_unit_label,
      saleUnitRatio: ratio,
      unitPrice,
    };
  });

  const totalAmount = orderItems.reduce(
    (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice),
    0,
  );
  const { data: existingOrderRows, error: existingOrderError } = await input.admin
    .from<NewOrderRow & { status: string; subtotal_amount: number | string | null; total_amount: number | string | null }>("orders")
    .select("id, order_number, order_date, created_at, status, subtotal_amount, total_amount")
    .eq("customer_id", input.customer.id)
    .eq("order_date", input.order.order_date)
    .order("created_at", { ascending: true });

  if (existingOrderError) {
    throw new Error(existingOrderError.message ?? "ไม่สามารถตรวจสอบออเดอร์เดิมได้");
  }

  const existingOrder = (existingOrderRows ?? []).find((row) => row.status !== "cancelled") ?? null;

  let targetOrder: NewOrderRow;

  if (!existingOrder) {
    const { data: orderNumber, error: orderNumberError } = await input.admin.rpc("next_order_number", {
      p_order_date: input.order.order_date,
      p_organization_id: input.organizationId,
    });

    if (orderNumberError || !orderNumber) {
      throw new Error(orderNumberError?.message ?? "ไม่สามารถสร้างเลขออเดอร์ได้");
    }

    const { data: newOrder, error: orderError } = await input.admin
      .from<NewOrderRow>("orders")
      .insert({
        customer_id: input.customer.id,
        fulfillment_status: "pending",
        metadata: {
          linePendingOrderId: input.order.id,
          lineUserId: input.lineUserId,
          source: "line_pending",
        },
        order_date: input.order.order_date,
        order_number: String(orderNumber),
        organization_id: input.organizationId,
        placed_by_user_id: input.userId,
        status: "submitted",
        subtotal_amount: totalAmount,
        total_amount: totalAmount,
      })
      .select("id, order_number, order_date, created_at")
      .single();

    if (orderError || !newOrder) {
      throw new Error(orderError?.message ?? "ไม่สามารถสร้างออเดอร์ได้");
    }

    targetOrder = newOrder;
  } else {
    const { error: updateOrderError } = await input.admin
      .from<NewOrderRow>("orders")
      .update({
        subtotal_amount: Number(existingOrder.subtotal_amount ?? 0) + totalAmount,
        total_amount: Number(existingOrder.total_amount ?? 0) + totalAmount,
      })
      .eq("id", existingOrder.id);

    if (updateOrderError) {
      throw new Error(updateOrderError.message ?? "ไม่สามารถอัปเดตออเดอร์เดิมได้");
    }

    targetOrder = {
      id: existingOrder.id,
      order_number: existingOrder.order_number,
      order_date: existingOrder.order_date,
      created_at: existingOrder.created_at,
    };
  }

  const mergeResult = await mergeItemsIntoOrder(input.admin as never, {
    items: orderItems,
    orderId: targetOrder.id,
    organizationId: input.organizationId,
  });

  if ("error" in mergeResult) {
    throw new Error(mergeResult.error);
  }

  const { data: finalItems, error: finalItemsError } = await input.admin
    .from("order_items")
    .select("product_id, sale_unit_label, quantity, unit_price, line_total")
    .eq("order_id", targetOrder.id)
    .order("created_at", { ascending: true });

  if (finalItemsError) {
    throw new Error(finalItemsError.message ?? "ไม่สามารถคำนวณยอดรวมออเดอร์ได้");
  }

  const finalTotal = (
    (finalItems ?? []) as {
      product_id: string;
      sale_unit_label: string;
      quantity: number | string | null;
      unit_price: number | string | null;
      line_total: number | string | null;
    }[]
  ).reduce((sum, item) => sum + Number(item.line_total ?? 0), 0);
  const { error: finalTotalUpdateError } = await input.admin
    .from<NewOrderRow>("orders")
    .update({
      subtotal_amount: finalTotal,
      total_amount: finalTotal,
    })
    .eq("id", targetOrder.id);

  if (finalTotalUpdateError) {
    throw new Error(finalTotalUpdateError.message ?? "ไม่สามารถอัปเดตยอดรวมออเดอร์ได้");
  }

  const syncResult = await syncDeliveryNoteForOrder(input.admin as never, {
    orderId: targetOrder.id,
    organizationId: input.organizationId,
    userId: input.userId,
  });

  if ("error" in syncResult) {
    throw new Error(syncResult.error);
  }
  const syncedDeliveryNumber = String(syncResult.deliveryNumber);
  const { error: updateOrderNumberError } = await input.admin
    .from<NewOrderRow>("orders")
    .update({ order_number: syncedDeliveryNumber })
    .eq("id", targetOrder.id);
  if (updateOrderNumberError) {
    throw new Error(updateOrderNumberError.message ?? "ไม่สามารถอัปเดตเลขใบจัดส่งในออเดอร์ได้");
  }
  targetOrder = {
    ...targetOrder,
    order_number: syncedDeliveryNumber,
  };

  const finalProductIds = Array.from(
    new Set(
      ((finalItems ?? []) as { product_id: string }[])
        .map((item) => item.product_id)
        .filter(Boolean),
    ),
  );

  const { data: finalProducts } = finalProductIds.length
    ? await input.admin
        .from<ProductRow>("products")
        .select("id, name")
        .in("id", finalProductIds)
    : { data: [] as ProductRow[] | null };

  const finalProductMap = new Map((finalProducts ?? []).map((p) => [p.id, p]));

  const finalReceiptItems = ((finalItems ?? []) as {
    product_id: string;
    sale_unit_label: string;
    quantity: number | string | null;
    unit_price: number | string | null;
    line_total: number | string | null;
  }[]).map((item) => ({
    lineTotal: Number(item.line_total ?? 0),
    name: finalProductMap.get(item.product_id)?.name ?? "-",
    quantity: Number(item.quantity) || 0,
    saleUnitLabel: item.sale_unit_label,
    unitPrice: Number(item.unit_price ?? 0),
  }));

  await input.admin
    .from<PendingOrderRow>("line_pending_orders")
    .update({
      converted_customer_id: input.customer.id,
      converted_order_id: targetOrder.id,
      status: "converted",
    })
    .eq("id", input.order.id);

  return {
    orderNumber: targetOrder.order_number,
    receiptPayload: {
      customerName: input.customer.name,
      items: finalReceiptItems,
      lineUserId: input.lineUserId,
      orderDate: targetOrder.order_date,
      orderNumber: targetOrder.order_number,
      organizationId: input.organizationId,
      totalAmount: finalTotal,
    },
  };
}

export async function linkLineCustomerAndConvertPendingOrders(input: {
  customerId: string;
  organizationId: string;
  pendingOrderId: string;
  userId: string;
}) {
  const admin = getAdmin();
  const { data: pendingOrder } = await admin
    .from<PendingOrderRow>("line_pending_orders")
    .select("id, line_order_customer_id, line_user_id, line_display_name, line_picture_url, order_date, created_at, status, converted_order_id")
    .eq("organization_id", input.organizationId)
    .eq("id", input.pendingOrderId)
    .eq("status", "pending_link")
    .maybeSingle();

  if (!pendingOrder) {
    return { error: "ไม่พบรายการที่รอผูกลูกค้า" };
  }

  const [{ data: customer }, { data: existingLinkedCustomer }] = await Promise.all([
    admin
      .from<CustomerRow>("customers")
      .select("id, name, customer_code, organization_id, line_user_id, metadata, default_vehicle_id")
      .eq("organization_id", input.organizationId)
      .eq("id", input.customerId)
      .eq("is_active", true)
      .maybeSingle(),
    admin
      .from<CustomerRow>("customers")
      .select("id, name, customer_code, organization_id, line_user_id, metadata, default_vehicle_id")
      .eq("organization_id", input.organizationId)
      .eq("line_user_id", pendingOrder.line_user_id)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  if (!customer) {
    return { error: "ไม่พบร้านค้าที่ต้องการผูก" };
  }

  if (existingLinkedCustomer && existingLinkedCustomer.id !== customer.id) {
    return { error: `LINE นี้ถูกผูกกับร้าน ${existingLinkedCustomer.name} แล้ว` };
  }

  const nextMetadata = mergeLineProfileMetadata(customer.metadata, {
    displayName: pendingOrder.line_display_name,
    pictureUrl: pendingOrder.line_picture_url,
  });
  const { data: staleLinkedCustomers } = await admin
    .from<CustomerRow>("customers")
    .select("id, name, customer_code, organization_id, line_user_id, metadata")
    .eq("organization_id", input.organizationId)
    .eq("line_user_id", pendingOrder.line_user_id);
  const customersToUnlink = (staleLinkedCustomers ?? []).filter(
    (row) => row.id !== customer.id,
  );

  await Promise.all([
    ...customersToUnlink.map((row) =>
      admin
        .from<CustomerRow>("customers")
        .update({
          line_user_id: null,
          metadata: removeLineProfileMetadata(row.metadata),
        })
        .eq("id", row.id)
        .eq("organization_id", input.organizationId),
    ),
    admin
      .from<CustomerRow>("customers")
      .update({
        line_user_id: pendingOrder.line_user_id,
        metadata: nextMetadata,
      })
      .eq("id", customer.id)
      .eq("organization_id", input.organizationId),
    admin
      .from<LineOrderCustomerRow>("line_order_customers")
      .update({ customer_id: customer.id })
      .eq("organization_id", input.organizationId)
      .eq("line_user_id", pendingOrder.line_user_id),
  ]);

  const { data: allPendingOrders } = await admin
    .from<PendingOrderRow>("line_pending_orders")
    .select("id, line_order_customer_id, line_user_id, line_display_name, line_picture_url, order_date, created_at, status, converted_order_id")
    .eq("organization_id", input.organizationId)
    .eq("line_user_id", pendingOrder.line_user_id)
    .eq("status", "pending_link")
    .order("created_at", { ascending: true });

  const orderNumbers: string[] = [];
  const receiptJobs: Promise<{ orderNumber: string; receiptError: string | null }>[] = [];

  for (const order of allPendingOrders ?? []) {
    const convertedOrder = await convertSinglePendingOrder({
      admin,
      customer,
      lineUserId: pendingOrder.line_user_id,
      order,
      organizationId: input.organizationId,
      userId: input.userId,
    });
    if (convertedOrder) {
      orderNumbers.push(convertedOrder.orderNumber);
      
      const payload = convertedOrder.receiptPayload;
      receiptJobs.push(
        (async () => {
          let receiptError: string | null = null;
          try {
            const receiptResult = await generateUploadAndNotifyCustomerReceiptImage(payload);
            if ("error" in receiptResult) {
              receiptError = receiptResult.error;
              console.error("[line-pending:receipt-image]", {
                error: receiptResult.error,
                lineUserId: pendingOrder.line_user_id,
                orderNumber: convertedOrder.orderNumber,
              });
            }
          } catch (error) {
            receiptError = error instanceof Error ? error.message : String(error);
            console.error("[line-pending:receipt-image]", {
              error,
              lineUserId: pendingOrder.line_user_id,
              orderNumber: convertedOrder.orderNumber,
            });
          }
          return { orderNumber: convertedOrder.orderNumber, receiptError };
        })()
      );
    }
  }

  const receiptResults = await Promise.all(receiptJobs);
  const receiptErrors: string[] = [];
  for (const res of receiptResults) {
    if (res.receiptError) {
      receiptErrors.push(`${res.orderNumber}: ${res.receiptError}`);
    }
  }

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  revalidatePath("/settings/customers");
  revalidatePath("/settings/customer-data");
  invalidateOrderCaches(input.organizationId);

  return {
    customerName: customer.name,
    orderNumbers,
    receiptErrors,
    success: true as const,
  };
}

