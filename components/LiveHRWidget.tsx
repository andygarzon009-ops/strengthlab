"use client";

import { useEffect, useState } from "react";

type Snapshot = { bpm: number | null; at: string | null; error?: string };

const POLL_MS = 20000;

export default function LiveHRWidget() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function pull() {
      try {
        const res = await fetch("/api/health/current-hr", { cache: "no-store" });
        const body = await res.json();
        if (cancelled) return;
        if (body.connected === false) {
          setSnap({ bpm: null, at: null, error: "not connected" });
          return;
        }
        setSnap({ bpm: body.bpm ?? null, at: body.at ?? null, error: body.error });
      } catch {
        if (!cancelled) setSnap((prev) => prev ?? { bpm: null, at: null });
      }
    }

    pull();
    const id = setInterval(pull, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // 1Hz wall-clock tick so the "Xs ago" label updates without re-fetching.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!snap) return null;
  if (snap.error === "not connected") return null;

  const ageSec = snap.at
    ? Math.max(0, Math.round((Date.now() - new Date(snap.at).getTime()) / 1000))
    : null;
  const stale = ageSec !== null && ageSec > 90;

  return (
    <div
      className="mb-3 rounded-xl px-4 py-2.5 flex items-center justify-between"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{
            background: snap.bpm ? "#ef4444" : "var(--fg-dim)",
            boxShadow: snap.bpm
              ? "0 0 6px rgba(239,68,68,0.6)"
              : "none",
          }}
        />
        <span
          className="text-[11px] uppercase tracking-wider font-semibold"
          style={{ color: "var(--fg-dim)", letterSpacing: "0.08em" }}
        >
          Live HR
        </span>
      </div>
      <div className="flex items-baseline gap-2 tabular-nums">
        {snap.bpm ? (
          <>
            <span
              className="text-[18px] font-bold"
              style={{ color: stale ? "var(--fg-dim)" : "var(--fg)" }}
            >
              {snap.bpm}
            </span>
            <span
              className="text-[10px]"
              style={{ color: "var(--fg-dim)" }}
            >
              bpm · {ageSec}s ago{stale ? " (lagging)" : ""}
              {/* tick keeps this label fresh */}
              <span className="hidden">{tick}</span>
            </span>
          </>
        ) : (
          <span className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
            waiting for Fitbit sync…
          </span>
        )}
      </div>
    </div>
  );
}
