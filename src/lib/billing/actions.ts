"use server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import type { SnapshotRow } from "@/lib/billing/billing-statement";

const billingTable = (supabase: ReturnType<typeof getSupabaseAdmin>) => supabase;

type BillingItem = {
  customerId: string;
  billingDate: string;
  fromDate: string;
  toDate: string;
  totalAmount: number;
  snapshotRows: SnapshotRow[];
};

/**
 * Server Action ออกใบวางบิล — idempotent
 *
 * กดปริ้นซ้ำ (ลูกค้าเดิม + ช่วงวันเดิม) → คืนเลขเดิม ไม่สร้างแถวใหม่
 * กดปริ้นครั้งแรก → generate เลขใหม่ + บันทึก snapshot rows
 */
export async function recordBillingHistoryAction(params: {
  organizationId: string;
  items: BillingItem[];
}) {
  const supabase = getSupabaseAdmin();
  const db = billingTable(supabase);

  const results: { customerId: string; billingNumber: string }[] = [];

  for (const item of params.items) {
    // ตรวจว่าเคยออกใบนี้ไว้แล้วไหม (ลูกค้าเดิม + ช่วงวันเดิม)
    const { data: existing } = await db
      .from("billing_records")
      .select("billing_number")
      .eq("organization_id", params.organizationId)
      .eq("customer_id", item.customerId)
      .eq("from_date", item.fromDate)
      .eq("to_date", item.toDate)
      .maybeSingle();

    if (existing) {
      // เคยออกแล้ว → reuse เลขเดิม ไม่สร้างซ้ำ
      results.push({
        customerId: item.customerId,
        billingNumber: (existing as { billing_number: string }).billing_number,
      });
      continue;
    }

    // ยังไม่เคยออก → generate เลขใหม่
    const { data: billingNumber } = await supabase.rpc("next_billing_number", {
      p_organization_id: params.organizationId,
      p_billing_date: item.billingDate,
    });

    if (billingNumber) {
      await db.from("billing_records").insert({
        organization_id: params.organizationId,
        customer_id: item.customerId,
        billing_number: billingNumber,
        billing_date: item.billingDate,
        from_date: item.fromDate,
        to_date: item.toDate,
        total_amount: item.totalAmount,
        snapshot_rows: item.snapshotRows,
      });
      results.push({ customerId: item.customerId, billingNumber });
    }
  }

  revalidatePath("/billing");
  return { success: true, results };
}
