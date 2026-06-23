import "server-only";

import {
  APP_SESSION_COOKIE,
  createSessionValue,
} from "@/lib/auth/session";
import { LOGIN_PUSH_PENDING_COOKIE } from "@/lib/auth/login-push";
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

type PinLoginError =
  | "incorrect-pin"
  | "invalid-pin"
  | "login-unavailable"
  | "missing-pin-pepper"
  | "missing-session-secret"
  | "missing-supabase-config"
  | "pin-locked"
  | "session-unavailable";

type PinLoginResult =
  | {
      ok: true;
      redirectTo: string;
      sessionCookie: {
        expires: Date;
        value: string;
      };
      pushCookie: {
        maxAge: number;
        value: string;
      };
    }
  | {
      ok: false;
      error: PinLoginError;
    };

export function normalizeOtp(formData: FormData) {
  const directToken = String(formData.get("token") ?? "")
    .replace(/\D/g, "")
    .slice(0, 6);

  if (directToken.length === 6) {
    return directToken;
  }

  return Array.from({ length: 6 }, (_, index) =>
    String(formData.get(`digit-${index}`) ?? "")
      .replace(/\D/g, "")
      .slice(0, 1),
  ).join("");
}

export function getSafeNextPath(formData: FormData) {
  const raw = String(formData.get("next") ?? "").trim();

  if (!raw.startsWith("/") || raw.startsWith("//")) {
    return null;
  }

  return raw;
}

function getPinConfigError(): PinLoginError | null {
  if (!hasSupabaseEnv()) {
    return "missing-supabase-config";
  }
  if (!hasSessionSecret()) {
    return "missing-session-secret";
  }
  if (!hasPinPepper()) {
    return "missing-pin-pepper";
  }
  return null;
}

async function createSessionWithSuccessAudit({
  admin,
  ipHash,
  pinLookup,
  userAgent,
  userId,
}: {
  admin: RpcCapableAdmin;
  ipHash: string | null;
  pinLookup: string;
  userAgent: string | null;
  userId: string;
}) {
  const combinedResult = await admin.rpc("create_app_session_with_success_audit", {
    p_user_id: userId,
    p_attempted_lookup: pinLookup,
    p_ip_hash: ipHash,
    p_user_agent: userAgent,
  });

  if (!combinedResult.error) {
    return combinedResult;
  }

  const missingCombinedRpc =
    combinedResult.error.message.includes("create_app_session_with_success_audit") ||
    combinedResult.error.message.includes("function") ||
    combinedResult.error.message.includes("schema cache");

  if (!missingCombinedRpc) {
    return combinedResult;
  }

  const sessionResult = await admin.rpc("create_app_session", {
    p_user_id: userId,
    p_ip_hash: ipHash,
    p_user_agent: userAgent,
  });

  if (sessionResult.error) {
    return sessionResult;
  }

  const auditResult = await admin.rpc("record_pin_auth_result", {
    p_user_id: userId,
    p_attempted_lookup: pinLookup,
    p_success: true,
    p_ip_hash: ipHash,
    p_user_agent: userAgent,
  });

  return auditResult.error ? auditResult : sessionResult;
}

export async function verifyPinLogin({
  formData,
  ip,
  userAgent,
}: {
  formData: FormData;
  ip: string | null;
  userAgent: string | null;
}): Promise<PinLoginResult> {
  const configError = getPinConfigError();
  if (configError) {
    return { ok: false, error: configError };
  }

  const token = normalizeOtp(formData);
  const nextPath = getSafeNextPath(formData);

  if (token.length !== 6) {
    return { ok: false, error: "invalid-pin" };
  }

  const ipHash = hashRequestIp(ip);
  const pinLookup = createPinLookup(token);
  const admin = getSupabaseAdmin() as RpcCapableAdmin;

  const { data, error: userError } = await admin
    .from("app_users")
    .select("id, organization_id, display_name, role, is_active, pin_hash, locked_until")
    .eq("pin_lookup", pinLookup)
    .maybeSingle();
  const user = data as LoginUserRow | null;

  if (userError) {
    return { ok: false, error: "login-unavailable" };
  }

  if (!user || !user.is_active) {
    await admin.rpc("record_pin_auth_result", {
      p_user_id: null,
      p_attempted_lookup: pinLookup,
      p_success: false,
      p_ip_hash: ipHash,
      p_user_agent: userAgent,
    });
    return { ok: false, error: "incorrect-pin" };
  }

  if (user.locked_until && Date.parse(user.locked_until) > Date.now()) {
    return { ok: false, error: "pin-locked" };
  }

  const isValidPin = await verifyPinHash(token, user.pin_hash);

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

    return { ok: false, error: isLocked ? "pin-locked" : "incorrect-pin" };
  }

  const sessionResult = await createSessionWithSuccessAudit({
    admin,
    ipHash,
    pinLookup,
    userAgent,
    userId: user.id,
  });

  const { data: sessionRows, error: sessionError } = sessionResult;

  if (sessionError || !Array.isArray(sessionRows) || !sessionRows[0]) {
    return { ok: false, error: "session-unavailable" };
  }

  const session = (sessionRows as AppSessionRow[])[0];

  return {
    ok: true,
    redirectTo: nextPath ?? roleHomePage(session.role),
    sessionCookie: {
      expires: new Date(session.expires_at),
      value: createSessionValue({
        displayName: session.display_name,
        expiresAt: session.expires_at,
        organizationId: session.organization_id,
        role: session.role,
        sessionId: session.session_id,
        userId: user.id,
      }),
    },
    pushCookie: {
      maxAge: 120,
      value: "1",
    },
  };
}

export function getAppSessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  };
}

export function getLoginPushCookieOptions() {
  return {
    httpOnly: false,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 120,
  };
}

export { APP_SESSION_COOKIE, LOGIN_PUSH_PENDING_COOKIE };
