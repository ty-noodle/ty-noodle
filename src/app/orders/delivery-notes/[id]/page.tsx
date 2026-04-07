import { notFound } from "next/navigation";
import { requireAppRole } from "@/lib/auth/authorization";
import { getDeliveryNotePrintData } from "@/lib/delivery/print";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { DeliveryNoteLayout } from "@/components/print/delivery-note-layout";
import { PrintButton } from "./print-button";
import { EditQuantitiesForm } from "./edit-quantities-form";

export const metadata = { title: "ใบส่งของ" };

type Props = { params: Promise<{ id: string }> };

export default async function DeliveryNotePrintPage({ params }: Props) {
  const { id } = await params;
  const session = await requireAppRole("admin");
  const supabase = getSupabaseAdmin();
  const { data: deliveryNoteRow } = await supabase
    .from("delivery_notes")
    .select("customer_id, delivery_date")
    .eq("id", id)
    .eq("organization_id", session.organizationId)
    .maybeSingle();
  const dn = await getDeliveryNotePrintData(session.organizationId, id);
  if (!dn || !deliveryNoteRow) notFound();

  const mergedPrintHref = `/delivery/print?date=${deliveryNoteRow.delivery_date}&customer=${deliveryNoteRow.customer_id}`;

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <PrintButton />
        <a
          href={mergedPrintHref}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl border border-[#003366]/20 bg-[#003366] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#002244]"
        >
          พิมพ์แบบรวมทั้งร้านในวันเดียวกัน
        </a>
        <a
          href="/orders"
          className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          กลับหน้าออเดอร์
        </a>
      </div>

      <EditQuantitiesForm deliveryNoteId={id} items={dn.items} />
      <DeliveryNoteLayout dns={[dn]} />
    </>
  );
}
