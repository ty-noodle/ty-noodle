import { Suspense } from "react";
import { PageLoader } from "@/components/page-loader";
import { PrintPackingListButton } from "@/components/orders/print-packing-list-button";
import {
  PackingListLayout,
  type PackingListData,
  type PackingListLayoutMode,
  type PackingListStore,
  type PackingListVehicle,
} from "@/components/print/packing-list-layout";
import { MobilePinchZoom } from "@/components/print/mobile-pinch-zoom";
import { requireAnyRole } from "@/lib/auth/authorization";
import { sortProductsByCategory } from "@/lib/products/sort-by-category";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { AutoPrint, PackingListPrintButton } from "./preview/print-button";

export const metadata = { title: "ใบจัดของ" };

type Props = {
  searchParams: Promise<{
    date?: string;
    endDate?: string;
    autoprint?: string;
    layout?: string;
  }>;
};

type OrderCustomer = {
  id: string;
  name: string;
  customer_code: string;
  default_vehicle_id: string | null;
  vehicles: unknown;
};

type DeliveryNoteRow = {
  vehicle_id: string | null;
  status: string;
  vehicles: unknown;
};

type OrderItemRow = {
  product_id: string;
  quantity: number | string;
  sale_unit_label: string;
  products: {
    name: string;
    sku: string;
  };
};

type OrderWithRelations = {
  id: string;
  order_date: string;
  customers: OrderCustomer;
  delivery_notes: DeliveryNoteRow[] | DeliveryNoteRow | null;
  order_items: OrderItemRow[];
};

type DbProduct = {
  id: string;
  name: string;
  display_order: number | null;
  metadata: unknown;
};

type DbCategory = {
  id: string;
  sort_order: number | string | null;
};

type GroupedStore = {
  customer: OrderCustomer;
  vehicleId: string | null;
  vehicleName: string | null;
  items: Map<string, number>;
};

type ProductDescriptor = {
  productId: string;
  sku: string;
  name: string;
  unit: string;
};

function getVehicleName(value: unknown) {
  if (!value) return null;
  if (Array.isArray(value)) {
    return (value[0] as { name?: string } | undefined)?.name ?? null;
  }
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

function getOrderKey(item: OrderItemRow) {
  return `${item.products.sku.trim().toLowerCase()}||${item.sale_unit_label.trim().toLowerCase()}`;
}

function getThaiDateLabel(value: string) {
  try {
    return new Intl.DateTimeFormat("th-TH", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Bangkok",
    }).format(new Date(`${value}T00:00:00`));
  } catch {
    console.error("Invalid date for packing list:", value);
    return value;
  }
}

export default async function PackingListWrapper({ searchParams }: Props) {
  return (
    <Suspense fallback={<PageLoader />}>
      <PackingListPage searchParams={searchParams} />
    </Suspense>
  );
}

async function PackingListPage({ searchParams }: Props) {
  const session = await requireAnyRole(["admin", "warehouse"]);
  const params = await searchParams;
  const autoprint = params.autoprint === "1";
  const layout: PackingListLayoutMode = params.layout === "transposed" ? "transposed" : "standard";
  const date =
    params.date ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
  const endDate = params.endDate || date;

  const admin = getSupabaseAdmin();
  const ordersQueryBase = admin
    .from("orders")
    .select(`
      id,
      order_date,
      customers!inner(id, name, customer_code, default_vehicle_id, vehicles(id, name)),
      delivery_notes!order_id(vehicle_id, status, vehicles(id, name)),
      order_items(
        product_id,
        quantity,
        sale_unit_label,
        products!inner(name, sku)
      )
    `)
    .eq("organization_id", session.organizationId)
    .neq("status", "cancelled");

  const filteredOrdersQuery =
    endDate && endDate !== date
      ? ordersQueryBase.gte("order_date", date).lte("order_date", endDate)
      : ordersQueryBase.eq("order_date", date);

  const [vehicleRows, ordersResult, productsDb, categoriesDb, categoryItemsDb] = await Promise.all([
    admin
      .from("vehicles")
      .select("id, name")
      .eq("organization_id", session.organizationId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    filteredOrdersQuery.order("order_date", { ascending: true }).order("created_at", {
      ascending: true,
    }),
    admin
      .from("products")
      .select("id, name, display_order, metadata")
      .eq("organization_id", session.organizationId),
    admin
      .from("product_categories")
      .select("id, sort_order")
      .eq("organization_id", session.organizationId)
      .eq("is_active", true),
    admin
      .from("product_category_items")
      .select("product_category_id, product_id")
      .eq("organization_id", session.organizationId),
  ]);

  const vehicles: PackingListVehicle[] = (vehicleRows.data ?? []).map(
    (vehicle: { id: string; name: string }) => ({
      id: vehicle.id,
      name: vehicle.name,
    }),
  );
  const vehicleSortIndexMap = new Map(vehicles.map((vehicle, index) => [vehicle.id, index]));

  const categoryIdsByProductId = new Map<string, string[]>();
  for (const item of categoryItemsDb.data ?? []) {
    const current = categoryIdsByProductId.get(item.product_id) ?? [];
    current.push(item.product_category_id);
    categoryIdsByProductId.set(item.product_id, current);
  }

  const dbProductsList = (productsDb.data ?? []).filter((product: DbProduct) => {
    const metadata =
      product.metadata && typeof product.metadata === "object"
        ? (product.metadata as Record<string, unknown>)
        : null;
    return !metadata?.deleted;
  });

  const packingListNameByProductId = new Map(
    dbProductsList.map((product: DbProduct) => [
      product.id,
      getPackingListProductName(product.name, product.metadata),
    ]),
  );

  const sortedMasterProducts = sortProductsByCategory(
    dbProductsList.map((product: DbProduct) => ({
      id: product.id,
      name: packingListNameByProductId.get(product.id) ?? product.name,
      display_order:
        product.display_order !== null && product.display_order !== undefined
          ? Number(product.display_order)
          : undefined,
      categoryIds: categoryIdsByProductId.get(product.id) ?? [],
    })),
    (categoriesDb.data ?? []).map((category: DbCategory) => ({
      id: category.id,
      sortOrder: Number(category.sort_order ?? 0),
    })),
  );

  const productSortIndexMap = new Map<string, number>();
  sortedMasterProducts.forEach((product, index) => {
    productSortIndexMap.set(product.id, index);
  });

  const rawOrders = (ordersResult.data ?? []) as OrderWithRelations[];
  const ordersByDate = new Map<string, OrderWithRelations[]>();

  for (const order of rawOrders) {
    const groupedDateOrders = ordersByDate.get(order.order_date);
    if (groupedDateOrders) {
      groupedDateOrders.push(order);
    } else {
      ordersByDate.set(order.order_date, [order]);
    }
  }

  const allPackingData: PackingListData[] = Array.from(ordersByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currentDate, dateOrders]) => {
      const groupedStores = new Map<string, GroupedStore>();
      const productMap = new Map<string, ProductDescriptor>();

      for (const order of dateOrders) {
        const customer = order.customers;
        const deliveryNotes = Array.isArray(order.delivery_notes)
          ? order.delivery_notes
          : order.delivery_notes
            ? [order.delivery_notes]
            : [];
        const activeDeliveryNote = deliveryNotes.find((note) => note.status !== "cancelled");
        const vehicleId = activeDeliveryNote?.vehicle_id ?? customer.default_vehicle_id;
        const vehicleName = activeDeliveryNote?.vehicle_id
          ? getVehicleName(activeDeliveryNote.vehicles)
          : getVehicleName(customer.vehicles);
        const resolvedVehicleName =
          vehicleName ||
          (vehicleId ? vehicles.find((vehicle) => vehicle.id === vehicleId)?.name : null) ||
          null;
        const storeGroupKey = `${customer.id}_${vehicleId ?? "none"}`;

        let groupedStore = groupedStores.get(storeGroupKey);
        if (!groupedStore) {
          groupedStore = {
            customer,
            vehicleId,
            vehicleName: resolvedVehicleName,
            items: new Map(),
          };
          groupedStores.set(storeGroupKey, groupedStore);
        }

        for (const item of order.order_items ?? []) {
          const key = getOrderKey(item);
          const quantity = Number(item.quantity ?? 0);
          groupedStore.items.set(key, (groupedStore.items.get(key) ?? 0) + quantity);

          if (!productMap.has(key)) {
            productMap.set(key, {
              productId: item.product_id,
              sku: item.products.sku,
              name: packingListNameByProductId.get(item.product_id) ?? item.products.name,
              unit: item.sale_unit_label,
            });
          }
        }
      }

      const stores = Array.from(groupedStores.values())
        .sort((a, b) => {
          const indexA =
            a.vehicleId === null ? 999 : (vehicleSortIndexMap.get(a.vehicleId) ?? 998);
          const indexB =
            b.vehicleId === null ? 999 : (vehicleSortIndexMap.get(b.vehicleId) ?? 998);
          if (indexA !== indexB) return indexA - indexB;
          return a.customer.customer_code.localeCompare(b.customer.customer_code);
        })
        .map(
          (group): PackingListStore & { consolidatedItems: Map<string, number> } => ({
            id: group.customer.customer_code,
            name: group.customer.name,
            vehicleId: group.vehicleId,
            vehicleName: group.vehicleName,
            consolidatedItems: group.items,
          }),
        );

      const products = Array.from(productMap.entries())
        .map(([key, product]) => ({
          key,
          productId: product.productId,
          sku: product.sku,
          name: product.name,
          unit: product.unit,
        }))
        .sort((a, b) => {
          const indexA = productSortIndexMap.get(a.productId) ?? 999999;
          const indexB = productSortIndexMap.get(b.productId) ?? 999999;
          if (indexA !== indexB) return indexA - indexB;
          return a.sku.localeCompare(b.sku) || a.name.localeCompare(b.name);
        });

      const qty = products.map((product) =>
        stores.map((store) => store.consolidatedItems.get(product.key) ?? 0),
      );

      return {
        date: currentDate,
        dateLabel: getThaiDateLabel(currentDate),
        organizationName: "T&Y Noodle",
        stores: stores.map((store) => ({
          id: store.id,
          name: store.name,
          vehicleId: store.vehicleId,
          vehicleName: store.vehicleName,
        })),
        products: products.map((product) => ({
          key: product.key,
          sku: product.sku,
          name: product.name,
          unit: product.unit,
        })),
        qty,
        vehicles,
      };
    });

  const totalStores = allPackingData.reduce((sum, packingData) => sum + packingData.stores.length, 0);
  const mainDateLabel =
    allPackingData.length > 1
      ? `${allPackingData[0]?.dateLabel ?? ""} - ${
          allPackingData[allPackingData.length - 1]?.dateLabel ?? ""
        }`
      : (allPackingData[0]?.dateLabel ?? "");
  const unassignedStores = allPackingData.flatMap((packingData) =>
    packingData.stores
      .filter((store: PackingListStore) => store.vehicleId === null)
      .map((store: PackingListStore) => store.name),
  );

  return (
    <>
      {autoprint ? <AutoPrint /> : null}

      <div
        className="no-print flex flex-col md:flex-row items-center gap-2 md:gap-3 bg-white py-2.5 px-4 rounded-[16px] shadow-lg fixed top-3 left-1/2 -translate-x-1/2 z-[100] border border-slate-100/80 w-max max-w-[calc(100vw-24px)]"
        style={{
          fontFamily: "Sarabun, sans-serif",
        }}
      >
        <div className="flex items-center gap-2">
          <span style={{ fontSize: "14px", fontWeight: 800, color: "#003366" }}>
            {layout === "transposed" ? "ใบจัดของ (สลับตาราง)" : "ใบจัดของ"}
          </span>
          <span
            className="hidden sm:inline"
            style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}
          >
            {mainDateLabel} · {totalStores} ร้าน
          </span>
        </div>

        <div className="flex items-center gap-2 flex-nowrap">
          <div>
            <PrintPackingListButton
              date={date}
              endDate={endDate}
              layout={layout === "standard" ? "transposed" : "standard"}
              label={
                layout === "standard"
                  ? "สลับตาราง"
                  : "ตารางเดิม"
              }
            />
          </div>
          <PackingListPrintButton
            unassignedStores={unassignedStores}
            dateLabel={mainDateLabel}
            hidePrintOnMobile
          />
          <a
            href="/orders/incoming"
            style={{
              fontSize: "13px",
              fontWeight: 700,
              color: "#ef4444",
              textDecoration: "none",
              padding: "6px 12px",
              borderRadius: "8px",
              background: "#fef2f2",
            }}
          >
            กลับ
          </a>
        </div>
      </div>

      {allPackingData.length === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
            paddingTop: "120px",
            fontFamily: "Sarabun, sans-serif",
          }}
        >
          <p style={{ fontSize: "18px", fontWeight: 600, color: "#64748b" }}>
            ไม่มีออเดอร์ในช่วงที่เลือก
          </p>
          <a
            href="/orders/incoming"
            style={{ marginTop: "8px", color: "#1e3a5f", fontSize: "14px" }}
          >
            กลับหน้าออเดอร์
          </a>
        </div>
      ) : (
        <MobilePinchZoom className="packing-print-container">
          {allPackingData.map((packingData) => (
            <PackingListLayout
              key={`${layout}-${packingData.date}`}
              data={packingData}
              layout={layout}
            />
          ))}
        </MobilePinchZoom>
      )}
    </>
  );
}
