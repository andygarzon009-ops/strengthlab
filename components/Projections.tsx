"use client";

import { useState } from "react";
import Link from "next/link";
import { formatLoad } from "@/lib/exercises";
import type { Projection } from "@/lib/projections";

/// Compact est.-1RM trend for one lift. Deliberately axis-free — it sits in a
/// list row, so it only has to answer "climbing, flat, or slipping"; the
/// drilldown has the real chart.
function Sparkline({ trend }: { trend: Projection["trend"] }) {
  const W = 64;
  const H = 26;
  if (trend.length < 2) {
    return (
      <span
        className="shrink-0 text-[10px] text-center"
        style={{ width: W, color: "var(--fg-muted)" }}
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
    // Inset top and bottom so the stroke isn't clipped at the extremes.
    const y = H - 2 - ((v - min) / span) * (H - 4);
    return [x, y] as const;
  });
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lastX, lastY] = pts[pts.length - 1];
  const stroke = trendColor(vals);
  const gid = `pj-${Math.round(vals[0])}-${vals.length}-${Math.round(vals[vals.length - 1])}`;

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="shrink-0 overflow-visible"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.3} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${d} L${W} ${H} L0 ${H} Z`} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="2.4" fill={stroke} />
    </svg>
  );
}

/// Colour by where the lift is now versus its recent baseline: the last point
/// against the median of everything before it.
function trendColor(vals: number[]): string {
  if (vals.length < 2) return "var(--fg-muted)";
  const prior = vals.slice(0, -1).sort((a, b) => a - b);
  const median = prior[Math.floor(prior.length / 2)];
  const last = vals[vals.length - 1];
  return last > median * 1.01 ? "#4ade80" : last < median * 0.99 ? "#fb923c" : "var(--fg-muted)";
}

const MEDAL = ["#eab308", "#cbd5e1", "#d97706"];

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
    <section
      className="rounded-2xl p-4"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)" }}
    >
      <div className="flex items-baseline justify-between mb-3">
        {href ? (
          <Link href={href} className="flex items-center gap-1">
            <h2 className="text-[15px] font-bold tracking-tight">Projections</h2>
            <span className="text-[15px]" style={{ color: "var(--fg-muted)" }}>
              ›
            </span>
          </Link>
        ) : (
          <h2 className="text-[15px] font-bold tracking-tight">Projections</h2>
        )}
        <p className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
          Estimated 1-rep max
        </p>
      </div>

      <div className="space-y-2">
        {visible.map((p, i) => {
          const first = p.trend[0]?.e1rm;
          const gain = first != null && p.trend.length > 1 ? Math.round(p.oneRepMax - first) : null;
          const medal = MEDAL[i];
          return (
            <Link
              key={p.exerciseName}
              href={`/strength/${encodeURIComponent(p.exerciseId)}`}
              className="flex items-center gap-3 rounded-xl px-3 py-3 transition-colors active:opacity-70"
              style={{ background: "var(--bg-elevated)" }}
            >
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-bold tabular-nums shrink-0"
                style={
                  medal
                    ? { background: `${medal}22`, color: medal }
                    : { background: "var(--bg-card)", color: "var(--fg-muted)" }
                }
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold truncate">{p.exerciseName}</p>
                <p className="text-[12px] mt-0.5 tabular-nums truncate" style={{ color: "var(--fg-muted)" }}>
                  from {formatLoad(p.exerciseName, p.baseWeight)} × {p.baseReps}
                  {gain != null && gain !== 0 && (
                    <span style={{ color: gain > 0 ? "#4ade80" : "#fb923c" }}>
                      {" · "}
                      {gain > 0 ? "+" : "−"}
                      {Math.abs(gain)} lb
                    </span>
                  )}
                </p>
              </div>
              <Sparkline trend={p.trend} />
              <p className="text-[19px] font-bold tabular-nums shrink-0 w-[58px] text-right leading-none">
                {Math.round(p.oneRepMax)}
                <span className="text-[11px] font-normal ml-0.5" style={{ color: "var(--fg-muted)" }}>
                  lb
                </span>
              </p>
            </Link>
          );
        })}
      </div>

      {href ? (
        <Link
          href={href}
          className="mt-3 w-full text-[13px] font-semibold py-2.5 rounded-xl block text-center"
          style={{ color: "var(--accent)", background: "var(--bg-elevated)" }}
        >
          View strength trend →
        </Link>
      ) : (
        hasMore && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="mt-3 w-full text-[13px] font-semibold py-2.5 rounded-xl"
            style={{ color: "var(--accent)", background: "var(--bg-elevated)" }}
          >
            {showAll ? "Show top 5" : `View all ${items.length} lifts`}
          </button>
        )
      )}

      <p className="text-[11px] mt-3" style={{ color: "var(--fg-muted)" }}>
        Epley formula · weight × (1 + reps ÷ 30) · tap a lift for its full trend
      </p>
    </section>
  );
}
