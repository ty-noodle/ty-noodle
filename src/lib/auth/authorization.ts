import "server-only";

import { redirect } from "next/navigation";
import { getAppSession, type AppSessionPayload } from "@/lib/auth/session";

export async function requireAppSession() {
  const session = await getAppSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}

export async function requireAppRole(role: "admin" | "member") {
  const session = await requireAppSession();

  if (session.role !== role) {
    redirect("/dashboard");
  }

  return session;
}

/**
 * Allow any of the listed roles. Redirects to /login if not authenticated,
 * or to the role's home page if the role is not permitted.
 */
export async function requireAnyRole(
  roles: AppSessionPayload["role"][],
): Promise<AppSessionPayload> {
  const session = await requireAppSession();

  if (!roles.includes(session.role)) {
    redirect(roleHomePage(session.role));
  }

  return session;
}

/** Default landing page per role after login or when redirected away. */
export function roleHomePage(role: AppSessionPayload["role"]): string {
  if (role === "warehouse") return "/delivery";
  return "/dashboard";
}
