"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  APP_SESSION_COOKIE,
  createSessionValue,
  getAppSession,
} from "@/lib/auth/session";
import { roleHomePage } from "@/lib/auth/authorization";
import { createPinLookup, hashRequestIp, verifyPinHash } from "@/lib/auth/pin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  hasPinPepper,
  hasSessionSecret,
  hasSupabaseEnv,
} from "@/lib/supabase/env";

type LoginUserRow = {
  display_name: string;
  id: string;
  is_active: boolean;
  locked_until: string | null;
  organization_id: string;
  pin_hash: string;
  role: "admin" | "member" | "warehouse";
};

type LoginAttemptResult = {
  failed_pin_attempts: number;
  locked_until: string | null;
};

type AppSessionRow = {
  display_name: string;
  expires_at: string;
  organization_id: string;
  role: "admin" | "member" | "warehouse";
  session_id: string;
};

type RpcCapableAdmin = ReturnType<typeof getSupabaseAdmin> & {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

function normalizeOtp(formData: FormData) {
  const directToken = String(formData.get("token") ?? "")
    .replace(/\D/g, "")
    .slice(0, 6);

  if (directToken.length === 6) {
    return directToken;
  }

  const token = Array.from({ length: 6 }, (_, index) =>
    String(formData.get(`digit-${index}`) ?? "")
      .replace(/\D/g, "")
      .slice(0, 1),
  ).join("");

  return token;
}

function ensurePinConfigOrRedirect() {
  if (!hasSupabaseEnv()) {
    redirect("/login?error=missing-supabase-config");
  }
  if (!hasSessionSecret()) {
    redirect("/login?error=missing-session-secret");
  }
  if (!hasPinPepper()) {
    redirect("/login?error=missing-pin-pepper");
  }
}

export async function verifyPin(formData: FormData) {
  ensurePinConfigOrRedirect();

  const token = normalizeOtp(formData);

  if (token.length !== 6) {
    redirect("/login?error=invalid-pin");
  }

  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ipHash = hashRequestIp(ip);
  const userAgent = requestHeaders.get("user-agent");
  const pinLookup = createPinLookup(token);
  const admin = getSupabaseAdmin() as RpcCapableAdmin;

  const { data, error: userError } = await admin
    .from("app_users")
    .select(
      "id, organization_id, display_name, role, is_active, pin_hash, locked_until",
    )
    .eq("pin_lookup", pinLookup)
    .maybeSingle();
  const user = data as LoginUserRow | null;

  if (userError) {
    redirect("/login?error=login-unavailable");
  }

  if (!user || !user.is_active) {
    await admin.rpc("record_pin_auth_result", {
      p_user_id: null,
      p_attempted_lookup: pinLookup,
      p_success: false,
      p_ip_hash: ipHash,
      p_user_agent: userAgent,
    });
    redirect("/login?error=incorrect-pin");
  }

  if (user.locked_until && Date.parse(user.locked_until) > Date.now()) {
    redirect("/login?error=pin-locked");
  }

  const isValidPin = verifyPinHash(token, user.pin_hash);

  if (!isValidPin) {
    const { data: failureState } = await admin.rpc("record_pin_auth_result", {
      p_user_id: user.id,
      p_attempted_lookup: pinLookup,
      p_success: false,
      p_ip_hash: ipHash,
      p_user_agent: userAgent,
    });

    const typedFailureState = failureState as LoginAttemptResult[] | null;
    const lockInfo = Array.isArray(typedFailureState) ? typedFailureState[0] : null;
    const isLocked =
      lockInfo?.locked_until && Date.parse(lockInfo.locked_until) > Date.now();

    redirect(isLocked ? "/login?error=pin-locked" : "/login?error=incorrect-pin");
  }

  const [sessionResult] = await Promise.all([
    admin.rpc("create_app_session", {
      p_user_id: user.id,
      p_ip_hash: ipHash,
      p_user_agent: userAgent,
    }),
    admin
      .rpc("record_pin_auth_result", {
        p_user_id: user.id,
        p_attempted_lookup: pinLookup,
        p_success: true,
        p_ip_hash: ipHash,
        p_user_agent: userAgent,
      })
      .catch(() => null),
  ]);

  const { data: sessionRows, error: sessionError } = sessionResult;

  if (sessionError || !Array.isArray(sessionRows) || !sessionRows[0]) {
    redirect("/login?error=session-unavailable");
  }

  const session = (sessionRows as AppSessionRow[])[0];

  const cookieStore = await cookies();
  cookieStore.set(
    APP_SESSION_COOKIE,
    createSessionValue({
      displayName: session.display_name,
      expiresAt: session.expires_at,
      organizationId: session.organization_id,
      role: session.role,
      sessionId: session.session_id,
      userId: user.id,
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: new Date(session.expires_at),
    },
  );

  redirect(roleHomePage(session.role));
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
  redirect("/login");
}
