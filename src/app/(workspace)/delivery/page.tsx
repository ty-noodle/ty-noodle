import { requireAnyRole } from "@/lib/auth/authorization";
import { getDeliveryList, calcDeliveryDaySummary } from "@/lib/delivery/delivery-list";
import { AppSidebarLayout } from "@/components/app-sidebar";
import { DeliveryBoard } from "@/components/delivery/delivery-board";
import { MobileSearchProvider } from "@/components/mobile-search/mobile-search-context";
import { signOut } from "@/app/login/actions";
import { LogOut } from "lucide-react";

export const metadata = { title: "จัดส่ง" };

type DeliverySearchParams = { from?: string; to?: string; q?: string };

function today() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
}

function validDate(raw: string | undefined, fallback: string): string {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : fallback;
}

export default async function DeliveryPage({ searchParams }: { searchParams: Promise<DeliverySearchParams> }) {
  const session = await requireAnyRole(["admin", "warehouse"]);
  const params = await searchParams;
  const todayStr = today();
  const from = validDate(params.from, todayStr);
  const to = validDate(params.to, from);
  const safeTo = to < from ? from : to;
  const q = params.q?.trim() ?? "";

  const items = await getDeliveryList(session.organizationId, from, safeTo, q);
  const summary = calcDeliveryDaySummary(items);

  const board = (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <DeliveryBoard items={items} summary={summary} from={from} to={safeTo} q={q} readOnly={session.role === "warehouse"} />
    </div>
  );

  if (session.role === "warehouse") {
    return (
      <MobileSearchProvider>
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
          <span className="text-sm font-bold text-[#003366]">ใบจัดส่ง — T&Y Noodle</span>
          <form action={signOut}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" strokeWidth={2} />
              ออกจากระบบ
            </button>
          </form>
        </header>
        {board}
      </MobileSearchProvider>
    );
  }

  return (
    <AppSidebarLayout>
      {board}
    </AppSidebarLayout>
  );
}
