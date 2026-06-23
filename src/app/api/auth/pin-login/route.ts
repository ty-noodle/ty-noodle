import { NextResponse, type NextRequest } from "next/server";
import {
  APP_SESSION_COOKIE,
  getAppSessionCookieOptions,
  getLoginPushCookieOptions,
  LOGIN_PUSH_PENDING_COOKIE,
  verifyPinLogin,
} from "@/lib/auth/pin-login";

export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null);

  if (!formData) {
    return NextResponse.json({ ok: false, error: "invalid-pin" }, { status: 400 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = request.headers.get("user-agent");
  const result = await verifyPinLogin({ formData, ip, userAgent });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 200 });
  }

  const response = NextResponse.json({
    ok: true,
    redirectTo: result.redirectTo,
  });

  response.cookies.set(
    APP_SESSION_COOKIE,
    result.sessionCookie.value,
    getAppSessionCookieOptions(result.sessionCookie.expires),
  );
  response.cookies.set(
    LOGIN_PUSH_PENDING_COOKIE,
    result.pushCookie.value,
    getLoginPushCookieOptions(),
  );

  return response;
}
