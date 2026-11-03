import dynamic from "next/dynamic";
import type { IncomingOrderListItem } from "@/lib/orders/detail";
import type { OrderProductOption } from "@/lib/orders/manage";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { compareCustomerOrder } from "@/lib/settings/customer-order";
import { IncomingOrdersDeliveryActions } from "@/components/orders/incoming-orders-delivery-actions";
import type { PackingListSummaryProduct, PackingListSummaryStore } from "@/components/orders/packing-list-summary-button";
const PackingListSummaryButton = dynamic(() => import("@/components/orders/packing-list-summary-button").then((mod) => mod.PackingListSummaryButton));
const PrintPackingListCombinedButton = dynamic(() => import("@/components/orders/print-packing-list-combined-button").then((mod) => mod.PrintPackingListCombinedButton));
const PrintVehicleProductSummaryButton = dynamic(() => import("@/components/orders/print-vehicle-product-summary-button").then((mod) => mod.PrintVehicleProductSummaryButton));
const PrintFactoryOrderSheetButton = dynamic(() => import("@/components/orders/print-factory-order-sheet-button").then((mod) => mod.PrintFactoryOrderSheetButton));
const MobilePrintActions = dynamic(() => import("@/components/orders/mobile-print-actions").then((mod) => mod.MobilePrintActions));

type IncomingOrderSummaryItemRow = {
  order_id: string;
  product_id: string;
  quantity: number | string;
  sale_unit_label: string;
  products: {
    name: string;
    sku: string;
  } | null;
};

const ORDER_SUMMARY_ITEM_CHUNK_SIZE = 50;

export async function getOrderSummaryItems(
  admin: ReturnType<typeof getSupabaseAdmin>,
  orderIds: string[],
) {
  if (orderIds.length === 0) {
    return { data: [] as IncomingOrderSummaryItemRow[], error: null };
  }

  const chunks: string[][] = [];
  for (let index = 0; index < orderIds.length; index += ORDER_SUMMARY_ITEM_CHUNK_SIZE) {
    chunks.push(orderIds.slice(index, index + ORDER_SUMMARY_ITEM_CHUNK_SIZE));
  }

  const results = await Promise.all(
    chunks.map((chunk) =>
      admin
        .from("order_items")
        .select(
          `
            order_id,
            product_id,
            quantity,
            sale_unit_label,
            products!inner(name, sku)
          `,
        )
        .in("order_id", chunk),
    ),
  );

  const error = results.find((result) => result.error)?.error ?? null;
  if (error) {
    return { data: [] as IncomingOrderSummaryItemRow[], error };
  }

  return {
    data: results.flatMap((result) => (result.data ?? []) as IncomingOrderSummaryItemRow[]),
    error: null,
  };
}

function formatDisplayDate(value: string) {
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${parseInt(y, 10) + 543}`;
}

export function buildIncomingOrderSummary(
  rows: IncomingOrderSummaryItemRow[],
  filteredPrintOrders: IncomingOrderListItem[],
  products: OrderProductOption[],
) {
  const productImageById = new Map(products.map((product) => [product.id, product.imageUrl ?? null]));
  const itemsByOrderId = new Map<string, IncomingOrderSummaryItemRow[]>();
  for (const row of rows) {
    const current = itemsByOrderId.get(row.order_id) ?? [];
    current.push(row);
    itemsByOrderId.set(row.order_id, current);
  }

  const summaryProductMap = new Map<string, PackingListSummaryProduct>();
  const summaryStoreMap = new Map<string, PackingListSummaryStore>();

  for (const order of filteredPrintOrders) {
    const orderItems = itemsByOrderId.get(order.id) ?? [];
    const storeKey = `${order.customerId}_${order.orderDate}_${order.vehicleId ?? "unassigned"}`;
    const existingStore = summaryStoreMap.get(storeKey) ?? {
      id: storeKey,
      customerCode: order.customerCode,
      customerName: order.customerName,
      date: order.orderDate,
      dateLabel: formatDisplayDate(order.orderDate),
      itemCount: 0,
      totalQuantity: 0,
      vehicleId: order.vehicleId,
      vehicleName: order.vehicleName,
      items: [],
    };
    const storeItemMap = new Map(existingStore.items.map((item) => [item.key, item]));

    for (const item of orderItems) {
      if (!item.products) continue;
      const unit = item.sale_unit_label?.trim() || "-";
      const quantity = Number(item.quantity ?? 0);
      const key = `${String(item.products.sku).trim().toLowerCase()}||${unit.toLowerCase()}`;
      const vehicleProductKey = `${order.vehicleId ?? "unassigned"}||${key}`;

      const existingProduct = summaryProductMap.get(vehicleProductKey);
      if (existingProduct) {
        existingProduct.quantity += quantity;
      } else {
        summaryProductMap.set(vehicleProductKey, {
          key: vehicleProductKey,
          sku: item.products.sku,
          name: item.products.name,
          unit,
          quantity,
          imageUrl: productImageById.get(item.product_id) ?? null,
          vehicleId: order.vehicleId,
          vehicleName: order.vehicleName,
        });
      }

      const existingStoreItem = storeItemMap.get(key);
      if (existingStoreItem) {
        existingStoreItem.quantity += quantity;
      } else {
        storeItemMap.set(key, {
          key,
          sku: item.products.sku,
          name: item.products.name,
          unit,
          quantity,
        });
      }
    }

    const storeItems = Array.from(storeItemMap.values()).sort((a, b) => {
      const skuCompare = a.sku.localeCompare(b.sku, "th");
      if (skuCompare !== 0) return skuCompare;
      return a.name.localeCompare(b.name, "th");
    });

    existingStore.items = storeItems;
    existingStore.itemCount = storeItems.length;
    existingStore.totalQuantity = storeItems.reduce((sum, item) => sum + item.quantity, 0);
    summaryStoreMap.set(storeKey, existingStore);
  }

  const summaryProducts = Array.from(summaryProductMap.values()).sort((a, b) => {
    const skuCompare = a.sku.localeCompare(b.sku, "th");
    if (skuCompare !== 0) return skuCompare;
    return a.name.localeCompare(b.name, "th");
  });

  const summaryStores = Array.from(summaryStoreMap.values()).sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    const vehicleCompare = (a.vehicleName ?? "").localeCompare(b.vehicleName ?? "", "th");
    if (vehicleCompare !== 0) return vehicleCompare;
    return compareCustomerOrder(a, b);
  });

  return { summaryProducts, summaryStores };
}

export async function IncomingOrderPrintActions({
  summaryItems, filteredPrintOrders, products, deliveryMap, deliveryIdMap, orderDate, endDate,
}: {
  summaryItems: ReturnType<typeof getOrderSummaryItems>;
  filteredPrintOrders: IncomingOrderListItem[];
  products: OrderProductOption[];
  deliveryMap: Map<string, string[]>;
  deliveryIdMap: Map<string, string[]>;
  orderDate: string;
  endDate: string;
}) {
  const orderSummaryItemsResult = await summaryItems;
  if (orderSummaryItemsResult.error) {
    throw new Error(orderSummaryItemsResult.error.message ?? "Failed to load order summary items.");
  }
  const { summaryProducts, summaryStores } = buildIncomingOrderSummary(
    orderSummaryItemsResult.data ?? [], filteredPrintOrders, products,
  );
  type GroupedOrderStore = {
    customerId: string;
    customerName: string;
    customerCode: string;
    hasDelivery: boolean;
    orderDate: string;
    orderIds: string[];
    orderNumbers: string[];
    deliveryNoteIds: string[];
    orderRounds: number;
    totalAmount: number;
    vehicleId?: string | null;
    vehicleName?: string | null;
  };

  const visibleOrderStores = Array.from(
    filteredPrintOrders
      .filter((order) => order.status === "submitted" || order.status === "confirmed")
      .reduce((storeMap, order) => {
        const groupKey = `${order.customerId}_${order.orderDate}`;
        const current = storeMap.get(groupKey) ?? {
          customerId: order.customerId,
          customerName: order.customerName,
          customerCode: order.customerCode,
          hasDelivery: false,
          orderDate: order.orderDate,
          orderIds: [] as string[],
          orderNumbers: [] as string[],
          deliveryNoteIds: [] as string[],
          orderRounds: 0,
          totalAmount: 0,
          vehicleId: order.vehicleId,
          vehicleName: order.vehicleName,
        };

        current.orderIds.push(order.id);
        current.orderNumbers.push(order.orderNumber);
        current.orderRounds += 1;
        current.totalAmount += order.totalAmount;
        storeMap.set(groupKey, current);
        return storeMap;
      }, new Map<string, GroupedOrderStore>())
      .values(),
  ).map((store) => ({
    ...store,
    hasDelivery: Boolean(deliveryMap.get(`${store.customerId}_${store.orderDate}`)?.length),
    deliveryNoteIds: deliveryIdMap.get(`${store.customerId}_${store.orderDate}`) ?? [],
  }));

  return <>
            {/* Mobile View: Premium Actions Bottom Sheet */}
            <div className="block sm:hidden w-full">
              <MobilePrintActions
                date={orderDate}
                endDate={endDate}
                dateLabel={orderDate === endDate ? formatDisplayDate(orderDate) : `${formatDisplayDate(orderDate)} - ${formatDisplayDate(endDate)}`}
                summaryProducts={summaryProducts}
                summaryStores={summaryStores}
                visibleOrderStores={visibleOrderStores}
              />
            </div>

            {/* Desktop & Tablet View: 5 Equal Width Action Cards Grid */}
            <div className="hidden sm:block w-full">
              <div className="grid grid-cols-5 gap-3 w-full [&_button]:w-full [&_button]:h-full [&_button]:justify-center [&_button]:py-3.5 [&_button]:px-5 [&_button]:rounded-2xl">
                <PackingListSummaryButton
                  dateLabel={orderDate === endDate ? formatDisplayDate(orderDate) : `${formatDisplayDate(orderDate)} - ${formatDisplayDate(endDate)}`}
                  products={summaryProducts}
                  stores={summaryStores}
                />
                <PrintPackingListCombinedButton date={orderDate} endDate={endDate} />
                <PrintVehicleProductSummaryButton date={orderDate} endDate={endDate} />
                <PrintFactoryOrderSheetButton date={orderDate} endDate={endDate} />
                <IncomingOrdersDeliveryActions date={orderDate} endDate={endDate} stores={visibleOrderStores} />
              </div>
            </div>
  </>;
}
