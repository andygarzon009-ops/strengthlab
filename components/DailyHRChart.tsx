"use client";

import { useEffect, useMemo, useState } from "react";
import { hrZoneBands, hrZoneColor, type HrZoneBand } from "@/lib/hrZones";
import { useScrub, scrubIndex } from "@/lib/useScrub";
import { hapticTick } from "@/lib/haptics";

type Sample = { t: string; bpm: number };
type Bucket = { startMin: number; min: number; max: number };
type RangeDay = {
  dateKey: string;
  restingHR?: number;
  peakHR?: number;
  avgHR?: number;
};
export type Range = "H" | "D" | "W" | "M" | "Y";

// 5-minute buckets: ~288 points across the day, roughly one per pixel of
// plot at this width. At 30 the day was 48 points and the trace came out
// smooth and characterless — the spikes that make a day legible were being
// averaged away before they were ever drawn.
const BUCKET_MIN = 5;
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
  restingHr,
  onDaySamples,
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
  /** Today's resting HR, drawn as a reference line on the day view. */
  restingHr?: number | null;
  /** Hands today's samples up so the page hero and zone card can use them. */
  onDaySamples?: (samples: Sample[]) => void;
}) {
  const [data, setData] = useState(initial);
  useEffect(() => {
    onDaySamples?.(data.samples ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
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
            border: "1px solid var(--border-strong)",
          }}
        >
          {RANGE_LABELS.map((r) => {
            const active = r.value === range;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => onRangeChange(r.value)}
                className="flex-1 py-2 rounded-full text-[13px] font-semibold transition-colors"
                style={{
                  background: active ? "var(--bg-elevated)" : "transparent",
                  color: active ? "var(--fg)" : "var(--fg-muted)",
                  boxShadow: active ? "inset 0 0 0 1px var(--border-strong)" : undefined,
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
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-strong)",
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
        <DayCard data={data} loading={loading} maxHr={maxHr} restingHr={restingHr} />
      ) : (
        <RangeCard range={range} days={rangeDays} loading={loading} maxHr={maxHr} />
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
      style={CARD}
    >
      <RangeHeader
        label="Last hour"
        primary={range ? `${range.min}–${range.max}` : null}
        subtitle="Lowest to highest reading"
        loading={loading}
      />
      <ScrubbableChart
        points={
          startMs === null || endMs === null || endMs <= startMs
            ? []
            : samples.map((sp) => ({
                label: fmtClock(new Date(sp.t), tz),
                bpm: sp.bpm,
                xFrac: Math.max(
                  0,
                  Math.min(
                    1,
                    (new Date(sp.t).getTime() - startMs) / (endMs - startMs)
                  )
                ),
              }))
        }
        maxHr={maxHr}
      >
        {(marker) => (
          <HourSvg
            samples={samples}
            startMs={startMs}
            endMs={endMs}
            tz={tz}
            maxHr={maxHr}
            marker={marker}
          />
        )}
      </ScrubbableChart>
      <ZoneLegend maxHr={maxHr} />
      {range && (
        <StatStrip
          maxHr={maxHr}
          items={[
            { label: "Low", bpm: range.min },
            { label: "Avg", bpm: avgBpm(samples) },
            { label: "High", bpm: range.max },
            { label: "Latest", bpm: latest?.bpm ?? null },
          ]}
        />
      )}
      {latest && <StaleHint latestAt={new Date(latest.t)} />}
    </div>
  );
}

function DayCard({
  data,
  loading,
  maxHr,
  restingHr,
}: {
  data: {
    connected: boolean;
    samples: Sample[];
    tz: string;
    dateKey: string;
  };
  loading: boolean;
  maxHr?: number | null;
  restingHr?: number | null;
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
      style={CARD}
    >
      <RangeHeader
        label="Today"
        primary={dayRange ? `${dayRange.min}–${dayRange.max}` : null}
        subtitle="Lowest to highest reading"
        loading={loading}
      />
      <ScrubbableChart
        points={buckets.map((b) => ({
          label: fmtBucketClock(b.startMin),
          bpm: b.max,
          // Same mapping DaySvg uses to place the bucket.
          xFrac: b.startMin / (24 * 60),
        }))}
        maxHr={maxHr}
      >
        {(marker) => (
          <DaySvg
            buckets={buckets}
            maxHr={maxHr}
            marker={marker}
            restingHr={restingHr}
          />
        )}
      </ScrubbableChart>
      <ZoneLegend maxHr={maxHr} />
      {dayRange && (
        <StatStrip
          maxHr={maxHr}
          items={[
            { label: "Low", bpm: dayRange.min },
            { label: "Avg", bpm: avgBpm(data.samples) },
            { label: "High", bpm: dayRange.max },
            { label: "Resting", bpm: restingHr ?? null, neutral: true },
          ]}
        />
      )}
      {latest && <StaleHint latestAt={new Date(latest.t)} />}
    </div>
  );
}

const CARD: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border-strong)",
};

function avgBpm(samples: Sample[]): number | null {
  if (!samples.length) return null;
  return Math.round(samples.reduce((a, s) => a + s.bpm, 0) / samples.length);
}

/// Low / avg / high (and one context reading) under a chart, each number in
/// the colour of the zone it falls in.
function StatStrip({
  items,
  maxHr,
}: {
  items: { label: string; bpm: number | null; neutral?: boolean }[];
  maxHr?: number | null;
}) {
  return (
    <div
      className="flex items-stretch mt-3 rounded-xl py-2.5"
      style={{ background: "var(--bg-elevated)" }}
    >
      {items.map((it, i) => (
        <div key={it.label} className="flex-1 flex">
          {i > 0 && (
            <div className="w-px self-stretch" style={{ background: "var(--border)" }} />
          )}
          <div className="flex-1 text-center">
            <p
              className="text-[17px] font-bold tabular-nums leading-tight"
              style={{
                color:
                  it.bpm != null && maxHr && !it.neutral
                    ? hrZoneColor(it.bpm, maxHr)
                    : "var(--fg)",
              }}
            >
              {it.bpm ?? "—"}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
              {it.label}
            </p>
          </div>
        </div>
      ))}
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
  maxHr,
}: {
  range: Range;
  days: RangeDay[];
  loading: boolean;
  maxHr?: number | null;
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
    const avgPeak = peaks.length
      ? Math.round(peaks.reduce((a, b) => a + b, 0) / peaks.length)
      : null;
    return { lo, hi, avgResting, avgPeak };
  }, [days]);

  const subtitle =
    range === "W" ? "Last 7 days" : range === "M" ? "Last 30 days" : "Last 12 months";

  return (
    <div
      className="rounded-2xl p-4"
      style={CARD}
    >
      <RangeHeader
        label={subtitle}
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
        subtitle={range === "Y" ? "Weekly averages of your daily peak and resting" : "Your peak and resting heart rate each day"}
        loading={loading}
      />
      <RangeSvg days={days} range={range} maxHr={maxHr} />
      {summary && (
        <StatStrip
          maxHr={maxHr}
          items={[
            { label: "Lowest rest", bpm: summary.lo, neutral: true },
            { label: "Avg rest", bpm: summary.avgResting, neutral: true },
            { label: "Avg peak", bpm: summary.avgPeak },
            { label: "Top peak", bpm: summary.hi },
          ]}
        />
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
      <div className="flex items-baseline justify-between">
        <p className="text-[13px] font-semibold" style={{ color: "var(--fg-muted)" }}>
          {label}
        </p>
        {loading && (
          <span className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
            updating…
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1.5 mt-1 tabular-nums">
        {primary ? (
          <>
            <span
              className="text-[30px] font-bold leading-none"
              style={{ letterSpacing: "-0.02em" }}
            >
              {primary}
            </span>
            <span className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
              bpm
            </span>
          </>
        ) : (
          <span className="text-[14px]" style={{ color: "var(--fg-muted)" }}>
            No samples yet
          </span>
        )}
      </div>
      <p className="text-[12px] mt-1 mb-2" style={{ color: "var(--fg-muted)" }}>
        {subtitle}
      </p>
    </>
  );
}


/// Each zone as a faint tinted band with a hairline at its floor, so the
/// trace reads against intensity without a ladder of dotted lines.
function ZoneBands({
  bands,
  yFor,
  x1,
  x2,
  labelX,
}: {
  bands: HrZoneBand[];
  yFor: (bpm: number) => number;
  x1: number;
  x2: number;
  /** Where the BPM label sits. Omit to draw bands only. */
  labelX?: number;
}) {
  return (
    <>
      {bands.map((b) => {
        const top = yFor(Math.min(b.maxBpm ?? Y_MAX, Y_MAX));
        const bottom = yFor(Math.max(b.minBpm, Y_MIN));
        if (bottom - top <= 0) return null;
        return (
          <rect
            key={`zb-${b.zone}`}
            x={x1}
            y={top}
            width={x2 - x1}
            height={bottom - top}
            fill={b.color}
            opacity={0.05}
          />
        );
      })}
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
            strokeWidth={0.6}
            strokeOpacity={0.35}
          />
        ))}
      {labelX != null &&
        bands
          .filter((b) => b.minBpm > Y_MIN && b.minBpm < Y_MAX)
          .map((b) => (
            <text
              key={`zl-${b.zone}`}
              x={labelX}
              y={yFor(b.minBpm) + 3}
              fontSize="9"
              fontWeight="600"
              fill={b.color}
            >
              {b.minBpm}
            </text>
          ))}
    </>
  );
}

/// The zone's dot signature, matching the density of its threshold line —
/// one dot for the easiest zone through five for the hardest. Doubles as a
/// key for anyone who can't tell the colours apart.
function ZoneDots({ zone, color }: { zone: number; color: string }) {
  return (
    <span aria-hidden className="inline-flex items-center gap-[2px]">
      {Array.from({ length: zone }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 2.5,
            height: 2.5,
            borderRadius: "50%",
            background: color,
            display: "inline-block",
          }}
        />
      ))}
    </span>
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
          <ZoneDots zone={b.zone} color={b.color} />
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


/// Vertical gradient with hard stops at each zone boundary, so one polyline
/// changes colour as it crosses into a zone. Positioned in user space against
/// the plot box, which is why it takes the same padT/plotH the chart uses.
function ZoneGradient({
  id,
  maxHr,
  padT,
  plotH,
  yMin = Y_MIN,
  yMax = Y_MAX,
}: {
  id: string;
  maxHr: number;
  padT: number;
  plotH: number;
  yMin?: number;
  yMax?: number;
}) {
  const yFor = (bpm: number) => {
    const c = Math.max(yMin, Math.min(yMax, bpm));
    return padT + plotH * (1 - (c - yMin) / (yMax - yMin));
  };
  // Top zone first. SVG clamps any stop whose offset is below the previous
  // one, and zone 1 sits at the BOTTOM of the plot — so emitting in zone
  // order made every stop after the first collapse, painting the whole line
  // zone 1's blue no matter how high it went.
  const stops = [...hrZoneBands(maxHr)].reverse().flatMap((b) => {
    const top = Math.min(b.maxBpm ?? yMax, yMax);
    const bottom = Math.max(b.minBpm, yMin);
    if (top <= bottom) return [];
    const o1 = (yFor(top) - padT) / plotH;
    const o2 = (yFor(bottom) - padT) / plotH;
    return [
      { o: Math.max(0, Math.min(1, o1)), c: b.color },
      { o: Math.max(0, Math.min(1, o2)), c: b.color },
    ];
  });
  return (
    <linearGradient
      id={id}
      gradientUnits="userSpaceOnUse"
      x1={0}
      y1={padT}
      x2={0}
      y2={padT + plotH}
    >
      {stops.map((st, i) => (
        <stop key={i} offset={`${(st.o * 100).toFixed(2)}%`} stopColor={st.c} />
      ))}
    </linearGradient>
  );
}

/// Gradient + fade mask the trace and its fill paint with. One set per chart,
/// ids prefixed so the hour and day charts never share a definition.
function TraceDefs({
  prefix,
  maxHr,
  padT,
  plotH,
  W,
}: {
  prefix: string;
  maxHr?: number | null;
  padT: number;
  plotH: number;
  W: number;
}) {
  return (
    <defs>
      {maxHr ? (
        <ZoneGradient id={`${prefix}Zone`} maxHr={maxHr} padT={padT} plotH={plotH} />
      ) : null}
      <linearGradient id={`${prefix}Fade`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fff" stopOpacity={0.42} />
        <stop offset="100%" stopColor="#fff" stopOpacity={0} />
      </linearGradient>
      <mask id={`${prefix}Mask`} maskUnits="userSpaceOnUse">
        <rect x={0} y={padT} width={W} height={plotH} fill={`url(#${prefix}Fade)`} />
      </mask>
    </defs>
  );
}

/// The trace: a zone-coloured line with a soft fill beneath it. Plotting each
/// bucket's high keeps the peaks. Breaks wherever the watch went quiet for
/// longer than `gap`, so a night off the wrist is a gap, not a straight line
/// pretending to be data.
function Trace({
  pts,
  prefix,
  hasZones,
  bottomY,
  gap,
}: {
  pts: { x: number; y: number }[];
  prefix: string;
  hasZones: boolean;
  bottomY: number;
  gap: number;
}) {
  if (pts.length === 0) return null;
  const paint = hasZones ? `url(#${prefix}Zone)` : "#ef4444";
  const segs: { x: number; y: number }[][] = [];
  for (const p of pts) {
    const cur = segs[segs.length - 1];
    if (!cur || p.x - cur[cur.length - 1].x > gap) segs.push([p]);
    else cur.push(p);
  }
  const f = (n: number) => n.toFixed(2);
  return (
    <>
      {segs.map((seg, i) => {
        if (seg.length === 1) {
          return (
            <circle key={i} cx={f(seg[0].x)} cy={f(seg[0].y)} r={1.6} fill={paint} />
          );
        }
        const line = seg.map((p) => `${f(p.x)},${f(p.y)}`).join(" ");
        const area =
          `M${f(seg[0].x)},${f(bottomY)} ` +
          seg.map((p) => `L${f(p.x)},${f(p.y)}`).join(" ") +
          ` L${f(seg[seg.length - 1].x)},${f(bottomY)} Z`;
        return (
          <g key={i}>
            <path d={area} fill={paint} mask={`url(#${prefix}Mask)`} />
            <polyline
              points={line}
              fill="none"
              stroke={paint}
              strokeWidth={1.8}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}
    </>
  );
}

/// Dashed resting-HR reference across the plot, its value in the right gutter.
function RestLine({
  bpm,
  yFor,
  x1,
  x2,
}: {
  bpm: number;
  yFor: (bpm: number) => number;
  x1: number;
  x2: number;
}) {
  const y = yFor(bpm);
  return (
    <>
      <line
        x1={x1}
        x2={x2}
        y1={y}
        y2={y}
        stroke="#94a3b8"
        strokeWidth={0.8}
        strokeDasharray="3 3"
        opacity={0.7}
      />
      <text x={x2 + 5} y={y + 3} fontSize="9" fontWeight="600" fill="#94a3b8">
        {bpm}
      </text>
    </>
  );
}

/// Highest point gets a dot and its number; the newest gets a pulsing dot so
/// the live end of the day is obvious.
function TraceMarks({
  pts,
  color,
  live,
  x1,
  x2,
}: {
  pts: { x: number; y: number; bpm: number }[];
  color: (bpm: number) => string;
  live: boolean;
  x1: number;
  x2: number;
}) {
  if (pts.length < 2) return null;
  let peak = pts[0];
  for (const p of pts) if (p.bpm > peak.bpm) peak = p;
  const last = pts[pts.length - 1];
  const lx = Math.max(x1 + 8, Math.min(x2 - 8, peak.x));
  return (
    <>
      <circle
        cx={peak.x.toFixed(2)}
        cy={peak.y.toFixed(2)}
        r={2.6}
        fill={color(peak.bpm)}
        stroke="var(--bg-card)"
        strokeWidth={1}
      />
      <text
        x={lx.toFixed(2)}
        y={(peak.y - 6).toFixed(2)}
        fontSize="9"
        fontWeight="700"
        textAnchor="middle"
        fill={color(peak.bpm)}
      >
        {peak.bpm}
      </text>
      {live && (
        <g>
          <circle cx={last.x.toFixed(2)} cy={last.y.toFixed(2)} r={3} fill={color(last.bpm)} opacity={0.35}>
            <animate attributeName="r" values="3;8;3" dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.45;0;0.45" dur="1.8s" repeatCount="indefinite" />
          </circle>
          <circle
            cx={last.x.toFixed(2)}
            cy={last.y.toFixed(2)}
            r={2.8}
            fill={color(last.bpm)}
            stroke="var(--bg-card)"
            strokeWidth={1}
          />
        </g>
      )}
    </>
  );
}

/// Nearest point to a scrub position, matched on where each point actually
/// sits in the plot rather than on its index.
function nearestByX(
  frac: number,
  points: { xFrac: number }[]
): number | null {
  if (points.length === 0) return null;
  const t = (frac - PLOT_PAD_L) / (1 - PLOT_PAD_L - PLOT_PAD_R);
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = Math.abs(points[i].xFrac - t);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function ScrubbableChart({
  points,
  maxHr,
  children,
}: {
  /**
   * xFrac is the point's position across the PLOT (0..1), not its index.
   * The day chart lays buckets out by time of day, so a session starting at
   * 2am sits a fifth of the way in — indexing would put the cursor somewhere
   * the dot isn't.
   */
  points: { label: string; bpm: number; xFrac: number }[];
  maxHr?: number | null;
  children: (marker: { xFrac: number; bpm: number } | null) => React.ReactNode;
}) {
  const { trackRef, frac, handlers } = useScrub<HTMLDivElement>();
  // The reading stays put after the finger lifts, cleared with the ✕. Letting
  // it vanish on release means you can never actually read it — the value is
  // under your thumb the whole time you're holding it there.
  const [held, setHeld] = useState<number | null>(null);

  const liveIdx = frac == null ? null : nearestByX(frac, points);
  if (liveIdx != null && liveIdx !== held) {
    setHeld(liveIdx);
    hapticTick();
  }

  const idx = liveIdx ?? held;
  const active = idx != null && idx >= 0 ? points[idx] : null;
  const dotColor =
    active && maxHr ? hrZoneColor(active.bpm, maxHr) : "var(--fg-dim)";

  return (
    <div className="select-none">
      <div className="h-9 mb-1 flex items-center">
        {active ? (
          <div className="flex items-center gap-2.5">
            <div>
              <div className="flex items-baseline gap-1.5">
                <span
                  className="text-[22px] font-bold tabular-nums leading-none"
                  style={{ color: dotColor }}
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
                {active.label}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setHeld(null)}
              aria-label="Clear reading"
              className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
              style={{
                background: "var(--bg-elevated)",
                color: "var(--fg-muted)",
              }}
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <span className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
            {points.length > 0 ? "Hold and drag the chart to read a time" : ""}
          </span>
        )}
      </div>
      <div
        ref={trackRef}
        // touch-none, not pan-y: with pan-y the browser grabbed the gesture as
        // soon as the thumb drifted vertically and the scrub died mid-drag.
        className="relative touch-none cursor-ew-resize"
        data-chart-scrub
        {...handlers}
      >
        {children(active && idx != null && idx >= 0 ? { xFrac: points[idx].xFrac, bpm: active.bpm } : null)}
        {idx != null && idx >= 0 && (
          <div
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{
              left: `${(PLOT_PAD_L +
                (points[idx]?.xFrac ?? 0) * (1 - PLOT_PAD_L - PLOT_PAD_R)) *
                100}%`,
              width: 1.5,
              marginLeft: -0.75,
              background: "var(--fg)",
              opacity: 0.9,
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
  marker,
}: {
  samples: Sample[];
  startMs: number | null;
  endMs: number | null;
  tz: string;
  maxHr?: number | null;
  marker?: { xFrac: number; bpm: number } | null;
}) {
  const W = 320;
  const H = 190;
  const padL = 8;
  const padR = 32;
  const padT = 14;
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

  const tickOffsets = [0, 15, 30, 45, 60];
  const fmt = new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  });
  const tickLabel = (offsetMin: number) => {
    if (startMs === null || endMs === null) return "";
    const ms = offsetMin === 60 ? endMs : startMs + offsetMin * 60_000;
    return fmt.format(new Date(ms));
  };

  const pts = buckets.map((b) => ({
    x: xFor(b.offsetMin) + bucketWidth / 2,
    y: yFor(b.max),
    bpm: b.max,
  }));
  const color = (bpm: number) => (maxHr ? hrZoneColor(bpm, maxHr) : "#ef4444");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ display: "block", overflow: "visible" }}
      preserveAspectRatio="none"
    >
      <TraceDefs prefix="hr-hour" maxHr={maxHr} padT={padT} plotH={plotH} W={W} />
      <AxisFrame
        W={W}
        padL={padL}
        padR={padR}
        yFor={yFor}
        maxHr={maxHr}
      />
      {tickOffsets.map((m) => (
        <text
          key={`xl-${m}`}
          x={padL + (m / totalMin) * plotW}
          y={H - padB + 15}
          fontSize="9"
          fill="var(--fg-muted)"
          textAnchor={m === 0 ? "start" : m === 60 ? "end" : "middle"}
        >
          {tickLabel(m)}
        </text>
      ))}
      <Trace
        pts={pts}
        prefix="hr-hour"
        hasZones={!!maxHr}
        bottomY={padT + plotH}
        gap={(plotW / totalMin) * 6}
      />
      <TraceMarks pts={pts} color={color} live x1={padL} x2={W - padR} />
      {marker && <ScrubDot x={padL + marker.xFrac * plotW} y={yFor(marker.bpm)} />}
    </svg>
  );
}

function ScrubDot({ x, y }: { x: number; y: number }) {
  return (
    <circle
      cx={x.toFixed(2)}
      cy={y.toFixed(2)}
      r={4}
      fill="var(--bg-card)"
      stroke="var(--fg)"
      strokeWidth={2}
    />
  );
}

/// Zone bands with their BPM floors on the right, or plain 50/100/150/200
/// guides when there's no max HR to build zones from.
function AxisFrame({
  W,
  padL,
  padR,
  yFor,
  maxHr,
}: {
  W: number;
  padL: number;
  padR: number;
  yFor: (bpm: number) => number;
  maxHr?: number | null;
}) {
  if (maxHr) {
    return (
      <ZoneBands
        bands={hrZoneBands(maxHr)}
        yFor={yFor}
        x1={padL}
        x2={W - padR}
        labelX={W - padR + 5}
      />
    );
  }
  return (
    <>
      {[50, 100, 150, 200].map((y) => (
        <g key={y}>
          <line
            x1={padL}
            x2={W - padR}
            y1={yFor(y)}
            y2={yFor(y)}
            stroke="var(--border)"
            strokeDasharray="2 3"
            strokeWidth={0.5}
          />
          <text x={W - padR + 5} y={yFor(y) + 3} fontSize="9" fill="var(--fg-muted)">
            {y}
          </text>
        </g>
      ))}
    </>
  );
}

function DaySvg({
  buckets,
  maxHr,
  marker,
  restingHr,
}: {
  buckets: Bucket[];
  maxHr?: number | null;
  marker?: { xFrac: number; bpm: number } | null;
  restingHr?: number | null;
}) {
  const W = 320;
  const H = 190;
  const padL = 8;
  const padR = 32;
  const padT = 14;
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

  const xTicks = [0, 6 * 60, 12 * 60, 18 * 60, 24 * 60];
  const pts = buckets.map((b) => ({
    x: xFor(b.startMin) + bucketWidth / 2,
    y: yFor(b.max),
    bpm: b.max,
  }));
  const color = (bpm: number) => (maxHr ? hrZoneColor(bpm, maxHr) : "#ef4444");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ display: "block", overflow: "visible" }}
      preserveAspectRatio="none"
    >
      <TraceDefs prefix="hr-day" maxHr={maxHr} padT={padT} plotH={plotH} W={W} />
      <AxisFrame W={W} padL={padL} padR={padR} yFor={yFor} maxHr={maxHr} />
      {xTicks.map((m) => (
        <line
          key={`xg-${m}`}
          x1={padL + (m / minutesInDay) * plotW}
          x2={padL + (m / minutesInDay) * plotW}
          y1={padT}
          y2={padT + plotH}
          stroke="var(--border)"
          strokeWidth={0.5}
          opacity={0.6}
        />
      ))}
      {xTicks.map((m) => {
        const label =
          m === 0
            ? "12am"
            : m === 12 * 60
              ? "12pm"
              : m === 24 * 60
                ? ""
                : m < 12 * 60
                  ? `${m / 60}am`
                  : `${m / 60 - 12}pm`;
        return (
          <text
            key={`xl-${m}`}
            x={padL + (m / minutesInDay) * plotW}
            y={H - padB + 15}
            fontSize="9"
            fill="var(--fg-muted)"
            textAnchor={m === 0 ? "start" : "middle"}
          >
            {label}
          </text>
        );
      })}
      {restingHr ? (
        <RestLine bpm={restingHr} yFor={yFor} x1={padL} x2={W - padR} />
      ) : null}
      <Trace
        pts={pts}
        prefix="hr-day"
        hasZones={!!maxHr}
        bottomY={padT + plotH}
        gap={(plotW / minutesInDay) * 30}
      />
      <TraceMarks pts={pts} color={color} live x1={padL} x2={W - padR} />
      {marker && <ScrubDot x={padL + marker.xFrac * plotW} y={yFor(marker.bpm)} />}
    </svg>
  );
}

/// Catmull-Rom through the points, the same curve as the sleep and vitals
/// trends.
function curvePath(pts: { x: number; y: number }[], move = true): string {
  const f = (n: number) => n.toFixed(2);
  if (pts.length === 0) return "";
  let d = `${move ? "M" : "L"}${f(pts[0].x)},${f(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    d += ` C${f(p1.x + (p2.x - p0.x) / 6)},${f(p1.y + (p2.y - p0.y) / 6)} ${f(p2.x - (p3.x - p1.x) / 6)},${f(p2.y - (p3.y - p1.y) / 6)} ${f(p2.x)},${f(p2.y)}`;
  }
  return d;
}

/// A year of days is too dense to read, so the year view plots one point per
/// week (by its Monday): the average resting and peak of the days in it.
function weeklyDays(days: RangeDay[]): RangeDay[] {
  const groups = new Map<string, RangeDay[]>();
  for (const d of days) {
    const [yy, mm, dd] = d.dateKey.split("-").map(Number);
    const t = Date.UTC(yy, mm - 1, dd);
    const dow = (new Date(t).getUTCDay() + 6) % 7;
    const key = new Date(t - dow * 86_400_000).toISOString().slice(0, 10);
    const g = groups.get(key);
    if (g) g.push(d);
    else groups.set(key, [d]);
  }
  const mean = (xs: (number | undefined)[]) => {
    const v = xs.filter((x): x is number => typeof x === "number");
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : undefined;
  };
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, g]) => ({
      dateKey,
      restingHR: mean(g.map((d) => d.restingHR)),
      peakHR: mean(g.map((d) => d.peakHR)),
      avgHR: mean(g.map((d) => d.avgHR)),
    }));
}

const REST_COLOR = "#cbd5e1";

/// Peak and resting heart rate per day as two smooth lines with the day's
/// range shaded between them. The peak line takes the zone colours, so a hard
/// training day visibly climbs into orange and red. Press and drag to read a
/// day.
function RangeSvg({
  days: rawDays,
  range,
  maxHr,
}: {
  days: RangeDay[];
  range: Range;
  maxHr?: number | null;
}) {
  const days = useMemo(
    () =>
      (range === "Y" ? weeklyDays(rawDays) : rawDays).filter(
        (d) => typeof d.peakHR === "number" || typeof d.restingHR === "number",
      ),
    [rawDays, range],
  );
  const { trackRef, frac, handlers } = useScrub<HTMLDivElement>();
  const W = 320;
  const H = 190;
  const padL = 8;
  const padR = 32;
  const padT = 10;
  const padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = days.length;

  // Its own scale: resting sits in the 40s–60s, so the day view's 50 floor
  // would pin that line to the bottom edge.
  const topPeak = Math.max(0, ...days.map((d) => d.peakHR ?? 0));
  const yLo = 40;
  const yHi = Math.min(210, Math.max(160, Math.ceil((topPeak + 10) / 10) * 10));
  const yFor = (bpm: number) => {
    const clamped = Math.max(yLo, Math.min(yHi, bpm));
    return padT + plotH * (1 - (clamped - yLo) / (yHi - yLo));
  };
  const cx = (i: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);

  // Label cadence: W shows the weekday for every day. M and Y label each
  // calendar month at the MIDPOINT of its days in the window, so a window
  // straddling a month boundary doesn't bunch two labels at the left edge.
  const MONTH_ABBR = [
    "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec",
  ];
  const DAY_ABBR = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const dateOfKey = (k: string) => {
    const [yy, mm, dd] = k.split("-").map(Number);
    return new Date(Date.UTC(yy, mm - 1, dd));
  };
  const ticks: { index: number; label: string }[] = [];
  if (range === "W") {
    days.forEach((d, i) => {
      ticks.push({ index: i, label: DAY_ABBR[dateOfKey(d.dateKey).getUTCDay()] });
    });
  } else {
    const byMonth = new Map<string, number[]>();
    days.forEach((d, i) => {
      const m = d.dateKey.slice(0, 7);
      const cur = byMonth.get(m);
      if (cur) cur.push(i);
      else byMonth.set(m, [i]);
    });
    const minSpan = 3;
    for (const [month, indices] of byMonth) {
      if (indices.length < minSpan) continue;
      const midIdx = indices[Math.floor(indices.length / 2)];
      ticks.push({ index: midIdx, label: MONTH_ABBR[Number(month.slice(5, 7)) - 1] ?? "" });
    }
  }

  const peak = days.flatMap((d, i) =>
    typeof d.peakHR === "number" ? [{ x: cx(i), y: yFor(d.peakHR) }] : [],
  );
  const rest = days.flatMap((d, i) =>
    typeof d.restingHR === "number" ? [{ x: cx(i), y: yFor(d.restingHR) }] : [],
  );
  // The shaded range only where a day has both ends.
  const both = days.flatMap((d, i) =>
    typeof d.peakHR === "number" && typeof d.restingHR === "number"
      ? [{ x: cx(i), top: yFor(d.peakHR), bottom: yFor(d.restingHR) }]
      : [],
  );
  const band =
    both.length >= 2
      ? `${curvePath(both.map((b) => ({ x: b.x, y: b.top })))} ${curvePath(
          [...both].reverse().map((b) => ({ x: b.x, y: b.bottom })),
          false,
        )} Z`
      : null;
  const base = padT + plotH;
  const restArea =
    rest.length >= 2
      ? `${curvePath(rest)} L${rest[rest.length - 1].x.toFixed(2)},${base} L${rest[0].x.toFixed(2)},${base} Z`
      : null;

  const idx = frac == null || n === 0 ? null : scrubIndex(frac, n, padL / W, padR / W);
  const active = idx != null && idx >= 0 ? days[idx] : null;
  const peakFill = maxHr ? "url(#hr-rangeZone)" : "#ef4444";
  const dotR = range === "W" ? 3 : range === "M" ? 1.8 : 1.4;

  return (
    <div className="select-none">
      <div className="h-9 flex items-center">
        {active ? (
          <div className="flex items-center gap-3 tabular-nums">
            <p className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
              {range === "Y" ? "Week of " : `${DAY_ABBR[dateOfKey(active.dateKey).getUTCDay()]} `}
              {dateOfKey(active.dateKey).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              })}
            </p>
            {typeof active.peakHR === "number" && (
              <p className="text-[13px]">
                <span style={{ color: "var(--fg-muted)" }}>Peak </span>
                <b style={{ color: maxHr ? hrZoneColor(active.peakHR, maxHr) : "#ef4444" }}>
                  {active.peakHR}
                </b>
              </p>
            )}
            {typeof active.restingHR === "number" && (
              <p className="text-[13px]">
                <span style={{ color: "var(--fg-muted)" }}>Rest </span>
                <b>{active.restingHR}</b>
              </p>
            )}
            <span className="text-[11px]" style={{ color: "var(--fg-muted)" }}>bpm</span>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--fg-muted)" }}>
            <span className="flex items-center gap-1.5">
              <span
                className="w-3 h-0.5 rounded"
                style={{ background: "linear-gradient(90deg, #22c55e, #f59e0b, #ef4444)" }}
              />
              Peak
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 rounded" style={{ background: REST_COLOR }} />
              Resting
            </span>
            <span className="ml-1">· hold and drag to read a {range === "Y" ? "week" : "day"}</span>
          </div>
        )}
      </div>

      <div ref={trackRef} className="relative touch-none cursor-ew-resize" {...handlers}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ display: "block", overflow: "visible" }}
          aria-hidden
        >
          <defs>
            {maxHr ? (
              <ZoneGradient
                id="hr-rangeZone"
                maxHr={maxHr}
                padT={padT}
                plotH={plotH}
                yMin={yLo}
                yMax={yHi}
              />
            ) : null}
            <linearGradient id="hr-restArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={REST_COLOR} stopOpacity={0.16} />
              <stop offset="100%" stopColor={REST_COLOR} stopOpacity={0} />
            </linearGradient>
          </defs>
          <AxisFrame W={W} padL={padL} padR={padR} yFor={yFor} maxHr={maxHr} />

          {ticks.map((t) => (
            <text
              key={`xl-${t.index}-${t.label}`}
              x={cx(t.index).toFixed(2)}
              y={H - padB + 15}
              fontSize="9"
              fill="var(--fg-muted)"
              textAnchor={n > 1 && t.index === 0 ? "start" : n > 1 && t.index === n - 1 ? "end" : "middle"}
            >
              {t.label}
            </text>
          ))}

          {band && <path d={band} fill={peakFill} opacity={0.14} />}
          {restArea && <path d={restArea} fill="url(#hr-restArea)" />}
          {rest.length >= 2 && (
            <path
              d={curvePath(rest)}
              fill="none"
              stroke={REST_COLOR}
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          )}
          {peak.length >= 2 && (
            <path
              d={curvePath(peak)}
              fill="none"
              stroke={peakFill}
              strokeWidth={2.4}
              strokeLinecap="round"
              style={{ filter: "drop-shadow(0 0 4px rgba(239,68,68,0.35))" }}
            />
          )}

          {days.map((d, i) =>
            typeof d.peakHR === "number" ? (
              <circle
                key={`p-${d.dateKey}`}
                cx={cx(i).toFixed(2)}
                cy={yFor(d.peakHR).toFixed(2)}
                r={dotR}
                fill={maxHr ? hrZoneColor(d.peakHR, maxHr) : "#ef4444"}
                stroke="var(--bg-card)"
                strokeWidth={0.8}
              />
            ) : null,
          )}
          {days.map((d, i) =>
            typeof d.restingHR === "number" ? (
              <circle
                key={`r-${d.dateKey}`}
                cx={cx(i).toFixed(2)}
                cy={yFor(d.restingHR).toFixed(2)}
                r={dotR}
                fill={REST_COLOR}
                stroke="var(--bg-card)"
                strokeWidth={0.8}
              />
            ) : null,
          )}

          {idx != null && idx >= 0 && (
            <>
              <line x1={cx(idx)} x2={cx(idx)} y1={padT} y2={base} stroke="var(--fg)" strokeWidth={1.2} />
              {typeof days[idx].peakHR === "number" && (
                <ScrubDot x={cx(idx)} y={yFor(days[idx].peakHR!)} />
              )}
              {typeof days[idx].restingHR === "number" && (
                <ScrubDot x={cx(idx)} y={yFor(days[idx].restingHR!)} />
              )}
            </>
          )}
        </svg>
      </div>
    </div>
  );
}
