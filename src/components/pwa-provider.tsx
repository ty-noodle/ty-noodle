"use client";

import { useEffect } from "react";

function isLineLiffUserAgent() {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent || "";
  return userAgent.includes(" LIFF") || userAgent.includes(" Line/");
}

export function PwaProvider() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") {
      return;
    }

    const pathname = window.location.pathname;
    const shouldBypassServiceWorker =
      pathname === "/order" || pathname.startsWith("/order/") || isLineLiffUserAgent();

    if (shouldBypassServiceWorker) {
      void caches.keys().then((keys) => {
        keys.forEach((key) => {
          void caches.delete(key);
        });
      });
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          void registration.unregister();
        });
      });
      return;
    }

    let idleId: number | undefined;
    let timeoutId: number | undefined;
    let cancelled = false;

    const register = () => {
      if (cancelled) return;

      navigator.serviceWorker
        .register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        })
        .catch(() => {
          // Ignore registration failures; the app remains usable online.
        });
    };

    const schedule = () => {
      const requestIdleCallback = window.requestIdleCallback;
      if (typeof requestIdleCallback === "function") {
        idleId = requestIdleCallback.call(window, register, { timeout: 2500 });
      } else {
        timeoutId = window.setTimeout(register, 1200);
      }
    };

    if (document.readyState === "complete") {
      schedule();
    } else {
      window.addEventListener("load", schedule, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("load", schedule);
      if (idleId !== undefined && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  return null;
}
