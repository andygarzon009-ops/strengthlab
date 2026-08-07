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
import { hapticTick } from "@/lib/haptics";
import { useMemo, useState } from "react";

type Sample = { timestamp: string; bpm: number };
type SetMarker = { timestamp: string; label: string };

/// Stable identity for the default, so omitting the prop doesn't invalidate
/// the memoised chart on every render.
const NO_MARKERS: SetMarker[] = [];

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

/// Single colour for the workout trace — see strokePaint below for why this
/// isn't the zone gradient.
const TRACE_COLOR = "#3b82f6";

/// Heart rate's own colour, used for the headline numbers. Red reads as
/// "pulse" everywhere else in the app (the workout-HR dot, the recovery
/// cards), and keeping the trace blue means the two never fight: blue is the
/// shape of the session, red is the number being quoted.
const HR_ACCENT = "#ef4444";

/// Index of the sample nearest an instant. The samples are time-ordered, so
/// this is a bisect — the previous scan compared every marker against every
/// sample, which on a long session was thousands of Date parses per render.
function nearestSampleIdx(times: number[], target: number): number {
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(times[lo - 1] - target) <= Math.abs(times[lo] - target)) {
    return lo - 1;
  }
  return lo;
}

export default function WorkoutHRChart({
  samples,
  setMarkers = NO_MARKERS,
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

  // Everything that doesn't depend on where the finger is, *including the
  // rendered chart*. Recharts re-measures and re-lays-out the entire plot for
  // any prop change, so re-rendering it per pointer move is what made the drag
  // lag behind the thumb. Keeping this element identity stable lets React skip
  // the whole subtree; the cursor and the reading dot are drawn as DOM overlays
  // on top instead, which cost nothing to move.
  const chart = useMemo(() => {
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
    const times = samples.map((s) => Date.parse(s.timestamp));

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

    // Pixel position of a BPM value inside the plot — used by the gradient
    // below and by the overlay dot, which has to land on the trace.
    const yPx = (bpm: number) =>
      PLOT_TOP + (PLOT_BOTTOM - PLOT_TOP) * (1 - (bpm - yMin) / (yMax - yMin));

    // Hard-stopped gradient so the trace takes the colour of whatever zone it's
    // passing through — the same colours as the threshold lines and the legend,
    // rather than one flat red for the whole session.
    // Top zone first: SVG clamps a stop whose offset is below the previous
    // one, and zone 1 sits at the BOTTOM of the plot. Emitting in zone order
    // collapsed every stop after the first, painting the whole trace zone 1's
    // colour however high the session went.
    const gradientStops = [...visibleBands].reverse().flatMap((b) => {
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
    // The trace stays one colour here, unlike the day chart. A workout sits
    // right on a zone boundary for most of its length, so colouring by zone
    // made the line strobe blue/green every few samples and cost more
    // legibility than the zone information was worth. The dotted thresholds
    // and the legend still say which zone any part of it is in.
    const strokePaint = TRACE_COLOR;

    // Zone the session actually peaked in. Falls back to neutral when there's
    // no max HR to score against, rather than picking a colour at random.
    const peakColor =
      maxHr && maxHr > 0 ? hrZoneColor(max, maxHr) : "rgba(255,255,255,0.75)";

    // Set markers, resolved once to the sample they sit on. `at` is kept in ms
    // so the scrub can find the active set with a numeric scan.
    const markers = [...setMarkers]
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
      .map((m) => {
        const at = Date.parse(m.timestamp);
        const idx = nearestSampleIdx(times, at);
        return { at, label: m.label, idx, bpm: data[idx].bpm };
      });

    const timeFmt = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    const formatTime = (iso: string) => timeFmt.format(new Date(iso));

    const element = (
      <div style={{ width: "100%", height: CHART_H }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: MARGIN_TOP, right: 16, bottom: MARGIN_BOTTOM, left: 0 }}
          >
            <defs>
              <linearGradient id="hrFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={TRACE_COLOR} stopOpacity={0.32} />
                <stop offset="100%" stopColor={TRACE_COLOR} stopOpacity={0.02} />
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
                  strokeDasharray={b.dash}
                  strokeOpacity={0.8}
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
              r={4}
              // The peak is worth saying something about, so it takes the
              // colour of the zone it actually reached — the same yellow as
              // the Moderate threshold it's sitting on. Red was arbitrary,
              // blue competed with the trace, grey said nothing at all. This
              // varies with the session, which is the point.
              fill={peakColor}
              stroke="var(--surface)"
              strokeWidth={1.5}
              ifOverflow="extendDomain"
              label={{
                value: `${max}`,
                position: "top",
                offset: 8,
                fill: peakColor,
                fontSize: 11,
                fontWeight: 700,
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
            {markers.map((m, i) => (
              <ReferenceDot
                key={`${m.at}-${i}`}
                x={data[m.idx].time}
                y={m.bpm}
                r={3}
                fill="#22c55e"
                stroke="var(--surface)"
                strokeWidth={1.5}
                ifOverflow="extendDomain"
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );

    return {
      data,
      min,
      max,
      avg,
      visibleBands,
      markers,
      yPx,
      formatTime,
      element,
    };
  }, [samples, setMarkers, maxHr]);

  if (!chart) return null;

  const { data, min, max, avg, visibleBands, markers, yPx, formatTime } = chart;

  // Recharts insets the plot by the axis width and right margin, so the data
  // occupies only the middle of the element. Map through those or the readout
  // lags the cursor at both edges.
  const padLeftPct = trackWidth > 0 ? MARGIN_LEFT / trackWidth : 0;
  const padRightPct = trackWidth > 0 ? MARGIN_RIGHT / trackWidth : 0;
  const liveIdx =
    frac == null
      ? null
      : scrubIndex(frac, data.length, padLeftPct, padRightPct);
  if (liveIdx != null && liveIdx !== held) {
    setHeld(liveIdx);
    // A tick per reading, so the drag catches on the data instead of sliding
    // over glass. Rate-limited inside hapticTick.
    hapticTick();
  }
  const idx = liveIdx ?? held ?? -1;
  const active = idx >= 0 ? data[idx] : null;

  /// Where a sample sits across the element, matching the plot insets. The
  /// cursor and the dot both use it, so they can't disagree with each other.
  const xPct = (i: number) =>
    (padLeftPct +
      (data.length > 1 ? i / (data.length - 1) : 0.5) *
        (1 - padLeftPct - padRightPct)) *
    100;

  // Which set was on when the scrubbed reading was taken. Markers carry
  // loggedAt — the instant a set was ticked — so the last one at or before
  // this point is the set the athlete had just finished, which is exactly
  // what a spike on the trace is asking about.
  let activeSetIdx = -1;
  if (active) {
    const t = Date.parse(active.time);
    for (let i = 0; i < markers.length; i++) {
      if (markers[i].at <= t) activeSetIdx = i;
      else break;
    }
  }
  const activeSet = activeSetIdx >= 0 ? markers[activeSetIdx] : null;
  const secsSinceSet =
    active && activeSet
      ? Math.max(0, Math.round((Date.parse(active.time) - activeSet.at) / 1000))
      : null;

  return (
    <section className="rounded-2xl p-4" style={{ background: "var(--surface)" }}>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-[15px] font-semibold">Heart Rate</h2>
        <div className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
          {data.length} samples
        </div>
      </div>

      <div className="h-9 mb-1 flex items-center">
        {active ? (
          <div className="flex items-center gap-2.5">
            <div>
              <div className="flex items-baseline gap-1.5">
                <span
                  className="text-[22px] font-bold tabular-nums leading-none"
                  style={{ color: HR_ACCENT }}
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
              {activeSet && (
                <div
                  className="text-[11px] mt-0.5 truncate"
                  style={{ color: "var(--accent)", maxWidth: 220 }}
                  title={activeSet.label}
                >
                  {secsSinceSet !== null && secsSinceSet < 20
                    ? "on "
                    : secsSinceSet !== null
                      ? `${Math.floor(secsSinceSet / 60)}:${String(
                          secsSinceSet % 60
                        ).padStart(2, "0")} after `
                      : ""}
                  {activeSet.label}
                </div>
              )}
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
        // touch-action:none, not pan-y. With pan-y the browser was free to
        // claim the gesture the moment a thumb drifted vertically — which it
        // always does — and the scrub died mid-drag with a pointercancel. The
        // page still scrolls from anywhere outside the plot.
        className="relative select-none touch-none cursor-ew-resize"
        data-chart-scrub
        {...handlers}
      >
        {chart.element}
        {idx >= 0 && trackWidth > 0 && (
          <>
            <div
              className="absolute top-0 bottom-0 pointer-events-none"
              style={{
                // Snapped to the sample rather than the raw finger position, so
                // the line, the dot and the number can't disagree.
                left: `${xPct(idx)}%`,
                width: 1.5,
                marginLeft: -0.75,
                background: "var(--fg)",
                opacity: 0.9,
              }}
            />
            {/* The reading dot, drawn over the chart rather than inside it —
                a ReferenceDot would mean re-rendering all of recharts for
                every pixel of the drag. */}
            <div
              className="absolute pointer-events-none rounded-full"
              style={{
                left: `${xPct(idx)}%`,
                top: yPx(data[idx].bpm),
                width: 8,
                height: 8,
                marginLeft: -4,
                marginTop: -4,
                background: "var(--surface)",
                border: "2px solid var(--fg)",
              }}
            />
            {activeSet && (
              // The set behind this reading, emphasised the way the green
              // marker dots below it aren't.
              <div
                className="absolute pointer-events-none rounded-full"
                style={{
                  left: `${xPct(activeSet.idx)}%`,
                  top: yPx(activeSet.bpm),
                  width: 10,
                  height: 10,
                  marginLeft: -5,
                  marginTop: -5,
                  background: "#22c55e",
                  border: "2px solid var(--fg)",
                }}
              />
            )}
          </>
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
              <span aria-hidden className="inline-flex items-center gap-[2px]">
                {Array.from({ length: b.zone }).map((_, i) => (
                  <span
                    key={i}
                    style={{
                      width: 2.5,
                      height: 2.5,
                      borderRadius: "50%",
                      background: b.color,
                      display: "inline-block",
                    }}
                  />
                ))}
              </span>
              {b.label}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end justify-between mt-2">
        <div
          className="text-[11px] font-semibold tracking-wider uppercase"
          style={{ color: HR_ACCENT, letterSpacing: "0.08em" }}
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
