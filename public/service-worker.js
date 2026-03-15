// TruckIQ Service Worker v1.0
const CACHE_NAME = "truckiq-v1";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png"
];

// ─── Install: cache static assets ─────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[TruckIQ SW] Caching static assets");
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// ─── Activate: clean up old caches ────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log("[TruckIQ SW] Deleting old cache:", name);
            return caches.delete(name);
          })
      )
    )
  );
  self.clients.claim();
});

// ─── Fetch: network first, fallback to cache ──────────────────────────────────
self.addEventListener("fetch", (event) => {
  // Skip non-GET and Supabase API requests (always need fresh data)
  if (
    event.request.method !== "GET" ||
    event.request.url.includes("supabase.co")
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache a copy of successful responses
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Network failed — serve from cache
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // Fallback to index.html for navigation requests
          if (event.request.mode === "navigate") {
            return caches.match("/index.html");
          }
        });
      })
  );
});

// ─── Push Notifications (future use) ──────────────────────────────────────────
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "TruckIQ";
  const options = {
    body: data.body || "You have a new notification",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-72x72.png",
    data: { url: data.url || "/" }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || "/")
  );
});
