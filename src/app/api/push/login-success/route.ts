import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { LOGIN_PUSH_PENDING_COOKIE } from "@/lib/auth/login-push";
import { getAppSession } from "@/lib/auth/session";
import { sendLoginSuccessPushNotification } from "@/lib/push/web-push";

export async function POST(request: Request) {
  const session = await getAppSession();

  if (!session) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const hasPendingFlag = request.headers
    .get("cookie")
    ?.split(";")
    .some((item) => item.trim().startsWith(`${LOGIN_PUSH_PENDING_COOKIE}=`));

  const response = NextResponse.json({ ok: true, sent: Boolean(hasPendingFlag) });
  response.cookies.delete(LOGIN_PUSH_PENDING_COOKIE);

  if (!hasPendingFlag) {
    return response;
  }

  const requestHeaders = await headers();

  try {
    await sendLoginSuccessPushNotification({
      organizationId: session.organizationId,
      displayName: session.displayName,
      role: session.role,
      userAgent: requestHeaders.get("user-agent"),
    });
  } catch (error) {
    console.error("[push/login-success]", error);
  }

  return response;
}
