"use client";

import { useEffect, useMemo, useState } from "react";

type Range = "W" | "M" | "Y";

type Day = { dateKey: string; volume: number };

type Payload = {
  range: Range;
  tz: string;
  total: number;
  best: number;
  days: Day[];
};

const RANGE_LABELS: { value: Range; label: string }[] = [
  { value: "W", label: "W" },
  { value: "M", label: "M" },
  { value: "Y", label: "Y" },
];

const RANGE_SUBTITLE: Record<Range, string> = {
  W: "Last 7 days",
  M: "Last 30 days",
  Y: "Last 12 months",
};

const COLOR = "#22c55e";

export default function StrengthVolumeChart({
  initial,
}: {
  initial: Payload;
}) {
  const [data, setData] = useState<Payload>(initial);
  const [range, setRange] = useState<Range>(initial.range);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/strength/volume?range=${range}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const activeDays = data.days.filter((d) => d.volume > 0).length;
  const avg = activeDays > 0 ? Math.round(data.total / activeDays) : 0;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[15px] font-bold tracking-tight">Strength</h2>
        <div
          className="flex gap-1 p-1 rounded-full"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
        >
          {RANGE_LABELS.map((r) => {
            const active = r.value === range;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => setRange(r.value)}
                className="px-3 py-1 rounded-full text-[11px] font-semibold transition-colors"
                style={{
                  background: active ? "var(--bg-elevated)" : "transparent",
                  color: active ? "var(--fg)" : "var(--fg-dim)",
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="rounded-2xl p-4"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
        }}
      >
        <p
          className="text-[10px] uppercase tracking-wider font-semibold"
          style={{ color: "var(--fg-dim)" }}
        >
          Volume
        </p>
        <div className="flex items-baseline gap-2 mb-1 tabular-nums">
          <span className="text-[26px] font-bold" style={{ color: COLOR }}>
            {data.total.toLocaleString()}
          </span>
          <span className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
            LB
          </span>
        </div>
        <p
          className="text-[11px] mb-3"
          style={{ color: "var(--fg-dim)" }}
        >
          {RANGE_SUBTITLE[range]} ·{" "}
          {activeDays > 0
            ? `avg ${avg.toLocaleString()} lb/day`
            : "no working sets"}
          {loading ? " · updating…" : ""}
        </p>

        <LineChart days={data.days} range={range} color={COLOR} />
      </div>
    </div>
  );
}

function LineChart({
  days,
  range,
  color,
}: {
  days: Day[];
  range: Range;
  color: string;
}) {
  const W = 320;
  const H = 180;
  const padL = 8;
  const padR = 32;
  const padT = 12;
  const padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const max = useMemo(() => {
    const m = Math.max(0, ...days.map((d) => d.volume));
    if (m === 0) return 1;
    // Round up to a clean axis max so labels read nicely.
    const step = m > 50_000 ? 25_000 : m > 10_000 ? 5_000 : m > 1_000 ? 1_000 : 100;
    return Math.ceil(m / step) * step;
  }, [days]);

  const n = days.length || 1;
  const slotW = plotW / n;
  const xFor = (i: number) => padL + i * slotW + slotW / 2;
  const yFor = (v: number) =>
    padT + plotH * (1 - Math.min(1, v / max));

  // Build the line path, lifting the pen when a day has zero volume so the
  // chart doesn't draw a phantom line through rest days.
  const segments: string[] = [];
  let inSegment = false;
  days.forEach((d, i) => {
    if (d.volume > 0) {
      segments.push(`${inSegment ? "L" : "M"}${xFor(i)},${yFor(d.volume)}`);
      inSegment = true;
    } else {
      inSegment = false;
    }
  });
  const linePath = segments.join(" ");

  const yTicks = [0, max / 2, max];

  const MONTH_ABBR = [
    "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec",
  ];
  const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const ticks: { index: number; label: string }[] = [];
  if (range === "W") {
    days.forEach((d, i) => {
      const [yy, mm, dd] = d.dateKey.split("-").map(Number);
      const dow = new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay();
      ticks.push({ index: i, label: DAY_ABBR[dow] });
    });
  } else {
    const byMonth = new Map<string, number[]>();
    days.forEach((d, i) => {
      const m = d.dateKey.slice(0, 7);
      const cur = byMonth.get(m);
      if (cur) cur.push(i);
      else byMonth.set(m, [i]);
    });
    const minSpan = range === "M" ? 3 : 1;
    for (const [month, indices] of byMonth) {
      if (indices.length < minSpan) continue;
      const midIdx = indices[Math.floor(indices.length / 2)];
      const monthNum = Number(month.slice(5, 7));
      ticks.push({ index: midIdx, label: MONTH_ABBR[monthNum - 1] ?? "" });
    }
  }

  // Highlight dots for days with logged sessions.
  const dots = days
    .map((d, i) => (d.volume > 0 ? { i, v: d.volume } : null))
    .filter((x): x is { i: number; v: number } => x !== null);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ display: "block" }}
      preserveAspectRatio="none"
    >
      {yTicks.map((y) => (
        <line
          key={`y-${y}`}
          x1={padL}
          x2={W - padR}
          y1={yFor(y)}
          y2={yFor(y)}
          stroke="var(--border)"
          strokeDasharray="2 3"
          strokeWidth={0.5}
        />
      ))}
      {yTicks.map((y) => (
        <text
          key={`yl-${y}`}
          x={W - padR + 4}
          y={yFor(y) + 3}
          fontSize="9"
          fill="var(--fg-dim)"
        >
          {formatVolume(Math.round(y))}
        </text>
      ))}

      {ticks.map((t) => (
        <text
          key={`xl-${t.index}-${t.label}`}
          x={padL + t.index * slotW + slotW / 2}
          y={H - padB + 14}
          fontSize="9"
          fill="var(--fg-dim)"
          textAnchor="middle"
        >
          {t.label}
        </text>
      ))}

      {linePath && (
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {dots.map((d) => (
        <circle
          key={`dot-${d.i}`}
          cx={xFor(d.i)}
          cy={yFor(d.v)}
          r={2.5}
          fill={color}
        />
      ))}
    </svg>
  );
}

function formatVolume(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}k`;
  return String(v);
}
