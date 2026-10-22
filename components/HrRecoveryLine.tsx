"use client";

import { useState } from "react";
import type { RecoveryPoint } from "@/lib/hrRecoveryHistory";
import type { RecoveryVerdict } from "@/lib/hrRecovery";

const VERDICT: Record<RecoveryVerdict, { text: (usual: number | null) => string; color: string }> = {
  faster: { text: (u) => `faster than usual (−${u})`, color: "#86efac" },
  slower: { text: (u) => `slower than usual (−${u})`, color: "#fbbf24" },
  typical: { text: (u) => `typical for this workout (−${u})`, color: "var(--fg-muted)" },
  first: { text: () => "first time measured for this workout", color: "var(--fg-muted)" },
};

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/// One line under a logged workout's HR chart: between-set recovery, and how it
/// compares with this workout's usual. Only calls it faster or slower when the
/// gap is beyond normal session-to-session noise. Tap for the trend.
export default function HrRecoveryLine({
  dropBpm,
  rests,
  history,
  verdict,
  usual,
}: {
  dropBpm: number;
  rests: number;
  history: RecoveryPoint[];
  verdict: RecoveryVerdict;
  usual: number | null;
}) {
  const [open, setOpen] = useState(false);
  const v = VERDICT[verdict];
  const points = [...history.map((h) => ({ label: shortDate(h.date), drop: h.dropBpm, today: false })), { label: "This", drop: dropBpm, today: true }];

  // Sparkline geometry: bigger drop plots higher (better recovery is up).
  const W = 300;
  const H = 86;
  const PT = 16;
  const PB = 16;
  const lo = Math.min(...points.map((p) => p.drop)) - 3;
  const hi = Math.max(...points.map((p) => p.drop)) + 3;
  const x = (i: number) => (points.length === 1 ? W / 2 : 12 + (i / (points.length - 1)) * (W - 24));
  const y = (d: number) => PT + (1 - (d - lo) / Math.max(1, hi - lo)) * (H - PT - PB);

  return (
    <div
      className="rounded-xl mt-2"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left text-[12.5px] tabular-nums"
      >
        <span className="min-w-0 flex-1 leading-snug">
          <span style={{ color: "var(--fg-muted)" }}>Recovery between sets </span>
          <b>−{dropBpm} bpm</b>
          <span style={{ color: "var(--fg-muted)" }}> in 60 s · </span>
          <span style={{ color: v.color, fontWeight: verdict === "faster" || verdict === "slower" ? 700 : 400 }}>
            {v.text(usual)}
          </span>
        </span>
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--fg-dim)"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="shrink-0"
          style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 160ms" }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="px-3.5 pb-3" style={{ borderTop: "1px solid var(--border)" }}>
          {history.length > 0 ? (
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="mt-2 block" style={{ overflow: "visible" }} aria-label="Recovery across recent sessions of this workout">
              <path
                d={points.map((p, i) => `${i ? "L" : "M"}${x(i)} ${y(p.drop)}`).join(" ")}
                fill="none"
                stroke="var(--fg-muted)"
                strokeWidth={1.4}
              />
              {points.map((p, i) => (
                <g key={i}>
                  <circle
                    cx={x(i)}
                    cy={y(p.drop)}
                    r={p.today ? 4.5 : 3}
                    fill={p.today ? "#f87171" : "var(--bg-elevated)"}
                    stroke={p.today ? "none" : "var(--fg-muted)"}
                    strokeWidth={1.2}
                  />
                  <text x={x(i)} y={y(p.drop) - 8} fontSize="9" textAnchor="middle" fontWeight={p.today ? 700 : 500} fill={p.today ? "var(--fg)" : "var(--fg-muted)"}>
                    −{p.drop}
                  </text>
                  <text x={x(i)} y={H - 2} fontSize="8.5" textAnchor="middle" fill="var(--fg-dim)">
                    {p.label}
                  </text>
                </g>
              ))}
            </svg>
          ) : null}
          <p className="text-[11px] mt-2 leading-snug" style={{ color: "var(--fg-dim)" }}>
            How far your heart rate fell a minute into rest after hard sets, the middle of {rests} clean rests
            {history.length ? `, against your last ${history.length} session${history.length === 1 ? "" : "s"} of this workout` : ""}. A bigger drop is
            better. Wrist heart rate is rough while lifting, so only clear differences are called out.
          </p>
        </div>
      )}
    </div>
  );
}
