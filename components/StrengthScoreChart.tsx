"use client";

import { useMemo, useState } from "react";

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

  const current = points.length ? points[points.length - 1].score : 0;
  const prCount = points.filter((p) => p.isPR).length;

  return (
    <div>
      {/* Summary tiles */}
      <div
        className="rounded-2xl p-4 mb-3 grid grid-cols-3 gap-3"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
        }}
      >
        <Tile
          label="Strength score"
          value={current > 0 ? current.toLocaleString() : "—"}
          unit="lb"
          color={COLOR}
        />
        <Tile label="Lifts tracked" value={String(liftsTracked)} unit="" />
        <Tile
          label="PRs"
          value={String(prCount)}
          unit=""
          color={prCount > 0 ? PR_COLOR : undefined}
        />
      </div>

      {/* Range chips */}
      <div
        className="flex gap-1 p-1 rounded-full mb-3"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
        }}
      >
        {RANGE_LABELS.map((r) => {
          const active = r === range;
          return (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className="flex-1 py-1.5 rounded-full text-[12px] font-semibold transition-colors"
              style={{
                background: active ? "var(--bg-elevated)" : "transparent",
                color: active ? "var(--fg)" : "var(--fg-dim)",
              }}
            >
              {r}
            </button>
          );
        })}
      </div>

      {/* Chart */}
      <div
        className="rounded-2xl p-4"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
        }}
      >
        <p
          className="text-[10px] uppercase tracking-wider font-semibold mb-1"
          style={{ color: "var(--fg-dim)" }}
        >
          Overall strength · trend
        </p>
        <p className="text-[11px] mb-3" style={{ color: "var(--fg-dim)" }}>
          {RANGE_SUBTITLE[range]} · sum of your best est. 1RM across every lift
        </p>
        {filtered.length < 2 ? (
          <p
            className="text-[12px] py-8 text-center"
            style={{ color: "var(--fg-dim)" }}
          >
            Log a few more strength sessions to see your trend.
          </p>
        ) : (
          <LineChart points={filtered} range={range} now={now} />
        )}
      </div>
    </div>
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
    <div>
      <p
        className="text-[9px] uppercase tracking-wider font-semibold"
        style={{ color: "var(--fg-dim)" }}
      >
        {label}
      </p>
      <p
        className="text-[18px] font-bold tabular-nums"
        style={{ color: color ?? "var(--fg)" }}
      >
        {value}
        {unit && (
          <span className="text-[10px] ml-0.5" style={{ color: "var(--fg-dim)" }}>
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

function LineChart({
  points,
  range,
  now,
}: {
  points: ScorePoint[];
  range: Range;
  now: number;
}) {
  const W = 320;
  const H = 200;
  const padL = 8;
  const padR = 36;
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

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xFor(p.at)},${yFor(p.score)}`)
    .join(" ");

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
          <stop offset="0%" stopColor={COLOR} stopOpacity={0.18} />
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
          fill="var(--fg-dim)"
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
          fill="var(--fg-dim)"
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
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* PR markers */}
      {points.map((p, i) =>
        p.isPR ? (
          <circle
            key={`pr-${i}`}
            cx={xFor(p.at)}
            cy={yFor(p.score)}
            r={2.5}
            fill={PR_COLOR}
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
    </svg>
  );
}
