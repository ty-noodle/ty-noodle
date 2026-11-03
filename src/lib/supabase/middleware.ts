import { NextResponse, type NextRequest } from "next/server";
import { APP_SESSION_COOKIE, isValidSessionValue } from "@/lib/auth/session";

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const pathname = request.nextUrl.pathname;
  const isProtectedRoute = pathname.startsWith("/dashboard");
  const isAuthRoute = pathname.startsWith("/login");
  const hasSession = isValidSessionValue(
    request.cookies.get(APP_SESSION_COOKIE)?.value,
  );

  if (!hasSession && isProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectedFrom", pathname);
    return NextResponse.redirect(url);
  }

  if (hasSession && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  response.headers.set("Cache-Control", "private, no-store");

  return response;
}
