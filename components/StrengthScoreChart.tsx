"use client";

import { useMemo, useState } from "react";
import ChartScrubTrack from "@/components/ChartScrubTrack";

export type ScorePoint = { at: string; score: number; isPR: boolean };

type Range = "3M" | "1Y" | "All";
const RANGE_LABELS: Range[] = ["3M", "1Y", "All"];
const RANGE_DAYS: Record<Range, number | null> = { "3M": 90, "1Y": 365, All: null };
const RANGE_SUBTITLE: Record<Range, string> = {
  "3M": "Last 90 days",
  "1Y": "Last 12 months",
  All: "All time",
};

const COLOR = "#22c55e";
const PR_COLOR = "#eab308";

// Plot box inside the 320-unit viewBox. The scrub maps its fraction through
// these, so they have to match what LineChart draws with.
const CHART_W = 320;
const PAD_L = 8;
const PAD_R = 36;
const PLOT_PAD_L = PAD_L / CHART_W;
const PLOT_PAD_R = PAD_R / CHART_W;

export default function StrengthScoreChart({
  points,
  liftsTracked,
}: {
  points: ScorePoint[];
  liftsTracked: number;
}) {
  const [range, setRange] = useState<Range>("1Y");
  // Capture "now" once so the chart's time window is stable across renders
  // (calling Date.now() in render bodies is impure).
  const [now] = useState(() => Date.now());

  const filtered = useMemo(() => {
    const days = RANGE_DAYS[range];
    if (days === null) return points;
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    return points.filter((p) => new Date(p.at).getTime() >= cutoff);
  }, [points, range, now]);

  // Each sample's position across the plot, which is what the scrub matches
  // against. "All" starts at the first sample; the fixed ranges start at the
  // cutoff, so a sparse window still reads correctly.
  const xFracs = useMemo(() => {
    if (filtered.length === 0) return [];
    const days = RANGE_DAYS[range];
    const start =
      days === null
        ? new Date(filtered[0].at).getTime()
        : now - days * 24 * 60 * 60 * 1000;
    const span = Math.max(1, now - start);
    return filtered.map((p) =>
      Math.max(0, Math.min(1, (new Date(p.at).getTime() - start) / span)),
    );
  }, [filtered, range, now]);

  const current = points.length ? points[points.length - 1].score : 0;
  const peak = points.reduce((m, p) => (p.score > m ? p.score : m), 0);
  const belowPeak = peak - current;
  // Change over the last ~4 weeks: today's score against the sample nearest
  // 28 days back.
  const monthAgo = (() => {
    const t = now - 28 * 24 * 60 * 60 * 1000;
    let best: ScorePoint | null = null;
    for (const p of points) if (new Date(p.at).getTime() <= t) best = p;
    return best?.score ?? null;
  })();
  const change = monthAgo != null ? current - monthAgo : null;
  const atPeak = belowPeak <= 0;

  return (
    <section
      className="relative rounded-3xl px-5 pt-5 pb-4 mb-4 overflow-hidden"
      style={{
        background: `radial-gradient(130% 80% at 50% 0%, rgba(34,197,94,0.14) 0%, transparent 60%), var(--bg-card)`,
        border: "1px solid var(--border-strong)",
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold" style={{ color: "var(--fg-muted)" }}>
          Strength score
        </p>
        <span
          className="text-[12px] font-bold px-2.5 py-0.5 rounded-full"
          style={
            atPeak
              ? { color: PR_COLOR, background: "rgba(234,179,8,0.13)", border: "1px solid rgba(234,179,8,0.35)" }
              : { color: "#fb923c", background: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.3)" }
          }
        >
          {atPeak ? "★ At your peak" : `${belowPeak.toLocaleString()} lb off peak`}
        </span>
      </div>

      <div className="flex items-end gap-2 mt-2">
        <span
          className="text-[60px] font-bold leading-none tabular-nums"
          style={{ letterSpacing: "-0.045em" }}
        >
          {current > 0 ? current.toLocaleString() : "—"}
        </span>
        <span className="text-[15px] font-semibold mb-2" style={{ color: "var(--fg-muted)" }}>
          lb
        </span>
        {change != null && change !== 0 && (
          <span
            className="ml-auto mb-2 text-[13px] font-bold tabular-nums"
            style={{ color: change > 0 ? "#4ade80" : "#fb923c" }}
          >
            {change > 0 ? "▲" : "▼"} {Math.abs(change).toLocaleString()} lb
            <span className="font-normal ml-1" style={{ color: "var(--fg-muted)" }}>
              4 wks
            </span>
          </span>
        )}
      </div>
      <p className="text-[12px] mt-1.5" style={{ color: "var(--fg-muted)" }}>
        Your best est. 1RM on each of {liftsTracked} lift{liftsTracked === 1 ? "" : "s"} over the last 6 weeks, added up
      </p>

      <div className="mt-3">
        {filtered.length < 2 ? (
          <p className="text-[12px] py-8 text-center" style={{ color: "var(--fg-muted)" }}>
            Log a few more strength sessions to see your trend.
          </p>
        ) : (
          <ChartScrubTrack
            xFracs={xFracs}
            padLeft={PLOT_PAD_L}
            padRight={PLOT_PAD_R}
            hint={
              <p className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
                {RANGE_SUBTITLE[range]} · hold and drag to read a week
              </p>
            }
            readout={(i) => <Readout point={filtered[i]} />}
          >
            {(activeIndex) => (
              <LineChart
                points={filtered}
                range={range}
                now={now}
                activeIndex={activeIndex}
              />
            )}
          </ChartScrubTrack>
        )}
      </div>

      <div className="flex items-center gap-3 mt-3">
        <div
          className="flex gap-1 p-1 rounded-full flex-1"
          style={{ background: "var(--bg-elevated)" }}
        >
          {RANGE_LABELS.map((r) => {
            const active = r === range;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className="flex-1 py-1.5 rounded-full text-[13px] font-semibold transition-colors"
                style={{
                  background: active ? "var(--bg-card)" : "transparent",
                  color: active ? "var(--fg)" : "var(--fg-muted)",
                  boxShadow: active ? "inset 0 0 0 1px var(--border-strong)" : undefined,
                }}
              >
                {r}
              </button>
            );
          })}
        </div>
        {atPeak ? (
          <Tile label="Lifts" value={String(liftsTracked)} unit="" />
        ) : (
          <Tile label="Peak" value={peak.toLocaleString()} unit="lb" color={PR_COLOR} />
        )}
      </div>
    </section>
  );
}

function Tile({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string;
  unit: string;
  color?: string;
}) {
  return (
    <div className="text-right shrink-0">
      <p className="text-[11px] font-semibold" style={{ color: "var(--fg-muted)" }}>
        {label}
      </p>
      <p
        className="text-[17px] font-bold tabular-nums leading-tight"
        style={{ color: color ?? "var(--fg)" }}
      >
        {value}
        {unit && (
          <span className="text-[11px] ml-0.5" style={{ color: "var(--fg-muted)" }}>
            {unit}
          </span>
        )}
      </p>
    </div>
  );
}

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/// What a scrubbed sample reads as: the score that week, and when.
function Readout({ point }: { point: ScorePoint }) {
  const d = new Date(point.at);
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[15px] font-bold tabular-nums">
        {Math.round(point.score).toLocaleString()}
        <span
          className="text-[10px] font-normal ml-0.5"
          style={{ color: "var(--fg-muted)" }}
        >
          lb
        </span>
      </span>
      {point.isPR && (
        <span
          className="text-[9px] font-bold px-1.5 py-0.5 rounded"
          style={{
            background: "rgba(234,179,8,0.15)",
            color: PR_COLOR,
            border: "1px solid rgba(234,179,8,0.35)",
          }}
        >
          PEAK
        </span>
      )}
      <span className="text-[11px] ml-auto" style={{ color: "var(--fg-dim)" }}>
        {d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
      </span>
    </div>
  );
}

function LineChart({
  points,
  range,
  now,
  activeIndex,
}: {
  points: ScorePoint[];
  range: Range;
  now: number;
  activeIndex: number | null;
}) {
  const W = CHART_W;
  const H = 200;
  const padL = PAD_L;
  const padR = PAD_R;
  const padT = 14;
  const padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const days = RANGE_DAYS[range];
  const windowEnd = now;
  const windowStart =
    days === null
      ? new Date(points[0].at).getTime()
      : windowEnd - days * 24 * 60 * 60 * 1000;
  const span = Math.max(1, windowEnd - windowStart);

  const vals = points.map((p) => p.score);
  const minVal = Math.max(0, Math.min(...vals) - 20);
  const maxVal = Math.max(...vals) + 20;
  const span2 = Math.max(1, maxVal - minVal);

  const xFor = (atIso: string) =>
    padL + ((new Date(atIso).getTime() - windowStart) / span) * plotW;
  const yFor = (v: number) => padT + plotH * (1 - (v - minVal) / span2);

  const xy = points.map((p) => ({ x: xFor(p.at), y: yFor(p.score) }));
  const linePath = smoothPath(xy);

  // Soft area fill under the line.
  const areaPath =
    linePath +
    ` L${xFor(points[points.length - 1].at)},${yFor(minVal)}` +
    ` L${xFor(points[0].at)},${yFor(minVal)} Z`;

  const yTicks = [minVal, (minVal + maxVal) / 2, maxVal];

  // Month ticks across the window.
  const xTicks: { x: number; label: string }[] = [];
  const seen = new Set<string>();
  for (let t = windowStart; t <= windowEnd; t += span / 4) {
    const d = new Date(t);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    xTicks.push({
      x: padL + ((t - windowStart) / span) * plotW,
      label: MONTH_ABBR[d.getMonth()],
    });
  }

  const last = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ display: "block" }}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="strengthFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={COLOR} stopOpacity={0.3} />
          <stop offset="100%" stopColor={COLOR} stopOpacity={0} />
        </linearGradient>
      </defs>

      {yTicks.map((y, i) => (
        <line
          key={`y-${i}`}
          x1={padL}
          x2={W - padR}
          y1={yFor(y)}
          y2={yFor(y)}
          stroke="var(--border)"
          strokeDasharray="2 3"
          strokeWidth={0.5}
        />
      ))}
      {yTicks.map((y, i) => (
        <text
          key={`yl-${i}`}
          x={W - padR + 4}
          y={yFor(y) + 3}
          fontSize="9"
          fill="var(--fg-muted)"
        >
          {Math.round(y)}
          {i === yTicks.length - 1 ? " lb" : ""}
        </text>
      ))}
      {xTicks.map((t, i) => (
        <text
          key={`xl-${i}`}
          x={t.x}
          y={H - padB + 14}
          fontSize="9"
          fill="var(--fg-muted)"
          textAnchor="middle"
        >
          {t.label}
        </text>
      ))}

      <path d={areaPath} fill="url(#strengthFill)" stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke={COLOR}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        style={{ filter: "drop-shadow(0 0 4px rgba(34,197,94,0.45))" }}
      />

      {/* PR markers */}
      {points.map((p, i) =>
        p.isPR ? (
          <circle
            key={`pr-${i}`}
            cx={xFor(p.at)}
            cy={yFor(p.score)}
            r={2.8}
            fill={PR_COLOR}
            stroke="var(--bg-card)"
            strokeWidth={0.8}
          />
        ) : null,
      )}

      {/* Latest point + value label */}
      <circle
        cx={xFor(last.at)}
        cy={yFor(last.score)}
        r={3.5}
        fill={COLOR}
        stroke="var(--bg-card)"
        strokeWidth={1.5}
      />

      {/* The sample under the scrub, so the header reading is tied to a point. */}
      {activeIndex != null && points[activeIndex] && (
        <circle
          cx={xFor(points[activeIndex].at)}
          cy={yFor(points[activeIndex].score)}
          r={5}
          fill={points[activeIndex].isPR ? PR_COLOR : COLOR}
          stroke="var(--bg-card)"
          strokeWidth={2}
        />
      )}
    </svg>
  );
}

/// Catmull-Rom through the samples, so the weekly steps read as a trend.
function smoothPath(pts: { x: number; y: number }[]): string {
  const f = (n: number) => n.toFixed(2);
  if (pts.length === 0) return "";
  let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    d += ` C${f(p1.x + (p2.x - p0.x) / 6)},${f(p1.y + (p2.y - p0.y) / 6)} ${f(p2.x - (p3.x - p1.x) / 6)},${f(p2.y - (p3.y - p1.y) / 6)} ${f(p2.x)},${f(p2.y)}`;
  }
  return d;
}
