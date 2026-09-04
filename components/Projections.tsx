"use client";

import { useState } from "react";
import Link from "next/link";
import type { Projection } from "@/lib/projections";

/// Compact est.-1RM trend for one lift. Deliberately axis-free — it sits in a
/// list row, so it only has to answer "climbing, flat, or slipping"; the
/// drilldown has the real chart.
function Sparkline({ trend }: { trend: Projection["trend"] }) {
  const W = 56;
  const H = 20;
  if (trend.length < 2) {
    return (
      <span
        className="shrink-0 text-[9px] tabular-nums"
        style={{ width: W, color: "var(--fg-dim)" }}
      >
        1 session
      </span>
    );
  }

  const vals = trend.map((p) => p.e1rm);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const step = W / (vals.length - 1);
  const pts = vals.map((v, i) => {
    const x = i * step;
    // 1.5px inset top and bottom so the stroke isn't clipped at the extremes.
    const y = H - 1.5 - ((v - min) / span) * (H - 3);
    return [x, y] as const;
  });
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lastX, lastY] = pts[pts.length - 1];

  // Colour by where the lift is now versus its recent baseline: the last point
  // against the median of everything before it.
  const prior = vals.slice(0, -1).sort((a, b) => a - b);
  const median = prior[Math.floor(prior.length / 2)];
  const last = vals[vals.length - 1];
  const rising = last > median * 1.01;
  const falling = last < median * 0.99;
  const stroke = rising ? "#22c55e" : falling ? "#f97316" : "var(--fg-muted)";

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="shrink-0 overflow-visible"
      aria-hidden="true"
    >
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="2" fill={stroke} />
    </svg>
  );
}

/// `href`, when set, turns the card into an entry point for a dedicated
/// strength page: the header links there and the footer swaps its inline
/// "view all" toggle for a link to the full trend.
export default function Projections({
  items,
  href,
}: {
  items: Projection[];
  href?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  if (items.length === 0) return null;

  const TOP = 5;
  // When linking out, always show just the top 5 — the full list lives on
  // the destination page.
  const visible = !href && showAll ? items : items.slice(0, TOP);
  const hasMore = items.length > TOP;

  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between mb-4">
        {href ? (
          <Link href={href} className="flex items-center gap-1">
            <h2 className="font-semibold text-[14px] tracking-tight">
              Projections
            </h2>
            <span className="text-[14px]" style={{ color: "var(--fg-dim)" }}>
              ›
            </span>
          </Link>
        ) : (
          <h2 className="font-semibold text-[14px] tracking-tight">
            Projections
          </h2>
        )}
        <p
          className="label text-[9px]"
          style={{ color: "var(--fg-dim)" }}
        >
          Estimated 1RM
        </p>
      </div>

      <div className="space-y-2">
        {visible.map((p, i) => (
          <Link
            key={p.exerciseName}
            href={`/strength/${encodeURIComponent(p.exerciseId)}`}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors active:opacity-70"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
            }}
          >
            <span
              className="nums text-[11px] w-4 shrink-0"
              style={{
                fontFamily: "var(--font-geist-mono)",
                color: "var(--fg-dim)",
              }}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold truncate">
                {p.exerciseName}
              </p>
              <p
                className="text-[10px] mt-0.5 nums"
                style={{
                  fontFamily: "var(--font-geist-mono)",
                  color: "var(--fg-dim)",
                }}
              >
                from {p.baseWeight} × {p.baseReps}
              </p>
            </div>
            <Sparkline trend={p.trend} />
            <p
              className="nums text-[15px] font-bold shrink-0 w-[52px] text-right"
              style={{
                fontFamily: "var(--font-geist-mono)",
                color: "var(--accent)",
              }}
            >
              {Math.round(p.oneRepMax)}
              <span className="text-[10px] font-normal opacity-70 ml-0.5">
                lb
              </span>
            </p>
          </Link>
        ))}
      </div>

      {href ? (
        <Link
          href={href}
          className="mt-3 w-full text-[11px] font-semibold py-2 rounded-lg transition-colors block text-center"
          style={{
            color: "var(--accent)",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
          }}
        >
          View strength trend →
        </Link>
      ) : (
        hasMore && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="mt-3 w-full text-[11px] font-semibold py-2 rounded-lg transition-colors"
            style={{
              color: "var(--accent)",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
            }}
          >
            {showAll
              ? "Show top 5"
              : `View all ${items.length} projections`}
          </button>
        )
      )}

      <p
        className="text-[10px] mt-3"
        style={{ color: "var(--fg-dim)" }}
      >
        Epley formula · weight × (1 + reps ÷ 30) · tap a lift for its full trend
      </p>
    </div>
  );
}
