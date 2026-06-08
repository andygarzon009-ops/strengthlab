"use client";

import { useEffect, useState } from "react";

/// Shown atop the health surfaces (heart-rate, recovery, health) when Google
/// has expired or revoked the Fitbit connection. Without this, a dead token
/// just renders empty charts ("No samples yet") with no hint as to why — this
/// makes the cause obvious and the fix one tap. The "Reconnect" link re-runs
/// the same OAuth consent flow as the initial connect.
///
/// In "Testing" publishing status Google expires refresh tokens 7 days after
/// consent, so this is expected to surface roughly weekly per user.
export default function HealthReconnectBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => {
        if (!cancelled && b?.needsReconnect) setShow(true);
      })
      .catch(() => {
        // Probe failed — stay quiet rather than show a false alarm.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;

  return (
    <div
      className="rounded-2xl p-4 mb-4 flex items-center gap-3"
      style={{ background: "var(--bg-card)", border: "1px solid #f97316" }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold" style={{ color: "#f97316" }}>
          Reconnect Fitbit
        </p>
        <p className="text-[12px] mt-0.5" style={{ color: "var(--fg-dim)" }}>
          Google expired the connection. Reconnect to resume heart-rate and
          recovery data.
        </p>
      </div>
      <a
        href="/api/health/google/auth"
        className="shrink-0 rounded-full px-4 py-2 text-[12px] font-semibold"
        style={{ background: "#f97316", color: "#000" }}
      >
        Reconnect
      </a>
    </div>
  );
}
