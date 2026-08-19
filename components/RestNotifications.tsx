"use client";

import { useEffect, useRef } from "react";
import { tone } from "@/lib/timerSound";

const PERMISSION_ASKED_KEY = "sl:notifPermAsked.v1";

// Web Audio chime that mirrors Timer.tsx's `cueDone` so the rest-end
// notification has the same "ding" the in-app FAB plays — single 440 Hz sine,
// 260 ms, 0.2 gain. Shares lib/timerSound's context with every other timer, so
// it inherits the playback session and the interruption watchdog rather than
// keeping a second context that nothing repairs.
const chime = () => tone(440, 260, 0.2);
function buzz(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // ignore
    }
  }
}

// Listens for the same `strengthlab:rest-start` window event the in-app Timer
// reacts to, and schedules a system notification for the rest's wall-clock
// end. This component owns ONLY the away-from-the-app case:
//
//   - app open and visible → nothing from here. Timer.tsx sounds its chime
//     and latches the REST DONE pill on the FAB, which is a cue that needs no
//     permission and survives a muted phone. Firing here as well would double
//     the chime and put a system banner over a cue already on screen.
//   - backgrounded but page alive → chime, vibrate and a system notification,
//     since the FAB can't be seen.
//   - fully suspended (screen locked on iOS Safari) → no guarantee until
//     VAPID Web Push is driven from the server. The SW push handler is
//     already in place for when that lands.
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

        // If the athlete is looking at the app, Timer.tsx has this covered —
        // it sounds its own chime and latches the REST DONE pill on the FAB.
        // Firing here too would double the chime and stack a system
        // notification on top of a cue already on screen.
        if (
          typeof document !== "undefined" &&
          document.visibilityState === "visible"
        ) {
          return;
        }

        // Page backgrounded but still alive. These cues can still land, and
        // the FAB can't be seen, so this is where they earn their keep.
        chime();
        buzz([300, 120, 300]);
        try {
          if (!("Notification" in window) || Notification.permission !== "granted") {
            return; // in-page cues above already fired; nothing more to do
          }
          const reg =
            swReg.current ??
            (await navigator.serviceWorker?.getRegistration?.()) ??
            null;
          if (reg && Notification.permission === "granted") {
            // Cast to allow renotify/vibrate/badge/silent — TS lib
            // types lag behind the spec but every browser that supports
            // notifications honors them. `silent: false` forces the OS
            // notification sound; the longer vibrate pattern gives the
            // wrist a clearer cue.
            await reg.showNotification("Rest done", {
              body: "Back to work — next set's up.",
              tag: "rest-end",
              icon: "/icon-192.png",
              badge: "/icon-192.png",
              data: { url: "/log" },
              ...({
                renotify: true,
                silent: false,
                requireInteraction: true,
                vibrate: [300, 120, 300],
              } as object),
            } as NotificationOptions);
          } else if (
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            // Fallback if SW isn't available: page-level notification.
            new Notification("Rest done", {
              body: "Back to work — next set's up.",
              tag: "rest-end",
              ...({ silent: false } as object),
            } as NotificationOptions);
          }
        } catch {
          // best effort
        }
      }, seconds * 1000);
    };

    const handler = async (e: Event) => {
      const ce = e as CustomEvent<{ seconds?: number }>;
      const secs = Math.max(5, Math.round(ce.detail?.seconds ?? 90));
      // Schedule FIRST, then ask. Bailing out on a denied permission used to
      // skip the page-side chime and buzz too, so anyone who dismissed the
      // browser prompt once — which is asked exactly once, ever — got nothing
      // at rest-end from this component for good. The system notification
      // still needs permission; the in-page cues never did.
      scheduleNotification(secs);
      void ensurePermission();

      // Hand the same deadline to the server. Locking the screen suspends
      // this page and freezes the timer above, so the only thing that can
      // reach a locked phone is a push the server sends on its own clock.
      // Best-effort: failing here must never disturb logging a set.
      void fetch("/api/rest/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seconds: secs }),
        keepalive: true,
      }).catch(() => {});
    };

    const cancel = () => {
      if (pendingTimer.current) {
        clearTimeout(pendingTimer.current);
        pendingTimer.current = null;
      }
      // Defuse the queued push too, or a skipped rest still buzzes.
      void fetch("/api/rest/schedule", {
        method: "DELETE",
        keepalive: true,
      }).catch(() => {});
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
