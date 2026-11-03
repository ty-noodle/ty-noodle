import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getSessionSecret } from "@/lib/supabase/env";

export const APP_SESSION_COOKIE = "tynoodle_session";

export type AppSessionPayload = {
  displayName: string;
  expiresAt: string;
  organizationId: string;
  role: "admin" | "member" | "warehouse";
  sessionId: string;
  userId: string;
};

function sign(value: string) {
  return createHmac("sha256", getSessionSecret()).update(value).digest("hex");
}

function encodePayload(payload: AppSessionPayload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function createSessionValue(payload: AppSessionPayload) {
  const encodedPayload = encodePayload(payload);
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function readSessionValue(value: string | undefined) {
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
  ) as AppSessionPayload;

  if (!payload?.sessionId || !payload?.userId || !payload?.role || !payload?.expiresAt) {
    return null;
  }

  if (Date.parse(payload.expiresAt) <= Date.now()) {
    return null;
  }

  return payload;
}

export function isValidSessionValue(value: string | undefined) {
  return Boolean(readSessionValue(value));
}

export async function hasAppSession() {
  const cookieStore = await cookies();
  return isValidSessionValue(cookieStore.get(APP_SESSION_COOKIE)?.value);
}

export async function getAppSession() {
  const cookieStore = await cookies();
  return readSessionValue(cookieStore.get(APP_SESSION_COOKIE)?.value);
}
