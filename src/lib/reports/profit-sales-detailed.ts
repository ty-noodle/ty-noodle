import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProfitSalesReport } from "@/lib/reports/profit-sales";

export type DetailedProfitProductItem = {
  productSku: string;
  productName: string;
  quantity: number;
  unit: string;
  costPrice: number;
  salesAmount: number;
  profit: number;
  marginPercent: number;
};

export type DetailedProfitStoreGroup = {
  customerId: string;
  customerCode: string;
  customerName: string;
  deliveryDate: string;
  deliveryNumber: string;
  items: DetailedProfitProductItem[];
  totalQuantity: number;
  totalSales: number;
  totalCost: number;
  totalProfit: number;
  avgMarginPercent: number;
};

export type DetailedProfitSummary = {
  totalSales: number;
  totalCost: number;
  totalNetProfit: number;
  totalItemsCount: number;
  totalQuantity: number;
  avgMarginPercent: number;
};

export type DetailedProfitInsights = {
  topPerformingItem: {
    name: string;
    sales: number;
  } | null;
  lowestProfitMarginItem: {
    name: string;
    marginPercent: number;
  } | null;
  topStore: {
    name: string;
    contributionPercent: number;
  } | null;
};

export type DetailedProfitPagination = {
  page: number;
  totalPages: number;
  totalDays: number;
  totalStores: number;
  currentDate: string | null;
  currentDateOrderCount: number;
};

export type DetailedProfitReportData = {
  stores: DetailedProfitStoreGroup[];
  summary: DetailedProfitSummary;
  insights: DetailedProfitInsights;
  pagination: DetailedProfitPagination;
};

type DeliveryNoteHeaderRow = {
  id: string;
  customer_id: string;
  delivery_date: string;
  delivery_number: string | null;
  total_amount: number | string | null;
  customers: {
    customer_code: string | null;
    name: string | null;
  } | null;
};

type DeliveryNoteItemRow = {
  delivery_note_id: string;
  quantity_delivered: number | string | null;
  line_total: number | string | null;
  sale_unit_label: string | null;
  cost_price: number | string | null;
  products: {
    name: string | null;
    sku: string | null;
    unit: string | null;
  } | null;
};

const DELIVERY_NOTE_BATCH_SIZE = 300;
const ITEM_BATCH_SIZE = 150;
const SALES_ADJUSTMENT_THRESHOLD = 0.004;

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function buildEmptyReport(page: number): DetailedProfitReportData {
  return {
    stores: [],
    summary: {
      totalSales: 0,
      totalCost: 0,
      totalNetProfit: 0,
      totalItemsCount: 0,
      totalQuantity: 0,
      avgMarginPercent: 0,
    },
    insights: {
      topPerformingItem: null,
      lowestProfitMarginItem: null,
      topStore: null,
    },
    pagination: {
      page,
      totalPages: 1,
      totalDays: 0,
      totalStores: 0,
      currentDate: null,
      currentDateOrderCount: 0,
    },
  };
}

async function fetchDeliveryNotes(params: {
  organizationId: string;
  fromDate: string;
  toDate: string;
  customerIds: string[];
}) {
  const { organizationId, fromDate, toDate, customerIds } = params;
  const supabase = getSupabaseAdmin();
  const rows: DeliveryNoteHeaderRow[] = [];
  let rangeFrom = 0;

  while (true) {
    let noteQuery = supabase
      .from("delivery_notes")
      .select(`
        id,
        customer_id,
        delivery_date,
        delivery_number,
        total_amount,
        customers(
          customer_code,
          name
        )
      `)
      .eq("organization_id", organizationId)
      .eq("status", "confirmed")
      .gte("delivery_date", fromDate)
      .lte("delivery_date", toDate)
      .order("delivery_date", { ascending: true })
      .order("delivery_number", { ascending: true })
      .order("id", { ascending: true })
      .range(rangeFrom, rangeFrom + DELIVERY_NOTE_BATCH_SIZE - 1);

    if (customerIds.length > 0) {
      noteQuery = noteQuery.in("customer_id", customerIds);
    }

    const { data, error } = await noteQuery;
    if (error) {
      throw new Error(error.message);
    }

    const batch = (data ?? []) as DeliveryNoteHeaderRow[];
    if (batch.length === 0) {
      break;
    }

    rows.push(...batch);

    if (batch.length < DELIVERY_NOTE_BATCH_SIZE) {
      break;
    }

    rangeFrom += DELIVERY_NOTE_BATCH_SIZE;
  }

  return rows;
}

async function fetchDeliveryNoteItems(noteIds: string[]) {
  if (noteIds.length === 0) {
    return [] as DeliveryNoteItemRow[];
  }

  const supabase = getSupabaseAdmin();
  const rows: DeliveryNoteItemRow[] = [];

  for (let index = 0; index < noteIds.length; index += ITEM_BATCH_SIZE) {
    const noteIdChunk = noteIds.slice(index, index + ITEM_BATCH_SIZE);
    const { data, error } = await supabase
      .from("delivery_note_items")
      .select(`
        delivery_note_id,
        quantity_delivered,
        line_total,
        sale_unit_label,
        cost_price,
        products(
          name,
          sku,
          unit
        )
      `)
      .in("delivery_note_id", noteIdChunk);

    if (error) {
      throw new Error(error.message);
    }

    rows.push(...((data ?? []) as DeliveryNoteItemRow[]));
  }

  return rows;
}

function buildStores(notes: DeliveryNoteHeaderRow[], items: DeliveryNoteItemRow[]) {
  const noteMap = new Map(
    notes.map((note) => [
      note.id,
      {
        customerId: note.customer_id,
        customerCode: note.customers?.customer_code ?? "-",
        customerName: note.customers?.name ?? "Unknown Store",
        deliveryDate: note.delivery_date,
        deliveryNumber: note.delivery_number ?? "",
        noteSalesTotal: roundMoney(toNumber(note.total_amount)),
      },
    ]),
  );

  const groupedByNote = new Map<
    string,
    Map<
      string,
      {
        sku: string;
        name: string;
        unit: string;
        quantity: number;
        salesAmount: number;
        totalCost: number;
      }
    >
  >();

  for (const item of items) {
    const note = noteMap.get(item.delivery_note_id);
    if (!note) {
      continue;
    }

    const sku = item.products?.sku ?? "-";
    const name = item.products?.name ?? "Unknown Product";
    const unit = item.sale_unit_label ?? item.products?.unit ?? "-";
    const quantity = toNumber(item.quantity_delivered);
    const salesAmount = roundMoney(toNumber(item.line_total));
    const totalCost = roundMoney(toNumber(item.cost_price) * quantity);
    const itemKey = `${sku}::${name}::${unit}`;
    const noteProductMap = groupedByNote.get(item.delivery_note_id) ?? new Map();
    const existing = noteProductMap.get(itemKey);

    if (existing) {
      existing.quantity += quantity;
      existing.salesAmount = roundMoney(existing.salesAmount + salesAmount);
      existing.totalCost = roundMoney(existing.totalCost + totalCost);
    } else {
      noteProductMap.set(itemKey, {
        sku,
        name,
        unit,
        quantity,
        salesAmount,
        totalCost,
      });
    }

    groupedByNote.set(item.delivery_note_id, noteProductMap);
  }

  return notes.map((note) => {
    const noteMeta = noteMap.get(note.id)!;
    const itemMap = groupedByNote.get(note.id) ?? new Map();
    const productItems: DetailedProfitProductItem[] = [...itemMap.values()]
      .sort((left, right) => left.sku.localeCompare(right.sku))
      .map((product) => {
        const profit = roundMoney(product.salesAmount - product.totalCost);
        return {
          productSku: product.sku,
          productName: product.name,
          quantity: product.quantity,
          unit: product.unit,
          costPrice: product.quantity > 0 ? roundMoney(product.totalCost / product.quantity) : 0,
          salesAmount: product.salesAmount,
          profit,
          marginPercent: product.salesAmount > 0 ? (profit / product.salesAmount) * 100 : 0,
        };
      });

    const totalQuantity = productItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalCost = roundMoney(productItems.reduce((sum, item) => sum + item.costPrice * item.quantity, 0));
    const lineItemSalesTotal = roundMoney(productItems.reduce((sum, item) => sum + item.salesAmount, 0));
    const salesAdjustment = roundMoney(noteMeta.noteSalesTotal - lineItemSalesTotal);

    if (Math.abs(salesAdjustment) > SALES_ADJUSTMENT_THRESHOLD) {
      productItems.push({
        productSku: "ADJUST",
        productName: "Sales Adjustment",
        quantity: 0,
        unit: "-",
        costPrice: 0,
        salesAmount: salesAdjustment,
        profit: salesAdjustment,
        marginPercent: 0,
      });
    }

    const totalSales = noteMeta.noteSalesTotal;
    const totalProfit = roundMoney(totalSales - totalCost);

    return {
      customerId: noteMeta.customerId,
      customerCode: noteMeta.customerCode,
      customerName: noteMeta.customerName,
      deliveryDate: noteMeta.deliveryDate,
      deliveryNumber: noteMeta.deliveryNumber,
      items: productItems,
      totalQuantity,
      totalSales,
      totalCost,
      totalProfit,
      avgMarginPercent: totalSales > 0 ? (totalProfit / totalSales) * 100 : 0,
    };
  });
}

function buildSummary(params: {
  totalSales: number;
  totalCost: number;
  totalNetProfit: number;
  avgMarginPercent: number;
  stores: DetailedProfitStoreGroup[];
}) {
  const { totalSales, totalCost, totalNetProfit, avgMarginPercent, stores } = params;
  return {
    totalSales,
    totalCost,
    totalNetProfit,
    totalItemsCount: stores.reduce((count, store) => count + store.items.length, 0),
    totalQuantity: stores.reduce((count, store) => count + store.totalQuantity, 0),
    avgMarginPercent,
  };
}

function buildInsights(stores: DetailedProfitStoreGroup[]): DetailedProfitInsights {
  const productMap = new Map<string, { name: string; sales: number; cost: number }>();
  const storeMap = new Map<string, { name: string; sales: number }>();
  let totalSales = 0;

  for (const store of stores) {
    totalSales += store.totalSales;
    storeMap.set(store.deliveryNumber, {
      name: `${store.customerCode} - ${store.customerName}`,
      sales: store.totalSales,
    });

    for (const item of store.items) {
      if (item.productSku === "ADJUST") {
        continue;
      }

      const key = `${item.productSku}::${item.productName}`;
      const current = productMap.get(key) ?? { name: item.productName, sales: 0, cost: 0 };
      current.sales += item.salesAmount;
      current.cost += item.costPrice * item.quantity;
      productMap.set(key, current);
    }
  }

  let topPerformingItem: DetailedProfitInsights["topPerformingItem"] = null;
  let lowestProfitMarginItem: DetailedProfitInsights["lowestProfitMarginItem"] = null;
  let topStore: DetailedProfitInsights["topStore"] = null;
  let bestSales = 0;
  let worstMargin = Number.POSITIVE_INFINITY;
  let highestStoreSales = 0;

  for (const product of productMap.values()) {
    if (product.sales > bestSales) {
      bestSales = product.sales;
      topPerformingItem = { name: product.name, sales: product.sales };
    }

    const marginPercent = product.sales > 0 ? ((product.sales - product.cost) / product.sales) * 100 : 0;
    if (product.sales > 0 && marginPercent < worstMargin) {
      worstMargin = marginPercent;
      lowestProfitMarginItem = { name: product.name, marginPercent };
    }
  }

  for (const store of storeMap.values()) {
    if (store.sales > highestStoreSales) {
      highestStoreSales = store.sales;
      topStore = {
        name: store.name,
        contributionPercent: totalSales > 0 ? (store.sales / totalSales) * 100 : 0,
      };
    }
  }

  return {
    topPerformingItem,
    lowestProfitMarginItem,
    topStore,
  };
}

export async function getDetailedProfitSalesReport(params: {
  organizationId: string;
  fromDate: string;
  toDate: string;
  customerIds?: string[];
  page?: number;
}): Promise<DetailedProfitReportData> {
  const { organizationId, fromDate, toDate, customerIds = [], page = 1 } = params;
  const safePage = Math.max(1, page);
  const summaryReport = await getProfitSalesReport({
    organizationId,
    fromDate,
    toDate,
    customerIds,
  });
  const activeDates = summaryReport.rows.filter((row) => row.orderCount > 0);

  if (activeDates.length === 0) {
    return buildEmptyReport(safePage);
  }

  const totalPages = activeDates.length;
  const effectivePage = Math.min(safePage, totalPages);
  const currentDateRow = activeDates[effectivePage - 1];
  const notes = await fetchDeliveryNotes({
    organizationId,
    fromDate: currentDateRow.isoDate,
    toDate: currentDateRow.isoDate,
    customerIds,
  });
  const items = await fetchDeliveryNoteItems(notes.map((note) => note.id));
  const stores = buildStores(notes, items);

  return {
    stores,
    summary: buildSummary({
      totalSales: summaryReport.summary.totalSales,
      totalCost: summaryReport.summary.totalCost,
      totalNetProfit: summaryReport.summary.totalNetProfit,
      avgMarginPercent: summaryReport.summary.avgMarginPercent,
      stores,
    }),
    insights: buildInsights(stores),
    pagination: {
      page: effectivePage,
      totalPages,
      totalDays: activeDates.length,
      totalStores: notes.length,
      currentDate: currentDateRow.isoDate,
      currentDateOrderCount: currentDateRow.orderCount,
    },
  };
}

export async function getDetailedProfitSalesPrintReport(params: {
  organizationId: string;
  fromDate: string;
  toDate: string;
  customerIds?: string[];
}): Promise<DetailedProfitReportData> {
  const { organizationId, fromDate, toDate, customerIds = [] } = params;
  const summaryReport = await getProfitSalesReport({
    organizationId,
    fromDate,
    toDate,
    customerIds,
  });
  const activeDates = summaryReport.rows.filter((row) => row.orderCount > 0);

  if (activeDates.length === 0) {
    return buildEmptyReport(1);
  }

  const notes = await fetchDeliveryNotes({
    organizationId,
    fromDate,
    toDate,
    customerIds,
  });
  const items = await fetchDeliveryNoteItems(notes.map((note) => note.id));
  const stores = buildStores(notes, items);

  return {
    stores,
    summary: buildSummary({
      totalSales: summaryReport.summary.totalSales,
      totalCost: summaryReport.summary.totalCost,
      totalNetProfit: summaryReport.summary.totalNetProfit,
      avgMarginPercent: summaryReport.summary.avgMarginPercent,
      stores,
    }),
    insights: buildInsights(stores),
    pagination: {
      page: 1,
      totalPages: activeDates.length,
      totalDays: activeDates.length,
      totalStores: notes.length,
      currentDate: null,
      currentDateOrderCount: 0,
    },
  };
}
