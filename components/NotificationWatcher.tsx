"use client";

// Makes in-app notifications actually land on the device.
//
// An invite used to exist only as a row in the inbox: you had to already be in
// the app to find out somebody wanted to lift with you. Web Push was supposed
// to cover that, but it only reaches a device that has SUBSCRIBED, and not one
// user in the database had a subscription — so every sendPushToUser call was a
// silent no-op.
//
// This is the same mechanism the rest timer uses to reach a lock screen:
// registration.showNotification from the page, which needs permission but no
// subscription, and therefore works today. Push, once it's actually
// subscribing, covers the case this can't — the app not running at all.

import { useEffect, useRef } from "react";

type Item = {
  id: string;
  type: string;
  body: string;
  url: string | null;
  createdAt: string;
};

const POLL_MS = 30_000;
const SEEN_KEY = "sl:announcedNotifications";
/// Anything older than this was already missed; announcing it now would fire a
/// banner for an invite that's long over.
const FRESH_MS = 10 * 60_000;

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>) {
  try {
    // Keep the list short — only recent ids can ever matter.
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-50)));
  } catch {
    // Private windows and blocked site data: the worst case is announcing the
    // same notification twice, which beats never announcing it.
  }
}

const TITLES: Record<string, string> = {
  SESSION_INVITE: "Training invite",
  SESSION_JOIN: "They're in",
  FRIEND_ACCEPT: "New crew",
  FRIEND_WORKOUT: "Crew activity",
};

export default function NotificationWatcher() {
  const seen = useRef<Set<string> | null>(null);
  // First poll of a fresh page load only records what's already there. Opening
  // the app should not replay every unread notification as a banner.
  const primed = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let stopped = false;
    let timer: number | undefined;

    const announce = async (item: Item) => {
      if (!("Notification" in window) || Notification.permission !== "granted") {
        return;
      }
      try {
        const reg = await navigator.serviceWorker?.getRegistration?.();
        const title = TITLES[item.type] ?? "StrengthLab";
        const options = {
          body: item.body,
          tag: `notif-${item.id}`,
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          data: { url: item.url || "/notifications" },
          ...({
            renotify: true,
            silent: false,
            requireInteraction: true,
            vibrate: [300, 120, 300],
          } as object),
        } as NotificationOptions;
        if (reg) await reg.showNotification(title, options);
        else new Notification(title, options);
      } catch {
        // A banner that fails to draw is not worth breaking anything over.
      }
    };

    const tick = async () => {
      try {
        const res = await fetch("/api/notifications/recent", {
          cache: "no-store",
        });
        if (res.ok) {
          const data = (await res.json()) as { items?: Item[] };
          const items = data.items ?? [];
          if (seen.current === null) seen.current = loadSeen();
          const fresh = Date.now() - FRESH_MS;

          for (const item of items) {
            if (seen.current.has(item.id)) continue;
            seen.current.add(item.id);
            if (!primed.current) continue; // first pass: record, don't announce
            if (new Date(item.createdAt).getTime() < fresh) continue;
            // Looking right at the app? The inbox and the bell already say so,
            // and a banner over the top is the noise the rest timer avoids.
            if (document.visibilityState === "visible") continue;
            await announce(item);
          }
          saveSeen(seen.current);
          primed.current = true;
        }
      } catch {
        // Offline in a gym basement — try again on the next tick.
      }
      if (!stopped) timer = window.setTimeout(tick, POLL_MS);
    };

    timer = window.setTimeout(tick, 0);
    const onFocus = () => {
      void tick();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return null;
}
