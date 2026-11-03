import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getDeliveryNotePrintData, type DeliveryNotePrintData } from "@/lib/delivery/print";
import type { SnapshotRow } from "./billing-statement";

export type BillingAttachmentData = {
  customerId: string;
  customer: DeliveryNotePrintData["customer"];
  fromDate: string;
  toDate: string;
  billingNumber: string | null;
  notes: DeliveryNotePrintData[];
  grandTotal: number;
};

export type BillingAttachmentParams = {
  record?: string;
  customers?: string;
  deliveries?: string;
  from?: string;
  to?: string;
};

function list(value?: string) {
  return [...new Set((value ?? "").split(",").map(item => item.trim()).filter(Boolean))];
}

function validDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function getBillingAttachments(
  organizationId: string,
  params: BillingAttachmentParams,
): Promise<BillingAttachmentData[]> {
  const supabase = getSupabaseAdmin();
  let customerIds = list(params.customers);
  let numbers = list(params.deliveries);
  let from = params.from;
  let to = params.to;
  let billingNumber: string | null = null;
  let snapshot: SnapshotRow[] = [];

  if (params.record) {
    const { data: record, error } = await supabase.from("billing_records")
      .select("customer_id, billing_number, from_date, to_date, snapshot_rows")
      .eq("organization_id", organizationId)
      .eq("id", params.record)
      .maybeSingle();
    if (error || !record) throw new Error("ไม่พบใบวางบิลที่ต้องการพิมพ์ใบแนบ");
    customerIds = [record.customer_id];
    from = record.from_date;
    to = record.to_date;
    billingNumber = record.billing_number;
    snapshot = Array.isArray(record.snapshot_rows) ? record.snapshot_rows as unknown as SnapshotRow[] : [];
    numbers = [...new Set(snapshot.map(row => row.deliveryNumber).filter(Boolean))];
  }

  if (!validDate(from) || !validDate(to) || from > to) throw new Error("ช่วงวันที่ไม่ถูกต้อง");
  if (!customerIds.length || !numbers.length) throw new Error("กรุณาเลือกร้านค้าและรายการใบส่งของก่อนพิมพ์ใบแนบ");

  const headers: { id: string; customer_id: string; delivery_number: string }[] = [];
  for (let offset = 0; offset < numbers.length; offset += 100) {
    const { data, error } = await supabase.from("delivery_notes")
      .select("id, customer_id, delivery_number")
      .eq("organization_id", organizationId)
      .eq("status", "confirmed")
      .in("customer_id", customerIds)
      .in("delivery_number", numbers.slice(offset, offset + 100))
      .gte("delivery_date", from)
      .lte("delivery_date", to);
    if (error) throw new Error("โหลดใบส่งของไม่สำเร็จ กรุณาลองใหม่");
    headers.push(...(data ?? []));
  }
  if (headers.length !== numbers.length || numbers.some(number => !headers.some(note => note.delivery_number === number))) {
    throw new Error("พบใบส่งของไม่ครบตามรายการที่เลือก อาจมีรายการถูกลบหรือเปลี่ยนสถานะ กรุณาตรวจสอบก่อนพิมพ์");
  }

  const groups = new Map<string, BillingAttachmentData>();
  for (let offset = 0; offset < headers.length; offset += 10) {
    const batch = headers.slice(offset, offset + 10);
    const notes = await Promise.all(batch.map(note => getDeliveryNotePrintData(organizationId, note.id)));
    for (const [index, note] of notes.entries()) {
      if (!note || !note.items.length) throw new Error("โหลดรายการสินค้าในใบส่งของไม่ครบ กรุณาตรวจสอบก่อนพิมพ์");
      // Billing uses item totals; do not reproduce a stale delivery_notes.total_amount.
      const totalAmount = Math.round(note.items.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100;
      const saved = snapshot.find(row => row.deliveryNumber === note.deliveryNumber);
      if (saved && Math.abs(totalAmount - Number(saved.totalAmount)) > 0.011) {
        throw new Error(`ยอดใบส่งของ ${note.deliveryNumber} เปลี่ยนแปลงจากใบวางบิลเดิม กรุณาตรวจสอบก่อนพิมพ์ใบแนบ`);
      }
      const customerId = batch[index].customer_id;
      const group = groups.get(customerId) ?? {
        customerId, customer: note.customer, fromDate: from, toDate: to, billingNumber,
        notes: [], grandTotal: 0,
      };
      group.notes.push({ ...note, totalAmount });
      group.grandTotal = Math.round((group.grandTotal + totalAmount) * 100) / 100;
      groups.set(customerId, group);
    }
  }
  for (const group of groups.values()) {
    group.notes.sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate) || a.deliveryNumber.localeCompare(b.deliveryNumber));
  }
  return [...groups.values()].sort((a, b) => a.customer.code.localeCompare(b.customer.code, "th", { numeric: true }));
}
