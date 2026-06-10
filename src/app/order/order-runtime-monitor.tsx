"use client";

import { useEffect } from "react";
import { reportOrderDebugClient } from "@/lib/order-debug";

export function OrderRuntimeMonitor() {
  useEffect(() => {
    void reportOrderDebugClient("order_runtime_monitor_mounted", {
      href: window.location.href,
      readyState: document.readyState,
    });
  }, []);

  return null;
}
