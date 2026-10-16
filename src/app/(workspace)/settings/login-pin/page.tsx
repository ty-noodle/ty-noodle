import { Clock3, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { PinSettingsForm } from "@/app/(workspace)/settings/login-pin/pin-settings-form";
import { SettingsShell } from "@/components/settings/settings-shell";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type AuditLogRow = {
  created_at: string;
  event_type: string;
  id: number;
  user_agent: string | null;
};

export const metadata = {
  title: "ตั้งค่า PIN",
};

function formatThaiDateTime(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function getAuditLabel(eventType: string) {
  if (eventType === "pin_login_succeeded") return "เข้าสู่ระบบสำเร็จ";
  if (eventType === "pin_login_failed") return "รหัสผิด";
  if (eventType === "pin_login_locked") return "ล็อกชั่วคราว";
  if (eventType === "pin_changed") return "เปลี่ยน PIN";
  return "กิจกรรมระบบ";
}

function getDeviceLabel(userAgent: string | null) {
  const value = userAgent?.toLowerCase() ?? "";
  if (!value) return "ไม่ทราบอุปกรณ์";
  if (value.includes("iphone")) return "iPhone";
  if (value.includes("ipad")) return "iPad";
  if (value.includes("android")) return "Android";
  if (value.includes("windows")) return "Windows";
  if (value.includes("macintosh") || value.includes("mac os")) return "Mac";
  return "อุปกรณ์อื่น";
}

export default async function LoginPinSettingsPage() {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();

  const { data: logs } = await admin
    .from("auth_audit_logs")
    .select("id, event_type, created_at, user_agent")
    .eq("user_id", session.userId)
    .order("created_at", { ascending: false })
    .limit(8);

  const auditLogs = (logs ?? []) as AuditLogRow[];

  return (
    <SettingsShell
      title="ตั้งค่า PIN"
      description="เปลี่ยนรหัสเข้าใช้งานสำหรับผู้ดูแลระบบ"
      floatingSubmit={false}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <PinSettingsForm />

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)] sm:p-7">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-[#003366]">
              <MonitorSmartphone className="h-6 w-6" strokeWidth={2.4} />
            </span>
            <div className="min-w-0">
              <h2 className="text-xl font-black text-slate-950">ประวัติการเข้าใช้งาน</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">รายการล่าสุดของบัญชีนี้</p>
            </div>
          </div>

          <div className="mt-6 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">
            {auditLogs.length === 0 ? (
              <div className="flex min-h-32 flex-col items-center justify-center gap-3 bg-slate-50 px-4 text-center">
                <ShieldCheck className="h-8 w-8 text-slate-300" strokeWidth={2.2} />
                <p className="text-sm font-bold text-slate-500">ยังไม่มีประวัติ</p>
              </div>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id} className="grid gap-3 bg-white px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="text-base font-black text-slate-950">{getAuditLabel(log.event_type)}</p>
                    <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-500">
                      <Clock3 className="h-4 w-4" strokeWidth={2.2} />
                      {formatThaiDateTime(log.created_at)}
                    </p>
                  </div>
                  <span className="inline-flex w-fit rounded-full bg-[#003366]/8 px-3 py-1 text-xs font-black text-[#003366]">
                    {getDeviceLabel(log.user_agent)}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </SettingsShell>
  );
}
