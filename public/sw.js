const CACHE_NAME = "T&Y Noodle-v2";
const APP_SHELL = [
  "/",
  "/offline",
  "/manifest.webmanifest",
  "/brand/192x192.png",
  "/brand/512x512.png",
  "/brand/1200x630.png",
];

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

  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(event.request);

      if (cached) {
        return cached;
      }

      return caches.match("/offline");
    }),
  );
});
