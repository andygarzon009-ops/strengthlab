"use client";

import { useEffect, useRef } from "react";

const PERMISSION_ASKED_KEY = "sl:notifPermAsked.v1";

// Listens for the same `strengthlab:rest-start` window event the
// in-app Timer already reacts to, and schedules a system notification
// to fire at the rest's wall-clock end. Works alongside the in-app
// chime (foreground) so the user gets:
//   - foreground tab → soft sine bell from Timer.tsx
//   - tab in background but page alive → system notification + vibrate
//   - tab fully suspended (e.g. screen locked on iOS Safari) → no
//     guarantee until we wire VAPID + Web Push from the server. The
//     SW push handler is already in place for when that lands.
export default function RestNotifications() {
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swReg = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        swReg.current = reg;
      })
      .catch(() => {
        // ignore; in-app cue still works
      });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const ensurePermission = async (): Promise<boolean> => {
      if (!("Notification" in window)) return false;
      if (Notification.permission === "granted") return true;
      if (Notification.permission === "denied") return false;
      // Don't re-prompt every set if the user already saw the prompt
      // and dismissed it without choosing — wait for an explicit
      // re-grant from the browser settings.
      let asked = false;
      try {
        asked = localStorage.getItem(PERMISSION_ASKED_KEY) === "1";
      } catch {
        // ignore
      }
      if (asked) return false;
      try {
        const result = await Notification.requestPermission();
        try {
          localStorage.setItem(PERMISSION_ASKED_KEY, "1");
        } catch {
          // ignore
        }
        return result === "granted";
      } catch {
        return false;
      }
    };

    const scheduleNotification = (seconds: number) => {
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
      pendingTimer.current = setTimeout(async () => {
        pendingTimer.current = null;
        try {
          const reg =
            swReg.current ??
            (await navigator.serviceWorker?.getRegistration?.()) ??
            null;
          if (reg && Notification.permission === "granted") {
            // Cast to allow renotify/vibrate/badge — TS lib types lag
            // behind the spec on these fields, but every browser that
            // supports notifications honors them.
            await reg.showNotification("Rest done", {
              body: "Back to work — next set's up.",
              tag: "rest-end",
              icon: "/icon-192.png",
              badge: "/icon-192.png",
              data: { url: "/log" },
              ...({ renotify: true, vibrate: [60] } as object),
            } as NotificationOptions);
          } else if (
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            // Fallback if SW isn't available: page-level notification.
            new Notification("Rest done", {
              body: "Back to work — next set's up.",
              tag: "rest-end",
            });
          }
        } catch {
          // best effort
        }
      }, seconds * 1000);
    };

    const handler = async (e: Event) => {
      const ce = e as CustomEvent<{ seconds?: number }>;
      const secs = Math.max(5, Math.round(ce.detail?.seconds ?? 90));
      const granted = await ensurePermission();
      if (!granted) return;
      scheduleNotification(secs);
    };

    const cancel = () => {
      if (pendingTimer.current) {
        clearTimeout(pendingTimer.current);
        pendingTimer.current = null;
      }
    };

    window.addEventListener("strengthlab:rest-start", handler);
    window.addEventListener("strengthlab:rest-cancel", cancel);
    return () => {
      window.removeEventListener("strengthlab:rest-start", handler);
      window.removeEventListener("strengthlab:rest-cancel", cancel);
      cancel();
    };
  }, []);

  return null;
}
