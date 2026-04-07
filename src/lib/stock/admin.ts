import "server-only";

import { cache } from "react";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getEffectiveSaleUnitCost,
  normalizeSaleUnitCostMode,
  type SaleUnitCostMode,
} from "@/lib/products/sale-unit-cost";

type StockAdmin = ReturnType<typeof getSupabaseAdmin> & {
  from: (table: string) => unknown;
};

type SelectQueryResult = Promise<{ data: unknown; error: { message?: string } | null }>;

type SelectTable = {
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      order: (column: string, options: { ascending: boolean }) => SelectQueryResult;
    };
  };
};

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
  sku: string;
  unit: string;
};

export type StockMovementRow = {
  createdAt: string;
  id: string;
  movementType: string;
  notes: string | null;
  productId: string;
  productName: string;
  quantityDelta: number;
  referenceNumber: string | null;
  sku: string;
  stockAfter: number;
  stockBefore: number;
};

export type StockDashboardData = {
  lowStockCount: number;
  movementRows: StockMovementRow[];
  products: StockProductOption[];
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
  is_default: boolean;
  product_id: string;
  sort_order: number | string;
  unit_label: string;
};

type MovementRow = {
  created_at: string;
  id: string;
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

export const getStockDashboardData = cache(
  async (organizationId: string): Promise<StockDashboardData> => {
    const admin = getSupabaseAdmin() as StockAdmin;
    const productsTable = admin.from("products") as unknown as SelectTable;
    const imagesTable = admin.from("product_images") as unknown as SelectTable;
    const saleUnitsTable = admin.from("product_sale_units") as unknown as SelectTable;
    const movementsTable = admin.from("inventory_movements") as unknown as SelectTable;

    const [productsResult, imagesResult, saleUnitsResult, movementsResult] = await Promise.all([
      productsTable
        .select(
          "id, sku, name, cost_price, stock_quantity, reserved_quantity, unit, is_active",
        )
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      imagesTable
        .select("product_id, public_url, sort_order")
        .eq("organization_id", organizationId)
        .order("sort_order", { ascending: true }),
      saleUnitsTable
        .select("id, product_id, unit_label, base_unit_quantity, is_default, sort_order, cost_mode, fixed_cost_price")
        .eq("organization_id", organizationId)
        .order("sort_order", { ascending: true }),
      movementsTable
        .select(
          "id, product_id, movement_type, quantity_delta, stock_before, stock_after, reference_number, notes, created_at",
        )
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
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
    const movements = ((movementsResult.data ?? []) as MovementRow[]).slice(0, 20);

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
            label: su.unit_label,
          };
        });

      return {
        costPrice: baseCostPrice,
        id: product.id,
        imageUrl: imageMap.get(product.id) ?? null,
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
        const availableQuantity = product.onHandQuantity - product.reservedQuantity;
        return availableQuantity > 0 && availableQuantity <= 5;
      }).length,
      movementRows: movements.map((movement) => ({
        createdAt: movement.created_at,
        id: movement.id,
        movementType: movement.movement_type,
        notes: movement.notes,
        productId: movement.product_id,
        productName: productMap.get(movement.product_id)?.name ?? "สินค้าไม่ทราบชื่อ",
        quantityDelta: Number(movement.quantity_delta),
        referenceNumber: movement.reference_number,
        sku: productMap.get(movement.product_id)?.sku ?? "-",
        stockAfter: Number(movement.stock_after),
        stockBefore: Number(movement.stock_before),
      })),
      products: normalizedProducts,
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
