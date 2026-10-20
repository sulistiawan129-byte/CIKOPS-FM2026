// CIKOPS Fleet — Service Worker
// Versi: diperbarui tiap deploy supaya cache ter-refresh
const CACHE_NAME = "cikops-fleet-v2";

// File statis yang di-cache supaya app bisa loading cepat
const PRECACHE = ["/driver", "/tga", "/manifest-tga.json", "/icon-tga-192.png", "/favicon.png", "/logo.png", "/icon-192.png", "/icon-512.png", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first untuk semua request — fallback ke cache kalau offline
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // Jangan cache request ke Supabase / API — selalu live
  if (url.hostname.includes("supabase") || url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

// Push notification — siap terima push dari server nanti
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = { title: "CIKOPS Fleet", body: "Ada notifikasi baru", icon: "/icon-192.png" };
  try { payload = { ...payload, ...event.data.json() }; } catch {}
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || "/icon-192.png",
      badge: "/icon-192.png",
      vibrate: [260, 110, 260, 110, 260],
      tag: "cikops-task",
      renotify: true,
    })
  );
});

// Klik notifikasi → buka app driver
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      const driver = cs.find((c) => c.url.includes("/driver"));
      if (driver) return driver.focus();
      return clients.openWindow("/driver");
    })
  );
});
