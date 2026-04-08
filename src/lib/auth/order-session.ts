import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getSessionSecret } from "@/lib/supabase/env";

export const ORDER_CUSTOMER_SESSION_COOKIE = "tynoodle_order_session";
const ORDER_CUSTOMER_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export type OrderCustomerSessionPayload = {
  customerId: string | null;
  displayName: string | null;
  expiresAt: string;
  lineUserId: string;
  organizationId: string | null;
};

function sign(value: string) {
  return createHmac("sha256", getSessionSecret()).update(value).digest("hex");
}

function encodePayload(payload: OrderCustomerSessionPayload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function createOrderCustomerSessionPayload(input: {
  customerId?: string | null;
  displayName?: string | null;
  lineUserId: string;
  organizationId?: string | null;
}) {
  return {
    customerId: input.customerId ?? null,
    displayName: input.displayName ?? null,
    expiresAt: new Date(Date.now() + ORDER_CUSTOMER_SESSION_TTL_MS).toISOString(),
    lineUserId: input.lineUserId,
    organizationId: input.organizationId ?? null,
  } satisfies OrderCustomerSessionPayload;
}

export function createOrderCustomerSessionValue(payload: OrderCustomerSessionPayload) {
  const encodedPayload = encodePayload(payload);
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function readOrderCustomerSessionValue(value: string | undefined) {
  if (!value) {
    return null;
  }

  const [encodedPayload, signature] = value.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expected = sign(encodedPayload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);

  if (left.length !== right.length) {
    return null;
  }

  if (!timingSafeEqual(left, right)) {
    return null;
  }

  const payload = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString("utf8"),
  ) as OrderCustomerSessionPayload;

  if (!payload?.lineUserId || !payload?.expiresAt) {
    return null;
  }

  if (Date.parse(payload.expiresAt) <= Date.now()) {
    return null;
  }

  return payload;
}

export async function getOrderCustomerSession() {
  const cookieStore = await cookies();
  return readOrderCustomerSessionValue(
    cookieStore.get(ORDER_CUSTOMER_SESSION_COOKIE)?.value,
  );
}

