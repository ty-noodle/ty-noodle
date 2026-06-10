import { NextRequest, NextResponse } from "next/server";
import {
  createOrderCustomerSessionPayload,
  createOrderCustomerSessionValue,
  ORDER_CUSTOMER_SESSION_COOKIE,
  readOrderCustomerSessionValue,
  type OrderCustomerSessionPayload,
} from "@/lib/auth/order-session";
import type { Database } from "@/types/database";
import { verifyLineIdToken } from "@/lib/line/id-token";
import { getLinkedCustomerByLineUserId } from "@/lib/orders/line-pending";
import { maskLineUserId } from "@/lib/order-debug";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function setOrderSessionCookie(response: NextResponse, payload: OrderCustomerSessionPayload) {
  response.cookies.set({
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_SECONDS,
    name: ORDER_CUSTOMER_SESSION_COOKIE,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    value: createOrderCustomerSessionValue(payload),
  });
}

function clearOrderSessionCookie(response: NextResponse) {
  response.cookies.set({
    httpOnly: true,
    maxAge: 0,
    name: ORDER_CUSTOMER_SESSION_COOKIE,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    value: "",
  });
}

type SessionCustomer = {
  customer_code: string | null;
  id: string;
  line_user_id: string | null;
  metadata: Database["public"]["Tables"]["customers"]["Row"]["metadata"];
  name: string;
  organization_id: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getOptionalTrimmedText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function syncCustomerLineProfile(
  customer: SessionCustomer,
  input: { displayName?: string | null; pictureUrl?: string | null },
) {
  const displayName = getOptionalTrimmedText(input.displayName);
  const pictureUrl = getOptionalTrimmedText(input.pictureUrl);

  if ((!displayName && !pictureUrl) || !customer.line_user_id) {
    return;
  }

  const currentMetadata = isRecord(customer.metadata) ? { ...customer.metadata } : {};
  const currentLineProfile = isRecord(currentMetadata.lineProfile)
    ? currentMetadata.lineProfile
    : {};
  const currentDisplayName = getOptionalTrimmedText(currentLineProfile.displayName);
  const currentPictureUrl = getOptionalTrimmedText(currentLineProfile.pictureUrl);
  const hasNewDisplayName = Boolean(displayName && currentDisplayName !== displayName);
  const hasNewPictureUrl = Boolean(pictureUrl && currentPictureUrl !== pictureUrl);

  if (!hasNewDisplayName && !hasNewPictureUrl) {
    return;
  }

  const supabase = getSupabaseAdmin();
  await supabase
    .from("customers")
    .update({
      metadata: {
        ...currentMetadata,
        lineProfile: {
          ...currentLineProfile,
          ...(hasNewDisplayName ? { displayName } : {}),
          ...(hasNewPictureUrl ? { pictureUrl } : {}),
          syncedAt: new Date().toISOString(),
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", customer.id)
    .eq("organization_id", customer.organization_id);
}

async function syncLineOrderCustomerProfile(
  customer: SessionCustomer,
  input: { displayName?: string | null; pictureUrl?: string | null },
) {
  const displayName = getOptionalTrimmedText(input.displayName);
  const pictureUrl = getOptionalTrimmedText(input.pictureUrl);

  if ((!displayName && !pictureUrl) || !customer.line_user_id) {
    return;
  }

  const updatePayload: Record<string, string> = {};
  if (displayName) updatePayload.line_display_name = displayName;
  if (pictureUrl) updatePayload.line_picture_url = pictureUrl;

  await getSupabaseAdmin()
    .from("line_order_customers")
    .update(updatePayload)
    .eq("organization_id", customer.organization_id)
    .eq("line_user_id", customer.line_user_id);
}

async function findActiveCustomerByLineUserIdForOrganization(
  organizationId: string | null,
  lineUserId: string,
) {
  if (organizationId) {
    return (await getLinkedCustomerByLineUserId(
      organizationId,
      lineUserId,
    )) as SessionCustomer | null;
  }

  const supabase = getSupabaseAdmin();
  const { data: lineCustomer } = await supabase
    .from("line_order_customers")
    .select("customer_id, organization_id")
    .eq("line_user_id", lineUserId)
    .not("customer_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lineCustomer?.customer_id && lineCustomer.organization_id) {
    return (await getLinkedCustomerByLineUserId(
      lineCustomer.organization_id,
      lineUserId,
    )) as SessionCustomer | null;
  }

  const { data: legacyCustomer } = await supabase
    .from("customers")
    .select("id, name, customer_code, organization_id, line_user_id, metadata")
    .eq("line_user_id", lineUserId)
    .eq("is_active", true)
    .maybeSingle();

  return (legacyCustomer ?? null) as SessionCustomer | null;
}

export async function GET(request: NextRequest) {
  const cookieValue = request.cookies.get(ORDER_CUSTOMER_SESSION_COOKIE)?.value;
  const session = readOrderCustomerSessionValue(cookieValue);

  if (!session) {
    const response = NextResponse.json({ authenticated: false });
    if (cookieValue) {
      clearOrderSessionCookie(response);
    }
    return response;
  }

  const customer = await findActiveCustomerByLineUserIdForOrganization(
    session.organizationId,
    session.lineUserId,
  );
  const payload = createOrderCustomerSessionPayload({
    customerId: customer?.id ?? null,
    displayName: session.displayName,
    lineUserId: session.lineUserId,
    organizationId: customer?.organization_id ?? session.organizationId,
  });

  const response = NextResponse.json({
    authenticated: true,
    customer: customer
      ? {
          customerCode: customer.customer_code,
          id: customer.id,
          name: customer.name,
          organizationId: customer.organization_id,
        }
      : null,
    lineUserId: payload.lineUserId,
  });
  setOrderSessionCookie(response, payload);
  return response;
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const body = (await request.json().catch(() => null)) as
    | {
        displayName?: string;
        idToken?: string;
        lineUserId?: string;
        pictureUrl?: string;
      }
    | null;

  const lineUserId = body?.lineUserId?.trim() ?? "";
  const idToken = body?.idToken?.trim() ?? "";
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID?.trim() ?? "";
  const maskedLineUserId = maskLineUserId(lineUserId);

  if (!lineUserId || !idToken || !liffId) {
    console.warn("[order-session:missing-payload]", {
      hasIdToken: Boolean(idToken),
      hasLiffId: Boolean(liffId),
      hasLineUserId: Boolean(lineUserId),
    });
    return NextResponse.json(
      { error: "Missing required session payload." },
      { status: 400 },
    );
  }

  const verified = await verifyLineIdToken(idToken, liffId);
  if (!verified || verified.lineUserId !== lineUserId) {
    console.warn("[order-session:invalid-token]", {
      durationMs: Date.now() - startedAt,
      lineUserId: maskedLineUserId,
      verifiedLineUserId: maskLineUserId(verified?.lineUserId),
    });
    return NextResponse.json({ error: "Invalid LINE token." }, { status: 401 });
  }

  const existingSession = readOrderCustomerSessionValue(
    request.cookies.get(ORDER_CUSTOMER_SESSION_COOKIE)?.value,
  );
  const customer = await findActiveCustomerByLineUserIdForOrganization(
    existingSession?.organizationId ?? null,
    lineUserId,
  );
  const payload = createOrderCustomerSessionPayload({
    customerId: customer?.id ?? null,
    displayName: verified.displayName ?? body?.displayName?.trim() ?? null,
    lineUserId,
    organizationId: customer?.organization_id ?? null,
  });

  const response = NextResponse.json({
    customer: customer
      ? {
          customerCode: customer.customer_code,
          id: customer.id,
          name: customer.name,
          organizationId: customer.organization_id,
        }
      : null,
    success: true,
  });

  if (customer) {
    const lineProfileInput = {
      displayName: verified.displayName ?? body?.displayName ?? null,
      pictureUrl: body?.pictureUrl ?? null,
    };
    await Promise.all([
      syncCustomerLineProfile(customer, lineProfileInput),
      syncLineOrderCustomerProfile(customer, lineProfileInput),
    ]);
  }

  console.info("[order-session:sync]", {
    durationMs: Date.now() - startedAt,
    hasCustomer: Boolean(customer),
    lineUserId: maskedLineUserId,
    organizationId: customer?.organization_id ?? null,
  });
  setOrderSessionCookie(response, payload);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  clearOrderSessionCookie(response);
  return response;
}
