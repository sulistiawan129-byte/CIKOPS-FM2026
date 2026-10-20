// CIKOPS Fleet — Service Worker
// Versi: diperbarui tiap deploy supaya cache ter-refresh
const CACHE_NAME = "cikops-fleet-v3";

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

// Push notification (Web Push dari edge function send-web-push) — Driver & TGA
self.addEventListener("push", (event) => {
  let p = { title: "CIKOPS", body: "Ada notifikasi baru", icon: "/icon-192.png", url: "/driver", tag: "cikops", urgent: false };
  try { p = { ...p, ...event.data.json() }; } catch { if (event.data) p.body = event.data.text(); }
  event.waitUntil(
    self.registration.showNotification(p.title, {
      body: p.body,
      icon: p.icon,
      badge: p.icon,
      tag: p.tag,
      renotify: true,
      requireInteraction: !!p.urgent,
      vibrate: [300, 120, 300, 120, 300, 400, 300, 120, 300],
      data: { url: p.url },
    })
  );
});

// Klik notifikasi → buka / fokuskan aplikasi yang sesuai (/tga atau /driver)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/driver";
  const base = url.split("?")[0];
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      const hit = cs.find((c) => new URL(c.url).pathname.startsWith(base));
      if (hit) { hit.postMessage({ type: "push-click" }); return hit.focus(); }
      return clients.openWindow(url);
    })
  );
});
