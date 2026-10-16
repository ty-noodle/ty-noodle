import { OrderWindowSettingsForm } from "@/components/settings/order-window-settings-form";
import { SettingsShell } from "@/components/settings/settings-shell";
import { requireAppRole } from "@/lib/auth/authorization";
import { getOrderWindowSettings } from "@/lib/order-window-server";

export const metadata = {
  title: "เวลารับออเดอร์และแจ้งเตือน",
};

export default async function SettingsOrderWindowPage() {
  const session = await requireAppRole("admin");
  const settings = await getOrderWindowSettings(session.organizationId);

  return (
    <SettingsShell
      title="เวลารับออเดอร์และแจ้งเตือน"
      description="ตั้งเวลารับออเดอร์จริงของร้าน พร้อมเปิดหรือปิดแจ้งเตือนออเดอร์ใหม่บนอุปกรณ์นี้ได้จากหน้าเดียว"
      floatingSubmit={false}
    >
      <OrderWindowSettingsForm
        initialAllowOrderAfterCutoff={settings.allowOrderAfterCutoff}
        initialCloseTime={settings.closeTime}
        initialOpenTime={settings.openTime}
      />
    </SettingsShell>
  );
}
