import type { Database } from "@/types/database";

export type Product = Database["public"]["Tables"]["products"]["Row"];
export type ProductImage = Database["public"]["Tables"]["product_images"]["Row"];

export type ProductSaleUnit = Database["public"]["Tables"]["product_sale_units"]["Row"];

export type ProductWithImage = Product & {
  categoryIds: string[];
  categoryNames: string[];
  min_order_qty: number;
  product_id: string;
  product_images?: ProductImage[];
  product_sale_unit_id: string;
  sale_unit_label: string;
  sale_unit_ratio: number;
  step_order_qty: number | null;
  product_sale_units?: ProductSaleUnit[];
};
