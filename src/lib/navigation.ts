export function shouldPersistNavigation(pathname: string, role: string | null) {
  if (role !== "admin") return false;

  return ["/dashboard", "/orders/incoming", "/billing", "/delivery"].includes(pathname) ||
    ["/settings", "/reports", "/stock"].some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
}
