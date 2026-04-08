import { NextRequest, NextResponse } from "next/server";
import {
  createOrderCustomerSessionPayload,
  createOrderCustomerSessionValue,
  ORDER_CUSTOMER_SESSION_COOKIE,
  readOrderCustomerSessionValue,
  type OrderCustomerSessionPayload,
} from "@/lib/auth/order-session";
import { verifyLineIdToken } from "@/lib/line/id-token";
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
  name: string;
  organization_id: string;
};

async function findActiveCustomerByLineUserId(lineUserId: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("customers")
    .select("id, name, customer_code, organization_id")
    .eq("line_user_id", lineUserId)
    .eq("is_active", true)
    .maybeSingle();

  return (data ?? null) as SessionCustomer | null;
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

  const customer = await findActiveCustomerByLineUserId(session.lineUserId);
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
  const body = (await request.json().catch(() => null)) as
    | {
        displayName?: string;
        idToken?: string;
        lineUserId?: string;
      }
    | null;

  const lineUserId = body?.lineUserId?.trim() ?? "";
  const idToken = body?.idToken?.trim() ?? "";
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID?.trim() ?? "";

  if (!lineUserId || !idToken || !liffId) {
    return NextResponse.json(
      { error: "Missing required session payload." },
      { status: 400 },
    );
  }

  const verified = await verifyLineIdToken(idToken, liffId);
  if (!verified || verified.lineUserId !== lineUserId) {
    return NextResponse.json({ error: "Invalid LINE token." }, { status: 401 });
  }

  const customer = await findActiveCustomerByLineUserId(lineUserId);
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

  setOrderSessionCookie(response, payload);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  clearOrderSessionCookie(response);
  return response;
}

