"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  Bell,
  BellOff,
  Clock,
  Loader2,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  ChevronDown,
} from "lucide-react";
import {
  updateOrderWindowSettingsAction,
  type OrderWindowSettingsActionState,
} from "@/app/(workspace)/settings/order-window/actions";

type PushPanelStatus =
  | "loading"
  | "unsupported"
  | "install"
  | "ready"
  | "subscribed"
  | "denied"
  | "unavailable"
  | "error";

type SubscriptionStatusResponse = {
  configured: boolean;
  publicKey: string;
  subscriptions: string[];
};

type OrderWindowSettingsFormProps = {
  initialAllowOrderAfterCutoff: boolean;
  initialCloseTime: string;
  initialOpenTime: string;
};

const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0"));

function detectIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isStandaloneMode() {
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

function detectPlatform() {
  const ua = window.navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  if (/mac/.test(ua)) return "mac";
  if (/win/.test(ua)) return "windows";
  return "web";
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

async function syncSubscription(subscription: PushSubscription, publicKey: string) {
  const subscriptionJson = subscription.toJSON();
  const p256dh = subscriptionJson.keys?.p256dh ?? "";
  const auth = subscriptionJson.keys?.auth ?? "";

  if (!subscription.endpoint || !p256dh || !auth || !publicKey) {
    throw new Error("Incomplete push subscription.");
  }

  const response = await fetch("/api/push/subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      auth,
      endpoint: subscription.endpoint,
      p256dh,
      platform: detectPlatform(),
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to save push subscription.");
  }
}

async function disableSubscription(endpoint: string) {
  const response = await fetch("/api/push/subscription", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });

  if (!response.ok) {
    throw new Error("Failed to disable push subscription.");
  }
}

function ModernToggle({
  checked,
  onChange,
  loading = false,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  loading?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={loading}
      className={`relative inline-flex h-[52px] w-[104px] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-4 focus:ring-[#003366]/20 disabled:cursor-not-allowed disabled:opacity-70 ${
        checked ? "bg-[#003366]" : "bg-slate-300"
      }`}
    >
      <span className="sr-only">{label}</span>
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-flex h-[48px] w-[48px] transform items-center justify-center rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
          checked ? "translate-x-[52px]" : "translate-x-0"
        }`}
      >
        {loading ? (
          <Loader2
            className={`h-5 w-5 animate-spin ${checked ? "text-[#003366]" : "text-slate-400"}`}
          />
        ) : (
          <span className={`text-base font-bold ${checked ? "text-[#003366]" : "text-slate-500"}`}>
            {checked ? "เปิด" : "ปิด"}
          </span>
        )}
      </span>
    </button>
  );
}

function TimeSelector({
  value,
  onChange,
  name,
}: {
  value: string;
  onChange: (v: string) => void;
  name: string;
}) {
  const [h, m] = value.split(":");
  return (
    <div className="flex items-center gap-2">
      <input type="hidden" name={name} value={value} />
      <div className="relative">
        <select
          value={h || "00"}
          onChange={(e) => onChange(`${e.target.value}:${m || "00"}`)}
          className="block w-[88px] appearance-none rounded-[1rem] border-0 bg-slate-100 py-3 pl-5 pr-8 text-center text-xl font-bold text-[#003366] shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] focus:outline-none focus:ring-2 focus:ring-[#003366]/30 sm:w-24 sm:pl-6 sm:text-2xl"
        >
          {HOURS.map((hour) => (
            <option key={hour} value={hour}>
              {hour}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      </div>
      <span className="text-2xl font-black text-slate-400">:</span>
      <div className="relative">
        <select
          value={m || "00"}
          onChange={(e) => onChange(`${h || "00"}:${e.target.value}`)}
          className="block w-[88px] appearance-none rounded-[1rem] border-0 bg-slate-100 py-3 pl-5 pr-8 text-center text-xl font-bold text-[#003366] shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] focus:outline-none focus:ring-2 focus:ring-[#003366]/30 sm:w-24 sm:pl-6 sm:text-2xl"
        >
          {MINUTES.map((minute) => (
            <option key={minute} value={minute}>
              {minute}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      </div>
      <span className="ml-2 text-lg font-bold text-slate-500">น.</span>
    </div>
  );
}

export function OrderWindowSettingsForm({
  initialAllowOrderAfterCutoff,
  initialCloseTime,
  initialOpenTime,
}: OrderWindowSettingsFormProps) {
  const initialState = useMemo<OrderWindowSettingsActionState>(
    () => ({
      allowOrderAfterCutoff: initialAllowOrderAfterCutoff,
      closeTime: initialCloseTime,
      message: "",
      openTime: initialOpenTime,
      status: "idle",
    }),
    [initialAllowOrderAfterCutoff, initialCloseTime, initialOpenTime],
  );
  const [state, formAction, isPending] = useActionState(
    updateOrderWindowSettingsAction,
    initialState,
  );
  const [allowOrderAfterCutoff, setAllowOrderAfterCutoff] = useState(
    initialAllowOrderAfterCutoff,
  );
  const [openTime, setOpenTime] = useState(initialOpenTime);
  const [closeTime, setCloseTime] = useState(initialCloseTime);

  const [pushStatus, setPushStatus] = useState<PushPanelStatus>("loading");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushPublicKey, setPushPublicKey] = useState("");
  const [pushErrorMessage, setPushErrorMessage] = useState("");
  const [pushSuccessMessage, setPushSuccessMessage] = useState("");
  const [activeEndpoint, setActiveEndpoint] = useState("");

  const hasChanges =
    allowOrderAfterCutoff !== state.allowOrderAfterCutoff ||
    openTime !== state.openTime ||
    closeTime !== state.closeTime;

  useEffect(() => {
    setAllowOrderAfterCutoff(state.allowOrderAfterCutoff);
    setOpenTime(state.openTime);
    setCloseTime(state.closeTime);
  }, [state.allowOrderAfterCutoff, state.closeTime, state.openTime]);

  useEffect(() => {
    let cancelled = false;

    async function loadPushStatus() {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        if (!cancelled) setPushStatus("unsupported");
        return;
      }

      if (detectIOS() && !isStandaloneMode()) {
        if (!cancelled) setPushStatus("install");
        return;
      }

      try {
        const response = await fetch("/api/push/subscription", { method: "GET" });
        if (!response.ok) {
          throw new Error("Failed to load push notification settings.");
        }

        const data = (await response.json()) as SubscriptionStatusResponse;
        if (!data.configured || !data.publicKey) {
          if (!cancelled) setPushStatus("unavailable");
          return;
        }

        setPushPublicKey(data.publicKey);

        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();

        if (existing) {
          try {
            await syncSubscription(existing, data.publicKey);
          } catch (error) {
            console.error("[push/settings:syncExisting]", error);
          }

          if (!cancelled) {
            setActiveEndpoint(existing.endpoint);
            setPushStatus("subscribed");
          }
          return;
        }

        if (!cancelled) {
          setPushStatus(Notification.permission === "denied" ? "denied" : "ready");
        }
      } catch (error) {
        console.error("[push/settings:init]", error);
        if (!cancelled) {
          setPushStatus("error");
          setPushErrorMessage("ยังไม่สามารถตรวจสอบสถานะแจ้งเตือนได้");
        }
      }
    }

    void loadPushStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pushSuccessMessage) return undefined;

    const timer = window.setTimeout(() => {
      setPushSuccessMessage("");
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [pushSuccessMessage]);

  async function handleTogglePush() {
    if (pushStatus === "subscribed") {
      await handleDisablePush();
    } else {
      await handleEnablePush();
    }
  }

  async function handleEnablePush() {
    if (!pushPublicKey || pushBusy) return;

    setPushBusy(true);
    setPushErrorMessage("");

    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const permission = existing ? "granted" : await Notification.requestPermission();

      if (permission !== "granted") {
        setPushStatus(permission === "denied" ? "denied" : "ready");
        return;
      }

      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          applicationServerKey: urlBase64ToUint8Array(pushPublicKey),
          userVisibleOnly: true,
        }));

      await syncSubscription(subscription, pushPublicKey);
      setActiveEndpoint(subscription.endpoint);
      setPushStatus("subscribed");
      setPushSuccessMessage("เปิดแจ้งเตือนออเดอร์ใหม่บนอุปกรณ์นี้เรียบร้อยแล้ว");
    } catch (error) {
      console.error("[push/settings:enable]", error);
      setPushStatus("error");
      setPushErrorMessage("เปิดแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setPushBusy(false);
    }
  }

  async function handleDisablePush() {
    if (pushBusy) return;

    setPushBusy(true);
    setPushErrorMessage("");

    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const endpoint = existing?.endpoint ?? activeEndpoint;

      if (existing) {
        await existing.unsubscribe();
      }

      if (endpoint) {
        await disableSubscription(endpoint);
      }

      setActiveEndpoint("");
      setPushStatus(Notification.permission === "denied" ? "denied" : "ready");
      setPushSuccessMessage("ปิดแจ้งเตือนบนอุปกรณ์นี้เรียบร้อยแล้ว");
    } catch (error) {
      console.error("[push/settings:disable]", error);
      setPushErrorMessage("ปิดแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      {/* การตั้งค่าเวลาเปิด-ปิดร้าน */}
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-md transition-shadow hover:shadow-lg">
        <div className="border-b border-slate-100 bg-[#003366]/[0.02] px-6 py-6 sm:px-8 sm:py-8">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#003366] text-white shadow-lg shadow-[#003366]/20">
              <Clock className="h-8 w-8" strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800 sm:text-3xl">เวลาทำการร้าน</h2>
              <p className="mt-1.5 text-base font-medium text-slate-500 sm:text-lg">
                กำหนดช่วงเวลาที่ลูกค้าสามารถสั่งออเดอร์หรือแก้ไขข้อมูลเข้ามาได้
              </p>
            </div>
          </div>
        </div>

        <form action={formAction} className="px-6 py-8 sm:px-8 sm:py-10">
          <input
            type="hidden"
            name="allowOrderAfterCutoff"
            value={allowOrderAfterCutoff ? "true" : "false"}
          />

          <div className="mb-10 grid gap-8 md:grid-cols-2">
            <div className="flex flex-col rounded-2xl border border-slate-200 bg-slate-50 p-6 md:p-8">
              <label className="mb-4 block text-lg font-bold text-slate-700">เวลาเริ่มรับออเดอร์</label>
              <TimeSelector
                name="openTime"
                value={openTime}
                onChange={(val) => setOpenTime(val)}
              />
            </div>
            <div className="flex flex-col rounded-2xl border border-slate-200 bg-slate-50 p-6 md:p-8">
              <label className="mb-4 block text-lg font-bold text-slate-700">เวลาปิดรับออเดอร์</label>
              <TimeSelector
                name="closeTime"
                value={closeTime}
                onChange={(val) => setCloseTime(val)}
              />
            </div>
          </div>

          <div className="mb-10 flex flex-col items-center justify-between gap-6 rounded-2xl border border-[#003366]/10 bg-[#003366]/[0.03] p-6 lg:flex-row lg:p-8">
            <div className="flex items-start gap-4">
              <div className="mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-[#003366] shadow-sm">
                <Settings2 className="h-6 w-6" strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-800">อนุญาตให้สั่งออเดอร์นอกเวลา</h3>
                <p className="mt-1.5 text-base leading-relaxed text-slate-600">
                  เปิดเพื่อให้สามารถสั่งของหลังเวลาปิดได้ มักใช้สำหรับทดสอบ หรือเหตุการณ์พิเศษ
                </p>
              </div>
            </div>
            <ModernToggle
              label="เปิดรับออเดอร์นอกเวลา"
              checked={allowOrderAfterCutoff}
              onChange={() => setAllowOrderAfterCutoff((v) => !v)}
            />
          </div>

          {state.message ? (
            <div
              className={`mb-8 rounded-2xl px-6 py-4 text-lg font-semibold ${
                state.status === "error"
                  ? "bg-red-50 text-red-700 ring-1 ring-red-200"
                  : "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-300"
              }`}
            >
              <div className="flex items-center gap-3">
                {state.status === "error" ? (
                  <ShieldAlert className="h-6 w-6 shrink-0" strokeWidth={2} />
                ) : (
                  <ShieldCheck className="h-6 w-6 shrink-0" strokeWidth={2} />
                )}
                {state.message}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setAllowOrderAfterCutoff(state.allowOrderAfterCutoff);
                setOpenTime(state.openTime);
                setCloseTime(state.closeTime);
              }}
              disabled={!hasChanges || isPending}
              className="inline-flex items-center justify-center rounded-2xl px-8 py-4 text-lg font-bold text-slate-600 transition hover:bg-slate-100 disabled:invisible"
            >
              ย้อนกลับค่าเดิม
            </button>
            <button
              type="submit"
              disabled={!hasChanges || isPending}
              className="inline-flex items-center justify-center gap-3 rounded-2xl bg-[#003366] px-10 py-4 text-lg font-bold text-white shadow-lg shadow-[#003366]/20 transition hover:bg-[#002244] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
            >
              {isPending ? <Loader2 className="h-6 w-6 animate-spin" strokeWidth={2} /> : null}
              {isPending ? "กำลังบันทึก..." : "บันทึกการตั้งค่าเวลา"}
            </button>
          </div>
        </form>
      </section>

      {/* การตั้งค่าระบบแจ้งเตือน */}
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-md transition-shadow hover:shadow-lg">
        <div className="border-b border-slate-100 bg-[#003366]/[0.02] px-6 py-6 sm:px-8 sm:py-8">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/20">
              <Bell className="h-8 w-8" strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800 sm:text-3xl">การแจ้งเตือนเครื่องนี้</h2>
              <p className="mt-1.5 text-base font-medium text-slate-500 sm:text-lg">
                ควบคุมการรับแจ้งเตือนออเดอร์เข้าใหม่ เฉพาะสำหรับอุปกรณ์ที่คุณกำลังใช้งานอยู่นี้
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-8 sm:px-8 sm:py-10">
          <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-slate-200 bg-slate-50 p-6 md:flex-row md:items-center lg:p-8">
            <div className="flex items-start gap-4">
              <div
                className={`mt-1 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ${
                  pushStatus === "subscribed" ? "text-emerald-500" : "text-slate-400"
                }`}
              >
                {pushStatus === "subscribed" ? (
                  <Bell className="h-7 w-7" strokeWidth={2} />
                ) : (
                  <BellOff className="h-7 w-7" strokeWidth={2} />
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-slate-800">
                  แจ้งเตือนออเดอร์เข้าใหม่
                </h3>
                <div className="mt-3 text-base leading-relaxed text-slate-600">
                  {pushStatus === "loading" ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" /> กำลังตรวจสอบสถานะ...
                    </span>
                  ) : pushStatus === "install" ? (
                    "บน iPhone ต้องเปิดเวปโปรแกรมจาก Safari แล้วกด Add to Home Screen ก่อนจึงจะเปิดแจ้งเตือนได้"
                  ) : pushStatus === "denied" ? (
                    <span className="text-rose-600">
                      แจ้งเตือนถูกบล็อคไว้ กรุณาตรวจสอบการตั้งค่าของเบราว์เซอร์หรือเครื่องของคุณให้เป็นอนุญาต
                    </span>
                  ) : pushStatus === "subscribed" ? (
                    "ระบบจะส่งเสียงและข้อความเตือนไปยังเครื่องนี้เมื่อมีออเดอร์ใหม่ หรือมีการแก้ไขออเดอร์"
                  ) : (
                    "เปิดสวิตช์เพื่อรับข้อความและการสั่นเตือนบนเครื่องนี้เมื่อมีออเดอร์เข้ามา"
                  )}
                </div>
              </div>
            </div>

            <div className="flex w-full justify-end md:w-auto">
              <ModernToggle
                label="เปิดปิดการแจ้งเตือน"
                checked={pushStatus === "subscribed"}
                loading={pushBusy || pushStatus === "loading"}
                onChange={handleTogglePush}
              />
            </div>
          </div>

          {pushSuccessMessage ? (
            <div className="mt-6 rounded-2xl bg-emerald-50 px-6 py-4 text-base font-bold text-emerald-700 ring-1 ring-emerald-200">
              {pushSuccessMessage}
            </div>
          ) : null}
          {pushErrorMessage ? (
            <div className="mt-6 rounded-2xl bg-rose-50 px-6 py-4 text-base font-bold text-rose-700 ring-1 ring-rose-200">
              {pushErrorMessage}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
