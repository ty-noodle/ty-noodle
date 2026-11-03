import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { compareCustomerOrder } from "@/lib/settings/customer-order";

export type OrderStoreStatusItem = {
  code: string;
  id: string;
  latestOrderAt: string | null;
  latestOrderId: string | null;
  name: string;
  orderCount: number;
  sortOrder: number;
  vehicleId: string | null;
  vehicleName: string | null;
};

export type OrderStoreStatusSummary = {
  allStores: OrderStoreStatusItem[];
  orderedStores: OrderStoreStatusItem[];
  unorderedStores: OrderStoreStatusItem[];
};

type CustomerRow = {
  customer_code: string | null;
  default_vehicle_id: string | null;
  id: string;
  name: string | null;
  sort_order: number | string;
  vehicles: { id: string; name: string | null } | { id: string; name: string | null }[] | null;
};

type OrderRow = {
  id: string;
  created_at: string | null;
  customer_id: string;
};

function getVehicleName(vehicle: CustomerRow["vehicles"]) {
  if (Array.isArray(vehicle)) {
    return vehicle[0]?.name ?? null;
  }

  return vehicle?.name ?? null;
}

export async function getOrderStoreStatusSummary(
  organizationId: string,
  orderDate: string,
): Promise<OrderStoreStatusSummary> {
  const admin = getSupabaseAdmin();

  const [customersResult, ordersResult] = await Promise.all([
    admin
      .from("customers")
      .select("id, customer_code, name, sort_order, default_vehicle_id, vehicles(id, name)")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("customer_code", { ascending: true }),
    admin
      .from("orders")
      .select("id, customer_id, created_at")
      .eq("organization_id", organizationId)
      .eq("order_date", orderDate)
      .neq("status", "cancelled"),
  ]);

  if (customersResult.error) {
    throw new Error(customersResult.error.message ?? "Failed to load stores.");
  }

  if (ordersResult.error) {
    throw new Error(ordersResult.error.message ?? "Failed to load store order status.");
  }

  const orderStatsByCustomerId = new Map<string, { latestOrderAt: string | null; latestOrderId: string | null; orderCount: number }>();

  for (const order of (ordersResult.data ?? []) as OrderRow[]) {
    const current = orderStatsByCustomerId.get(order.customer_id) ?? {
      latestOrderAt: null,
      latestOrderId: null,
      orderCount: 0,
    };
    
    const isNewer = !current.latestOrderAt || (order.created_at && order.created_at > current.latestOrderAt);
    const nextLatest = isNewer ? order.created_at : current.latestOrderAt;
    const nextOrderId = isNewer ? order.id : current.latestOrderId;

    orderStatsByCustomerId.set(order.customer_id, {
      latestOrderAt: nextLatest,
      latestOrderId: nextOrderId,
      orderCount: current.orderCount + 1,
    });
  }

  const allStores = ((customersResult.data ?? []) as unknown as CustomerRow[])
    .map((customer) => {
      const stats = orderStatsByCustomerId.get(customer.id);

      return {
        code: customer.customer_code ?? "-",
        id: customer.id,
        latestOrderAt: stats?.latestOrderAt ?? null,
        latestOrderId: stats?.latestOrderId ?? null,
        name: customer.name ?? "-",
        orderCount: stats?.orderCount ?? 0,
        sortOrder: Number(customer.sort_order),
        vehicleId: customer.default_vehicle_id ?? null,
        vehicleName: getVehicleName(customer.vehicles),
      };
    })
    .toSorted(compareCustomerOrder);

  const orderedStores = allStores.filter((store) => store.orderCount > 0);

  const unorderedStores = allStores.filter((store) => store.orderCount === 0);

  return {
    allStores,
    orderedStores,
    unorderedStores,
  };
}
