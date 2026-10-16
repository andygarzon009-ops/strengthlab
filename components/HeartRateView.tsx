"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import DailyHRChart, { type Range } from "@/components/DailyHRChart";
import { hrZone, hrZoneBands, hrZoneColor } from "@/lib/hrZones";

type Sample = { t: string; bpm: number };
type Workout = {
  id: string;
  title: string;
  date: string;
  startedAt: string | null;
  endedAt: string | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
};
type Resting = {
  now: number | null;
  delta: number | null;
  baseline: number | null;
  days: { dateKey: string; bpm: number }[]; // oldest → newest
};

const RANGE_DAYS: Record<Range, number> = {
  // H slices an hour off the day; the cutoff is hours, not days, but the
  // shape still fits since the filter is just a millisecond comparison.
  H: 1 / 24,
  D: 1,
  W: 7,
  M: 30,
  Y: 365,
};

const RANGE_LABEL: Record<Range, string> = {
  H: "Last hour",
  D: "Today",
  W: "Last 7 days",
  M: "Last 30 days",
  Y: "Last 12 months",
};

const CARD: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border-strong)",
};
const GOOD = "#4ade80";
const WARN = "#fb923c";
const HEART =
  "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";

function formatWorkoutDate(d: Date): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60 * 60) return `${Math.max(1, Math.floor(sec / 60))}m ago`;
  if (sec < 60 * 60 * 24) return `${Math.floor(sec / 3600)}h ago`;
  const day = Math.floor(sec / 86400);
  if (day === 1) return "Yesterday";
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function fmtMin(min: number): string {
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

/// The latest reading, big, in its zone colour, with resting and today's
/// span alongside. A trace of a heartbeat runs behind the number.
function Hero({
  latest,
  maxHr,
  resting,
  dayLow,
  dayHigh,
}: {
  latest: Sample | null;
  maxHr: number;
  resting: Resting;
  dayLow: number | null;
  dayHigh: number | null;
}) {
  const zone = latest ? hrZone(latest.bpm, maxHr) : null;
  const color = zone?.color ?? "#ef4444";
  const ageMin = latest
    ? Math.floor((Date.now() - new Date(latest.t).getTime()) / 60_000)
    : null;
  const live = ageMin != null && ageMin < 10;
  const when = latest
    ? new Date(latest.t).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
  const d = resting.delta;

  return (
    <section
      className="relative rounded-3xl px-5 pt-5 pb-4 mb-4 overflow-hidden"
      style={{
        background: `radial-gradient(130% 90% at 50% 0%, ${color}22 0%, transparent 60%), var(--bg-card)`,
        border: "1px solid var(--border-strong)",
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold" style={{ color: "var(--fg-muted)" }}>
          {latest ? (live ? "Right now" : "Latest reading") : "Heart rate"}
        </p>
        {latest && (
          <span
            className="flex items-center gap-1.5 text-[11px] font-semibold"
            style={{ color: live ? GOOD : "var(--fg-muted)" }}
          >
            {live && (
              <span className="relative flex w-2 h-2">
                <span
                  className="absolute inset-0 rounded-full animate-ping"
                  style={{ background: GOOD, opacity: 0.6 }}
                />
                <span className="relative w-2 h-2 rounded-full" style={{ background: GOOD }} />
              </span>
            )}
            {live ? "Live" : when}
          </span>
        )}
      </div>

      <div className="relative flex flex-col items-center pt-3 pb-1">
        <div className="flex items-center gap-3">
          <svg
            className="heartbeat shrink-0"
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill={color}
            aria-hidden
            style={{ filter: `drop-shadow(0 0 10px ${color}aa)` }}
          >
            <path d={HEART} />
          </svg>
          <span
            className="text-[76px] font-bold leading-none tabular-nums"
            style={{ letterSpacing: "-0.045em" }}
          >
            {latest?.bpm ?? "—"}
          </span>
          <span className="text-[15px] font-semibold self-end mb-2" style={{ color: "var(--fg-muted)" }}>
            bpm
          </span>
        </div>
        {zone && (
          <span
            className="mt-3 text-[13px] font-bold px-3.5 py-1 rounded-full tabular-nums"
            style={{
              color,
              background: `${color}1f`,
              border: `1px solid ${color}4d`,
            }}
          >
            Zone {zone.zone} · {zone.label} · {zone.pctMax}% of max
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 mt-5">
        <HeroStat
          label="Resting"
          value={resting.now}
          note={
            d != null && d !== 0
              ? `${d < 0 ? "↓" : "↑"} ${Math.abs(d)} vs last week`
              : resting.baseline != null
                ? `usual ${resting.baseline}`
                : "today"
          }
          noteColor={d == null || d === 0 ? undefined : d < 0 ? GOOD : WARN}
        />
        <HeroStat
          label="Today"
          value={dayLow != null && dayHigh != null ? `${dayLow}–${dayHigh}` : null}
          note="low – high"
        />
        <HeroStat label="Max HR" value={maxHr} note="estimated" />
      </div>
    </section>
  );
}

function HeroStat({
  label,
  value,
  note,
  noteColor,
}: {
  label: string;
  value: number | string | null;
  note: string;
  noteColor?: string;
}) {
  return (
    <div
      className="rounded-2xl py-3 px-2 text-center"
      style={{ background: "var(--bg-elevated)" }}
    >
      <p className="text-[11px] font-semibold" style={{ color: "var(--fg-muted)" }}>
        {label}
      </p>
      <p className="text-[20px] font-bold tabular-nums leading-tight mt-0.5">
        {value ?? "—"}
      </p>
      <p
        className="text-[11px] leading-tight mt-0.5 whitespace-nowrap"
        style={{ color: noteColor ?? "var(--fg-muted)" }}
      >
        {note}
      </p>
    </div>
  );
}

/// Minutes in each zone today. Each sample counts until the next one, capped
/// so a watch left on the charger doesn't credit hours to its last reading.
function ZoneTime({ samples, maxHr }: { samples: Sample[]; maxHr: number }) {
  const rows = useMemo(() => {
    const mins = [0, 0, 0, 0, 0];
    for (let i = 0; i < samples.length; i++) {
      const t = Date.parse(samples[i].t);
      const next = i + 1 < samples.length ? Date.parse(samples[i + 1].t) : t + 60_000;
      const dt = Math.min(5, Math.max(0, (next - t) / 60_000));
      mins[hrZone(samples[i].bpm, maxHr).zone - 1] += dt;
    }
    return hrZoneBands(maxHr).map((b, i) => ({ ...b, min: mins[i] }));
  }, [samples, maxHr]);
  const total = rows.reduce((a, r) => a + r.min, 0);
  if (total < 5) return null;
  const active = rows.slice(1).reduce((a, r) => a + r.min, 0);
  const top = Math.max(...rows.map((r) => r.min));

  return (
    <section className="rounded-2xl p-4 mb-4" style={CARD}>
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-bold tracking-tight">Time in zones</h2>
        <span className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
          Today
        </span>
      </div>
      <p className="mt-1 leading-none">
        <span className="text-[26px] font-bold tabular-nums" style={{ letterSpacing: "-0.02em" }}>
          {fmtMin(active)}
        </span>
        <span className="text-[12px] ml-1.5" style={{ color: "var(--fg-muted)" }}>
          elevated (zone 2+)
        </span>
      </p>

      <div className="flex h-2.5 rounded-full overflow-hidden mt-3 gap-[2px]">
        {rows.map((r) =>
          r.min > 0 ? (
            <div key={r.zone} style={{ flexGrow: r.min, background: r.color }} />
          ) : null,
        )}
      </div>

      <div className="mt-3 space-y-2">
        {[...rows].reverse().map((r) => (
          <div key={r.zone} className="flex items-center gap-3">
            <span
              className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0"
              style={{ background: `${r.color}26`, color: r.color }}
            >
              {r.zone}
            </span>
            <div className="w-[92px] shrink-0">
              <p className="text-[13px] font-semibold leading-tight">{r.label}</p>
              <p className="text-[11px] tabular-nums" style={{ color: "var(--fg-muted)" }}>
                {r.maxBpm ? `${r.minBpm}–${r.maxBpm - 1}` : `${r.minBpm}+`} bpm
              </p>
            </div>
            <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--bg-elevated)" }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${top ? Math.max(r.min > 0 ? 3 : 0, (r.min / top) * 100) : 0}%`,
                  background: r.color,
                }}
              />
            </div>
            <span className="w-14 text-right text-[13px] font-semibold tabular-nums">
              {r.min >= 1 ? fmtMin(r.min) : "—"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/// Smooth Catmull-Rom path through the points, the same curve the readiness
/// trend uses.
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  const f = (n: number) => n.toFixed(2);
  let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(p2.x)},${f(p2.y)}`;
  }
  return d;
}

/// Resting HR over the last month. Lower is fitter, so the line goes green
/// when today sits under the average.
function RestingTrend({ days }: { days: Resting["days"] }) {
  if (days.length < 3) return null;
  const vals = days.map((d) => d.bpm);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const lo = Math.min(...vals) - 6;
  const hi = Math.max(...vals) + 6;
  const W = 320;
  const H = 110;
  const padT = 10;
  const padB = 18;
  const plotH = H - padT - padB;
  const y = (v: number) => padT + plotH * (1 - (v - lo) / (hi - lo || 1));
  const pts = days.map((d, i) => ({
    x: 4 + (i / (days.length - 1)) * (W - 8),
    y: y(d.bpm),
  }));
  const line = smoothPath(pts);
  const area = `${line} L${pts[pts.length - 1].x.toFixed(2)},${H - padB} L${pts[0].x.toFixed(2)},${H - padB} Z`;
  const now = vals[vals.length - 1];
  const diff = Math.round(now - avg);
  const color = diff <= 0 ? GOOD : WARN;
  const last = pts[pts.length - 1];
  const fmtKey = (k: string) => {
    const [yy, mm, dd] = k.split("-").map(Number);
    return new Date(Date.UTC(yy, mm - 1, dd)).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  };

  return (
    <Link href="/recovery/rhr" className="block rounded-2xl p-4 mb-4 active:opacity-80" style={CARD}>
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-bold tracking-tight">Resting heart rate</h2>
        <span className="flex items-center gap-0.5 text-[12px]" style={{ color: "var(--fg-muted)" }}>
          Last {days.length} days
          <ChevronRight size={14} strokeWidth={2.2} className="self-center" />
        </span>
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-[26px] font-bold tabular-nums leading-none" style={{ letterSpacing: "-0.02em" }}>
          {now}
          <span className="text-[12px] font-normal ml-1" style={{ color: "var(--fg-muted)" }}>
            bpm
          </span>
        </span>
        <span className="text-[12px] font-semibold" style={{ color }}>
          {diff === 0
            ? "right on your average"
            : `${Math.abs(diff)} ${diff < 0 ? "below" : "above"} your ${Math.round(avg)} avg`}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block mt-2" style={{ overflow: "visible" }} aria-hidden>
        <defs>
          <linearGradient id="rhr-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <line
          x1={0}
          x2={W}
          y1={y(avg).toFixed(2)}
          y2={y(avg).toFixed(2)}
          stroke="var(--fg-muted)"
          strokeDasharray="3 4"
          strokeWidth={0.8}
          opacity={0.6}
        />
        <path d={area} fill="url(#rhr-area)" />
        <path d={line} fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
        <circle cx={last.x.toFixed(2)} cy={last.y.toFixed(2)} r={4} fill={color} stroke="var(--bg-card)" strokeWidth={2} />
        <text x={0} y={H - 3} fontSize="10" fill="var(--fg-muted)">
          {fmtKey(days[0].dateKey)}
        </text>
        <text x={W} y={H - 3} fontSize="10" fill="var(--fg-muted)" textAnchor="end">
          {fmtKey(days[days.length - 1].dateKey)}
        </text>
      </svg>
    </Link>
  );
}

function WorkoutRow({ w, maxHr }: { w: Workout & { sortAt: Date }; maxHr: number }) {
  const avgC = w.avgHeartRate ? hrZoneColor(w.avgHeartRate, maxHr) : "var(--fg-muted)";
  const maxC = w.maxHeartRate ? hrZoneColor(w.maxHeartRate, maxHr) : "var(--fg-muted)";
  // Avg→max on a 50..max-HR track, so a hard session visibly reaches further.
  const pos = (bpm: number) =>
    Math.max(0, Math.min(100, ((bpm - 50) / (maxHr - 50)) * 100));
  return (
    <Link
      href={`/workout/${w.id}`}
      className="flex items-center gap-3 rounded-2xl px-4 py-3"
      style={CARD}
    >
      <span
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${w.avgHeartRate ? avgC : "#ef4444"}1f` }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill={avgC} aria-hidden>
          <path d={HEART} />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold truncate">{w.title}</p>
        <p className="text-[12px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
          {formatWorkoutDate(w.sortAt)}
        </p>
        {w.avgHeartRate && w.maxHeartRate && (
          <div className="relative h-1 rounded-full mt-2" style={{ background: "var(--bg-elevated)" }}>
            <div
              className="absolute top-0 bottom-0 rounded-full"
              style={{
                left: `${pos(w.avgHeartRate)}%`,
                width: `${Math.max(2, pos(w.maxHeartRate) - pos(w.avgHeartRate))}%`,
                background: `linear-gradient(90deg, ${avgC}, ${maxC})`,
              }}
            />
          </div>
        )}
      </div>
      <div className="text-right tabular-nums shrink-0">
        <p className="text-[18px] font-bold leading-none" style={{ color: avgC }}>
          {w.avgHeartRate ?? "—"}
          <span className="text-[11px] font-normal ml-1" style={{ color: "var(--fg-muted)" }}>
            avg
          </span>
        </p>
        <p className="text-[12px] mt-1" style={{ color: "var(--fg-muted)" }}>
          max <span style={{ color: maxC, fontWeight: 600 }}>{w.maxHeartRate ?? "—"}</span>
        </p>
      </div>
    </Link>
  );
}

export default function HeartRateView({
  initial,
  workouts,
  maxHr,
  resting,
}: {
  initial: {
    connected: boolean;
    samples: Sample[];
    tz: string;
    dateKey: string;
  };
  workouts: Workout[];
  /** Estimated max HR, for the chart's intensity zones. */
  maxHr: number;
  resting: Resting;
}) {
  const [range, setRange] = useState<Range>("D");
  const [daySamples, setDaySamples] = useState<Sample[]>(initial.samples);

  const filtered = useMemo(() => {
    const cutoff = Date.now() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000;
    return workouts
      .map((w) => ({
        ...w,
        sortAt: new Date(w.endedAt ?? w.startedAt ?? w.date),
      }))
      .filter((w) => w.sortAt.getTime() >= cutoff)
      .sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime());
  }, [range, workouts]);

  const latest = daySamples.length ? daySamples[daySamples.length - 1] : null;
  const [dayLow, dayHigh] = useMemo(() => {
    if (!daySamples.length) return [null, null];
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of daySamples) {
      if (s.bpm < lo) lo = s.bpm;
      if (s.bpm > hi) hi = s.bpm;
    }
    return [lo, hi];
  }, [daySamples]);

  return (
    <div>
      {initial.connected && (
        <Hero
          latest={latest}
          maxHr={maxHr}
          resting={resting}
          dayLow={dayLow}
          dayHigh={dayHigh}
        />
      )}

      <DailyHRChart
        maxHr={maxHr}
        restingHr={resting.now}
        initial={initial}
        range={range}
        onRangeChange={setRange}
        onDaySamples={setDaySamples}
      />

      <div className="mt-4">
        <ZoneTime samples={daySamples} maxHr={maxHr} />
        <RestingTrend days={resting.days} />
      </div>

      <div className="mt-2 mb-8">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-[15px] font-bold tracking-tight">Workouts</h2>
          <span className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
            {RANGE_LABEL[range]}
          </span>
        </div>
        {filtered.length === 0 ? (
          <div className="rounded-2xl p-5 text-center" style={CARD}>
            <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
              No workouts with HR data {RANGE_LABEL[range].toLowerCase()}.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((w) => (
              <WorkoutRow key={w.id} w={w} maxHr={maxHr} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
