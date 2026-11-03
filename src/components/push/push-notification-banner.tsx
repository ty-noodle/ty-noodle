"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCircle2, Download, Smartphone } from "lucide-react";

type PushStatus =
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
      endpoint: subscription.endpoint,
      p256dh,
      auth,
      platform: detectPlatform(),
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to save push subscription.");
  }
}

export function PushNotificationBanner() {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [publicKey, setPublicKey] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        if (!cancelled) setStatus("unsupported");
        return;
      }

      if (detectIOS() && !isStandaloneMode()) {
        if (!cancelled) setStatus("install");
        return;
      }

      try {
        const response = await fetch("/api/push/subscription", { method: "GET" });
        if (!response.ok) {
          throw new Error("Failed to load push notification settings.");
        }

        const data = (await response.json()) as SubscriptionStatusResponse;
        if (!data.configured || !data.publicKey) {
          if (!cancelled) setStatus("unavailable");
          return;
        }

        setPublicKey(data.publicKey);

        const registration = await navigator.serviceWorker.ready;
        if (!("pushManager" in registration)) {
          if (!cancelled) setStatus(detectIOS() ? "install" : "unsupported");
          return;
        }

        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          try {
            await syncSubscription(existing, data.publicKey);
            if (!cancelled) setStatus("subscribed");
            return;
          } catch (error) {
            console.error("[push/banner:syncExisting]", error);
          }
        }

        if (!cancelled) {
          setStatus(Notification.permission === "denied" ? "denied" : "ready");
        }
      } catch (error) {
        console.error("[push/banner:init]", error);
        if (!cancelled) {
          setStatus("error");
          setErrorMessage("ยังไม่สามารถตรวจสอบสถานะแจ้งเตือนได้");
        }
      }
    }

    void loadStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleEnablePush() {
    if (!publicKey || isBusy) return;

    setIsBusy(true);
    setErrorMessage("");

    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const permission = existing ? "granted" : await Notification.requestPermission();

      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "ready");
        return;
      }

      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));

      await syncSubscription(subscription, publicKey);
      setStatus("subscribed");
    } catch (error) {
      console.error("[push/banner:enable]", error);
      setStatus("error");
      setErrorMessage("เปิดแจ้งเตือนไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setIsBusy(false);
    }
  }

  if (status === "loading" || status === "unsupported" || status === "unavailable") {
    return null;
  }

  if (status === "subscribed") {
    return (
      <div className="mx-4 mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 md:mx-6">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2.2} />
          <p className="font-semibold">อุปกรณ์นี้เปิดแจ้งเตือนออเดอร์ใหม่แล้ว</p>
        </div>
      </div>
    );
  }

  if (status === "install") {
    return (
      <div className="mx-4 mt-3 rounded-2xl border border-[#003366]/15 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm md:mx-6">
        <div className="flex items-start gap-3">
          <Download className="mt-0.5 h-5 w-5 shrink-0 text-[#003366]" strokeWidth={2.2} />
          <div className="space-y-1">
            <p className="font-semibold text-slate-900">บน iPhone ต้องติดตั้งเว็บแอปลงหน้าจอก่อน</p>
            <p>เปิดผ่าน Safari แล้วกด Share &gt; Add to Home Screen จากนั้นค่อยกดเปิดแจ้งเตือน</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-4 mt-3 rounded-2xl border border-[#003366]/15 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm md:mx-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <Bell className="mt-0.5 h-5 w-5 shrink-0 text-[#003366]" strokeWidth={2.2} />
          <div className="space-y-1">
            <p className="font-semibold text-slate-900">เปิดแจ้งเตือนออเดอร์ใหม่บนมือถือเครื่องนี้</p>
            <p className="text-slate-600">
              {status === "denied"
                ? "ระบบถูกปฏิเสธสิทธิ์แจ้งเตือนแล้ว กรุณาเปิดสิทธิ์ Notifications ให้เว็บแอปนี้ในเครื่องก่อน"
                : "เมื่อมีออเดอร์ใหม่ ระบบจะส่งแจ้งเตือนมาที่อุปกรณ์นี้ทันที"}
            </p>
            {errorMessage ? <p className="text-sm font-medium text-rose-600">{errorMessage}</p> : null}
          </div>
        </div>

        {status === "ready" ? (
          <button
            type="button"
            onClick={handleEnablePush}
            disabled={isBusy}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#003366] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#002244] disabled:opacity-50"
          >
            <Smartphone className="h-4 w-4" strokeWidth={2.2} />
            {isBusy ? "กำลังเปิด..." : "เปิดแจ้งเตือน"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
