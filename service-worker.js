const CACHE_NAME = "campusshield-offline-v2";
const OFFLINE_URL = "./offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("campusshield-offline-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) {
    payload = { body: event.data ? event.data.text() : "You have a new CampusShield update." };
  }
  const title = String(payload.title || "CampusShield AI").slice(0, 80);
  const body = String(payload.body || "You have a new campus update.").slice(0, 180);
  const tag = String(payload.tag || "campusshield-update").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80);
  const targetPath = typeof payload.url === "string" ? payload.url : "./";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "./icons/campusshield-192.png",
    badge: "./icons/campusshield-192.png",
    tag,
    data: { url: targetPath },
    renotify: false,
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = String(event.notification.data?.url || "./");
  let target;
  try {
    target = new URL(path, self.registration.scope);
    const scopePath = new URL(self.registration.scope).pathname;
    if (target.origin !== self.location.origin || !target.pathname.startsWith(scopePath)) {
      target = new URL("./", self.registration.scope);
    }
  } catch (_) {
    target = new URL("./", self.registration.scope);
  }
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.registration.scope) && "focus" in client) {
        if ("navigate" in client && client.url !== target.href) await client.navigate(target.href);
        return client.focus();
      }
    }
    return self.clients.openWindow(target.href);
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode !== "navigate") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error())
  );
});
