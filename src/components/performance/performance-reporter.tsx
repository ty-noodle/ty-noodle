"use client";

import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";

export function PerformanceReporter() {
  const pathname = usePathname();

  useReportWebVitals((metric) => {
    if (pathname === "/login") {
      return;
    }

    // Collect only standard Core Web Vitals to keep telemetry lean
    if (
      metric.name !== "FCP" &&
      metric.name !== "LCP" &&
      metric.name !== "CLS" &&
      metric.name !== "FID" &&
      metric.name !== "TTFB"
    ) {
      return;
    }

    const payload = {
      eventType: "web_vital",
      eventName: metric.name,
      durationMs: metric.value,
      metadata: {
        id: metric.id,
        navigationType: metric.navigationType,
      },
    };

    // Use fetch with keepalive: true so that requests are non-blocking
    // and are guaranteed to complete even if the user navigates away.
    fetch("/api/performance", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // Fail silently to ensure telemetry never impacts the user interface
    });
  });

  return null;
}
export default PerformanceReporter;
