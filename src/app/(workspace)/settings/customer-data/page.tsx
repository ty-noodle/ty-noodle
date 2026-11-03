import { CustomerDataPanel } from "@/components/settings/customer-data-panel";
import { CustomerInquiryModal } from "@/components/settings/customer-inquiry-modal";
import { SettingsShell } from "@/components/settings/settings-shell";
import { roleHomePage } from "@/lib/auth/authorization";
import { getAppSession } from "@/lib/auth/session";
import { getCustomerInquiryById } from "@/lib/customer-inquiries";
import { getCustomerDirectoryData } from "@/lib/settings/customer-directory";
import { redirect } from "next/navigation";

export const metadata = {
  title: "ข้อมูลลูกค้า",
};

type SettingsCustomerDataPageProps = {
  searchParams: Promise<{
    inquiryId?: string;
    open?: string;
  }>;
};

export default async function SettingsCustomerDataPage({
  searchParams,
}: SettingsCustomerDataPageProps) {
  const params = await searchParams;
  const session = await getAppSession();

  if (!session) {
    const currentUrl = new URLSearchParams();
    if (params.inquiryId) currentUrl.set("inquiryId", params.inquiryId);
    if (params.open) currentUrl.set("open", params.open);

    const nextPath = currentUrl.toString()
      ? `/settings/customer-data?${currentUrl.toString()}`
      : "/settings/customer-data";

    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  if (session.role !== "admin") {
    redirect(roleHomePage(session.role));
  }

  const data = await getCustomerDirectoryData(session.organizationId);
  const inquiry =
    params.open === "inquiry-call" && params.inquiryId
      ? await getCustomerInquiryById(session.organizationId, params.inquiryId)
      : null;

  return (
    <SettingsShell
      current="customerData"
      title="ข้อมูลลูกค้า"
      description="ตรวจสอบข้อมูลลูกค้าที่เชื่อม LINE กับร้านค้า ดูสถานะการใช้งาน และจัดการสิทธิ์การสั่งซื้อจากหน้านี้"
      floatingSubmit={false}
    >
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6">
        <CustomerDataPanel data={data} />
      </div>
      <CustomerInquiryModal inquiry={inquiry} />
    </SettingsShell>
  );
}
