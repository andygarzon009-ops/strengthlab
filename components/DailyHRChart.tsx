"use client";

import { useEffect, useMemo, useState } from "react";
import { hrZoneBands, hrZoneColor, type HrZoneBand } from "@/lib/hrZones";
import { useScrub, scrubIndex } from "@/lib/useScrub";

type Sample = { t: string; bpm: number };
type Bucket = { startMin: number; min: number; max: number };
type RangeDay = {
  dateKey: string;
  restingHR?: number;
  peakHR?: number;
  avgHR?: number;
};
export type Range = "H" | "D" | "W" | "M" | "Y";

const BUCKET_MIN = 30;
const HOUR_BUCKET_MIN = 2;
const Y_MIN = 50;
const Y_MAX = 200;

const RANGE_LABELS: { value: Range; label: string }[] = [
  { value: "H", label: "H" },
  { value: "D", label: "D" },
  { value: "W", label: "W" },
  { value: "M", label: "M" },
  { value: "Y", label: "Y" },
];

export default function DailyHRChart({
  initial,
  range,
  onRangeChange,
  maxHr,
}: {
  initial: {
    connected: boolean;
    samples: Sample[];
    tz: string;
    dateKey: string;
  };
  range: Range;
  onRangeChange: (r: Range) => void;
  /** Estimated max HR for the intensity zones. Omit to draw without them. */
  maxHr?: number | null;
}) {
  const [data, setData] = useState(initial);
  const [rangeDays, setRangeDays] = useState<RangeDay[]>([]);
  const [hourSamples, setHourSamples] = useState<Sample[]>([]);
  const [hourWindow, setHourWindow] = useState<{ start: string; end: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // Day-view: fetch immediately on mount (the page no longer blocks to provide
  // initial samples), then re-pull once a minute so the chart fills in live.
  useEffect(() => {
    if (range !== "D") return;
    let cancelled = false;
    const storageKey = `sl:hr-daily:${initial.dateKey}`;

    // Paint instantly from the last-seen data for today (survives going back and
    // reopening the page), so there's no blank-then-load on every visit.
    let hasData = data.samples.length > 0;
    if (!hasData && typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem(storageKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed?.samples?.length) {
            setData(parsed);
            hasData = true;
          }
        }
      } catch {
        // ignore bad cache
      }
    }

    const load = async (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      try {
        const res = await fetch("/api/health/daily-hr", { cache: "no-store" });
        if (res.ok) {
          const body = await res.json();
          if (!cancelled) {
            setData(body);
            try {
              sessionStorage.setItem(storageKey, JSON.stringify(body));
            } catch {
              // storage full / unavailable — fine
            }
          }
        }
      } catch {
        // keep whatever we have
      } finally {
        if (showLoading && !cancelled) setLoading(false);
      }
    };
    // Spinner only when there's truly nothing to show yet.
    load(!hasData);
    const id = setInterval(() => load(false), 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  // Hour-view fetch + tight 20s poll so the chart tracks an active workout.
  useEffect(() => {
    if (range !== "H") return;
    let cancelled = false;
    const pull = async () => {
      try {
        const res = await fetch("/api/health/hourly-hr", { cache: "no-store" });
        if (!res.ok) return;
        const body = await res.json();
        if (cancelled) return;
        if (Array.isArray(body.samples)) setHourSamples(body.samples);
        if (body.windowStart && body.windowEnd) {
          setHourWindow({ start: body.windowStart, end: body.windowEnd });
        }
      } catch {}
    };
    setLoading(true);
    pull().finally(() => {
      if (!cancelled) setLoading(false);
    });
    const id = setInterval(pull, 20_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [range]);

  // Fetch multi-day data when range changes to W/M/Y.
  useEffect(() => {
    if (range === "D" || range === "H") return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/health/hr-range?range=${range}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((body) => {
        if (!cancelled && Array.isArray(body.days)) setRangeDays(body.days);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  // Manual refresh — fires whatever fetch matches the current range.
  // Useful when the user knows the watch should have new data but the
  // background poll is mid-interval.
  const refresh = async () => {
    setLoading(true);
    try {
      if (range === "H") {
        const res = await fetch("/api/health/hourly-hr", { cache: "no-store" });
        if (res.ok) {
          const body = await res.json();
          if (Array.isArray(body.samples)) setHourSamples(body.samples);
          if (body.windowStart && body.windowEnd) {
            setHourWindow({ start: body.windowStart, end: body.windowEnd });
          }
        }
      } else if (range === "D") {
        const res = await fetch("/api/health/daily-hr", { cache: "no-store" });
        if (res.ok) setData(await res.json());
      } else {
        const res = await fetch(`/api/health/hr-range?range=${range}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const body = await res.json();
          if (Array.isArray(body.days)) setRangeDays(body.days);
        }
      }
    } catch {}
    setLoading(false);
  };

  if (!data.connected) {
    return (
      <div
        className="rounded-2xl p-6 text-center"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
        }}
      >
        <p style={{ color: "var(--fg-dim)" }}>
          Connect Fitbit on the Health page to see your heart rate.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div
          className="flex gap-1 p-1 rounded-full flex-1"
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
                onClick={() => onRangeChange(r.value)}
                className="flex-1 py-1.5 rounded-full text-[12px] font-semibold transition-colors"
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
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          aria-label="Refresh"
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--fg-muted)",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              animation: loading ? "spin 0.9s linear infinite" : undefined,
            }}
          >
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
            <polyline points="21 3 21 8 16 8" />
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            <polyline points="3 21 3 16 8 16" />
          </svg>
        </button>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {range === "H" ? (
        <HourCard
          maxHr={maxHr}
          samples={hourSamples}
          windowStart={hourWindow?.start ?? null}
          windowEnd={hourWindow?.end ?? null}
          tz={data.tz}
          loading={loading}
        />
      ) : range === "D" ? (
        <DayCard data={data} loading={loading} maxHr={maxHr} />
      ) : (
        <RangeCard range={range} days={rangeDays} loading={loading} />
      )}
    </div>
  );
}

function HourCard({
  samples,
  windowStart,
  windowEnd,
  tz,
  loading,
  maxHr,
}: {
  samples: Sample[];
  windowStart: string | null;
  windowEnd: string | null;
  tz: string;
  loading: boolean;
  maxHr?: number | null;
}) {
  const range = useMemo(() => {
    if (samples.length === 0) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const s of samples) {
      if (s.bpm < min) min = s.bpm;
      if (s.bpm > max) max = s.bpm;
    }
    return { min, max };
  }, [samples]);

  const latest = samples.length ? samples[samples.length - 1] : null;
  const startMs = windowStart ? new Date(windowStart).getTime() : null;
  const endMs = windowEnd ? new Date(windowEnd).getTime() : null;

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
    >
      <RangeHeader
        label="Range"
        primary={range ? `${range.min}–${range.max}` : null}
        subtitle="Last hour"
        loading={loading}
      />
      <ScrubbableChart
        points={samples.map((sp) => ({
          label: fmtClock(new Date(sp.t), tz),
          bpm: sp.bpm,
        }))}
        maxHr={maxHr}
      >
        <HourSvg
          samples={samples}
          startMs={startMs}
          endMs={endMs}
          tz={tz}
          maxHr={maxHr}
        />
      </ScrubbableChart>
      <ZoneLegend maxHr={maxHr} />
      {latest && (
        <>
          <div
            className="mt-3 pt-3 flex items-center justify-between"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <span className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
              Latest:{" "}
              {new Date(latest.t).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
            <span className="text-[14px] font-bold tabular-nums">
              {latest.bpm} BPM
            </span>
          </div>
          <StaleHint latestAt={new Date(latest.t)} />
        </>
      )}
    </div>
  );
}

function DayCard({
  data,
  loading,
  maxHr,
}: {
  data: {
    connected: boolean;
    samples: Sample[];
    tz: string;
    dateKey: string;
  };
  loading: boolean;
  maxHr?: number | null;
}) {
  const buckets = useMemo<Bucket[]>(() => {
    if (!data.samples?.length) return [];
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: data.tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const map = new Map<number, { min: number; max: number }>();
    for (const s of data.samples) {
      const d = new Date(s.t);
      const parts = fmt.formatToParts(d);
      const hh = Number(parts.find((p) => p.type === "hour")?.value);
      const mm = Number(parts.find((p) => p.type === "minute")?.value);
      const minuteOfDay = (hh === 24 ? 0 : hh) * 60 + mm;
      const startMin = Math.floor(minuteOfDay / BUCKET_MIN) * BUCKET_MIN;
      const cur = map.get(startMin);
      if (!cur) map.set(startMin, { min: s.bpm, max: s.bpm });
      else {
        if (s.bpm < cur.min) cur.min = s.bpm;
        if (s.bpm > cur.max) cur.max = s.bpm;
      }
    }
    return Array.from(map.entries())
      .map(([startMin, v]) => ({ startMin, min: v.min, max: v.max }))
      .sort((a, b) => a.startMin - b.startMin);
  }, [data]);

  const dayRange = useMemo(() => {
    if (!data.samples?.length) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const s of data.samples) {
      if (s.bpm < min) min = s.bpm;
      if (s.bpm > max) max = s.bpm;
    }
    return { min, max };
  }, [data]);

  const latest = data.samples?.length
    ? data.samples[data.samples.length - 1]
    : null;

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
    >
      <RangeHeader
        label="Range"
        primary={dayRange ? `${dayRange.min}–${dayRange.max}` : null}
        subtitle="Today"
        loading={loading}
      />
      <ScrubbableChart
        points={buckets.map((b) => ({ label: fmtBucketClock(b.startMin), bpm: b.max }))}
        maxHr={maxHr}
      >
        <DaySvg buckets={buckets} maxHr={maxHr} />
      </ScrubbableChart>
      <ZoneLegend maxHr={maxHr} />
      {latest && (
        <>
          <div
            className="mt-3 pt-3 flex items-center justify-between"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <span className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
              Latest:{" "}
              {new Date(latest.t).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
            <span className="text-[14px] font-bold tabular-nums">
              {latest.bpm} BPM
            </span>
          </div>
          <StaleHint latestAt={new Date(latest.t)} />
        </>
      )}
    </div>
  );
}

function StaleHint({ latestAt }: { latestAt: Date }) {
  const ageMin = Math.floor((Date.now() - latestAt.getTime()) / 60_000);
  if (ageMin < 15) return null;
  return (
    <p
      className="mt-2 text-[11px]"
      style={{ color: ageMin > 60 ? "#f97316" : "var(--fg-dim)" }}
    >
      Last sample {ageMin} min ago — Fitbit hasn&apos;t pushed newer data.
      Open the Fitbit app on your phone to force a sync, then refresh.
    </p>
  );
}

function RangeCard({
  range,
  days,
  loading,
}: {
  range: Range;
  days: RangeDay[];
  loading: boolean;
}) {
  const summary = useMemo(() => {
    const restings = days.map((d) => d.restingHR).filter((x): x is number => !!x);
    const peaks = days.map((d) => d.peakHR).filter((x): x is number => !!x);
    if (restings.length === 0 && peaks.length === 0) return null;
    const lo = restings.length ? Math.min(...restings) : null;
    const hi = peaks.length ? Math.max(...peaks) : null;
    const avgResting = restings.length
      ? Math.round(restings.reduce((a, b) => a + b, 0) / restings.length)
      : null;
    return { lo, hi, avgResting };
  }, [days]);

  const subtitle =
    range === "W" ? "Last 7 days" : range === "M" ? "Last 30 days" : "Last 12 months";

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
    >
      <RangeHeader
        label="Range"
        primary={
          summary
            ? summary.lo !== null && summary.hi !== null
              ? `${summary.lo}–${summary.hi}`
              : summary.lo !== null
                ? `${summary.lo}`
                : summary.hi !== null
                  ? `${summary.hi}`
                  : null
            : null
        }
        subtitle={subtitle}
        loading={loading}
      />
      <RangeSvg days={days} range={range} />
      {summary?.avgResting !== null && summary?.avgResting !== undefined && (
        <div
          className="mt-3 pt-3 flex items-center justify-between"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <span className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
            Avg resting HR
          </span>
          <span className="text-[14px] font-bold tabular-nums">
            {summary.avgResting} BPM
          </span>
        </div>
      )}
    </div>
  );
}

function RangeHeader({
  label,
  primary,
  subtitle,
  loading,
}: {
  label: string;
  primary: string | null;
  subtitle: string;
  loading: boolean;
}) {
  return (
    <>
      <div className="flex items-baseline justify-between mb-1">
        <p
          className="text-[10px] uppercase tracking-wider font-semibold"
          style={{ color: "var(--fg-dim)" }}
        >
          {label}
        </p>
        {loading && (
          <span className="text-[10px]" style={{ color: "var(--fg-dim)" }}>
            updating…
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2 mb-2 tabular-nums">
        {primary ? (
          <>
            <span className="text-[28px] font-bold">{primary}</span>
            <span className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
              BPM
            </span>
          </>
        ) : (
          <span className="text-[14px]" style={{ color: "var(--fg-dim)" }}>
            No samples yet
          </span>
        )}
      </div>
      <p className="text-[12px] mb-3" style={{ color: "var(--fg-dim)" }}>
        {subtitle}
      </p>
    </>
  );
}


/// Dotted intensity thresholds, drawn in the same colours the readings use.
/// Only the lower bound of each zone above the first is worth a line — the
/// floor of zone 1 is the axis.
function ZoneLines({
  bands,
  yFor,
  x1,
  x2,
}: {
  bands: HrZoneBand[];
  yFor: (bpm: number) => number;
  x1: number;
  x2: number;
}) {
  return (
    <>
      {bands
        .filter((b) => b.minBpm > Y_MIN && b.minBpm < Y_MAX)
        .map((b) => (
          <line
            key={`zone-${b.zone}`}
            x1={x1}
            x2={x2}
            y1={yFor(b.minBpm)}
            y2={yFor(b.minBpm)}
            stroke={b.color}
            strokeDasharray="1 5"
            strokeWidth={1}
            strokeOpacity={0.75}
          />
        ))}
    </>
  );
}

/// Key for the threshold colours. Sits under the chart rather than inside it,
/// so it doesn't compete with the trace for space on a narrow screen.
export function ZoneLegend({ maxHr }: { maxHr?: number | null }) {
  if (!maxHr || maxHr <= 0) return null;
  const bands = hrZoneBands(maxHr).filter((b) => b.minBpm < Y_MAX);
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 px-1">
      {bands.map((b) => (
        <span
          key={`lg-${b.zone}`}
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
  );
}


/// Press-and-drag readout over a chart, matching the sleep hypnogram's
/// gesture. The SVGs inside pad the plot by padL/padR, so the scrub fraction
/// is mapped through those insets — otherwise the cursor and the value drift
/// apart at both edges.
const PLOT_PAD_L = 8 / 320;
const PLOT_PAD_R = 32 / 320;

function ScrubbableChart({
  points,
  maxHr,
  children,
}: {
  points: { label: string; bpm: number }[];
  maxHr?: number | null;
  children: React.ReactNode;
}) {
  const { trackRef, frac, handlers } = useScrub<HTMLDivElement>();
  const idx =
    frac == null ? -1 : scrubIndex(frac, points.length, PLOT_PAD_L, PLOT_PAD_R);
  const active = idx >= 0 ? points[idx] : null;

  return (
    <div className="select-none">
      <div className="h-6 mb-1 flex items-center">
        {active ? (
          <span className="flex items-center gap-1.5 text-[12px] font-semibold tabular-nums">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{
                background: maxHr
                  ? hrZoneColor(active.bpm, maxHr)
                  : "var(--fg-dim)",
              }}
            />
            {active.bpm}
            <span style={{ color: "var(--fg-muted)" }}>bpm</span>
            <span style={{ color: "var(--fg-dim)" }}>· {active.label}</span>
          </span>
        ) : (
          <span className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
            {points.length > 0
              ? "Drag across the chart to read exact times"
              : ""}
          </span>
        )}
      </div>
      <div
        ref={trackRef}
        className="relative touch-pan-y cursor-ew-resize"
        {...handlers}
      >
        {children}
        {frac != null && (
          <div
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{
              left: `${frac * 100}%`,
              width: 2,
              marginLeft: -1,
              background: "var(--fg)",
              opacity: 0.85,
            }}
          />
        )}
      </div>
    </div>
  );
}

/// "3:11 PM" for a sample instant in the athlete's timezone.
function fmtClock(d: Date, tz: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

/// "3:10 PM" for a day-view bucket, which is stored as minutes past midnight.
function fmtBucketClock(startMin: number): string {
  const h24 = Math.floor(startMin / 60);
  const m = startMin % 60;
  const ampm = h24 < 12 ? "AM" : "PM";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

function HourSvg({
  samples,
  startMs,
  endMs,
  tz,
  maxHr,
}: {
  samples: Sample[];
  startMs: number | null;
  endMs: number | null;
  tz: string;
  maxHr?: number | null;
}) {
  const W = 320;
  const H = 200;
  const padL = 8;
  const padR = 32;
  const padT = 8;
  const padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const totalMin = 60;

  // Bucket by HOUR_BUCKET_MIN. Offset relative to startMs so the leftmost
  // bucket is exactly the start of the window.
  const buckets = useMemo<{ offsetMin: number; min: number; max: number }[]>(() => {
    if (!samples.length || startMs === null) return [];
    const map = new Map<number, { min: number; max: number }>();
    for (const s of samples) {
      const t = new Date(s.t).getTime();
      const offsetMin = Math.floor((t - startMs) / 60_000);
      if (offsetMin < 0 || offsetMin >= totalMin) continue;
      const bucket = Math.floor(offsetMin / HOUR_BUCKET_MIN) * HOUR_BUCKET_MIN;
      const cur = map.get(bucket);
      if (!cur) map.set(bucket, { min: s.bpm, max: s.bpm });
      else {
        if (s.bpm < cur.min) cur.min = s.bpm;
        if (s.bpm > cur.max) cur.max = s.bpm;
      }
    }
    return Array.from(map.entries())
      .map(([offsetMin, v]) => ({ offsetMin, ...v }))
      .sort((a, b) => a.offsetMin - b.offsetMin);
  }, [samples, startMs]);

  const yFor = (bpm: number) => {
    const clamped = Math.max(Y_MIN, Math.min(Y_MAX, bpm));
    return padT + plotH * (1 - (clamped - Y_MIN) / (Y_MAX - Y_MIN));
  };
  const bucketWidth = (plotW / totalMin) * HOUR_BUCKET_MIN - 1;
  const xFor = (offsetMin: number) =>
    padL + (offsetMin / totalMin) * plotW + 0.5;

  const yTicks = [50, 100, 150, 200];
  // Five x ticks at 0, 15, 30, 45, 60 minutes into the window.
  const tickOffsets = [0, 15, 30, 45, 60];
  const fmt = new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  });

  const tickLabel = (offsetMin: number) => {
    if (startMs === null || endMs === null) return "";
    const ms =
      offsetMin === 60 ? endMs : startMs + offsetMin * 60_000;
    return fmt.format(new Date(ms));
  };

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
      {maxHr ? (
        <ZoneLines bands={hrZoneBands(maxHr)} yFor={yFor} x1={padL} x2={W - padR} />
      ) : null}
      {yTicks.map((y) => (
        <text
          key={`yl-${y}`}
          x={W - padR + 4}
          y={yFor(y) + 3}
          fontSize="9"
          fill="var(--fg-dim)"
        >
          {y}
        </text>
      ))}
      {tickOffsets.map((m) => (
        <text
          key={`xl-${m}`}
          x={padL + (m / totalMin) * plotW}
          y={H - padB + 14}
          fontSize="9"
          fill="var(--fg-dim)"
          textAnchor="middle"
        >
          {tickLabel(m)}
        </text>
      ))}
      {buckets.map((b) => {
        const y1 = yFor(b.max);
        const y2 = yFor(b.min);
        const h = Math.max(2, y2 - y1);
        return (
          <rect
            key={b.offsetMin}
            x={xFor(b.offsetMin)}
            y={y1}
            width={Math.max(2, bucketWidth)}
            height={h}
            rx={1.5}
            fill={maxHr ? hrZoneColor(b.max, maxHr) : "#ef4444"}
            opacity={0.9}
          />
        );
      })}
    </svg>
  );
}

function DaySvg({ buckets, maxHr }: { buckets: Bucket[]; maxHr?: number | null }) {
  const W = 320;
  const H = 200;
  const padL = 8;
  const padR = 32;
  const padT = 8;
  const padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const minutesInDay = 24 * 60;

  const yFor = (bpm: number) => {
    const clamped = Math.max(Y_MIN, Math.min(Y_MAX, bpm));
    return padT + plotH * (1 - (clamped - Y_MIN) / (Y_MAX - Y_MIN));
  };

  const bucketWidth = (plotW / minutesInDay) * BUCKET_MIN - 1;
  const xFor = (startMin: number) =>
    padL + (startMin / minutesInDay) * plotW + 0.5;

  const yTicks = [50, 100, 150, 200];
  const xTicks = [0, 6 * 60, 12 * 60, 18 * 60, 24 * 60];

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
      {maxHr ? (
        <ZoneLines bands={hrZoneBands(maxHr)} yFor={yFor} x1={padL} x2={W - padR} />
      ) : null}
      {yTicks.map((y) => (
        <text
          key={`yl-${y}`}
          x={W - padR + 4}
          y={yFor(y) + 3}
          fontSize="9"
          fill="var(--fg-dim)"
        >
          {y}
        </text>
      ))}
      {xTicks.map((m) => {
        const label =
          m === 0
            ? "12 AM"
            : m === 12 * 60
              ? "12 PM"
              : m === 24 * 60
                ? ""
                : m < 12 * 60
                  ? `${m / 60}`
                  : `${m / 60 - 12}`;
        return (
          <text
            key={`xl-${m}`}
            x={padL + (m / minutesInDay) * plotW}
            y={H - padB + 14}
            fontSize="9"
            fill="var(--fg-dim)"
            textAnchor="middle"
          >
            {label}
          </text>
        );
      })}
      {buckets.map((b) => {
        const y1 = yFor(b.max);
        const y2 = yFor(b.min);
        const h = Math.max(2, y2 - y1);
        return (
          <rect
            key={b.startMin}
            x={xFor(b.startMin)}
            y={y1}
            width={Math.max(2, bucketWidth)}
            height={h}
            rx={1.5}
            fill={maxHr ? hrZoneColor(b.max, maxHr) : "#ef4444"}
            opacity={0.9}
          />
        );
      })}
    </svg>
  );
}

function RangeSvg({ days, range }: { days: RangeDay[]; range: Range }) {
  const W = 320;
  const H = 200;
  const padL = 8;
  const padR = 32;
  const padT = 8;
  const padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = days.length || 1;
  const slotW = plotW / n;
  const barW = Math.max(2, slotW - 2);

  const yFor = (bpm: number) => {
    const clamped = Math.max(Y_MIN, Math.min(Y_MAX, bpm));
    return padT + plotH * (1 - (clamped - Y_MIN) / (Y_MAX - Y_MIN));
  };

  const yTicks = [50, 100, 150, 200];

  // Label cadence: W shows the day-of-month for every day. M and Y label
  // each calendar month seen at the MIDPOINT of its days in the window —
  // anchoring at the first day bunched labels at the left when the window
  // straddled a month boundary (e.g. last 30 days starting Apr 28 placed
  // Apr at index 0 and May right next to it at index 3).
  const MONTH_ABBR = [
    "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec",
  ];
  const DAY_ABBR = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
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
    // Drop a month if it only has 2 or fewer days in-window — its label
    // would crowd the next one. Keep it only when it occupies real space.
    const minSpan = range === "M" ? 3 : 1;
    for (const [month, indices] of byMonth) {
      if (indices.length < minSpan) continue;
      const midIdx = indices[Math.floor(indices.length / 2)];
      const monthNum = Number(month.slice(5, 7));
      ticks.push({ index: midIdx, label: MONTH_ABBR[monthNum - 1] ?? "" });
    }
  }

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
          {y}
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

      {days.map((d, i) => {
        const x = padL + i * slotW + (slotW - barW) / 2;
        const hasPeak = typeof d.peakHR === "number";
        const hasRest = typeof d.restingHR === "number";
        // Workout day: red bar from resting (or 60) to peak.
        // Rest day: thin gray bar at the resting reading.
        if (hasPeak) {
          const top = yFor(d.peakHR!);
          const bottom = yFor(d.restingHR ?? 60);
          return (
            <rect
              key={d.dateKey}
              x={x}
              y={top}
              width={barW}
              height={Math.max(2, bottom - top)}
              rx={1.5}
              fill="#ef4444"
              opacity={0.9}
            />
          );
        }
        if (hasRest) {
          const y = yFor(d.restingHR!);
          return (
            <rect
              key={d.dateKey}
              x={x}
              y={y - 1}
              width={barW}
              height={3}
              rx={1.5}
              fill="var(--fg-dim)"
              opacity={0.6}
            />
          );
        }
        return null;
      })}
    </svg>
  );
}
