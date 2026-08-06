"use client";

import {
  Area,
  AreaChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { hrZoneBands, hrZoneColor } from "@/lib/hrZones";
import { useScrub, scrubIndex } from "@/lib/useScrub";
import { useState } from "react";

type Sample = { timestamp: string; bpm: number };
type SetMarker = { timestamp: string; label: string };

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/// Chart geometry. The zone gradient is positioned in user space, so these
/// have to match what's handed to AreaChart below — change one, change both.
const CHART_H = 200;
const MARGIN_TOP = 24;
const MARGIN_BOTTOM = 8;
const XAXIS_H = 20;
const PLOT_TOP = MARGIN_TOP;
const PLOT_BOTTOM = CHART_H - MARGIN_BOTTOM - XAXIS_H;

/// Recharts insets the plot by these margins, so a scrub fraction measured
/// across the whole element has to be mapped through them or the readout
/// drifts from the cursor at both ends.
const MARGIN_LEFT = 36; // YAxis width
const MARGIN_RIGHT = 16;

export default function WorkoutHRChart({
  samples,
  setMarkers = [],
  maxHr,
}: {
  samples: Sample[];
  setMarkers?: SetMarker[];
  /** Athlete's estimated max HR, for zone thresholds. Omit to skip zones. */
  maxHr?: number | null;
}) {
  // Before the early return — a hook can't sit behind a conditional exit.
  const { trackRef, frac, trackWidth, handlers } = useScrub<HTMLDivElement>();
  // Held after release so the value can actually be read — while you're
  // dragging, it's under your thumb.
  const [held, setHeld] = useState<number | null>(null);

  if (samples.length === 0) return null;

  const bpms = samples.map((s) => s.bpm);
  const min = Math.min(...bpms);
  const max = Math.max(...bpms);
  const avg = Math.round(bpms.reduce((s, n) => s + n, 0) / bpms.length);
  const minIdx = bpms.indexOf(min);
  const maxIdx = bpms.indexOf(max);

  const yMin = Math.max(0, min - 10);
  const yMax = max + 10;

  const data = samples.map((s) => ({ time: s.timestamp, bpm: s.bpm }));

  const firstTs = data[0].time;
  const midTs = data[Math.floor(data.length / 2)].time;
  const lastTs = data[data.length - 1].time;

  // Y-axis ticks: keep only min and max — drawing avg as a separate tick
  // ended up overlapping the dashed "avg N" reference line label. Padded
  // values are rounded so the axis reads as 50/100/150 etc.
  const yTicks = [min, max];

  // Zone bands clipped to what's actually on screen. A session that never
  // left the light zone shouldn't draw four threshold lines it never crossed.
  const bands = maxHr && maxHr > 0 ? hrZoneBands(maxHr) : [];
  const visibleBands = bands.filter(
    (b) => (b.maxBpm ?? Infinity) > yMin && b.minBpm < yMax
  );

  // Pixel position of a BPM value inside the plot, for the gradient below.
  const yPx = (bpm: number) =>
    PLOT_TOP +
    (PLOT_BOTTOM - PLOT_TOP) * (1 - (bpm - yMin) / (yMax - yMin));

  // Hard-stopped gradient so the trace takes the colour of whatever zone it's
  // passing through — the same colours as the threshold lines and the legend,
  // rather than one flat red for the whole session.
  const gradientStops = visibleBands.flatMap((b) => {
    const top = Math.min(b.maxBpm ?? yMax, yMax);
    const bottom = Math.max(b.minBpm, yMin);
    const o1 = (yPx(top) - PLOT_TOP) / (PLOT_BOTTOM - PLOT_TOP);
    const o2 = (yPx(bottom) - PLOT_TOP) / (PLOT_BOTTOM - PLOT_TOP);
    return [
      { offset: Math.max(0, Math.min(1, o1)), color: b.color },
      { offset: Math.max(0, Math.min(1, o2)), color: b.color },
    ];
  });
  const hasZones = gradientStops.length > 0;
  const strokePaint = hasZones ? "url(#hrZoneStroke)" : "#ef4444";

  // Recharts insets the plot by the axis width and right margin, so the data
  // occupies only the middle of the element. Map through those or the readout
  // lags the cursor at both edges.
  const padLeftPct = trackWidth > 0 ? MARGIN_LEFT / trackWidth : 0;
  const padRightPct = trackWidth > 0 ? MARGIN_RIGHT / trackWidth : 0;
  const liveIdx =
    frac == null
      ? null
      : scrubIndex(frac, data.length, padLeftPct, padRightPct);
  if (liveIdx != null && liveIdx !== held) setHeld(liveIdx);
  const idx = liveIdx ?? held ?? -1;
  const active = idx >= 0 ? data[idx] : null;

  return (
    <section className="rounded-2xl p-4" style={{ background: "var(--surface)" }}>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-[15px] font-semibold">Heart Rate</h2>
        <div className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
          {samples.length} samples
        </div>
      </div>

      <div className="h-9 mb-1 flex items-center">
        {active ? (
          <div className="flex items-center gap-2.5">
            <div>
              <div className="flex items-baseline gap-1.5">
                <span
                  className="text-[22px] font-bold tabular-nums leading-none"
                  style={{
                    color: maxHr ? hrZoneColor(active.bpm, maxHr) : "#ef4444",
                  }}
                >
                  {active.bpm}
                </span>
                <span
                  className="text-[11px] font-medium"
                  style={{ color: "var(--fg-muted)" }}
                >
                  bpm
                </span>
              </div>
              <div
                className="text-[11px] tabular-nums mt-0.5"
                style={{ color: "var(--fg-dim)" }}
              >
                {formatTime(active.time)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setHeld(null)}
              aria-label="Clear reading"
              className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "var(--bg-elevated)", color: "var(--fg-muted)" }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <span className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
            Hold and drag the chart to read a time
          </span>
        )}
      </div>

      <div
        ref={trackRef}
        className="relative select-none touch-pan-y cursor-ew-resize"
        {...handlers}
      >
      <div style={{ width: "100%", height: CHART_H }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: MARGIN_TOP, right: 16, bottom: MARGIN_BOTTOM, left: 0 }}
          >
            <defs>
              <linearGradient id="hrFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
              </linearGradient>
              {hasZones && (
                <linearGradient
                  id="hrZoneStroke"
                  gradientUnits="userSpaceOnUse"
                  x1={0}
                  y1={PLOT_TOP}
                  x2={0}
                  y2={PLOT_BOTTOM}
                >
                  {gradientStops.map((s, i) => (
                    <stop
                      key={i}
                      offset={`${(s.offset * 100).toFixed(2)}%`}
                      stopColor={s.color}
                    />
                  ))}
                </linearGradient>
              )}
            </defs>
            {visibleBands
              // The floor of zone 1 is the axis, not a threshold worth drawing.
              .filter((b) => b.minBpm > yMin)
              .map((b) => (
                <ReferenceLine
                  key={`zone-${b.zone}`}
                  y={b.minBpm}
                  stroke={b.color}
                  strokeDasharray="1 5"
                  strokeOpacity={0.7}
                />
              ))}
            <YAxis
              domain={[yMin, yMax]}
              ticks={yTicks}
              tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <XAxis
              dataKey="time"
              tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              ticks={[firstTs, midTs, lastTs]}
              tickFormatter={formatTime}
              height={20}
            />
            <ReferenceLine
              y={avg}
              stroke="rgba(255,255,255,0.2)"
              strokeDasharray="3 3"
            />
            <Area
              type="monotone"
              dataKey="bpm"
              stroke={strokePaint}
              strokeWidth={1.75}
              fill="url(#hrFill)"
              isAnimationActive={false}
              activeDot={false}
            />
            <ReferenceDot
              x={data[maxIdx].time}
              y={max}
              r={3.5}
              fill="#ef4444"
              stroke="var(--surface)"
              strokeWidth={1.5}
              ifOverflow="extendDomain"
              label={{
                value: `${max}`,
                position: "top",
                offset: 8,
                fill: "#ef4444",
                fontSize: 11,
                fontWeight: 600,
              }}
            />
            <ReferenceDot
              x={data[minIdx].time}
              y={min}
              r={3.5}
              fill="rgba(255,255,255,0.45)"
              stroke="var(--surface)"
              strokeWidth={1.5}
              ifOverflow="extendDomain"
              label={{
                value: `${min}`,
                position: "bottom",
                offset: 8,
                fill: "rgba(255,255,255,0.75)",
                fontSize: 11,
                fontWeight: 600,
              }}
            />
            {active && (
              <ReferenceDot
                x={active.time}
                y={active.bpm}
                r={4}
                fill="var(--surface)"
                stroke="var(--fg)"
                strokeWidth={2}
                ifOverflow="extendDomain"
              />
            )}
            {setMarkers.map((m, i) => {
              const target = new Date(m.timestamp).getTime();
              let nearestIdx = 0;
              let nearestDiff = Infinity;
              for (let j = 0; j < data.length; j++) {
                const diff = Math.abs(new Date(data[j].time).getTime() - target);
                if (diff < nearestDiff) {
                  nearestDiff = diff;
                  nearestIdx = j;
                }
              }
              return (
                <ReferenceDot
                  key={`${m.timestamp}-${i}`}
                  x={data[nearestIdx].time}
                  y={data[nearestIdx].bpm}
                  r={3}
                  fill="#22c55e"
                  stroke="var(--surface)"
                  strokeWidth={1.5}
                  ifOverflow="extendDomain"
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>
        {idx >= 0 && trackWidth > 0 && (
          <div
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{
              // Snapped to the sample rather than the raw finger position, so
              // the line, the dot and the number can't disagree.
              left: `${(padLeftPct +
                (data.length > 1 ? idx / (data.length - 1) : 0.5) *
                  (1 - padLeftPct - padRightPct)) *
                100}%`,
              width: 1.5,
              marginLeft: -0.75,
              background: "var(--fg)",
              opacity: 0.9,
            }}
          />
        )}
      </div>

      {visibleBands.length > 1 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
          {visibleBands.map((b) => (
            <span
              key={`legend-${b.zone}`}
              className="flex items-center gap-1.5 text-[10px]"
              style={{ color: "var(--fg-dim)" }}
            >
              <span
                aria-hidden
                style={{
                  width: 12,
                  height: 2,
                  borderRadius: 1,
                  background: b.color,
                  display: "inline-block",
                }}
              />
              {b.label}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end justify-between mt-2">
        <div
          className="text-[11px] font-semibold tracking-wider uppercase"
          style={{ color: "#ef4444", letterSpacing: "0.08em" }}
        >
          {avg} BPM AVG
        </div>
        <div className="flex gap-4 text-right">
          <div>
            <div className="text-[10px]" style={{ color: "var(--fg-dim)" }}>
              MAX
            </div>
            <div className="text-[14px] font-bold tabular-nums">{max}</div>
          </div>
          <div>
            <div className="text-[10px]" style={{ color: "var(--fg-dim)" }}>
              MIN
            </div>
            <div
              className="text-[14px] font-bold tabular-nums"
              style={{ color: "var(--fg-dim)" }}
            >
              {min}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
