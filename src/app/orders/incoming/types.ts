export type ActionResult =
  | { error: string }
  | {
      receiptWarning?: string;
      success: true;
      orderDate?: string;
      orderNumber?: string;
      deliveryNumber?: string;
      incomingOrder?: import("@/lib/orders/detail").IncomingOrderListItem;
      updatedOrder?: {
        id: string;
        notes: string | null;
        productCount: number;
        totalAmount: number;
      };
    };

export type CustomerLastOrderItem = {
  productId: string;
  quantity: number;
  saleUnitBaseQty: number;
  saleUnitId: string | null;
  saleUnitLabel: string;
  unitPrice: number;
};

export type CustomerLastOrderSnapshot = {
  items: CustomerLastOrderItem[];
  orderCount: number;
  sourceDate: string;
};
