import { requireAppRole } from "@/lib/auth/authorization";
import {
  getAllDeliveryNotesPrintDataForDate,
  getMergedDeliveryPrintData,
} from "@/lib/delivery/print";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { DeliveryNoteLayout } from "@/components/print/delivery-note-layout";
import { AutoPrint, PrintButton } from "./print-button";

export const metadata = { title: "ปริ้นใบส่งของ" };

type Props = { searchParams: Promise<{ date?: string; customer?: string; autoprint?: string }> };

export default async function DeliveryBatchPrintPage({ searchParams }: Props) {
  const session = await requireAppRole("admin");
  const params = await searchParams;
  const date = params.date ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
  const customerId = params.customer ?? null;
  const autoprint = params.autoprint === "1";

  const dateLabel = new Intl.DateTimeFormat("th-TH", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok",
  }).format(new Date(date + "T00:00:00"));

  let dns;

  if (customerId) {
    const supabase = getSupabaseAdmin();
    const { data: rows } = await supabase
      .from("delivery_notes")
      .select("id")
      .eq("organization_id", session.organizationId)
      .eq("delivery_date", date)
      .eq("customer_id", customerId)
      .eq("status", "confirmed")
      .order("created_at", { ascending: true });

    const ids = (rows ?? []).map((r: { id: string }) => r.id);
    const merged = ids.length > 0
      ? await getMergedDeliveryPrintData(session.organizationId, ids)
      : null;
    dns = merged ? [merged] : [];
  } else {
    dns = await getAllDeliveryNotesPrintDataForDate(session.organizationId, date);
  }

  return (
    <>
      <style>{`
        @media print { .no-print { display: none !important; } }
        @media screen { body { background: #e5e7eb; } }
      `}</style>

      {autoprint && <AutoPrint />}

      <div className="no-print mb-6 flex items-center gap-3 px-4 pt-4">
        <PrintButton />
        <span className="text-sm font-semibold text-slate-700">
          {dns.length} {customerId ? "ใบ" : "ร้าน"} · {dateLabel}
        </span>
        <a
          href="/delivery"
          className="ml-auto rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          กลับ
        </a>
      </div>

      {dns.length === 0 ? (
        <div className="no-print flex flex-col items-center gap-3 py-24 text-center">
          <p className="text-lg font-semibold text-slate-500">ไม่มีใบส่งของในวันที่เลือก</p>
          <p className="text-sm text-slate-400">{dateLabel}</p>
        </div>
      ) : (
        <DeliveryNoteLayout dns={dns} />
      )}
    </>
  );
}
