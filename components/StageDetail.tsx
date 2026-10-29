"use client";

// One sleep stage in depth, laid out like the overnight vitals: last night
// against your usual, a trend you can switch between night / week / month /
// year, and what the stage does. The stored sleep history (about two weeks,
// stages on the newest 7) renders at once; the year comes from Google Health
// via /api/health/sleep-year and fills the month and year views when it lands.

import { useEffect, useMemo, useState } from "react";
import { useScrub } from "@/lib/useScrub";
import SleepHypnogram from "@/components/SleepHypnogram";
import { type SleepNightHistory } from "@/components/SleepHistoryChart";
import { STAGE_STYLE, type StageSeg } from "@/lib/sleepStages";
import {
  AWAKE_OK_MIN,
  STAGE_INFO,
  STAGE_MIN_KEY,
  STAGE_TARGET,
  stageVerdict,
  type StageKey,
} from "@/lib/sleepStageInfo";

type Range = "D" | "W" | "M" | "Y";
type Load = "loading" | "ready" | "error";

/// One plotted bar: minutes in the stage and that night's total sleep.
type Point = { date: string; min: number; total: number };

const GOOD = "#4ade80";
const WARN = "#fb923c";

const W = 320;
const H = 170;
const PAD_L = 6;
const PAD_R = 34;
const PAD_T = 12;
const PAD_B = 22;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

function dateOf(key: string): Date {
  return new Date(`${key}T12:00:00Z`);
}
function dayLabel(key: string): string {
  return dateOf(key).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}
function weekday(key: string): string {
  return dateOf(key).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
}
function clock(ms: number, offsetSec: number): string {
  const d = new Date(ms + offsetSec * 1000);
  let h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")}${ampm}`;
}
function fmtDur(min: number): string {
  const r = Math.round(min);
  const h = Math.floor(r / 60);
  const m = r % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}
function fmtAxis(min: number): string {
  if (min === 0) return "0";
  if (min < 60) return `${min}m`;
  return min % 60 === 0 ? `${min / 60}h` : `${Math.floor(min / 60)}h${min % 60}`;
}
function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const sleepOf = (n: Pick<SleepNightHistory, "deepMin" | "remMin" | "lightMin" | "asleepMin">) =>
  n.deepMin + n.remMin + n.lightMin || n.asleepMin;

/// Typical range in minutes: the share range applied to a night's sleep, or
/// the flat awake allowance.
function rangeMin(stage: StageKey, total: number): [number, number] {
  if (stage === "awake") return [0, AWAKE_OK_MIN];
  const [lo, hi] = STAGE_TARGET[stage];
  return [(lo / 100) * total, (hi / 100) * total];
}

// "Good" rather than strictly in range: deep or REM above the typical share
// isn't a miss (see stageVerdict).
function inRange(stage: StageKey, p: Point): boolean {
  return stageVerdict(stage, p.min, p.total).good;
}

function status(stage: StageKey, p: Point): { text: string; good: boolean } {
  return stageVerdict(stage, p.min, p.total);
}

/// Round-number gridlines in minutes covering [0, hi].
function minuteScale(hi: number): { max: number; ticks: number[] } {
  const step = [15, 30, 60, 90, 120].find((s) => hi / s <= 4) ?? 180;
  const max = Math.max(step, Math.ceil((hi * 1.1) / step) * step);
  const ticks: number[] = [];
  for (let t = 0; t <= max; t += step) ticks.push(t);
  return { max, ticks };
}

/// The year is too dense night by night: one bar per week, by its Monday.
function weekly(points: Point[]): Point[] {
  const groups = new Map<string, Point[]>();
  for (const p of points) {
    const d = dateOf(p.date);
    const dow = (d.getUTCDay() + 6) % 7;
    const key = new Date(d.getTime() - dow * 86400e3).toISOString().slice(0, 10);
    const g = groups.get(key);
    if (g) g.push(p);
    else groups.set(key, [p]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, g]) => ({
      date,
      min: g.reduce((s, p) => s + p.min, 0) / g.length,
      total: g.reduce((s, p) => s + p.total, 0) / g.length,
    }));
}

/// Stretches of the stage within a night, joining pieces split by under a
/// minute of something else.
function bouts(stages: StageSeg[], stage: StageKey): { startMs: number; endMs: number }[] {
  const out: { startMs: number; endMs: number }[] = [];
  for (const s of [...stages].filter((s) => s.type === stage).sort((a, b) => a.startMs - b.startMs)) {
    const last = out[out.length - 1];
    if (last && s.startMs - last.endMs < 60_000) last.endMs = Math.max(last.endMs, s.endMs);
    else out.push({ startMs: s.startMs, endMs: s.endMs });
  }
  return out;
}

function Stat({ label, value, note, color }: { label: string; value: string; note: string; color?: string }) {
  return (
    <div className="rounded-xl py-2.5 px-2 text-center" style={{ background: "var(--bg-elevated)" }}>
      <p className="text-[11px] font-semibold" style={{ color: "var(--fg-muted)" }}>{label}</p>
      <p className="text-[16px] font-bold tabular-nums leading-tight mt-0.5" style={{ color: color ?? "var(--fg)" }}>
        {value}
      </p>
      <p className="text-[10px] mt-0.5 truncate" style={{ color: "var(--fg-muted)" }}>{note}</p>
    </div>
  );
}

function BarChart({ stage, points, mode }: { stage: StageKey; points: Point[]; mode: Range }) {
  const st = STAGE_STYLE[stage];
  const { trackRef, frac, handlers } = useScrub<HTMLDivElement>();
  const n = points.length;
  const avgTotal = points.reduce((s, p) => s + p.total, 0) / n;
  const band = rangeMin(stage, avgTotal);
  const { max, ticks } = minuteScale(Math.max(band[1], ...points.map((p) => p.min)));
  const slot = PLOT_W / n;
  const barW = Math.max(1.5, Math.min(22, slot * (n > 40 ? 0.7 : 0.6)));
  const cx = (i: number) => PAD_L + slot * (i + 0.5);
  const y = (m: number) => PAD_T + PLOT_H * (1 - m / max);
  const base = PAD_T + PLOT_H;

  const idx = frac == null ? null : Math.max(0, Math.min(n - 1, Math.floor(((frac * W - PAD_L) / PLOT_W) * n)));
  const active = idx != null ? points[idx] : null;
  const labelEvery = mode === "W" ? 1 : Math.ceil(n / (mode === "Y" ? 6 : 5));

  return (
    <div className="select-none">
      <div className="h-9 flex items-center">
        {active ? (
          <div className="tabular-nums">
            <p className="text-[16px] font-bold leading-none">
              {fmtDur(active.min)}
              {stage !== "awake" && active.total > 0 && (
                <span className="text-[11px] font-normal ml-2" style={{ color: "var(--fg-muted)" }}>
                  {Math.round((active.min / active.total) * 100)}% of sleep
                </span>
              )}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
              {mode === "Y" ? `Week of ${dayLabel(active.date)}` : `${weekday(active.date)} ${dayLabel(active.date)}`}
            </p>
          </div>
        ) : (
          <span className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
            Hold and drag to read a {mode === "Y" ? "week" : "night"}
          </span>
        )}
      </div>

      <div ref={trackRef} className="relative touch-none cursor-ew-resize" {...handlers}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }} aria-hidden>
          <rect
            x={PAD_L}
            width={PLOT_W}
            y={y(band[1])}
            height={Math.max(0, y(band[0]) - y(band[1]))}
            fill={hexA(st.color, 0.13)}
          />
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={0.6} />
              <text x={W - PAD_R + 5} y={y(t) + 3} fontSize="9" fill="var(--fg-muted)">
                {fmtAxis(t)}
              </text>
            </g>
          ))}

          {points.map((p, i) => {
            const ok = inRange(stage, p);
            const top = y(p.min);
            return (
              <rect
                key={p.date}
                x={(cx(i) - barW / 2).toFixed(2)}
                y={top.toFixed(2)}
                width={barW.toFixed(2)}
                height={Math.max(0, base - top).toFixed(2)}
                rx={Math.min(4, barW / 2)}
                fill={ok ? st.top : WARN}
                opacity={idx == null || idx === i ? 1 : 0.4}
              />
            );
          })}

          {points.map((p, i) =>
            (i % labelEvery === 0 && (i === 0 || n - 1 - i >= labelEvery * 0.6)) || i === n - 1 ? (
              <text
                key={p.date}
                x={cx(i).toFixed(2)}
                y={H - 6}
                fontSize="9"
                fill="var(--fg-muted)"
                textAnchor={n > 7 && i === 0 ? "start" : n > 7 && i === n - 1 ? "end" : "middle"}
              >
                {mode === "W"
                  ? weekday(p.date)
                  : mode === "Y"
                    ? dateOf(p.date).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" })
                    : dayLabel(p.date)}
              </text>
            ) : null,
          )}
        </svg>
      </div>
    </div>
  );
}

export default function StageDetail({
  stage,
  stored,
  initialNight,
}: {
  stage: StageKey;
  stored: SleepNightHistory[]; // oldest first; newest nights carry segments
  initialNight: string | null;
}) {
  const st = STAGE_STYLE[stage];
  const info = STAGE_INFO[stage];
  const key = STAGE_MIN_KEY[stage];
  const [year, setYear] = useState<SleepNightHistory[]>([]);
  const [yearState, setYearState] = useState<Load>("loading");

  useEffect(() => {
    let live = true;
    fetch("/api/health/sleep-year", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b) => {
        if (!live) return;
        setYear(Array.isArray(b.nights) ? b.nights : []);
        setYearState("ready");
      })
      .catch(() => live && setYearState("error"));
    return () => {
      live = false;
    };
  }, []);

  // Stored nights win over the cached year (they're fresher and carry stages).
  const all = useMemo(() => {
    const byDate = new Map<string, SleepNightHistory>();
    for (const n of year) byDate.set(n.date, n);
    for (const n of stored) byDate.set(n.date, n);
    return [...byDate.values()].filter((n) => n.asleepMin > 0).sort((a, b) => a.date.localeCompare(b.date));
  }, [year, stored]);
  const allPoints = useMemo<Point[]>(
    () => all.map((n) => ({ date: n.date, min: n[key], total: sleepOf(n) })),
    [all, key],
  );

  // Nights with a full stage timeline, newest first, for the Night view.
  const timeline = useMemo(
    () =>
      all
        .filter((n) => (n.stages?.length ?? 0) > 0 && n.startUtc && n.endUtc && n.offsetSec != null)
        .reverse(),
    [all],
  );
  // Opened from a night on the sleep card: start on that night's timeline.
  const [range, setRange] = useState<Range>(() => (timeline.some((n) => n.date === initialNight) ? "D" : "W"));
  const [nightIdx, setNightIdx] = useState(() => Math.max(0, timeline.findIndex((n) => n.date === initialNight)));
  const night = timeline[Math.min(nightIdx, timeline.length - 1)] ?? null;

  const latest = allPoints.length ? allPoints[allPoints.length - 1] : null;
  const usual = useMemo(() => {
    const prior = allPoints.slice(-31, -1);
    return prior.length >= 3 ? prior.reduce((s, p) => s + p.min, 0) / prior.length : null;
  }, [allPoints]);

  // Date keys for the range cutoffs, taken once (render stays pure).
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const daysBack = (d: number) => new Date(dateOf(today).getTime() - d * 86400e3).toISOString().slice(0, 10);
  const inRangeNights = allPoints.filter((p) => p.date >= daysBack(range === "W" ? 6 : range === "M" ? 29 : 365));
  const points = range === "Y" ? weekly(inRangeNights) : inRangeNights;
  const rangeNights = inRangeNights;

  const s = latest ? status(stage, latest) : null;
  const recent = latest ? latest.date >= daysBack(1) : false;
  const ranges: Range[] = timeline.length ? ["D", "W", "M", "Y"] : ["W", "M", "Y"];
  const waiting = (range === "Y" || range === "M") && yearState === "loading";

  return (
    <>
      {/* hero */}
      <section
        className="relative rounded-3xl px-5 pt-5 pb-5 mb-4 overflow-hidden"
        style={{
          background: `radial-gradient(140% 90% at 0% 0%, ${hexA(st.color, 0.2)} 0%, transparent 60%), var(--bg-card)`,
          border: "1px solid var(--border-strong)",
        }}
      >
        <p className="text-[12px] font-semibold" style={{ color: "var(--fg-muted)" }}>
          {latest && !recent ? `${weekday(latest.date)} ${dayLabel(latest.date)}` : "Last night"}
        </p>
        {latest && s ? (
          <>
            <p className="mt-1 leading-none text-[56px] font-bold tabular-nums" style={{ letterSpacing: "-0.04em", color: st.top }}>
              {fmtDur(latest.min)}
            </p>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span
                className="text-[12px] font-bold px-3 py-1 rounded-full tabular-nums"
                style={{ color: s.good ? GOOD : WARN, background: s.good ? "rgba(34,197,94,0.12)" : "rgba(249,115,22,0.12)" }}
              >
                {s.text}
              </span>
              <span className="text-[12px] tabular-nums" style={{ color: "var(--fg-muted)" }}>
                {stage === "awake"
                  ? `normal up to ${AWAKE_OK_MIN}m`
                  : `${Math.round((latest.min / Math.max(1, latest.total)) * 100)}% of sleep · typical ${STAGE_TARGET[stage][0]}–${STAGE_TARGET[stage][1]}%`}
              </span>
              {usual != null && (
                <span className="text-[12px] tabular-nums ml-auto" style={{ color: "var(--fg-muted)" }}>
                  usual {fmtDur(usual)}
                </span>
              )}
            </div>
          </>
        ) : (
          <p className="text-[13px] py-6" style={{ color: "var(--fg-muted)" }}>
            {yearState === "loading" ? "Loading from Google Health…" : "No sleep tracked yet. Wear your tracker to bed and this fills in."}
          </p>
        )}
      </section>

      {/* trend */}
      <section
        className="rounded-2xl p-4 mb-4"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold tracking-tight">{range === "D" ? "Through the night" : "Trend"}</h2>
          <div className="flex gap-1 p-1 rounded-full" style={{ background: "var(--bg-elevated)" }}>
            {ranges.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className="text-[12px] px-2.5 py-1 rounded-full font-semibold"
                style={{
                  background: range === r ? "var(--bg-card)" : "transparent",
                  color: range === r ? "var(--fg)" : "var(--fg-muted)",
                  boxShadow: range === r ? "inset 0 0 0 1px var(--border-strong)" : undefined,
                }}
              >
                {r === "D" ? "Night" : r === "W" ? "Week" : r === "M" ? "Month" : "Year"}
              </button>
            ))}
          </div>
        </div>

        {range === "D" && night ? (
          <>
            <div className="flex items-center justify-between mt-3 mb-3">
              <button
                type="button"
                aria-label="Previous night"
                disabled={nightIdx >= timeline.length - 1}
                onClick={() => setNightIdx((i) => Math.min(timeline.length - 1, i + 1))}
                className="w-8 h-8 rounded-full text-[16px] disabled:opacity-30"
                style={{ background: "var(--bg-elevated)" }}
              >
                ‹
              </button>
              <div className="text-center">
                <p className="text-[13px] font-semibold">
                  {nightIdx === 0 && recent ? "Last night" : `${weekday(night.date)} ${dayLabel(night.date)}`}
                </p>
                <p className="text-[11px] tabular-nums" style={{ color: "var(--fg-muted)" }}>
                  {clock(Date.parse(night.startUtc!), night.offsetSec!)} – {clock(Date.parse(night.endUtc!), night.offsetSec!)}
                </p>
              </div>
              <button
                type="button"
                aria-label="Next night"
                disabled={nightIdx === 0}
                onClick={() => setNightIdx((i) => Math.max(0, i - 1))}
                className="w-8 h-8 rounded-full text-[16px] disabled:opacity-30"
                style={{ background: "var(--bg-elevated)" }}
              >
                ›
              </button>
            </div>
            <SleepHypnogram
              stages={night.stages!}
              startUtc={night.startUtc!}
              endUtc={night.endUtc!}
              offsetSec={night.offsetSec!}
              focus={stage}
            />
            <NightStats stage={stage} night={night} />
          </>
        ) : waiting ? (
          <p className="text-[12px] py-16 text-center" style={{ color: "var(--fg-muted)" }}>
            Loading your {range === "Y" ? "year" : "month"}…
          </p>
        ) : points.length === 0 ? (
          <p className="text-[12px] py-12 text-center" style={{ color: "var(--fg-muted)" }}>
            {yearState === "error" && range !== "W" ? "Couldn't reach Google Health. Try again in a bit." : "Nothing tracked in this range."}
          </p>
        ) : (
          <>
            <div className="mt-1">
              <BarChart stage={stage} points={points} mode={range} />
            </div>
            <div className="flex items-center gap-3 mt-2 text-[11px] flex-wrap" style={{ color: "var(--fg-muted)" }}>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: st.top }} />
                {stage === "awake" ? "Normal" : "In range"}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: WARN }} />
                {stage === "awake" ? "Restless" : "Outside"}
              </span>
              <span className="flex items-center gap-1.5 ml-auto">
                <span className="w-3 h-2.5 rounded-sm" style={{ background: hexA(st.color, 0.25) }} />
                {stage === "awake" ? `Up to ${AWAKE_OK_MIN}m` : "Typical for your sleep"}
              </span>
            </div>
            <RangeStats stage={stage} nights={rangeNights} />
          </>
        )}
      </section>

      {/* about */}
      <section
        className="rounded-2xl p-4 mb-8"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)" }}
      >
        <p className="text-[13px] font-bold">What it is</p>
        <p className="text-[13px] leading-snug mt-1" style={{ color: "var(--fg-muted)" }}>{info.about}</p>
        <p className="text-[13px] font-bold mt-3">Why it matters</p>
        <p className="text-[13px] leading-snug mt-1" style={{ color: "var(--fg-muted)" }}>{info.why}</p>
        <p className="text-[13px] font-bold mt-3">What moves it</p>
        <p className="text-[13px] leading-snug mt-1" style={{ color: "var(--fg-muted)" }}>{info.moves}</p>
      </section>
    </>
  );
}

function RangeStats({ stage, nights }: { stage: StageKey; nights: Point[] }) {
  if (nights.length === 0) return null;
  const avg = nights.reduce((s, p) => s + p.min, 0) / nights.length;
  const lo = nights.reduce((a, b) => (b.min < a.min ? b : a));
  const hi = nights.reduce((a, b) => (b.min > a.min ? b : a));
  const ok = nights.filter((p) => inRange(stage, p)).length;
  return (
    <>
      <div className="grid grid-cols-3 gap-2 mt-3">
        <Stat label="Average" value={fmtDur(avg)} note={`${nights.length} night${nights.length === 1 ? "" : "s"}`} />
        <Stat label="Lowest" value={fmtDur(lo.min)} note={dayLabel(lo.date)} />
        <Stat label="Highest" value={fmtDur(hi.min)} note={dayLabel(hi.date)} />
      </div>
      <p className="text-[11px] mt-2 text-center tabular-nums" style={{ color: "var(--fg-muted)" }}>
        {stage === "awake"
          ? "Normal"
          : stage === "light"
            ? "In the typical range"
            : "At or above the typical range"}{" "}
        on {ok} of {nights.length} night{nights.length === 1 ? "" : "s"}
      </p>
    </>
  );
}

function NightStats({ stage, night }: { stage: StageKey; night: SleepNightHistory }) {
  const b = bouts(night.stages ?? [], stage);
  const longest = b.reduce((m, x) => Math.max(m, x.endMs - x.startMs), 0) / 60_000;
  const first = b[0];
  const p: Point = { date: night.date, min: night[STAGE_MIN_KEY[stage]], total: sleepOf(night) };
  const s = status(stage, p);
  return (
    <div className="grid grid-cols-3 gap-2 mt-3">
      <Stat label="Total" value={fmtDur(p.min)} note={s.text} color={s.good ? undefined : WARN} />
      {stage === "awake" ? (
        <Stat label="Wake-ups" value={`${b.length}`} note="this night" />
      ) : (
        <Stat label="Stretches" value={`${b.length}`} note="this night" />
      )}
      {stage === "deep" && first ? (
        <Stat label="First deep" value={clock(first.startMs, night.offsetSec!)} note={`longest ${fmtDur(longest)}`} />
      ) : (
        <Stat label="Longest" value={b.length ? fmtDur(longest) : "—"} note="one stretch" />
      )}
    </div>
  );
}
