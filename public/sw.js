const CACHE_NAME = "T&Y Noodle-v7";
const APP_SHELL = [
  "/offline",
  "/manifest.webmanifest",
  "/brand/192x192.png",
  "/brand/512x512.png",
  "/brand/1200x630.png",
];
const DEFAULT_NOTIFICATION_URL = "/orders/incoming";

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

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
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
    url.pathname.startsWith("/api/order/") ||
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
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }

          return Promise.resolve(false);
        }),
      ),
    ),
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
      fetch(request)
        .then(cleanResponse)
        .catch(async () => {
          const offlinePage = await caches.match("/offline");
          if (offlinePage) {
            return cleanResponse(offlinePage);
          }

          return new Response("Offline", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }),
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
        const offlinePage = await caches.match("/offline");
        return cleanResponse(offlinePage);
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
