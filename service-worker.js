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

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode !== "navigate") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error())
  );
});

const PUSH_PAGES = new Set(["timetable", "campus-messages", "noticeboard", "profile-settings"]);

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) {}
  const title = typeof payload.title === "string" ? payload.title.slice(0, 80) : "CampusShield AI";
  const body = typeof payload.body === "string" ? payload.body.slice(0, 180) : "You have a new CampusShield update.";
  const page = PUSH_PAGES.has(payload.page) ? payload.page : "dashboard";
  const tag = typeof payload.tag === "string" && /^campusshield-[a-z_]+$/.test(payload.tag)
    ? payload.tag.slice(0, 60) : "campusshield-update";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag,
    icon: "./icons/campusshield-192.png",
    badge: "./icons/campusshield-192.png",
    renotify: false,
    data: { page, url: "./" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const page = PUSH_PAGES.has(event.notification?.data?.page)
    ? event.notification.data.page : "dashboard";
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const appPath = new URL("./", self.location.href).pathname;
    const current = windows.find((client) => {
      try {
        const url = new URL(client.url);
        return url.origin === self.location.origin && url.pathname.startsWith(appPath);
      } catch { return false; }
    });
    if (current) {
      current.postMessage({ type: "CAMPUSSHIELD_PUSH_NAVIGATE", page });
      await current.focus();
      return;
    }
    const target = new URL("./", self.location.href);
    target.searchParams.set("pushPage", page);
    await self.clients.openWindow(target.toString());
  })());
});
