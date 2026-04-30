// StrengthLab service worker — minimal scope: handle notification
// clicks (focus the app) and own the activation lifecycle so future
// Web Push support can slot in without a second worker.

self.addEventListener("install", (event) => {
  // Activate immediately; we don't precache anything yet.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// When the user taps the rest-end notification, focus an existing
// StrengthLab tab if there is one, otherwise open a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of all) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client && client.url !== url) {
            try {
              await client.navigate(url);
            } catch {
              // cross-origin or stale; ignore
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(url);
      }
    })()
  );
});

// Web Push hook (no-op until VAPID + server scheduling lands).
self.addEventListener("push", (event) => {
  let payload = { title: "StrengthLab", body: "Time's up", tag: "rest-end" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // non-JSON push payload — keep defaults
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      vibrate: [300, 120, 300],
      silent: false,
      requireInteraction: true,
      data: { url: payload.url || "/" },
    })
  );
});
