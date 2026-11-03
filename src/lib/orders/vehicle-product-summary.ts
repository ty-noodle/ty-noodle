import "server-only";

import { sortProductsByCategory } from "@/lib/products/sort-by-category";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type VehicleSummaryProduct = {
  id: string;
  sku: string;
  name: string;
  unit: string;
};

export type VehicleSummaryVehicle = {
  id: string | null;
  name: string;
};

export type VehicleProductSummaryData = {
  organizationName: string;
  dateLabel: string;
  products: VehicleSummaryProduct[];
  vehicles: VehicleSummaryVehicle[];
  qty: number[][];
};

type OrderRow = {
  id: string;
  customer_id: string;
  order_items: Array<{
    product_id: string;
    quantity_in_base_unit: number | string | null;
  }>;
  customers: {
    default_vehicle_id: string | null;
    vehicles: unknown;
  };
  delivery_notes: unknown;
};

type DbProduct = {
  id: string;
  name: string;
  unit: string;
  display_order: number | null;
  metadata: unknown;
  sku: string;
};

type DbCategory = {
  id: string;
  sort_order: number | string | null;
};

function getVehicleName(value: unknown) {
  if (!value) return null;
  if (Array.isArray(value)) return (value[0] as { name?: string } | undefined)?.name ?? null;
  return (value as { name?: string }).name ?? null;
}

function getPackingListProductName(name: string, metadata: unknown) {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const packingListName = (metadata as Record<string, unknown>).packing_list_name;
    if (typeof packingListName === "string" && packingListName.trim()) {
      return packingListName.trim();
    }
  }

  return name;
}

export async function getVehicleProductSummaryData(
  organizationId: string,
  date: string,
  endDate: string,
): Promise<VehicleProductSummaryData> {
  const admin = getSupabaseAdmin();

  const [ordersResult, productsResult, categoriesResult, categoryItemsResult, vehiclesResult] = await Promise.all([
    admin
      .from("orders")
      .select(`
        id,
        customer_id,
        customers!inner(default_vehicle_id, vehicles(id, name)),
        delivery_notes!order_id(vehicle_id, status, vehicles(id, name)),
        order_items(product_id, quantity_in_base_unit)
      `)
      .eq("organization_id", organizationId)
      .neq("status", "cancelled")
      .gte("order_date", date)
      .lte("order_date", endDate),
    admin
      .from("products")
      .select("id, sku, name, unit, display_order, metadata")
      .eq("organization_id", organizationId)
      .eq("is_active", true),
    admin
      .from("product_categories")
      .select("id, sort_order")
      .eq("organization_id", organizationId)
      .eq("is_active", true),
    admin
      .from("product_category_items")
      .select("product_category_id, product_id")
      .eq("organization_id", organizationId),
    admin
      .from("vehicles")
      .select("id, name")
      .eq("organization_id", organizationId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (ordersResult.error) throw new Error(ordersResult.error.message ?? "Failed to load orders for vehicle summary.");
  if (productsResult.error) throw new Error(productsResult.error.message ?? "Failed to load products for vehicle summary.");
  if (categoriesResult.error) throw new Error(categoriesResult.error.message ?? "Failed to load product categories.");
  if (categoryItemsResult.error) throw new Error(categoryItemsResult.error.message ?? "Failed to load product category items.");
  if (vehiclesResult.error) throw new Error(vehiclesResult.error.message ?? "Failed to load vehicles.");

  const categoryIdsByProductId = new Map<string, string[]>();
  for (const item of categoryItemsResult.data ?? []) {
    const current = categoryIdsByProductId.get(item.product_id) ?? [];
    current.push(item.product_category_id);
    categoryIdsByProductId.set(item.product_id, current);
  }

  const activeProducts = ((productsResult.data ?? []) as DbProduct[]).filter((product) => {
    const metadata = product.metadata && typeof product.metadata === "object" ? (product.metadata as Record<string, unknown>) : null;
    return !metadata?.deleted;
  });

  const sortedProducts = sortProductsByCategory(
    activeProducts.map((product) => ({
      id: product.id,
      name: getPackingListProductName(product.name, product.metadata),
      display_order: product.display_order !== null && product.display_order !== undefined ? Number(product.display_order) : undefined,
      categoryIds: categoryIdsByProductId.get(product.id) ?? [],
      sku: product.sku,
      unit: product.unit,
    })),
    ((categoriesResult.data ?? []) as DbCategory[]).map((category) => ({
      id: category.id,
      sortOrder: Number(category.sort_order ?? 0),
    })),
  );

  const products: VehicleSummaryProduct[] = sortedProducts.map((product) => ({
    id: product.id,
    sku: product.sku,
    name: product.name,
    unit: product.unit || "-",
  }));

  const configuredVehicles: VehicleSummaryVehicle[] = ((vehiclesResult.data ?? []) as Array<{ id: string; name: string }>).map((vehicle) => ({
    id: vehicle.id,
    name: vehicle.name,
  }));

  const orders = (ordersResult.data ?? []) as OrderRow[];
  const hasUnassignedOrders = orders.some((order) => {
    const deliveryNotes = Array.isArray(order.delivery_notes) ? order.delivery_notes : order.delivery_notes ? [order.delivery_notes] : [];
    const activeDeliveryNote = deliveryNotes.find((note: { status: string }) => note.status !== "cancelled") as { vehicle_id: string | null } | undefined;
    const vehicleId = activeDeliveryNote?.vehicle_id ?? order.customers.default_vehicle_id;
    return !vehicleId;
  });

  const vehicles: VehicleSummaryVehicle[] = hasUnassignedOrders
    ? [...configuredVehicles, { id: null, name: "ยังไม่กำหนดรถ" }]
    : configuredVehicles;

  const productIndexById = new Map(products.map((product, index) => [product.id, index]));
  const vehicleIndexById = new Map(vehicles.map((vehicle, index) => [vehicle.id ?? "__unassigned__", index]));
  const qty = products.map(() => vehicles.map(() => 0));

  for (const order of orders) {
    const deliveryNotes = Array.isArray(order.delivery_notes) ? order.delivery_notes : order.delivery_notes ? [order.delivery_notes] : [];
    const activeDeliveryNote = deliveryNotes.find((note: { status: string }) => note.status !== "cancelled") as
      | { vehicle_id: string | null; vehicles: unknown }
      | undefined;

    const vehicleId = activeDeliveryNote?.vehicle_id ?? order.customers.default_vehicle_id;
    const resolvedVehicleId = vehicleId ?? "__unassigned__";
    let vehicleIndex = vehicleIndexById.get(resolvedVehicleId);

    if (vehicleIndex === undefined) {
      const deliveryVehicleName = activeDeliveryNote?.vehicle_id ? getVehicleName(activeDeliveryNote.vehicles) : null;
      const customerVehicleName = getVehicleName(order.customers.vehicles);
      vehicles.push({
        id: vehicleId,
        name: deliveryVehicleName || customerVehicleName || "ยังไม่กำหนดรถ",
      });
      vehicleIndex = vehicles.length - 1;
      vehicleIndexById.set(resolvedVehicleId, vehicleIndex);
      qty.forEach((row) => row.push(0));
    }

    for (const item of order.order_items ?? []) {
      const productIndex = productIndexById.get(item.product_id);
      if (productIndex === undefined) continue;
      qty[productIndex][vehicleIndex] = (qty[productIndex][vehicleIndex] ?? 0) + Number(item.quantity_in_base_unit ?? 0);
    }
  }

  const activeRowIndices = qty.reduce<number[]>((indices, row, index) => {
    if (row.some((value) => value > 0)) {
      indices.push(index);
    }
    return indices;
  }, []);

  const filteredProducts = activeRowIndices.map((index) => products[index]);
  const filteredQty = activeRowIndices.map((index) => qty[index]);

  let dateLabel = date;
  if (date === endDate) {
    try {
      dateLabel = new Intl.DateTimeFormat("th-TH", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Asia/Bangkok",
      }).format(new Date(`${date}T00:00:00`));
    } catch {
      dateLabel = date;
    }
  } else {
    const formatter = new Intl.DateTimeFormat("th-TH", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Bangkok",
    });
    try {
      dateLabel = `${formatter.format(new Date(`${date}T00:00:00`))} - ${formatter.format(new Date(`${endDate}T00:00:00`))}`;
    } catch {
      dateLabel = `${date} - ${endDate}`;
    }
  }

  return {
    organizationName: "T&Y Noodle",
    dateLabel,
    products: filteredProducts,
    vehicles,
    qty: filteredQty,
  };
}
