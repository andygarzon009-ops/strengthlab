"use client";

import { useState, useTransition } from "react";
import { setNotifyInactivity } from "@/lib/actions/workouts";

/// Profile toggle for the "away longer than usual" nudge. Defaults on
/// (server-side default), this is the opt-out. Optimistic — flips instantly
/// and reverts if the write fails so the switch never lies about its state.
export default function InactivityNotifyToggle({
  initialEnabled,
}: {
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [, startTransition] = useTransition();

  const toggle = () => {
    const next = !enabled;
    setEnabled(next); // optimistic
    startTransition(async () => {
      try {
        await setNotifyInactivity(next);
      } catch {
        setEnabled(!next); // revert on failure
      }
    });
  };

  return (
    <div className="card flex items-center justify-between px-4 py-4">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "var(--bg-elevated)" }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--fg-muted)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="font-medium text-[14px] leading-tight">
            Time-away reminder
          </p>
          <p
            className="text-[11px] mt-0.5 leading-tight"
            style={{ color: "var(--fg-dim)" }}
          >
            A morning nudge when it&apos;s been longer than you usually leave it
          </p>
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Time-away reminder"
        onClick={toggle}
        className="relative shrink-0 rounded-full transition-colors"
        style={{
          width: 44,
          height: 26,
          background: enabled ? "var(--accent)" : "var(--bg-elevated)",
          border: "1px solid var(--border)",
        }}
      >
        <span
          className="absolute rounded-full transition-transform"
          style={{
            top: 2,
            left: 2,
            width: 20,
            height: 20,
            background: enabled ? "#0a0a0a" : "var(--fg-muted)",
            transform: enabled ? "translateX(18px)" : "translateX(0)",
          }}
        />
      </button>
    </div>
  );
}
