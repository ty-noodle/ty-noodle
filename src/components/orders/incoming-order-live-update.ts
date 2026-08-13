import type { IncomingOrderListItem } from "@/lib/orders/detail";

export const INCOMING_ORDER_SAVED_EVENT = "incoming-order-saved";
export const INCOMING_ORDER_DELETED_EVENT = "incoming-order-deleted";

export type IncomingOrderSavedEventDetail = {
  deliveryNumber: string | null;
  order: IncomingOrderListItem;
};

export type IncomingOrderDeletedEventDetail = {
  orderId: string;
};

type IncomingOrderFilters = {
  endDate: string;
  orderDate: string;
  searchTerm: string;
  selectedCustomerIds: string[];
};

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("th");
}

export function shouldShowIncomingOrder(
  order: IncomingOrderListItem,
  filters: IncomingOrderFilters,
) {
  if (order.orderDate < filters.orderDate || order.orderDate > filters.endDate) return false;
  if (
    filters.selectedCustomerIds.length > 0 &&
    !filters.selectedCustomerIds.includes(order.customerId)
  ) {
    return false;
  }

  const query = normalize(filters.searchTerm);
  if (!query) return true;

  return [order.orderNumber, order.customerCode, order.customerName].some((value) =>
    normalize(value).includes(query),
  );
}

export function upsertIncomingOrder(
  orders: IncomingOrderListItem[],
  savedOrder: IncomingOrderListItem,
) {
  const withoutSavedOrder = orders.filter((order) => order.id !== savedOrder.id);
  return [savedOrder, ...withoutSavedOrder].toSorted((left, right) => {
    const dateDifference = right.orderDate.localeCompare(left.orderDate);
    if (dateDifference !== 0) return dateDifference;
    return right.createdAt.localeCompare(left.createdAt);
  });
}

export function removeIncomingOrder(
  orders: IncomingOrderListItem[],
  orderId: string,
) {
  return orders.filter((order) => order.id !== orderId);
}
