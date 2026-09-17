"use client";

import { useCallback, useEffect, useState } from "react";
import { pushSupported, subscribeToPush } from "@/lib/pushClient";

type Perm = "granted" | "denied" | "default";

/// Turning on notifications, and — when they're already on but nothing is
/// arriving — saying why.
///
/// This used to hide itself the moment permission was granted, which made the
/// actual failure invisible: permission can be granted while the device has no
/// push subscription at all, and that combination is silent in every direction.
/// It's how every user in the database ended up unreachable. Now the card stays
/// and reports the three facts that decide whether a push can land: permission,
/// a subscription on this device, and a row on the server.
export default function EnablePushButton() {
  const [perm, setPerm] = useState<Perm | "unsupported" | "loading">("loading");
  const [deviceSub, setDeviceSub] = useState<boolean | null>(null);
  const [devices, setDevices] = useState<number | null>(null);
  /// Server-side key health, so a broken deploy config names itself instead of
  /// looking like a device problem.
  const [keyNote, setKeyNote] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!pushSupported()) {
      setPerm("unsupported");
      return;
    }
    setPerm(Notification.permission as Perm);
    try {
      const reg = await navigator.serviceWorker?.getRegistration?.();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      setDeviceSub(!!sub);
    } catch {
      setDeviceSub(false);
    }
    try {
      const res = await fetch("/api/push/status", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as {
          devices?: number;
          keys?: {
            serverPublic: { problem: string | null };
            browserPublic: { problem: string | null };
            privateKey: { problem: string | null };
            publicKeysMatch: boolean;
            pairValid: boolean;
          };
        };
        setDevices(data.devices ?? 0);
        const k = data.keys;
        const faults: string[] = [];
        if (k) {
          if (k.browserPublic.problem) faults.push(`browser key ${k.browserPublic.problem}`);
          if (k.serverPublic.problem) faults.push(`server key ${k.serverPublic.problem}`);
          if (k.privateKey.problem) faults.push(`private key ${k.privateKey.problem}`);
          if (!k.publicKeysMatch) faults.push("public keys differ");
          else if (!k.pairValid) faults.push("key pair mismatched");
        }
        setKeyNote(faults.length > 0 ? `server config: ${faults.join(", ")}` : null);
      }
    } catch {
      // leave unknown
    }
  }, []);

  // Deferred a tick: the refresh sets state, and doing that synchronously in an
  // effect body cascades a render. Nothing here is time-critical.
  useEffect(() => {
    const id = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(id);
  }, [refresh]);

  const enable = async () => {
    setBusy(true);
    setReason(null);
    try {
      if (pushSupported() && Notification.permission === "default") {
        setPerm((await Notification.requestPermission()) as Perm);
      }
      const res = await subscribeToPush();
      setReason(res.reason);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (perm === "loading") return null;

  const working = perm === "granted" && deviceSub === true && (devices ?? 0) > 0;

  const headline =
    perm === "unsupported"
      ? "Notifications aren't supported here"
      : perm === "denied"
        ? "Notifications are blocked"
        : working
          ? "Notifications are on"
          : "Finish turning on notifications";

  const detail =
    perm === "unsupported"
      ? "On an iPhone, push only works once the app is added to your Home Screen."
      : perm === "denied"
        ? "Enable notifications for this site in your browser settings, then come back."
        : working
          ? `${devices} device${devices === 1 ? "" : "s"} reachable — invites and rest timers will land with the app closed.`
          : perm !== "granted"
            ? "Get pinged when someone invites you to train."
            : "Permission is granted, but this device isn't subscribed — so nothing can reach you with the app closed.";

  return (
    <div
      className="rounded-2xl px-4 py-3.5 mb-4"
      style={{
        background: "var(--bg-card)",
        border: `1px solid ${working ? "var(--border)" : "var(--accent)"}`,
      }}
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium">{headline}</p>
          <p
            className="text-[11px] mt-0.5 leading-relaxed"
            style={{ color: "var(--fg-dim)" }}
          >
            {detail}
          </p>
        </div>
        {perm !== "denied" && perm !== "unsupported" && !working && (
          <button
            type="button"
            onClick={enable}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg text-[12px] font-semibold shrink-0 disabled:opacity-60"
            style={{ background: "var(--accent)", color: "#0a0a0a" }}
          >
            {busy ? "…" : "Turn on"}
          </button>
        )}
      </div>

      {/* The three facts, when something is wrong. Worth showing plainly:
          which one is false decides what the fix even is. */}
      {!working && perm !== "unsupported" && (
        <p
          className="text-[10px] mt-2.5 nums"
          style={{
            color: "var(--fg-dim)",
            fontFamily: "var(--font-geist-mono)",
          }}
        >
          permission: {perm} · this device:{" "}
          {deviceSub === null ? "?" : deviceSub ? "subscribed" : "no"} · server:{" "}
          {devices ?? "?"}
          {reason ? ` · ${reason}` : ""}
          {keyNote ? ` · ${keyNote}` : ""}
        </p>
      )}
    </div>
  );
}
