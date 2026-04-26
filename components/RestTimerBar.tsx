"use client";

import { useState } from "react";
import { formatMMSS, useRestTimer } from "@/lib/useRestTimer";

export default function RestTimerBar() {
  const {
    active,
    paused,
    remaining,
    total,
    defaultSeconds,
    setDefaultSeconds,
    add,
    pause,
    resume,
    skip,
  } = useRestTimer();
  const [showSettings, setShowSettings] = useState(false);
  const [draftDefault, setDraftDefault] = useState(String(defaultSeconds));

  if (!active) return null;

  const pct = total > 0 ? Math.min(100, ((total - remaining) / total) * 100) : 0;

  return (
    <>
      <div
        className="fixed left-0 right-0 z-[80] px-3"
        style={{
          bottom: "calc(env(safe-area-inset-bottom) + 76px)",
          pointerEvents: "none",
        }}
      >
        <div
          className="mx-auto max-w-lg rounded-2xl shadow-2xl overflow-hidden"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            pointerEvents: "auto",
          }}
        >
          <div
            className="h-1 transition-all"
            style={{
              width: `${pct}%`,
              background: "var(--accent)",
            }}
          />
          <div className="px-3 py-2.5 flex items-center gap-2">
            <div className="flex flex-col min-w-0">
              <p
                className="label text-[9px]"
                style={{ color: "var(--fg-dim)" }}
              >
                Rest
              </p>
              <p
                className="nums text-[20px] font-bold leading-none mt-0.5"
                style={{
                  color: paused ? "var(--fg-muted)" : "var(--fg)",
                  fontFamily: "var(--font-geist-mono)",
                }}
              >
                {formatMMSS(remaining)}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <TimerBtn label="-15" onClick={() => add(-15)} />
              <TimerBtn label="+15" onClick={() => add(15)} />
              {paused ? (
                <TimerBtn label="▶" onClick={resume} accent />
              ) : (
                <TimerBtn label="❚❚" onClick={pause} />
              )}
              <TimerBtn label="Skip" onClick={skip} />
              <button
                onClick={() => {
                  setDraftDefault(String(defaultSeconds));
                  setShowSettings(true);
                }}
                aria-label="Timer settings"
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{
                  background: "var(--bg-elevated)",
                  color: "var(--fg-muted)",
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.36.16.66.46.82.82.16.36.16.78 0 1.18z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {showSettings && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.65)" }}
          onClick={() => setShowSettings(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card w-full max-w-sm p-5"
            style={{ background: "var(--bg-card)" }}
          >
            <p className="label">Timer</p>
            <h3 className="text-[17px] font-bold tracking-tight mt-0.5 mb-3">
              Default rest
            </h3>
            <div className="flex items-center gap-2 mb-3">
              <input
                type="number"
                inputMode="numeric"
                value={draftDefault}
                onChange={(e) => setDraftDefault(e.target.value)}
                className="flex-1 rounded-xl px-3 py-2.5 text-[14px] focus:outline-none nums"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  color: "var(--fg)",
                  fontFamily: "var(--font-geist-mono)",
                }}
              />
              <span style={{ color: "var(--fg-dim)", fontSize: "12px" }}>
                seconds
              </span>
            </div>
            <div className="flex gap-2 flex-wrap mb-4">
              {[60, 90, 120, 150, 180, 240, 300].map((s) => (
                <button
                  key={s}
                  onClick={() => setDraftDefault(String(s))}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-semibold"
                  style={{
                    background:
                      String(s) === draftDefault
                        ? "var(--accent-dim)"
                        : "var(--bg-elevated)",
                    color:
                      String(s) === draftDefault
                        ? "var(--accent)"
                        : "var(--fg-muted)",
                  }}
                >
                  {formatMMSS(s)}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowSettings(false)}
                className="btn-ghost px-4 py-2.5 rounded-xl text-[13px]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const n = parseInt(draftDefault, 10);
                  if (Number.isFinite(n) && n > 0) setDefaultSeconds(n);
                  setShowSettings(false);
                }}
                className="btn-accent flex-1 py-2.5 rounded-xl text-[13px] font-semibold"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TimerBtn({
  label,
  onClick,
  accent,
}: {
  label: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="h-8 px-2.5 rounded-lg text-[11px] font-semibold transition-colors active:scale-95"
      style={{
        background: accent ? "var(--accent)" : "var(--bg-elevated)",
        color: accent ? "#0a0a0a" : "var(--fg-muted)",
        fontFamily: "var(--font-geist-mono)",
        minWidth: 36,
      }}
    >
      {label}
    </button>
  );
}
