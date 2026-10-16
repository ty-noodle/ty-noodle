import { getAppSession } from "@/lib/auth/session";
import { PersistentAppShell } from "@/components/persistent-app-shell";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await getAppSession();
  return <PersistentAppShell role={session?.role ?? null}>{children}</PersistentAppShell>;
}
