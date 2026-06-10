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

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Ignore registration failures in the starter.
    });
  }, []);

  return null;
}
