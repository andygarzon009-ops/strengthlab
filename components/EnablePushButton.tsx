"use client";

import { useEffect, useState } from "react";
import { pushSupported, subscribeToPush } from "@/lib/pushClient";

type Status = "loading" | "unsupported" | "granted" | "denied" | "default";

/// Prompt to turn on push notifications. Shown on the notifications page only
/// when there's something to do (permission not yet granted). Once granted it
/// subscribes and hides itself.
export default function EnablePushButton() {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported()) {
      setStatus("unsupported");
      return;
    }
    const perm = Notification.permission as "granted" | "denied" | "default";
    setStatus(perm);
    if (perm === "granted") void subscribeToPush();
  }, []);

  // Nothing actionable to show.
  if (status === "loading" || status === "unsupported" || status === "granted") {
    return null;
  }

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setStatus(perm as Status);
      if (perm === "granted") await subscribeToPush();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded-2xl px-4 py-3.5 mb-4 flex items-center gap-3"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium">Turn on notifications</p>
        <p className="text-[11px] mt-0.5" style={{ color: "var(--fg-dim)" }}>
          {status === "denied"
            ? "Blocked — enable notifications for this site in your browser settings."
            : "Get pinged when someone adds you to their crew."}
        </p>
      </div>
      {status !== "denied" && (
        <button
          type="button"
          onClick={enable}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg text-[12px] font-semibold shrink-0 disabled:opacity-60"
          style={{ background: "var(--accent)", color: "#0a0a0a" }}
        >
          {busy ? "…" : "Enable"}
        </button>
      )}
    </div>
  );
}
