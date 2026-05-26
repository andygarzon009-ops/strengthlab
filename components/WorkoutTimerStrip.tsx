"use client";

import { useEffect, useState } from "react";

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function WorkoutTimerStrip({
  startedAt,
  onBegin,
  onCancel,
}: {
  startedAt: Date | null;
  onBegin: () => void;
  onCancel: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  if (!startedAt) {
    return (
      <button
        type="button"
        onClick={onBegin}
        className="w-full mb-4 rounded-xl py-3 text-[14px] font-semibold flex items-center justify-center gap-2"
        style={{
          background: "var(--accent-dim)",
          color: "var(--accent)",
          border: "1px solid rgba(34,197,94,0.25)",
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
        >
          <path d="M8 5v14l11-7z" />
        </svg>
        Begin workout
      </button>
    );
  }

  const elapsed = Math.max(0, Math.floor((now - startedAt.getTime()) / 1000));
  return (
    <div
      className="w-full mb-4 rounded-xl px-4 py-3 flex items-center justify-between"
      style={{
        background: "var(--accent-dim)",
        border: "1px solid rgba(34,197,94,0.25)",
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className="w-2 h-2 rounded-full animate-pulse"
          style={{ background: "var(--accent)" }}
        />
        <div>
          <div
            className="text-[10px] font-medium tracking-wider uppercase"
            style={{ color: "var(--accent)", letterSpacing: "0.1em" }}
          >
            In progress
          </div>
          <div
            className="text-[18px] font-bold tabular-nums leading-none mt-0.5"
            style={{ color: "var(--fg)" }}
          >
            {formatElapsed(elapsed)}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          if (confirm("Discard the workout timer? Set/rep entries stay.")) onCancel();
        }}
        className="text-[12px] underline"
        style={{ color: "var(--fg-dim)" }}
      >
        Cancel
      </button>
    </div>
  );
}
