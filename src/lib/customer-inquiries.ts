import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type CustomerInquiryRecord = {
  createdAt: string;
  customerName: string;
  customerPhone: string;
  id: string;
  isHandled: boolean;
};

type CustomerInquiryRow = {
  created_at: string;
  customer_name: string;
  customer_phone: string;
  id: string;
  is_handled: boolean;
};

export async function createCustomerInquiry(input: {
  customerName: string;
  customerPhone: string;
  organizationId: string;
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("customer_inquiries")
    .insert({
      customer_name: input.customerName,
      customer_phone: input.customerPhone,
      organization_id: input.organizationId,
      source: "line",
    })
    .select("id, customer_name, customer_phone, is_handled, created_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create customer inquiry");
  }

  const row = data as CustomerInquiryRow;

  return {
    createdAt: row.created_at,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    id: row.id,
    isHandled: row.is_handled,
  } satisfies CustomerInquiryRecord;
}

export async function getCustomerInquiryById(
  organizationId: string,
  inquiryId: string,
): Promise<CustomerInquiryRecord | null> {
  if (!inquiryId.trim()) {
    return null;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("customer_inquiries")
    .select("id, customer_name, customer_phone, is_handled, created_at")
    .eq("organization_id", organizationId)
    .eq("id", inquiryId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as CustomerInquiryRow;

  return {
    createdAt: row.created_at,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    id: row.id,
    isHandled: row.is_handled,
  };
}
