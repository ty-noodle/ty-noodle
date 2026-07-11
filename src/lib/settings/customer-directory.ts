import "server-only";

import type { Database } from "@/types/database";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { compareCustomerOrder } from "@/lib/settings/customer-order";

type CustomerRow = Pick<
  Database["public"]["Tables"]["customers"]["Row"],
  | "created_at"
  | "customer_code"
  | "id"
  | "is_active"
  | "line_user_id"
  | "metadata"
  | "name"
  | "phone"
>;
type CustomerOrderRow = CustomerRow & { sort_order: number | string };
type LineOrderCustomerRow = Pick<
  Database["public"]["Tables"]["line_order_customers"]["Row"],
  | "created_at"
  | "customer_id"
  | "id"
  | "line_display_name"
  | "line_picture_url"
  | "line_user_id"
  | "updated_at"
>;

type LineProfileSnapshot = {
  displayName: string | null;
  pictureUrl: string | null;
};

export type CustomerDirectoryItem = {
  createdAt: string;
  customerCode: string | null;
  customerId: string | null;
  id: string;
  isActive: boolean;
  isLinked: boolean;
  lineDisplayName: string | null;
  lineLinkId: string;
  linePictureUrl: string | null;
  lineUserId: string;
  name: string;
  phone: string | null;
  sortOrder?: number;
};

export type CustomerDirectoryData = {
  activeCount: number;
  customers: CustomerDirectoryItem[];
  disabledCount: number;
  totalCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getLineProfileSnapshot(metadata: CustomerRow["metadata"]): LineProfileSnapshot {
  if (!isRecord(metadata)) {
    return {
      displayName: null,
      pictureUrl: null,
    };
  }

  const rawLineProfile = metadata.lineProfile;
  if (!isRecord(rawLineProfile)) {
    return {
      displayName: null,
      pictureUrl: null,
    };
  }

  return {
    displayName: getTrimmedString(rawLineProfile.displayName),
    pictureUrl: getTrimmedString(rawLineProfile.pictureUrl),
  };
}

export async function getCustomerDirectoryData(
  organizationId: string,
): Promise<CustomerDirectoryData> {
  const admin = getSupabaseAdmin();
  const { data: lineLinks, error: lineLinksError } = await admin
    .from("line_order_customers")
    .select("id, customer_id, line_user_id, line_display_name, line_picture_url, created_at, updated_at")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false });

  if (lineLinksError) {
    return {
      activeCount: 0,
      customers: [],
      disabledCount: 0,
      totalCount: 0,
    };
  }

  const links = ((lineLinks ?? []) as LineOrderCustomerRow[]).filter((link) =>
    link.line_user_id.trim(),
  );
  const customerIds = Array.from(
    new Set(links.map((link) => link.customer_id).filter((id): id is string => Boolean(id))),
  );

  const { data: customerRows, error: customerError } = customerIds.length
    ? await admin
        .from("customers")
        .select("id, customer_code, name, phone, created_at, is_active, line_user_id, metadata, sort_order")
        .eq("organization_id", organizationId)
        .in("id", customerIds)
    : { data: [] as CustomerRow[], error: null };

  if (customerError) {
    return {
      activeCount: 0,
      customers: [],
      disabledCount: 0,
      totalCount: 0,
    };
  }

  const customerById = new Map(
    ((customerRows ?? []) as unknown as CustomerOrderRow[]).map((customer) => [customer.id, customer]),
  );
  const customers = links
    .map((link) => {
      const customer = link.customer_id ? customerById.get(link.customer_id) : null;
      const lineProfile = customer
        ? getLineProfileSnapshot(customer.metadata)
        : { displayName: null, pictureUrl: null };

      return {
        createdAt: link.updated_at ?? link.created_at,
        customerCode: customer?.customer_code ?? null,
        customerId: customer?.id ?? null,
        id: customer?.id ?? link.id,
        isActive: customer?.is_active ?? false,
        isLinked: Boolean(customer),
        lineDisplayName: getTrimmedString(link.line_display_name) ?? lineProfile.displayName,
        lineLinkId: link.id,
        linePictureUrl: getTrimmedString(link.line_picture_url) ?? lineProfile.pictureUrl,
        lineUserId: link.line_user_id.trim(),
        name: customer?.name ?? "ยังไม่ผูกร้านค้า",
        phone: customer?.phone ?? null,
        sortOrder: customer ? Number((customer as CustomerOrderRow).sort_order) : undefined,
      } satisfies CustomerDirectoryItem;
    })
    .sort((left, right) => {
      if (left.isLinked !== right.isLinked) {
        return left.isLinked ? -1 : 1;
      }

      if (left.isActive !== right.isActive) {
        return left.isActive ? -1 : 1;
      }

      const customerOrder = compareCustomerOrder(left, right);
      if (customerOrder !== 0) return customerOrder;
      return right.createdAt.localeCompare(left.createdAt);
    });

  return {
    activeCount: customers.filter((customer) => customer.isLinked && customer.isActive).length,
    customers,
    disabledCount: customers.filter((customer) => !customer.isLinked || !customer.isActive).length,
    totalCount: customers.length,
  };
}
