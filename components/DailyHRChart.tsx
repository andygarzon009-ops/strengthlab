"use client";

import { useEffect, useMemo, useState } from "react";

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
}: {
  initial: {
    connected: boolean;
    samples: Sample[];
    tz: string;
    dateKey: string;
  };
  range: Range;
  onRangeChange: (r: Range) => void;
}) {
  const [data, setData] = useState(initial);
  const [rangeDays, setRangeDays] = useState<RangeDay[]>([]);
  const [hourSamples, setHourSamples] = useState<Sample[]>([]);
  const [hourWindow, setHourWindow] = useState<{ start: string; end: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // Day-view auto-refresh: re-pull samples once a minute so the chart
  // fills in live. Only runs while range === "D".
  useEffect(() => {
    if (range !== "D") return;
    let cancelled = false;
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/health/daily-hr", { cache: "no-store" });
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled) setData(body);
      } catch {}
    }, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
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
    if (range === "D") return;
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
      <div className="flex gap-1 mb-3 p-1 rounded-full" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
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

      {range === "H" ? (
        <HourCard
          samples={hourSamples}
          windowStart={hourWindow?.start ?? null}
          windowEnd={hourWindow?.end ?? null}
          tz={data.tz}
          loading={loading}
        />
      ) : range === "D" ? (
        <DayCard data={data} loading={loading} />
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
}: {
  samples: Sample[];
  windowStart: string | null;
  windowEnd: string | null;
  tz: string;
  loading: boolean;
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
      <HourSvg samples={samples} startMs={startMs} endMs={endMs} tz={tz} />
      {latest && (
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
      )}
    </div>
  );
}

function DayCard({
  data,
  loading,
}: {
  data: {
    connected: boolean;
    samples: Sample[];
    tz: string;
    dateKey: string;
  };
  loading: boolean;
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
      <DaySvg buckets={buckets} />
      {latest && (
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
      )}
    </div>
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
          summary && summary.lo !== null && summary.hi !== null
            ? `${summary.lo}–${summary.hi}`
            : summary && summary.lo !== null
              ? `${summary.lo}`
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

function HourSvg({
  samples,
  startMs,
  endMs,
  tz,
}: {
  samples: Sample[];
  startMs: number | null;
  endMs: number | null;
  tz: string;
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
            fill="#ef4444"
            opacity={0.85}
          />
        );
      })}
    </svg>
  );
}

function DaySvg({ buckets }: { buckets: Bucket[] }) {
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
            fill="#ef4444"
            opacity={0.85}
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

  // Label cadence: W shows every day. M and Y both show the first index of
  // each month seen, labeled with the month name. Day-of-month numbers
  // ("29, 04, 09…") were ambiguous and didn't communicate where months
  // started.
  const tickIndices: number[] = [];
  if (range === "W") {
    for (let i = 0; i < days.length; i++) tickIndices.push(i);
  } else {
    let lastMonth = "";
    days.forEach((d, i) => {
      const month = d.dateKey.slice(0, 7);
      if (month !== lastMonth) {
        tickIndices.push(i);
        lastMonth = month;
      }
    });
  }

  const MONTH_ABBR = [
    "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec",
  ];
  const formatTick = (dateKey: string) => {
    if (range === "W") return dateKey.slice(8, 10);
    const monthNum = Number(dateKey.slice(5, 7));
    return MONTH_ABBR[monthNum - 1] ?? "";
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

      {tickIndices.map((i) => (
        <text
          key={`xl-${i}`}
          x={padL + i * slotW + slotW / 2}
          y={H - padB + 14}
          fontSize="9"
          fill="var(--fg-dim)"
          textAnchor="middle"
        >
          {formatTick(days[i].dateKey)}
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
