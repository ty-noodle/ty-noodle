import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const rootDir = process.cwd();

function loadEnvFile(filename) {
  const filePath = resolve(rootDir, filename);
  if (!existsSync(filePath)) return;
  const contents = readFileSync(filePath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!process.env[key]) process.env[key] = rawValue;
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function fetchAllActiveOrders() {
  const pageSize = 1000;
  let from = 0;
  const all = [];

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
    .from("orders")
      .select(
        "id, organization_id, customer_id, order_date, notes, status, order_number, created_at, placed_by_user_id",
      )
      .neq("status", "cancelled")
      .order("created_at", { ascending: true })
      .range(from, to);

    if (error) throw new Error(`Fetch orders failed: ${error.message}`);
    if (!data || data.length === 0) break;

    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

async function backfillMissingDeliveryNotes() {
  console.log("Starting backfill: missing delivery_notes ...");

  const orders = await fetchAllActiveOrders();
  if (orders.length === 0) {
    console.log("No active orders found.");
    return;
  }

  const orderIds = orders.map((o) => o.id);
  const orderItemsByOrderId = new Map();
  const coveredOrderIds = new Set();

  for (const idChunk of chunkArray(orderIds, 500)) {
    const [{ data: orderItems, error: orderItemsError }, { data: dnItems, error: dnItemsError }] =
      await Promise.all([
        supabase
          .from("order_items")
          .select(
            "id, order_id, product_id, product_sale_unit_id, quantity, quantity_in_base_unit, sale_unit_label, sale_unit_ratio, unit_price",
          )
          .in("order_id", idChunk),
        supabase.from("delivery_note_items").select("order_item_id"),
      ]);

    if (orderItemsError) throw new Error(`Fetch order_items failed: ${orderItemsError.message}`);
    if (dnItemsError) throw new Error(`Fetch delivery_note_items failed: ${dnItemsError.message}`);

    for (const row of orderItems ?? []) {
      const list = orderItemsByOrderId.get(row.order_id) ?? [];
      list.push(row);
      orderItemsByOrderId.set(row.order_id, list);
    }
    const orderIdByItemId = new Map((orderItems ?? []).map((item) => [String(item.id), String(item.order_id)]));
    for (const row of dnItems ?? []) {
      const mappedOrderId = row.order_item_id ? orderIdByItemId.get(String(row.order_item_id)) : null;
      if (mappedOrderId) coveredOrderIds.add(mappedOrderId);
    }
  }

  const missingOrders = orders.filter((order) => {
    const items = orderItemsByOrderId.get(order.id) ?? [];
    if (items.length === 0) return false;
    return !coveredOrderIds.has(order.id);
  });

  console.log(`Active orders: ${orders.length}`);
  console.log(`Missing delivery-note coverage: ${missingOrders.length}`);

  if (missingOrders.length === 0) {
    console.log("Nothing to backfill.");
    return;
  }

  const groups = new Map();
  for (const order of missingOrders) {
    const key = `${order.organization_id}|${order.customer_id}|${order.order_date}`;
    const list = groups.get(key) ?? [];
    list.push(order);
    groups.set(key, list);
  }

  let groupsProcessed = 0;
  let ordersProcessed = 0;
  let groupsFailed = 0;
  const failures = [];

  for (const [key, groupOrders] of groups.entries()) {
    const [organizationId, customerId, orderDate] = key.split("|");

    const sortedOrders = [...groupOrders].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const missingOrderIds = sortedOrders.map((o) => o.id);

    const allItems = missingOrderIds.flatMap((orderId) => orderItemsByOrderId.get(orderId) ?? []);
    if (allItems.length === 0) continue;

    const { data: customerRow, error: customerError } = await supabase
      .from("customers")
      .select("default_vehicle_id")
      .eq("id", customerId)
      .maybeSingle();
    if (customerError) {
      groupsFailed += 1;
      failures.push(`${key}: customer lookup failed (${customerError.message})`);
      continue;
    }

    let userId =
      process.env.BACKFILL_USER_ID ??
      process.env.SUPABASE_SEED_USER_ID ??
      sortedOrders.find((order) => order.placed_by_user_id)?.placed_by_user_id ??
      null;

    if (!userId) {
      const { data: fallbackDnUser } = await supabase
        .from("delivery_notes")
        .select("created_by")
        .eq("organization_id", organizationId)
        .not("created_by", "is", null)
        .limit(1)
        .maybeSingle();
      userId = fallbackDnUser?.created_by ?? null;
    }

    if (!userId) {
      const { data: fallbackMovementUser } = await supabase
        .from("inventory_movements")
        .select("created_by")
        .eq("organization_id", organizationId)
        .not("created_by", "is", null)
        .limit(1)
        .maybeSingle();
      userId = fallbackMovementUser?.created_by ?? null;
    }

    if (!userId) {
      throw new Error("Missing BACKFILL_USER_ID (or SUPABASE_SEED_USER_ID) in environment.");
    }

    const mergedNotes = sortedOrders
      .map((o) => String(o.notes ?? "").trim())
      .filter(Boolean)
      .reduce((acc, cur) => {
        if (!acc) return cur;
        if (acc.includes(cur)) return acc;
        return `${acc} / ${cur}`;
      }, "");

    const payloadItems = allItems.map((item) => ({
      orderItemId: item.id,
      productId: item.product_id,
      productSaleUnitId: item.product_sale_unit_id,
      quantityDelivered: Number(item.quantity),
      saleUnitLabel: item.sale_unit_label,
      saleUnitRatio: Number(item.sale_unit_ratio),
      unitPrice: Number(item.unit_price),
    }));

    const { data: deliveryNumber, error: createError } = await supabase.rpc("create_store_delivery_note", {
      p_organization_id: organizationId,
      p_order_ids: missingOrderIds,
      p_customer_id: customerId,
      p_vehicle_id: customerRow?.default_vehicle_id ?? null,
      p_delivery_date: orderDate,
      p_notes: mergedNotes || null,
      p_created_by: userId,
      p_items: payloadItems,
    });

    if (createError) {
      groupsFailed += 1;
      failures.push(`${key}: create_store_delivery_note failed (${createError.message})`);
      continue;
    }

    const dn = String(deliveryNumber ?? "").trim();
    if (!dn) {
      groupsFailed += 1;
      failures.push(`${key}: create_store_delivery_note returned empty delivery number`);
      continue;
    }

    const { error: updateOrdersError } = await supabase
      .from("orders")
      .update({ order_number: dn })
      .in("id", missingOrderIds);

    if (updateOrdersError) {
      groupsFailed += 1;
      failures.push(`${key}: update orders.order_number failed (${updateOrdersError.message})`);
      continue;
    }

    groupsProcessed += 1;
    ordersProcessed += missingOrderIds.length;
    console.log(`OK ${key} -> ${dn} (${missingOrderIds.length} orders)`);
  }

  console.log("Backfill completed.");
  console.log(`Groups processed: ${groupsProcessed}`);
  console.log(`Orders processed: ${ordersProcessed}`);
  console.log(`Groups failed: ${groupsFailed}`);

  if (failures.length > 0) {
    console.log("Failures:");
    for (const failure of failures) {
      console.log(` - ${failure}`);
    }
  }
}

backfillMissingDeliveryNotes().catch((error) => {
  console.error(error);
  process.exit(1);
});
