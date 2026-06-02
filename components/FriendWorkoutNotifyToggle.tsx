"use client";

import { useState, useTransition } from "react";
import { setNotifyFriendWorkouts } from "@/lib/actions/workouts";

/// Profile toggle: get a push when a crew friend logs a workout. Defaults on
/// (server-side default), this is the opt-out. Optimistic — flips instantly and
/// reverts if the server write fails so the switch never lies about its state.
export default function FriendWorkoutNotifyToggle({
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
        await setNotifyFriendWorkouts(next);
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
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="font-medium text-[14px] leading-tight">
            Crew workout alerts
          </p>
          <p
            className="text-[11px] mt-0.5 leading-tight"
            style={{ color: "var(--fg-dim)" }}
          >
            Get notified when a friend logs a workout
          </p>
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Crew workout alerts"
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
