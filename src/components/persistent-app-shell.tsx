"use client";

import { usePathname } from "next/navigation";
import { AppSidebarFrame } from "@/components/app-sidebar";
import { shouldPersistNavigation } from "@/lib/navigation";

export function PersistentAppShell({ children, role }: {
  children: React.ReactNode;
  role: string | null;
}) {
  const pathname = usePathname();
  return shouldPersistNavigation(pathname, role)
    ? <AppSidebarFrame>{children}</AppSidebarFrame>
    : children;
}
