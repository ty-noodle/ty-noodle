const CACHE_NAME = "T&Y Noodle-v11";
const APP_SHELL = [
  "/manifest.webmanifest",
  "/brand/192x192.png",
  "/brand/512x512.png",
  "/brand/1200x630.png",
];
const DEFAULT_NOTIFICATION_URL = "/orders/incoming";

function navigationDiagnostic(request, stage, error, response) {
  const details = {
    version: CACHE_NAME,
    time: new Date().toISOString(),
    path: new URL(request.url).pathname,
    stage,
    error: error ? `${error.name || "Error"}: ${error.message || "Unknown failure"}` : null,
    status: response ? response.status : null,
    responseType: response ? response.type : null,
    redirected: response ? response.redirected : null,
    redirectMode: request.redirect,
    browserOnlineHint: self.navigator.onLine,
    browser: self.navigator.userAgent,
  };
  console.error("[sw] Navigation failure", details);
  return details;
}

function navigationFailureResponse(details) {
  const escaped = JSON.stringify(details, null, 2).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);

  return new Response(`<!doctype html><html lang="th"><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>โหลดระบบไม่สำเร็จ | T&Y Noodle</title>
    <style>body{font-family:system-ui,sans-serif;background:#f4f9ff;color:#172033;margin:0;padding:24px}main{max-width:720px;margin:8vh auto;background:white;padding:28px;border-radius:24px}p{line-height:1.7}a{display:inline-block;background:#003366;color:white;padding:12px 24px;border-radius:12px;text-decoration:none}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f1f5f9;padding:16px;font-size:13px}</style>
    <main><h1>โหลดระบบไม่สำเร็จ</h1>
    <p>เบราว์เซอร์โหลดหน้าเว็บไม่สำเร็จ ข้อความนี้ไม่ได้ยืนยันว่าอินเทอร์เน็ตหลุด กรุณาลองใหม่ หากยังเกิดปัญหา ส่งภาพรายละเอียดด้านล่างให้ผู้ดูแลระบบ</p>
    <a href="/login">ลองโหลดระบบอีกครั้ง</a>
    <h2>รายละเอียดข้อผิดพลาด</h2><pre>${escaped}</pre></main></html>`, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}

/**
 * Strip the `redirected` flag from a Response.
 *
 * iOS Safari in standalone PWA mode refuses a Response with
 * `response.redirected === true` from the Service Worker.
 */
function cleanResponse(response) {
  if (!response || !response.redirected) {
    return response;
  }

  try {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch {
    return response;
  }
}

function getDefaultPushPayload() {
  return {
    title: "มีออเดอร์ใหม่",
    body: "มีคำสั่งซื้อใหม่เข้ามาในระบบ",
    icon: "/brand/192x192.png",
    badge: "/brand/192x192.png",
    url: DEFAULT_NOTIFICATION_URL,
    tag: "new-order",
  };
}

function parsePushPayload(event) {
  if (!event.data) {
    return getDefaultPushPayload();
  }

  try {
    const payload = event.data.json();
    const fallback = getDefaultPushPayload();

    return {
      title: payload?.title || fallback.title,
      body: payload?.body || fallback.body,
      icon: payload?.icon || fallback.icon,
      badge: payload?.badge || fallback.badge,
      url: payload?.url || fallback.url,
      tag: payload?.tag || payload?.topic || fallback.tag,
    };
  } catch (error) {
    console.warn("[sw] Unable to parse push payload:", error);
    return getDefaultPushPayload();
  }
}

function isBypassedRequest(request, url) {
  if (url.origin !== self.location.origin) {
    return false;
  }

  if (
    url.pathname === "/order" ||
    url.pathname.startsWith("/order/") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/")
  ) {
    return true;
  }

  const acceptHeader = request.headers.get("accept") || "";
  if (acceptHeader.includes("text/x-component")) {
    return true;
  }

  if (request.headers.has("rsc") || request.headers.has("next-router-state-tree")) {
    return true;
  }

  return false;
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.registration.navigationPreload
        ? self.registration.navigationPreload.enable()
        : Promise.resolve(),
      caches.keys().then((keys) =>
        Promise.all(
          keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : Promise.resolve(false))),
        ),
      ),
    ]),
  );

  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const { request } = event;
  const url = new URL(request.url);

  if (isBypassedRequest(request, url)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          let response = null;
          try {
            response = await event.preloadResponse;
          } catch (error) {
            navigationDiagnostic(request, "navigation-preload", error);
            response = null;
          }

          if (!response) {
            response = await fetch(request);
          }

          if (!response.ok) {
            navigationDiagnostic(request, "http-response", null, response);
          }
          return cleanResponse(response);
        } catch (error) {
          return navigationFailureResponse(navigationDiagnostic(request, "navigation-fetch", error));
        }
      })(),
    );
    return;
  }

  const isStaticAsset =
    url.origin === self.location.origin &&
    ["style", "script", "image", "font", "manifest"].includes(request.destination);

  if (!isStaticAsset) {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cleanResponse(cached);
        return new Response("Network unavailable", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) return cleanResponse(cached);

      const response = await fetch(request);
      const cleaned = cleanResponse(response);
      if (cleaned && cleaned.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, cleaned.clone());
      }
      return cleaned;
    }),
  );
});

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event);

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      badge: payload.badge,
      tag: payload.tag,
      renotify: true,
      data: {
        url: payload.url,
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || DEFAULT_NOTIFICATION_URL;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const nextUrl = new URL(targetUrl, self.location.origin);

      for (const client of clientList) {
        if (!("focus" in client)) continue;

        const clientUrl = new URL(client.url);
        if (clientUrl.pathname === nextUrl.pathname) {
          if ("navigate" in client && clientUrl.href !== nextUrl.href) {
            return client.navigate(nextUrl.href).then((navigatedClient) => {
              if (navigatedClient && "focus" in navigatedClient) {
                return navigatedClient.focus();
              }

              return client.focus();
            });
          }

          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    }),
  );
});
