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

// Web Push hook. Rest-end pushes are scheduled server-side (see
// lib/qstash.ts) so they land even with the screen locked.
self.addEventListener("push", (event) => {
  let payload = { title: "StrengthLab", body: "Time's up", tag: "rest-end" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // non-JSON push payload — keep defaults
  }
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const onScreen = clients.filter(
        (c) => c.visibilityState === "visible" || c.focused
      );

      // A banner drawn over an app the athlete is already looking at buys
      // nothing and costs a lot: iOS presents it over the web view, which
      // takes focus off whatever field is being typed into and retracts the
      // software keyboard mid-entry. Someone logging a set gets the keyboard
      // yanked out from under them every time a crew-mate finishes a workout.
      //
      // So nothing visible is ever posted while the app is on screen — the
      // page draws its own quiet in-app notice instead, via the message
      // below. This used to be done for rest-end only; every other push type
      // (crew activity, invites, the nudge) still banners, and those are the
      // frequent ones.
      //
      // A push must still end with a notification: iOS counts every push that
      // shows nothing and revokes the subscription after a few, and Chrome
      // posts its own "site updated in the background" banner instead. Post a
      // silent one and close it straight away — the rule is met, nothing is
      // seen, and focus stays where the athlete put it.
      if (onScreen.length > 0) {
        for (const client of onScreen) {
          client.postMessage({
            kind: "strengthlab:foreground-push",
            title: payload.title,
            body: payload.body,
            tag: payload.tag,
            url: payload.url || null,
          });
        }
        const tag = payload.tag || "strengthlab";
        await self.registration.showNotification(payload.title, {
          body: payload.body,
          tag,
          silent: true,
        });
        const shown = await self.registration.getNotifications({ tag });
        shown.forEach((n) => n.close());
        return;
      }

      await self.registration.showNotification(payload.title, {
        body: payload.body,
        tag: payload.tag,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        vibrate: [300, 120, 300],
        silent: false,
        requireInteraction: true,
        data: { url: payload.url || "/" },
      });
    })()
  );
});
