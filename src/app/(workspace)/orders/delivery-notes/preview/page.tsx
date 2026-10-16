import { requireAnyRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getDeliveryNotePrintData, type DeliveryNotePrintData } from "@/lib/delivery/print";
import { DeliveryNoteLayout } from "@/components/print/delivery-note-layout";
import { PrintButton } from "./print-button";

export const metadata = { title: "พิมพ์ใบส่งของ" };

type Props = {
  searchParams: Promise<{
    date?: string;
    customer_ids?: string;
    note_ids?: string;
  }>;
};

export default async function DeliveryNotePreviewPage({ searchParams }: Props) {
  const session = await requireAnyRole(["admin", "warehouse"]);
  const params = await searchParams;
  const date = params.date;
  const customerIds = (params.customer_ids ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const noteIds = (params.note_ids ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (noteIds.length === 0 && (!date || customerIds.length === 0)) {
    return (
      <div className="p-10 text-center">
        <p className="text-lg font-bold text-slate-900">ไม่มีข้อมูลสำหรับพิมพ์</p>
        <a href="/orders/incoming" className="mt-4 inline-block font-bold text-[#003366]">กลับหน้าออเดอร์</a>
      </div>
    );
  }

  const supabase = getSupabaseAdmin();
  let selectedNoteIds = noteIds;

  if (selectedNoteIds.length === 0 && date) {
    const { data: dns, error } = await supabase
      .from("delivery_notes")
      .select("id")
      .eq("organization_id", session.organizationId)
      .eq("delivery_date", date)
      .in("customer_id", customerIds)
      .neq("status", "cancelled")
      .order("customer_id", { ascending: true });

    if (error || !dns || dns.length === 0) {
      return (
        <div className="p-10 text-center">
          <p className="text-lg font-bold text-slate-900">ไม่พบใบส่งของสำหรับร้านที่เลือกในวันที่ {date}</p>
          <p className="mt-2 text-sm text-slate-500">โปรดยืนยันออเดอร์เพื่อสร้างใบส่งของก่อนพิมพ์</p>
          <a href="/orders/incoming" className="mt-4 inline-block font-bold text-[#003366]">กลับหน้าออเดอร์</a>
        </div>
      );
    }

    selectedNoteIds = dns.map((dn) => dn.id);
  }

  const printDataResults = await Promise.all(
    selectedNoteIds.map((id) => getDeliveryNotePrintData(session.organizationId, id)),
  );

  const validPrintData = printDataResults.filter((data): data is DeliveryNotePrintData => data !== null);

  if (validPrintData.length === 0) {
    return (
      <div className="p-10 text-center">
        <p className="text-lg font-bold text-slate-900">ไม่สามารถโหลดข้อมูลการพิมพ์ได้</p>
        <a href="/orders/incoming" className="mt-4 inline-block font-bold text-[#003366]">กลับหน้าออเดอร์</a>
      </div>
    );
  }

  return (
    <>
      <div className="no-print sticky top-0 z-50 flex items-center gap-3 border-b bg-white p-4">
        <div className="rounded-xl bg-[#003366]/10 px-4 py-2 text-sm font-bold text-[#003366]">
          พิมพ์ใบส่งของ - {validPrintData.length} ร้านค้า
        </div>
        <PrintButton />
        <a href="/orders/incoming" className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 active:scale-95">
          กลับ
        </a>
      </div>

      <div className="min-h-screen bg-slate-50 py-10 print:bg-white print:py-0">
        <DeliveryNoteLayout dns={validPrintData} showIntermediateFooter />
      </div>
    </>
  );
}
