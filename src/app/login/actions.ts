"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { APP_SESSION_COOKIE, getAppSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import {
  APP_SESSION_COOKIE as PIN_LOGIN_SESSION_COOKIE,
  getAppSessionCookieOptions,
  getLoginPushCookieOptions,
  LOGIN_PUSH_PENDING_COOKIE,
  verifyPinLogin,
} from "@/lib/auth/pin-login";

type RpcCapableAdmin = ReturnType<typeof getSupabaseAdmin> & {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

export async function verifyPin(formData: FormData) {
  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = requestHeaders.get("user-agent");
  const result = await verifyPinLogin({ formData, ip, userAgent });

  if (!result.ok) {
    redirect(`/login?error=${result.error}`);
  }

  const cookieStore = await cookies();
  cookieStore.set(
    PIN_LOGIN_SESSION_COOKIE,
    result.sessionCookie.value,
    getAppSessionCookieOptions(result.sessionCookie.expires),
  );
  cookieStore.set(
    LOGIN_PUSH_PENDING_COOKIE,
    result.pushCookie.value,
    getLoginPushCookieOptions(),
  );

  redirect(result.redirectTo);
}

export async function signOut() {
  const session = await getAppSession();
  const cookieStore = await cookies();

  if (session && hasSupabaseEnv()) {
    const admin = getSupabaseAdmin() as RpcCapableAdmin;
    await admin.rpc("revoke_app_session", {
      p_session_id: session.sessionId,
    });
  }

  cookieStore.delete(APP_SESSION_COOKIE);
  cookieStore.delete(LOGIN_PUSH_PENDING_COOKIE);
  redirect("/login");
}
