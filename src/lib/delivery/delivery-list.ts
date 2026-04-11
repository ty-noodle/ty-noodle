import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeSearch } from "@/lib/utils/search";

export type DeliveryLineStatus = "complete" | "partial" | "unlinked";

export type DeliveryLineItem = {
  productId: string;
  productSku: string;
  productName: string;
  saleUnitLabel: string;
  orderedQuantity: number;
  deliveredQuantity: number;
  shortQuantity: number;
  orderedLineTotal: number;
  deliveredLineTotal: number;
  status: DeliveryLineStatus;
};

export type DeliveryEditableItem = {
  id: string;
  deliveryNoteId: string;
  deliveryNumber: string;
  orderNumber: string | null;
  productId: string;
  productSku: string;
  productName: string;
  saleUnitLabel: string;
  quantityDelivered: number;
  unitPrice: number;
  lineTotal: number;
  imageUrl: string | null;
};

export type DeliveryNoteEntry = {
  id: string;
  deliveryNumber: string;
  totalAmount: number;
  itemCount: number;
};

export type BillingRecordInfo = {
  billingNumber: string;
  billingDate: string;
};

export type DeliveryListItem = {
  customerId: string;
  customerName: string;
  customerCode: string;
  deliveryDate: string;
  deliveryNotes: DeliveryNoteEntry[];
  orderedAmount: number;
  deliveredAmount: number;
  itemCount: number;
  lines: DeliveryLineItem[];
  deliveryItems: DeliveryEditableItem[];
  notes: string | null;
  orderNumbers: string[];
  /** ไม่ใช่ null หมายความว่าวันส่งนี้ถูกรวมอยู่ในใบวางบิลที่ออกแล้ว */
  billingRecord: BillingRecordInfo | null;
};

export type DeliveryDaySummary = {
  count: number;
  totalItemCount: number;
  totalOrderedAmount: number;
  totalDeliveredAmount: number;
};

type RawDeliveryNoteRow = {
  id: string;
  delivery_number: string;
  delivery_date: string;
  total_amount: number | string;
  notes: string | null;
  customers: {
    id: string;
    name: string;
    customer_code: string;
  };
  orders: {
    order_number: string;
  } | null;
};

type RawDeliveryLineRow = {
  id: string;
  delivery_note_id: string;
  order_item_id: string | null;
  product_id: string;
  quantity_delivered: number | string;
  unit_price: number | string;
  line_total: number | string;
  sale_unit_label: string;
  products: {
    name: string;
    sku: string;
  };
};

type RawOrderItemRow = {
  id: string;
  quantity: number | string;
  line_total: number | string;
  sale_unit_label: string;
  orders: {
    order_number: string;
  } | null;
};

function toNum(v: number | string | null | undefined) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

type MutableLineAggregate = {
  productId: string;
  productSku: string;
  productName: string;
  saleUnitLabel: string;
  orderedQuantity: number;
  deliveredQuantity: number;
  orderedLineTotal: number;
  deliveredLineTotal: number;
};

type GroupAccumulator = {
  customerId: string;
  customerName: string;
  customerCode: string;
  deliveryDate: string;
  deliveryNotes: DeliveryNoteEntry[];
  orderedAmount: number;
  deliveredAmount: number;
  notes: string | null;
  orderNumbers: string[];
  seenOrderItemIds: Set<string>;
  lineMap: Map<string, MutableLineAggregate>;
  deliveryItems: DeliveryEditableItem[];
};

function buildLineStatus(orderedQuantity: number, deliveredQuantity: number): DeliveryLineStatus {
  if (orderedQuantity <= 0) return "unlinked";
  return deliveredQuantity >= orderedQuantity ? "complete" : "partial";
}

export async function getDeliveryList(
  organizationId: string,
  from: string,
  to: string,
  keyword = "",
): Promise<DeliveryListItem[]> {
  const supabase = getSupabaseAdmin();

  const { data: notesData, error: notesError } = await supabase
    .from("delivery_notes")
    .select(`
      id, delivery_number, delivery_date, total_amount, notes,
      customers!inner(id, name, customer_code),
      orders(order_number)
    `)
    .eq("organization_id", organizationId)
    .gte("delivery_date", from)
    .lte("delivery_date", to)
    .eq("status", "confirmed")
    .order("delivery_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (notesError || !notesData) return [];

  const normalizedKeyword = normalizeSearch(keyword);
  const allNotes = notesData as RawDeliveryNoteRow[];
  const filteredNotes = normalizedKeyword
    ? allNotes.filter((row) => {
        const customerName = normalizeSearch(row.customers.name);
        const customerCode = normalizeSearch(row.customers.customer_code);
        const deliveryNumber = normalizeSearch(row.delivery_number);
        return (
          customerName.includes(normalizedKeyword) ||
          customerCode.includes(normalizedKeyword) ||
          deliveryNumber.includes(normalizedKeyword)
        );
      })
    : allNotes;

  if (filteredNotes.length === 0) return [];

  const noteIds = filteredNotes.map((row) => row.id);
  const { data: linesData, error: linesError } = await supabase
    .from("delivery_note_items")
    .select(`
      id, delivery_note_id, order_item_id, product_id, quantity_delivered, unit_price, line_total, sale_unit_label,
      products!inner(name, sku)
    `)
    .eq("organization_id", organizationId)
    .in("delivery_note_id", noteIds)
    .order("created_at", { ascending: true });

  if (linesError || !linesData) return [];

  const lines = linesData as RawDeliveryLineRow[];
  const linesByNote = new Map<string, RawDeliveryLineRow[]>();
  const orderItemIds: string[] = [];

  for (const line of lines) {
    const bucket = linesByNote.get(line.delivery_note_id) ?? [];
    bucket.push(line);
    linesByNote.set(line.delivery_note_id, bucket);

    if (line.order_item_id) orderItemIds.push(line.order_item_id);
  }

  const uniqueOrderItemIds = Array.from(new Set(orderItemIds));
  const orderItemById = new Map<string, RawOrderItemRow>();

  if (uniqueOrderItemIds.length > 0) {
    const { data: orderItemsData } = await supabase
      .from("order_items")
      .select(`
        id, quantity, line_total, sale_unit_label,
        orders(order_number)
      `)
      .eq("organization_id", organizationId)
      .in("id", uniqueOrderItemIds);

    for (const orderItem of (orderItemsData ?? []) as RawOrderItemRow[]) {
      orderItemById.set(orderItem.id, orderItem);
    }
  }

  // Batch fetch product images (primary image per product)
  const uniqueProductIds = Array.from(new Set(lines.map((l) => l.product_id)));
  const productImageMap = new Map<string, string>();
  if (uniqueProductIds.length > 0) {
    const { data: imagesData } = await supabase
      .from("product_images")
      .select("product_id, public_url")
      .in("product_id", uniqueProductIds)
      .order("sort_order", { ascending: true });
    for (const img of (imagesData ?? []) as { product_id: string; public_url: string }[]) {
      if (!productImageMap.has(img.product_id)) {
        productImageMap.set(img.product_id, img.public_url);
      }
    }
  }

  // ดึงใบวางบิลที่ออกแล้วของลูกค้าทั้งหมดในช่วงวันที่ค้นหา
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const billingDb = supabase as any;
  const uniqueCustomerIds = Array.from(new Set(filteredNotes.map((n) => n.customers.id)));
  const billingByCustomer = new Map<
    string,
    { billingNumber: string; billingDate: string; fromDate: string; toDate: string }[]
  >();

  if (uniqueCustomerIds.length > 0) {
    const { data: billingRows } = await billingDb
      .from("billing_records")
      .select("customer_id, billing_number, billing_date, from_date, to_date")
      .eq("organization_id", organizationId)
      .in("customer_id", uniqueCustomerIds)
      .lte("from_date", to)
      .gte("to_date", from);

    for (const br of (billingRows ?? []) as {
      customer_id: string;
      billing_number: string;
      billing_date: string;
      from_date: string;
      to_date: string;
    }[]) {
      const list = billingByCustomer.get(br.customer_id) ?? [];
      list.push({
        billingNumber: br.billing_number,
        billingDate: br.billing_date,
        fromDate: br.from_date,
        toDate: br.to_date,
      });
      billingByCustomer.set(br.customer_id, list);
    }
  }

  const grouped = new Map<string, GroupAccumulator>();

  for (const note of filteredNotes) {
    const key = `${note.customers.id}::${note.delivery_date}`;
    const existing = grouped.get(key) ?? {
      customerId: note.customers.id,
      customerName: note.customers.name,
      customerCode: note.customers.customer_code,
      deliveryDate: note.delivery_date,
      deliveryNotes: [],
      orderedAmount: 0,
      deliveredAmount: 0,
      notes: null,
      orderNumbers: [],
      seenOrderItemIds: new Set<string>(),
      lineMap: new Map<string, MutableLineAggregate>(),
      deliveryItems: [],
    };

    const noteLines = linesByNote.get(note.id) ?? [];

    existing.deliveryNotes.push({
      id: note.id,
      deliveryNumber: note.delivery_number,
      totalAmount: toNum(note.total_amount),
      itemCount: noteLines.length,
    });

    existing.deliveredAmount += toNum(note.total_amount);

    if (note.notes) {
      existing.notes = existing.notes ? `${existing.notes} / ${note.notes}` : note.notes;
    }

    if (note.orders?.order_number && !existing.orderNumbers.includes(note.orders.order_number)) {
      existing.orderNumbers.push(note.orders.order_number);
    }

    for (const line of noteLines) {
      existing.deliveryItems.push({
        id: line.id,
        deliveryNoteId: note.id,
        deliveryNumber: note.delivery_number,
        orderNumber: line.order_item_id
          ? (orderItemById.get(line.order_item_id)?.orders?.order_number ?? null)
          : null,
        productId: line.product_id,
        productSku: line.products.sku,
        productName: line.products.name,
        saleUnitLabel: line.sale_unit_label,
        quantityDelivered: toNum(line.quantity_delivered),
        unitPrice: toNum(line.unit_price),
        lineTotal: toNum(line.line_total),
        imageUrl: productImageMap.get(line.product_id) ?? null,
      });

      const lineKey = `${line.product_id}::${line.sale_unit_label}`;
      const current = existing.lineMap.get(lineKey) ?? {
        productId: line.product_id,
        productSku: line.products.sku,
        productName: line.products.name,
        saleUnitLabel: line.sale_unit_label,
        orderedQuantity: 0,
        deliveredQuantity: 0,
        orderedLineTotal: 0,
        deliveredLineTotal: 0,
      };

      current.deliveredQuantity += toNum(line.quantity_delivered);
      current.deliveredLineTotal += toNum(line.line_total);

      if (line.order_item_id && !existing.seenOrderItemIds.has(line.order_item_id)) {
        const orderItem = orderItemById.get(line.order_item_id);
        if (orderItem) {
          current.orderedQuantity += toNum(orderItem.quantity);
          current.orderedLineTotal += toNum(orderItem.line_total);
          existing.orderedAmount += toNum(orderItem.line_total);
          existing.seenOrderItemIds.add(line.order_item_id);

          if (
            orderItem.orders?.order_number &&
            !existing.orderNumbers.includes(orderItem.orders.order_number)
          ) {
            existing.orderNumbers.push(orderItem.orders.order_number);
          }
        }
      }

      existing.lineMap.set(lineKey, current);
    }

    grouped.set(key, existing);
  }

  return Array.from(grouped.values())
    .map((group) => {
      const linesForReport = Array.from(group.lineMap.values())
        .map((line) => {
          const shortQuantity = Math.max(0, line.orderedQuantity - line.deliveredQuantity);
          return {
            productId: line.productId,
            productSku: line.productSku,
            productName: line.productName,
            saleUnitLabel: line.saleUnitLabel,
            orderedQuantity: line.orderedQuantity,
            deliveredQuantity: line.deliveredQuantity,
            shortQuantity,
            orderedLineTotal: line.orderedLineTotal,
            deliveredLineTotal: line.deliveredLineTotal,
            status: buildLineStatus(line.orderedQuantity, line.deliveredQuantity),
          } satisfies DeliveryLineItem;
        })
        .sort((a, b) => a.productName.localeCompare(b.productName, "th"));

      const deliveryItems = group.deliveryItems
        .slice()
        .sort((a, b) => {
          if (a.deliveryNumber === b.deliveryNumber) {
            return a.productName.localeCompare(b.productName, "th");
          }
          return a.deliveryNumber.localeCompare(b.deliveryNumber, "th");
        });

      const billingRecords = billingByCustomer.get(group.customerId) ?? [];
      const matchedBilling =
        billingRecords.find(
          (br) => group.deliveryDate >= br.fromDate && group.deliveryDate <= br.toDate,
        ) ?? null;

      return {
        customerId: group.customerId,
        customerName: group.customerName,
        customerCode: group.customerCode,
        deliveryDate: group.deliveryDate,
        deliveryNotes: group.deliveryNotes,
        orderedAmount: group.orderedAmount,
        deliveredAmount: group.deliveredAmount,
        itemCount: linesForReport.length,
        lines: linesForReport,
        deliveryItems,
        notes: group.notes,
        orderNumbers: group.orderNumbers,
        billingRecord: matchedBilling
          ? { billingNumber: matchedBilling.billingNumber, billingDate: matchedBilling.billingDate }
          : null,
      } satisfies DeliveryListItem;
    })
    .sort((a, b) => {
      if (a.deliveryDate === b.deliveryDate) {
        return a.customerName.localeCompare(b.customerName, "th");
      }
      return a.deliveryDate.localeCompare(b.deliveryDate);
    });
}

export function calcDeliveryDaySummary(items: DeliveryListItem[]): DeliveryDaySummary {
  return items.reduce(
    (acc, item) => {
      acc.count += 1;
      acc.totalItemCount += item.itemCount;
      acc.totalOrderedAmount += item.orderedAmount;
      acc.totalDeliveredAmount += item.deliveredAmount;
      return acc;
    },
    {
      count: 0,
      totalItemCount: 0,
      totalOrderedAmount: 0,
      totalDeliveredAmount: 0,
    } as DeliveryDaySummary,
  );
}
