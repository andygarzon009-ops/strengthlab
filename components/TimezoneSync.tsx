"use client";

import { useEffect } from "react";

const STORED_TZ_KEY = "sl:timezone.v1";

// Silently captures the browser's IANA timezone and posts it to the
// server when it changes. Returning users with the same TZ never hit
// the network. Travelers get auto-updated on the next page load
// without any prompt or UI — Intl.DateTimeFormat tracks device tz.
export default function TimezoneSync() {
  useEffect(() => {
    let tz: string | null = null;
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch {
      tz = null;
    }
    if (!tz) return;

    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORED_TZ_KEY);
    } catch {
      // ignore
    }
    if (stored === tz) return;

    fetch("/api/user/timezone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: tz }),
    })
      .then((r) => {
        if (r.ok) {
          try {
            localStorage.setItem(STORED_TZ_KEY, tz!);
          } catch {
            // ignore
          }
        }
      })
      .catch(() => {
        // best-effort; the coach falls back to UTC if sync fails
      });
  }, []);

  return null;
}
