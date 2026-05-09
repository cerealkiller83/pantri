/* Pantri service worker
 * - Caches the app shell for offline access (cache-first for static assets, network-first for API)
 * - Handles push events to display notifications
 * - Handles notification-click events to focus or open the app
 */

const SHELL_CACHE = "pantri-shell-v1";
const RUNTIME_CACHE = "pantri-runtime-v1";

const SHELL_ASSETS = [
  "/",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Don't intercept cross-origin or auth requests
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // tRPC handles its own caching
  if (url.pathname.startsWith("/manus-storage/")) return; // signed redirects, don't cache

  // Navigation requests: network-first with shell fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          return resp;
        })
        .catch(() => caches.match("/").then((m) => m ?? Response.error()))
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((resp) => {
        if (resp.ok && resp.type === "basic") {
          const copy = resp.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
        }
        return resp;
      });
    })
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    if (event.data) payload = event.data.json();
  } catch {
    payload = { title: "Pantri", body: event.data?.text?.() ?? "" };
  }
  const title = payload.title || "Pantri";
  const options = {
    body: payload.body || "",
    icon: payload.icon,
    badge: payload.badge,
    data: { url: payload.url || "/" },
    tag: payload.tag,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
