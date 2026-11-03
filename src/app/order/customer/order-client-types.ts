export type ReceiptItem = {
  name: string;
  saleUnitLabel: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type LastOrderMeta = {
  orderNumber: string;
  totalAmount: number;
  orderDate: string;
  capturedAt: string;
  receiptPushKey: string;
  receiptItems: ReceiptItem[];
};

export type Customer = {
  id: string;
  name: string;
  customer_code: string | null;
  linePictureUrl?: string | null;
};

export type SessionCustomer = {
  id: string;
  linePictureUrl?: string | null;
  name: string;
  customerCode: string | null;
};

export type FrequentProductSummary = {
  productId: string;
  productSaleUnitId: string | null;
  totalQuantity: number;
  orderCount: number;
  lastOrderedAt: string;
};

export type CustomerOrderItem = {
  id?: string;
  product_sale_unit_id?: string | null;
  sale_unit_label?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  line_total?: number | string | null;
  products?: {
    id?: string;
    name?: string | null;
  } | null;
};

export type CustomerOrderRow = {
  id?: string;
  order_number?: string | null;
  order_date?: string | null;
  status?: string | null;
  created_at?: string | null;
  total_amount?: number | string | null;
  order_items?: CustomerOrderItem[] | null;
};

export type ViewState =
  | "loading"
  | "login"
  | "register"
  | "new_inquiry"
  | "inquiry_done"
  | "catalog"
  | "cart"
  | "success"
  | "pending_success"
  | "profile"
  | "history"
  | "edit_order";

export type GeoOption = {
  code: number;
  label: string;
  postalCode?: number;
};
