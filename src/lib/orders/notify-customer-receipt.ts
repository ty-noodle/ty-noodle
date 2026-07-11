import { generateUploadAndNotifyCustomerReceiptImage } from "@/lib/line/customer-receipt-image";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

type ReceiptAdmin = SupabaseClient<Database>;

export async function notifyUpdatedCustomerReceiptForOrder(
  admin: ReceiptAdmin,
  input: {
    orderId: string;
    organizationId: string;
  },
): Promise<string | null> {
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, customer_id, order_date, order_number, total_amount")
    .eq("id", input.orderId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  if (orderError) {
    return orderError.message ?? "โหลดข้อมูลออเดอร์สำหรับส่งใบยืนยันไม่สำเร็จ";
  }

  if (!order?.customer_id) {
    return null;
  }

  const { data: customer, error: customerError } = await admin
    .from("customers")
    .select("name, line_user_id")
    .eq("id", order.customer_id)
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  if (customerError) {
    return customerError.message ?? "โหลดข้อมูลร้านค้าสำหรับส่งใบยืนยันไม่สำเร็จ";
  }

  const lineUserId = customer?.line_user_id?.trim() ?? "";
  if (!lineUserId) {
    return null;
  }

  const { data: orderItems, error: orderItemsError } = await admin
    .from("order_items")
    .select("product_id, quantity, sale_unit_label, unit_price, line_total")
    .eq("order_id", input.orderId)
    .eq("organization_id", input.organizationId);

  if (orderItemsError) {
    return orderItemsError.message ?? "โหลดรายการสินค้าเพื่อส่งใบยืนยันไม่สำเร็จ";
  }

  if (!orderItems || orderItems.length === 0) {
    return null;
  }

  const productIds = Array.from(new Set(orderItems.map((item) => item.product_id).filter(Boolean)));
  const { data: products, error: productsError } = await admin
    .from("products")
    .select("id, name")
    .in("id", productIds)
    .eq("organization_id", input.organizationId);

  if (productsError) {
    return productsError.message ?? "โหลดชื่อสินค้าเพื่อส่งใบยืนยันไม่สำเร็จ";
  }

  const productNameById = new Map((products ?? []).map((product) => [product.id, product.name]));
  const receiptItems = orderItems.map((item) => ({
    lineTotal: Number(item.line_total ?? 0),
    name: productNameById.get(item.product_id) ?? "-",
    quantity: Number(item.quantity ?? 0),
    saleUnitLabel: item.sale_unit_label ?? "",
    unitPrice: Number(item.unit_price ?? 0),
  }));

  const receiptResult = await generateUploadAndNotifyCustomerReceiptImage({
    customerName: customer?.name?.trim() || "ลูกค้า",
    items: receiptItems,
    lineUserId,
    orderDate: order.order_date,
    orderNumber: order.order_number,
    organizationId: input.organizationId,
    totalAmount: Number(order.total_amount ?? 0),
  });

  return "error" in receiptResult ? receiptResult.error : null;
}
