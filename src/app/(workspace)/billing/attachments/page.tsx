import { Suspense } from "react";
import { requireAppRole } from "@/lib/auth/authorization";
import { getBillingAttachments, type BillingAttachmentParams } from "@/lib/billing/attachments";
import { BillingAttachmentLayout } from "@/components/print/billing-attachment-layout";

export const metadata = { title: "ใบแนบส่งของประกอบใบวางบิล" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

async function AttachmentPageContent({ searchParams }: Props) {
  const session = await requireAppRole("admin");
  const search = await searchParams;
  const params: BillingAttachmentParams = {};
  for (const key of ["record", "customers", "deliveries", "from", "to"] as const) {
    if (typeof search[key] === "string") params[key] = search[key];
  }
  let groups;
  try {
    groups = await getBillingAttachments(session.organizationId, params);
  } catch (cause) {
    return <main className="mx-auto max-w-xl space-y-4 p-8">
      <h1 className="text-xl font-bold">ยังพิมพ์ใบแนบส่งของไม่ได้</h1>
      <p role="alert" data-attachment-error>{cause instanceof Error ? cause.message : "โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่"}</p>
      <a href="/billing" className="font-bold text-[#003366] underline">กลับหน้าใบวางบิล</a>
    </main>;
  }
  return <BillingAttachmentLayout groups={groups} autoprint={search.autoprint === "1"} />;
}

export default function AttachmentPage(props: Props) {
  return <Suspense fallback={<p className="p-8">กำลังโหลดใบแนบส่งของ…</p>}><AttachmentPageContent {...props} /></Suspense>;
}
