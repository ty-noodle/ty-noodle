"use server";

import { revalidatePath } from "next/cache";
import { revalidateReportPages } from "@/lib/reports/revalidate-report-pages";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
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

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function getDeliveryNumberActualTotals(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  deliveryNumbers: string[],
) {
  if (deliveryNumbers.length === 0) {
    return new Map<string, { deliveryDate: string; totalAmount: number; notes: string | null }>();
  }

  const deliveryNumberChunks = chunkArray(deliveryNumbers, 100);
  const deliveryNotes: { id: string; delivery_number: string; delivery_date: string; total_amount: number; notes: string | null }[] = [];
  for (const chunk of deliveryNumberChunks) {
    const { data, error } = await supabase
      .from("delivery_notes")
      .select("id, delivery_number, delivery_date, total_amount, notes")
      .in("delivery_number", chunk);
    if (error) {
      console.error("Error fetching delivery_notes chunk:", error.message);
      continue;
    }
    if (data) {
      deliveryNotes.push(...(data as { id: string; delivery_number: string; delivery_date: string; total_amount: number; notes: string | null }[]));
    }
  }

  if (deliveryNotes.length === 0) {
    return new Map<string, { deliveryDate: string; totalAmount: number; notes: string | null }>();
  }

  const noteIds = deliveryNotes.map((note) => note.id);
  const noteIdChunks = chunkArray(noteIds, 100);
  const dnItems: { delivery_note_id: string; order_item_id: string | null }[] = [];
  for (const chunk of noteIdChunks) {
    const { data, error } = await supabase
      .from("delivery_note_items")
      .select("delivery_note_id, order_item_id")
      .in("delivery_note_id", chunk);
    if (error) {
      console.error("Error fetching delivery_note_items chunk:", error.message);
      continue;
    }
    if (data) {
      dnItems.push(...(data as { delivery_note_id: string; order_item_id: string | null }[]));
    }
  }

  const orderItemIds = Array.from(
    new Set(dnItems.map((item) => item.order_item_id).filter((id): id is string => Boolean(id))),
  );

  const orderItems: { id: string; line_total: number | null }[] = [];
  if (orderItemIds.length > 0) {
    const orderItemIdChunks = chunkArray(orderItemIds, 100);
    for (const chunk of orderItemIdChunks) {
      const { data, error } = await supabase
        .from("order_items")
        .select("id, line_total")
        .in("id", chunk);
      if (error) {
        console.error("Error fetching order_items chunk:", error.message);
        continue;
      }
      if (data) {
        orderItems.push(...(data as { id: string; line_total: number | null }[]));
      }
    }
  }

  const orderItemTotalMap = new Map(
    orderItems.map((item) => [item.id, Number(item.line_total ?? 0)]),
  );
  const totalsByNoteId = new Map<string, number>();

  for (const noteId of noteIds) {
    totalsByNoteId.set(noteId, 0);
  }

  const seenPairs = new Set<string>();
  for (const item of dnItems) {
    if (!item.order_item_id) continue;
    const dedupeKey = `${item.delivery_note_id}:${item.order_item_id}`;
    if (seenPairs.has(dedupeKey)) continue;
    seenPairs.add(dedupeKey);
    totalsByNoteId.set(
      item.delivery_note_id,
      (totalsByNoteId.get(item.delivery_note_id) ?? 0) + (orderItemTotalMap.get(item.order_item_id) ?? 0),
    );
  }

  return new Map(
    deliveryNotes.map((note) => [
      note.delivery_number,
      {
        deliveryDate: note.delivery_date,
        totalAmount: totalsByNoteId.get(note.id) ?? Number(note.total_amount ?? 0),
        notes: note.notes ?? null,
      },
    ]),
  );
}

async function getDeliveryRowsForBillingRecord(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  organizationId: string,
  customerId: string,
  fromDate: string,
  toDate: string,
) {
  const { data: deliveryNotes, error } = await supabase
    .from("delivery_notes")
    .select("id, delivery_number, delivery_date, total_amount, notes")
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .eq("status", "confirmed")
    .gte("delivery_date", fromDate)
    .lte("delivery_date", toDate)
    .order("delivery_date", { ascending: true })
    .order("delivery_number", { ascending: true });

  if (error || !deliveryNotes || deliveryNotes.length === 0) {
    return [] as SnapshotRow[];
  }

  const totalsByDeliveryNumber = await getDeliveryNumberActualTotals(
    supabase,
    deliveryNotes.map((note) => String(note.delivery_number)),
  );

  return deliveryNotes.map((note, index) => {
    const live = totalsByDeliveryNumber.get(String(note.delivery_number));
    return {
      lineNumber: index + 1,
      deliveryNumber: String(note.delivery_number),
      deliveryDate: live?.deliveryDate ?? String(note.delivery_date),
      totalAmount: Number(live?.totalAmount ?? note.total_amount ?? 0),
      notes: live?.notes ?? note.notes ?? null,
    };
  });
}

async function getDeliveryRowsByDeliveryNumbers(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  organizationId: string,
  customerId: string,
  deliveryNumbers: string[],
) {
  const uniqueNumbers = Array.from(new Set(deliveryNumbers.filter(Boolean)));
  if (uniqueNumbers.length === 0) return [] as SnapshotRow[];

  const { data: deliveryNotes, error } = await supabase
    .from("delivery_notes")
    .select("id, delivery_number, delivery_date, total_amount, notes")
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .in("delivery_number", uniqueNumbers)
    .eq("status", "confirmed")
    .order("delivery_date", { ascending: true })
    .order("delivery_number", { ascending: true });

  if (error || !deliveryNotes || deliveryNotes.length === 0) {
    return [] as SnapshotRow[];
  }

  const totalsByDeliveryNumber = await getDeliveryNumberActualTotals(
    supabase,
    deliveryNotes.map((note) => String(note.delivery_number)),
  );

  return deliveryNotes.map((note, index) => {
    const live = totalsByDeliveryNumber.get(String(note.delivery_number));
    return {
      lineNumber: index + 1,
      deliveryNumber: String(note.delivery_number),
      deliveryDate: live?.deliveryDate ?? String(note.delivery_date),
      totalAmount: Number(live?.totalAmount ?? note.total_amount ?? 0),
      notes: live?.notes ?? note.notes ?? null,
    } satisfies SnapshotRow;
  });
}

export async function recordBillingHistoryAction(params: {
  organizationId: string;
  items: BillingItem[];
}) {
  const supabase = getSupabaseAdmin();
  const db = billingTable(supabase);
  const results: { customerId: string; billingNumber: string }[] = [];

  const { data: existingRecords, error: existingRecordsError } = await db
    .from("billing_records")
    .select("customer_id, billing_number")
    .eq("organization_id", params.organizationId)
    .in(
      "customer_id",
      params.items.map((item) => item.customerId),
    )
    .in(
      "from_date",
      params.items.map((item) => item.fromDate),
    )
    .in(
      "to_date",
      params.items.map((item) => item.toDate),
    );

  if (existingRecordsError) {
    console.error("[billing] failed to check existing billing records", existingRecordsError);
    return {
      success: false as const,
      error: "ตรวจสอบประวัติใบวางบิลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
      results: [],
    };
  }

  const existingMap = new Map<string, string>();
  existingRecords?.forEach((record) => {
    existingMap.set(record.customer_id, record.billing_number);
  });

  for (const item of params.items) {
    const existingNumber = existingMap.get(item.customerId);

    if (existingNumber) {
      results.push({
        customerId: item.customerId,
        billingNumber: existingNumber,
      });
      continue;
    }

    const { data: billingNumber, error: billingNumberError } = await supabase.rpc("next_billing_number", {
      p_organization_id: params.organizationId,
      p_billing_date: item.billingDate,
    });

    if (billingNumberError || !billingNumber) {
      console.error("[billing] failed to generate billing number", billingNumberError);
      return {
        success: false as const,
        error: "สร้างเลขใบวางบิลไม่สำเร็จ ระบบจะไม่สั่งพิมพ์ กรุณาลองใหม่อีกครั้ง",
        results,
      };
    }

    const { error: insertError } = await db.from("billing_records").insert({
      organization_id: params.organizationId,
      customer_id: item.customerId,
      billing_number: billingNumber,
      billing_date: item.billingDate,
      from_date: item.fromDate,
      to_date: item.toDate,
      total_amount: item.totalAmount,
      snapshot_rows: item.snapshotRows,
    });

    if (insertError) {
      console.error("[billing] failed to save billing record", {
        customerId: item.customerId,
        billingNumber,
        error: insertError,
      });
      return {
        success: false as const,
        error: `บันทึกใบวางบิล ${billingNumber} ไม่สำเร็จ ระบบจะไม่สั่งพิมพ์ กรุณาลองใหม่อีกครั้ง`,
        results,
      };
    }

    results.push({ customerId: item.customerId, billingNumber });
  }

  revalidatePath("/billing");
  revalidateReportPages();
  return { success: true, results };
}

export async function syncBillingSnapshotsForDeliveryNumbers(params: {
  organizationId: string;
  customerId: string;
  deliveryNumbers: string[];
  skipRevalidate?: boolean;
}) {
  const deliveryNumbers = Array.from(new Set(params.deliveryNumbers.filter(Boolean)));

  const supabase = getSupabaseAdmin();
  const { data: records, error: recordsError } = await supabase
    .from("billing_records")
    .select("id, total_amount, snapshot_rows, from_date, to_date")
    .eq("organization_id", params.organizationId)
    .eq("customer_id", params.customerId);

  if (recordsError) {
    return { success: false as const, error: recordsError.message ?? "โหลดข้อมูลใบวางบิลไม่สำเร็จ" };
  }

  if (!records || records.length === 0) {
    revalidateReportPages();
    return { success: true as const, updated: 0 };
  }

  let updated = 0;

  for (const record of records) {
    const snapshotRows = Array.isArray(record.snapshot_rows)
      ? (record.snapshot_rows as SnapshotRow[])
      : [];

    if (deliveryNumbers.length > 0) {
      const touched = snapshotRows.some((row) => deliveryNumbers.includes(row.deliveryNumber));
      if (!touched) continue;
    }

    const candidateDeliveryNumbers = Array.from(
      new Set([
        ...snapshotRows.map((row) => String(row.deliveryNumber)).filter(Boolean),
        ...deliveryNumbers,
      ]),
    );

    // Rebuild snapshot from the union of old+new delivery numbers.
    // This keeps billing record number intact and updates rows in place.
    let normalizedRows = await getDeliveryRowsByDeliveryNumbers(
      supabase,
      params.organizationId,
      params.customerId,
      candidateDeliveryNumbers,
    );

    // Fallback for legacy records that had incomplete snapshot numbers.
    if (normalizedRows.length === 0) {
      normalizedRows = await getDeliveryRowsForBillingRecord(
        supabase,
        params.organizationId,
        params.customerId,
        String(record.from_date),
        String(record.to_date),
      );
    }

    // Delete billing record when rows become empty (all referenced orders were deleted)
    if (normalizedRows.length === 0) {
      const { error: deleteError } = await supabase
        .from("billing_records")
        .delete()
        .eq("id", record.id);
        
      if (!deleteError) {
        updated += 1;
      }
      continue;
    }

    const nextTotal = normalizedRows.reduce((sum, row) => sum + Number(row.totalAmount), 0);

    // Calculate new from_date and to_date from normalizedRows
    const dates = normalizedRows.map(row => row.deliveryDate).filter(Boolean).sort();
    const newFromDate = dates[0] || record.from_date;
    const newToDate = dates[dates.length - 1] || record.to_date;
    
    const { error: updateError } = await supabase
      .from("billing_records")
      .update({
        snapshot_rows: normalizedRows,
        total_amount: nextTotal,
        from_date: newFromDate,
        to_date: newToDate,
      })
      .eq("id", record.id);

    if (!updateError) {
      updated += 1;
    }
  }

  if (!params.skipRevalidate) {
    if (updated > 0) {
      revalidatePath("/billing");
    }
    revalidateReportPages();
  }

  return { success: true as const, updated };
}

export async function confirmAndSaveBillingBatchAction(params: {
  fromDate: string;
  toDate: string;
  customerIds: string[];
  billingDate: string;
}) {
  const { requireAppRole } = await import("@/lib/auth/authorization");
  const { getBatchBillingData } = await import("@/lib/billing/billing-statement");
  const session = await requireAppRole("admin");

  const dataList = await getBatchBillingData(
    session.organizationId,
    params.fromDate,
    params.toDate,
    params.billingDate,
    params.customerIds,
  );

  if (dataList.length === 0) {
    return { success: false, error: "No records found" };
  }

  const items = dataList.map((item) => ({
    customerId: item.customer.id,
    billingDate: item.billingDate,
    fromDate: item.fromDate,
    toDate: item.toDate,
    totalAmount: item.grandTotal,
    snapshotRows: item.rows,
  }));

  const result = await recordBillingHistoryAction({
    organizationId: session.organizationId,
    items,
  });

  return result;
}

export async function getBillingHistoryAction(options: {
  from?: string;
  to?: string;
  query?: string;
  customerIds?: string[];
}) {
  const { requireAppRole } = await import("@/lib/auth/authorization");
  const { getBillingHistory } = await import("@/lib/billing/billing-statement");
  const session = await requireAppRole("admin");

  try {
    const history = await getBillingHistory(session.organizationId, options);
    return { success: true, history };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to fetch history";
    return { success: false, error: msg };
  }
}
