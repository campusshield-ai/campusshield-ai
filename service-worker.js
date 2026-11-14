const CACHE_NAME = "campusshield-offline-v13";
const STATIC_CACHE_NAME = "campusshield-static-v18";
const BRAND_STYLESHEET_URL = "./campusshield-brand-system.css";
const MODULE_STYLESHEET_URL = "./campusshield-module-experience.css?v=20261110-2";
const SHIELDMIND_CHAT_STYLESHEET_URL = "./shieldmind-chat-history.css?v=20261110-1";
const CAMPUS_CHAT_STYLESHEET_URL = "./campus-chat-room-upgrade.css";
const OFFLINE_URL = "./offline.html";
const STATIC_DESTINATIONS = new Set(["script", "style", "image", "font"]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all([
        cache.add(OFFLINE_URL),
        cache.add(BRAND_STYLESHEET_URL),
        cache.add(MODULE_STYLESHEET_URL),
        cache.add(SHIELDMIND_CHAT_STYLESHEET_URL),
        cache.add(CAMPUS_CHAT_STYLESHEET_URL)
      ]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) =>
          ((key.startsWith("campusshield-offline-") && key !== CACHE_NAME) ||
           (key.startsWith("campusshield-static-") && key !== STATIC_CACHE_NAME))
        )
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) {}
  const title = typeof payload.title === "string" ? payload.title.slice(0, 100) : "CampusShield AI";
  const body = typeof payload.body === "string" ? payload.body.slice(0, 220) : "You have a new campus update.";
  const allowedPages = new Set(["./", "./?page=timetable", "./?page=campus-messages", "./?page=noticeboard", "./?page=profile-settings"]);
  const requestedUrl = typeof payload.url === "string" && allowedPages.has(payload.url) ? payload.url : "./";
  const iconUrl = new URL("icons/campusshield-192.png", self.registration.scope).href;
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: iconUrl,
    badge: iconUrl,
    tag: typeof payload.tag === "string" ? payload.tag.slice(0, 80) : "campusshield-update",
    data: { url: requestedUrl },
    renotify: false
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const scopeUrl = new URL(self.registration.scope);
  const requested = event.notification.data && typeof event.notification.data.url === "string"
    ? event.notification.data.url : "./";
  let target = new URL(requested, scopeUrl);
  if (target.origin !== scopeUrl.origin || !target.pathname.startsWith(scopeUrl.pathname)) {
    target = scopeUrl;
  }
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      const clientUrl = new URL(client.url);
      if (clientUrl.origin === target.origin && clientUrl.pathname.startsWith(scopeUrl.pathname) && "focus" in client) {
        if ("navigate" in client && client.url !== target.href) await client.navigate(target.href);
        await client.focus();
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target.href);
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.headers.has("authorization")) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error())
    );
    return;
  }

  if (!STATIC_DESTINATIONS.has(request.destination) || request.cache === "no-store") return;

  const cachePromise = caches.open(STATIC_CACHE_NAME);
  const cachedPromise = cachePromise.then((cache) => cache.match(request));
  const refreshPromise = cachePromise.then((cache) => fetch(request).then(async (response) => {
    if (response.ok && response.type !== "opaque") {
      await cache.put(request, response.clone());
    }
    return response;
  }));

  event.respondWith(cachedPromise.then((cached) =>
    cached || refreshPromise.catch(() => Response.error())
  ));
  event.waitUntil(cachedPromise.then((cached) =>
    cached ? refreshPromise.then(() => undefined).catch(() => undefined) : undefined
  ));
});
