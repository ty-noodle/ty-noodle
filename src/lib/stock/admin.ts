import "server-only";

import { cache } from "react";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getEffectiveSaleUnitCost,
  normalizeSaleUnitCostMode,
  type SaleUnitCostMode,
} from "@/lib/products/sale-unit-cost";


export type StockProductOption = {
  costPrice: number;
  id: string;
  imageUrl: string | null;
  isActive: boolean;
  name: string;
  onHandQuantity: number;
  reservedQuantity: number;
  saleUnits: {
    baseUnitQuantity: number;
    costMode: SaleUnitCostMode;
    effectiveCostPrice: number;
    id: string;
    isDefault: boolean;
    label: string;
  }[];
  categoryName: string | null;
  sku: string;
  unit: string;
};

export type StockSupplierOption = {
  id: string;
  name: string;
  code: string;
};

export type StockMovementRow = {
  createdAt: string;
  id: string;
  movementType: string;
  notes: string | null;
  productId: string;
  productName: string;
  quantityDelta: number;
  receiptUrl: string | null;
  referenceNumber: string | null;
  sku: string;
  stockAfter: number;
  stockBefore: number;
};

export type StockDashboardData = {
  lowStockCount: number;
  movementRows: StockMovementRow[];
  products: StockProductOption[];
  suppliers: StockSupplierOption[];
  reservedTotal: number;
  setupHint: string | null;
  totalOnHandValue: number;
};

type ProductRow = {
  cost_price: number | string;
  id: string;
  is_active: boolean;
  name: string;
  reserved_quantity: number | string;
  sku: string;
  stock_quantity: number | string;
  unit: string;
  product_category_items: Array<{
    product_categories: {
      name: string;
    } | null;
  }>;
};

type ProductImageRow = {
  product_id: string;
  public_url: string;
  sort_order: number;
};

type StockSaleUnitRow = {
  base_unit_quantity: number | string;
  cost_mode: string | null;
  fixed_cost_price: number | string | null;
  id: string;
  is_active: boolean;
  is_default: boolean;
  product_id: string;
  sort_order: number | string;
  unit_label: string;
};

type SupplierRow = {
  id: string;
  name: string;
  supplier_code: string;
};

type MovementRow = {
  created_at: string;
  id: string;
  inventory_receipts: { receipt_url: string | null } | null;
  movement_type: string;
  notes: string | null;
  product_id: string;
  quantity_delta: number | string;
  reference_number: string | null;
  stock_after: number | string;
  stock_before: number | string;
};

function isMissingTableError(message: string | undefined) {
  return Boolean(message?.includes('relation "public.'));
}

export type StockHistoryRow = {
  createdAt: string;
  id: string;
  itemCount: number;
  notes: string | null;
  receiptNumber: string;
  receiptUrl: string | null;
  receivedAt: string;
  supplierId: string | null;
  supplierName: string;
  totalAmount: number;
};

export const getStockHistoryData = cache(
  async (organizationId: string, limit = 50, offset = 0): Promise<StockHistoryRow[]> => {
    const admin = getSupabaseAdmin();

    const { data, error } = await admin
      .from("inventory_receipts")
      .select(`
        id, receipt_number, supplier_name, supplier_id, received_at, created_at, notes, receipt_url,
        inventory_receipt_items(quantity_received, unit_cost),
        suppliers(name)
      `)
      .eq("organization_id", organizationId)
      .order("received_at", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error || !data) return [];

    return (data as unknown as {
      id: string;
      receipt_number: string;
      supplier_name: string;
      supplier_id: string | null;
      received_at: string;
      created_at: string;
      notes: string | null;
      receipt_url: string | null;
      inventory_receipt_items: { quantity_received: number; unit_cost: number }[];
      suppliers: { name: string } | null;
    }[]).map((r) => {
      const items = r.inventory_receipt_items || [];
      const totalAmount = items.reduce(
        (sum: number, it: { quantity_received: number; unit_cost: number }) => sum + Number(it.quantity_received) * Number(it.unit_cost),
        0,
      );

      return {
        createdAt: r.created_at,
        id: r.id,
        itemCount: items.length,
        notes: r.notes,
        receiptNumber: r.receipt_number,
        receiptUrl: r.receipt_url,
        receivedAt: r.received_at,
        supplierId: r.supplier_id,
        supplierName: r.suppliers?.name || r.supplier_name || "ไม่ระบุผู้ขาย",
        totalAmount,
      };
    });
  },
);

export type StockReceiptDetail = StockHistoryRow & {
  items: {
    productId: string;
    productName: string;
    sku: string;
    quantityReceived: number;
    unit: string;
    unitCost: number;
    lineTotal: number;
  }[];
  createdBy: string | null;
  createdByName: string | null;
  supplierAddress: string | null;
};

export const getStockReceiptDetail = cache(
  async (organizationId: string, receiptId: string): Promise<StockReceiptDetail | null> => {
    const admin = getSupabaseAdmin();

    const { data, error } = await admin
      .from("inventory_receipts")
      .select(`
        id, receipt_number, supplier_name, supplier_id, received_at, created_at, notes, receipt_url,
        inventory_receipt_items(
          product_id, quantity_received, unit, unit_cost,
          products(name, sku, unit)
        ),
        suppliers(name, address, province, district, subdistrict, postal_code),
        profiles:created_by(display_name)
      `)
      .eq("organization_id", organizationId)
      .eq("id", receiptId)
      .maybeSingle();

    if (error || !data) return null;

    interface ReceiptItemRow {
      product_id: string;
      unit: string;
      unit_cost: number;
      quantity_received: number;
      products: { name: string; sku: string; unit: string; } | null;
    }

    interface ReceiptRow {
      id: string;
      created_at: string;
      received_at: string;
      receipt_number: string;
      notes: string | null;
      receipt_url: string | null;
      supplier_id: string | null;
      supplier_name: string | null;
      suppliers: { name: string; address: string | null } | null;
      inventory_receipt_items: ReceiptItemRow[];
      created_by: string | null;
      profiles: { display_name: string | null } | null;
    }

    const r = data as unknown as ReceiptRow;
    const items = (r.inventory_receipt_items || []).map((it) => ({
      productId: it.product_id,
      productName: it.products?.name || "สินค้าไม่ทราบชื่อ",
      sku: it.products?.sku || "-",
      quantityReceived: Number(it.quantity_received),
      unit: it.products?.unit ?? it.unit,
      unitCost: Number(it.unit_cost),
      lineTotal: Number(it.quantity_received) * Number(it.unit_cost),
    }));

    const totalAmount = items.reduce((sum, it) => sum + it.lineTotal, 0);

    return {
      createdAt: r.created_at,
      id: r.id,
      itemCount: items.length,
      notes: r.notes,
      receiptNumber: r.receipt_number,
      receiptUrl: r.receipt_url,
      receivedAt: r.received_at,
      supplierId: r.supplier_id,
      supplierName: r.suppliers?.name || r.supplier_name || "ไม่ระบุผู้ขาย",
      supplierAddress: r.suppliers?.address || null,
      totalAmount,
      items,
      createdBy: r.created_by,
      createdByName: r.profiles?.display_name || null,
    };
  },
);

export const getStockDashboardData = cache(
  async (organizationId: string, movementLimit = 20, movementOffset = 0): Promise<StockDashboardData> => {
    const admin = getSupabaseAdmin();

    const [productsResult, imagesResult, saleUnitsResult, movementsResult, suppliersResult] = await Promise.all([
      admin.from("products")
        .select(`
          id, sku, name, cost_price, stock_quantity, reserved_quantity, unit, is_active, display_order,
          product_category_items(product_categories(name))
        `)
        .eq("organization_id", organizationId)
        .order("display_order", { ascending: true })
        .order("sku", { ascending: true }),
      admin.from("product_images")
        .select("product_id, public_url, sort_order")
        .eq("organization_id", organizationId)
        .order("sort_order", { ascending: true }),
      admin.from("product_sale_units")
        .select("id, product_id, unit_label, base_unit_quantity, is_active, is_default, sort_order, cost_mode, fixed_cost_price")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      movementLimit > 0
        ? admin.from("inventory_movements")
            .select(
              "id, product_id, movement_type, quantity_delta, stock_before, stock_after, reference_number, notes, created_at, inventory_receipts(receipt_url)",
            )
            .eq("organization_id", organizationId)
            .order("created_at", { ascending: false })
            .range(movementOffset, movementOffset + movementLimit - 1)
        : Promise.resolve({ data: [] as unknown[], error: null }),
      admin.from("suppliers")
        .select("id, name, supplier_code")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name", { ascending: true }),
    ]);

    const errors = [
      productsResult.error,
      imagesResult.error,
      saleUnitsResult.error,
      movementsResult.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      const firstError = errors[0];

      return {
        lowStockCount: 0,
        movementRows: [],
        products: [],
        suppliers: [],
        reservedTotal: 0,
        setupHint: isMissingTableError(firstError?.message)
          ? "ยังไม่ได้รัน migration สำหรับหน้าสต็อก"
          : "ยังโหลดข้อมูลสต็อกไม่สำเร็จ",
        totalOnHandValue: 0,
      };
    }

    const products = (productsResult.data ?? []) as ProductRow[];
    const images = (imagesResult.data ?? []) as ProductImageRow[];
    const saleUnits = (saleUnitsResult.data ?? []) as StockSaleUnitRow[];
    const movements = (movementsResult.data ?? []) as MovementRow[];
    const suppliers = (suppliersResult.data ?? []) as SupplierRow[];

    const imageMap = new Map<string, string>();
    for (const image of images) {
      if (!imageMap.has(image.product_id)) {
        imageMap.set(image.product_id, image.public_url);
      }
    }

    const saleUnitMap = new Map<string, StockSaleUnitRow[]>();
    for (const saleUnit of saleUnits) {
      const current = saleUnitMap.get(saleUnit.product_id) ?? [];
      current.push(saleUnit);
      saleUnitMap.set(saleUnit.product_id, current);
    }

    const productMap = new Map(products.map((product) => [product.id, product]));
    const normalizedProducts = products.map((product) => {
      const baseCostPrice = Number(product.cost_price);
      const productSaleUnits = (saleUnitMap.get(product.id) ?? [])
        .toSorted((a, b) => Number(a.sort_order) - Number(b.sort_order))
        .map((su) => {
          const baseUnitQuantity = Number(su.base_unit_quantity);
          const fixedCostPrice = su.fixed_cost_price === null ? null : Number(su.fixed_cost_price);
          const costMode = normalizeSaleUnitCostMode(su.cost_mode);
          return {
            baseUnitQuantity,
            costMode,
            effectiveCostPrice: getEffectiveSaleUnitCost({ baseCostPrice, baseUnitQuantity, costMode, fixedCostPrice }),
            id: su.id,
            isDefault: su.is_default,
            label: product.unit,
          };
        });

      return {
        costPrice: baseCostPrice,
        id: product.id,
        imageUrl: imageMap.get(product.id) ?? null,
        categoryName: product.product_category_items?.[0]?.product_categories?.name ?? null,
        isActive: product.is_active,
        name: product.name,
        onHandQuantity: Number(product.stock_quantity),
        reservedQuantity: Number(product.reserved_quantity),
        saleUnits: productSaleUnits,
        sku: product.sku,
        unit: product.unit,
      };
    });

    return {
      lowStockCount: normalizedProducts.filter((product) => {
        if (!product.isActive) return false;
        const availableQuantity = product.onHandQuantity - product.reservedQuantity;
        return availableQuantity <= 5;
      }).length,
      movementRows: movements.map((movement) => ({
        createdAt: movement.created_at,
        id: movement.id,
        movementType: movement.movement_type,
        notes: movement.notes,
        productId: movement.product_id,
        productName: productMap.get(movement.product_id)?.name ?? "สินค้าไม่ทราบชื่อ",
        quantityDelta: Number(movement.quantity_delta),
        receiptUrl: movement.inventory_receipts?.receipt_url ?? null,
        referenceNumber: movement.reference_number,
        sku: productMap.get(movement.product_id)?.sku ?? "-",
        stockAfter: Number(movement.stock_after),
        stockBefore: Number(movement.stock_before),
      })),
      products: normalizedProducts,
      suppliers: suppliers.map(s => ({
        id: s.id,
        name: s.name,
        code: s.supplier_code
      })),
      reservedTotal: normalizedProducts.reduce(
        (total, product) => total + product.reservedQuantity,
        0,
      ),
      setupHint: null,
      totalOnHandValue: normalizedProducts.reduce(
        (total, product) => total + product.onHandQuantity * product.costPrice,
        0,
      ),
    };
  },
);

export const getStockMovementsData = cache(
  async (organizationId: string, limit = 50, offset = 0): Promise<StockMovementRow[]> => {
    const admin = getSupabaseAdmin();

    const [movementsResult, productsResult] = await Promise.all([
      admin.from("inventory_movements")
        .select(
          "id, product_id, movement_type, quantity_delta, stock_before, stock_after, reference_number, notes, created_at, inventory_receipts(receipt_url)",
        )
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1),
      admin.from("products")
        .select("id, name, sku")
        .eq("organization_id", organizationId),
    ]);

    if (movementsResult.error || !movementsResult.data) return [];

    const movements = (movementsResult.data as unknown as MovementRow[]);
    const products = (productsResult.data as unknown as { id: string; name: string; sku: string }[]);
    const productMap = new Map(products.map(p => [p.id, p]));

    return movements.map((movement) => ({
      createdAt: movement.created_at,
      id: movement.id,
      movementType: movement.movement_type,
      notes: movement.notes,
      productId: movement.product_id,
      productName: productMap.get(movement.product_id)?.name ?? "สินค้าไม่ทราบชื่อ",
      quantityDelta: Number(movement.quantity_delta),
      receiptUrl: movement.inventory_receipts?.receipt_url ?? null,
      referenceNumber: movement.reference_number,
      sku: productMap.get(movement.product_id)?.sku ?? "-",
      stockAfter: Number(movement.stock_after),
      stockBefore: Number(movement.stock_before),
    }));
  }
);
