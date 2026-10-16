"use client";

import { useMemo, useState } from "react";
import { useScrub } from "@/lib/useScrub";
import { STAGE_STYLE, type StageSeg } from "@/lib/sleepStages";

export type SleepNightHistory = {
  date: string; // YYYY-MM-DD (local)
  asleepMin: number;
  inBedMin?: number;
  deepMin: number;
  remMin: number;
  lightMin: number;
  awakeMin: number;
  // Added later — only present on nights synced after the schema bump. Used for
  // the average bedtime/wake schedule summary; guarded everywhere it's read.
  startUtc?: string;
  endUtc?: string;
  offsetSec?: number;
  // Per-stage segments, kept only on the newest 7 nights (see lib/recovery) so
  // the tappable 7-day trend can render a full hypnogram for a past night.
  toSleepMin?: number;
  stages?: StageSeg[];
};

// Average a set of local clock times (in minutes past midnight), tolerant of
// the evening→after-midnight wrap. `evening` shifts pre-noon times forward a
// day first, so bedtimes near midnight average correctly instead of cancelling.
function avgClock(minutes: number[], evening: boolean): number | null {
  if (minutes.length === 0) return null;
  const adj = minutes.map((m) => (evening && m < 12 * 60 ? m + 1440 : m));
  const mean = adj.reduce((s, m) => s + m, 0) / adj.length;
  return Math.round(mean) % 1440;
}

function fmtClockMin(min: number): string {
  let h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")}${ampm}`;
}

function localMinutes(iso: string, offsetSec: number): number {
  const d = new Date(Date.parse(iso) + offsetSec * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

type Range = "W" | "M" | "Y";

type Night = SleepNightHistory & {
  deep: number;
  light: number;
  rem: number;
  total: number;
  /** Bedtime / wake as minutes after local noon, so a night never wraps. */
  bedSN?: number;
  wakeSN?: number;
};

const sinceNoon = (iso: string, off: number) => (localMinutes(iso, off) - 720 + 1440) % 1440;

/// A year of nights is too dense to read, so the year view plots one point
/// per week: the average of the nights logged in it, dated by its Monday.
function weekly(nights: Night[]): Night[] {
  const groups = new Map<string, Night[]>();
  for (const n of nights) {
    const d = dateOf(n.date);
    const dow = (d.getUTCDay() + 6) % 7;
    const key = new Date(d.getTime() - dow * 86400e3).toISOString().slice(0, 10);
    const g = groups.get(key);
    if (g) g.push(n);
    else groups.set(key, [n]);
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const meanOpt = (xs: (number | undefined)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? mean(v) : undefined;
  };
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, g]) => ({
      date,
      asleepMin: mean(g.map((n) => n.asleepMin)),
      deepMin: mean(g.map((n) => n.deepMin)),
      remMin: mean(g.map((n) => n.remMin)),
      lightMin: mean(g.map((n) => n.lightMin)),
      awakeMin: mean(g.map((n) => n.awakeMin)),
      deep: mean(g.map((n) => n.deep)),
      light: mean(g.map((n) => n.light)),
      rem: mean(g.map((n) => n.rem)),
      total: mean(g.map((n) => n.total)),
      bedSN: meanOpt(g.map((n) => n.bedSN)),
      wakeSN: meanOpt(g.map((n) => n.wakeSN)),
    }));
}

const GOAL_MIN = 480;
const GOAL = "#4ade80";

function fmtDur(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

function dateOf(key: string): Date {
  return new Date(`${key}T12:00:00Z`);
}

function labelFor(dateKey: string | undefined): string {
  if (!dateKey) return "";
  return dateOf(dateKey).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function weekdayFor(dateKey: string): string {
  return dateOf(dateKey).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
}

/// Catmull-Rom through the points; symmetric, so a reversed call traces the
/// same curve backwards — which is what lets two edges close a stacked band.
function curve(pts: { x: number; y: number }[], move = true): string {
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

const W = 320;
const H = 168;
const PAD_L = 6;
const PAD_R = 30;
const PAD_T = 10;
const PAD_B = 22;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

/// Stage layers stacked as smooth areas — deep at the floor, then light, then
/// REM, whose top edge is time asleep — on an hours axis with the 8h goal.
/// Press and drag to read a night.
function StageChart({ nights, mode }: { nights: Night[]; mode: Range }) {
  const isMonth = mode !== "W";
  const { trackRef, frac, handlers } = useScrub<HTMLDivElement>();
  const n = nights.length;
  const maxMin = Math.max(600, ...nights.map((d) => d.total + 30));
  const yMax = Math.ceil(maxMin / 120) * 120;
  const x = (i: number) => PAD_L + (n === 1 ? PLOT_W / 2 : (i / (n - 1)) * PLOT_W);
  const y = (min: number) => PAD_T + PLOT_H * (1 - min / yMax);
  const base = y(0);

  const deepTop = nights.map((d, i) => ({ x: x(i), y: y(d.deep) }));
  const lightTop = nights.map((d, i) => ({ x: x(i), y: y(d.deep + d.light) }));
  const remTop = nights.map((d, i) => ({ x: x(i), y: y(d.total) }));
  const floor = nights.map((_, i) => ({ x: x(i), y: base }));
  const band = (top: { x: number; y: number }[], bottom: { x: number; y: number }[]) =>
    `${curve(top)} ${curve([...bottom].reverse(), false)} Z`;

  const idx =
    frac == null
      ? null
      : Math.max(
          0,
          Math.min(n - 1, Math.round(((frac * W - PAD_L) / PLOT_W) * (n - 1))),
        );
  const active = idx != null ? nights[idx] : null;

  const hours: number[] = [];
  for (let m = 120; m <= yMax; m += 120) hours.push(m);
  const labelEvery = mode === "W" ? 1 : Math.ceil(n / (mode === "Y" ? 6 : 5));

  return (
    <div className="select-none">
      <div className="h-9 flex items-center">
        {active ? (
          <div className="flex items-center gap-3 tabular-nums min-w-0">
            <div className="shrink-0">
              <p className="text-[16px] font-bold leading-none">{fmtDur(active.total)}</p>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
                {mode === "Y"
                  ? `Week of ${labelFor(active.date)}`
                  : `${weekdayFor(active.date)} ${labelFor(active.date)}`}
              </p>
            </div>
            <div className="flex gap-2.5 text-[11px] flex-wrap">
              {(["deep", "rem", "light"] as const).map((k) => (
                <span key={k} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm" style={{ background: STAGE_STYLE[k].top }} />
                  <span style={{ color: "var(--fg-muted)" }}>{STAGE_STYLE[k].label}</span>
                  <b>{fmtDur(active[k])}</b>
                </span>
              ))}
            </div>
          </div>
        ) : (
          <span className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
            Hold and drag to read a night
          </span>
        )}
      </div>

      <div
        ref={trackRef}
        className="relative touch-none cursor-ew-resize"
        {...handlers}
      >
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }} aria-hidden>
          <defs>
            {(["deep", "light", "rem"] as const).map((k) => (
              <linearGradient key={k} id={`sh-${k}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={STAGE_STYLE[k].top} stopOpacity={0.95} />
                <stop offset="100%" stopColor={STAGE_STYLE[k].color} stopOpacity={0.8} />
              </linearGradient>
            ))}
          </defs>

          {hours.map((m) => (
            <g key={m}>
              {m !== GOAL_MIN && (
                <line x1={PAD_L} x2={W - PAD_R} y1={y(m)} y2={y(m)} stroke="var(--border)" strokeWidth={0.6} />
              )}
              <text
                x={W - PAD_R + 5}
                y={y(m) + 3}
                fontSize="9"
                fontWeight={m === GOAL_MIN ? 700 : 400}
                fill={m === GOAL_MIN ? GOAL : "var(--fg-muted)"}
              >
                {m / 60}h
              </text>
            </g>
          ))}

          {n >= 2 ? (
            <>
              <path d={band(deepTop, floor)} fill="url(#sh-deep)" />
              <path d={band(lightTop, deepTop)} fill="url(#sh-light)" />
              <path d={band(remTop, lightTop)} fill="url(#sh-rem)" />
              <path
                d={curve(remTop)}
                fill="none"
                stroke="#e0f2fe"
                strokeWidth={1.6}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </>
          ) : null}

          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={y(GOAL_MIN)}
            y2={y(GOAL_MIN)}
            stroke={GOAL}
            strokeWidth={1}
            strokeDasharray="4 3"
            opacity={0.9}
          />

          {remTop.map((p, i) => (
            <circle
              key={i}
              cx={p.x.toFixed(2)}
              cy={p.y.toFixed(2)}
              r={isMonth ? 1.6 : 2.6}
              fill={nights[i].total >= GOAL_MIN ? GOAL : "#e0f2fe"}
              stroke="var(--bg-card)"
              strokeWidth={0.8}
            />
          ))}

          {nights.map((d, i) =>
            i % labelEvery === 0 || i === n - 1 ? (
              <text
                key={d.date}
                x={x(i).toFixed(2)}
                y={H - 6}
                fontSize="9"
                fill="var(--fg-muted)"
                textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
              >
                {mode === "W"
                  ? weekdayFor(d.date)
                  : mode === "Y"
                    ? dateOf(d.date).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" })
                    : labelFor(d.date)}
              </text>
            ) : null,
          )}

          {idx != null && (
            <>
              <line
                x1={x(idx)}
                x2={x(idx)}
                y1={PAD_T}
                y2={base}
                stroke="var(--fg)"
                strokeWidth={1.2}
                vectorEffect="non-scaling-stroke"
              />
              <circle cx={x(idx)} cy={y(nights[idx].total)} r={4.5} fill="var(--bg-card)" stroke="var(--fg)" strokeWidth={2} />
            </>
          )}
        </svg>
      </div>
    </div>
  );
}

/// Bedtime and wake as two lines on a clock axis running down the night, the
/// band between them is time in bed. Flat, parallel lines = a steady rhythm.
function ScheduleChart({ nights }: { nights: Night[] }) {
  const rows = nights
    .filter((d) => d.bedSN != null && d.wakeSN != null)
    .map((d) => ({ d, bed: d.bedSN!, wake: d.wakeSN! }));
  if (rows.length < 3) return null;
  const lo = Math.floor((Math.min(...rows.map((r) => r.bed)) - 30) / 60) * 60;
  const hi = Math.ceil((Math.max(...rows.map((r) => r.wake)) + 30) / 60) * 60;
  const H2 = 132;
  const plotH = H2 - PAD_T - 16;
  const n = rows.length;
  const x = (i: number) => PAD_L + (i / (n - 1)) * PLOT_W;
  const y = (m: number) => PAD_T + ((m - lo) / (hi - lo || 1)) * plotH;
  const bedPts = rows.map((r, i) => ({ x: x(i), y: y(r.bed) }));
  const wakePts = rows.map((r, i) => ({ x: x(i), y: y(r.wake) }));
  const step = hi - lo > 8 * 60 ? 180 : 120;
  const ticks: number[] = [];
  for (let m = Math.ceil(lo / step) * step; m <= hi; m += step) ticks.push(m);
  const clock = (sn: number) => fmtClockMin((sn + 720) % 1440).replace(":00", "");

  const bedAvg = avgClock(rows.map((r) => (r.bed + 720) % 1440), true);
  const wakeAvg = avgClock(rows.map((r) => (r.wake + 720) % 1440), false);
  const spread = (() => {
    const v = rows.map((r) => r.bed);
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    return Math.round(Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length));
  })();
  const steady = spread <= 30;

  return (
    <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[13px] font-semibold">Schedule</p>
          <p className="text-[12px] mt-0.5" style={{ color: steady ? GOAL : "#fb923c" }}>
            Bedtime varies ±{spread}m{steady ? " · nice and steady" : " · try a set bedtime"}
          </p>
        </div>
        <div className="flex gap-4 text-right tabular-nums">
          <div>
            <p className="text-[11px]" style={{ color: "var(--fg-muted)" }}>Avg bed</p>
            <p className="text-[15px] font-bold">{bedAvg != null ? fmtClockMin(bedAvg) : "—"}</p>
          </div>
          <div>
            <p className="text-[11px]" style={{ color: "var(--fg-muted)" }}>Avg wake</p>
            <p className="text-[15px] font-bold">{wakeAvg != null ? fmtClockMin(wakeAvg) : "—"}</p>
          </div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H2}`} width="100%" className="block mt-2" style={{ overflow: "visible" }} aria-hidden>
        <defs>
          <linearGradient id="sh-bed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.3} />
          </linearGradient>
        </defs>
        {ticks.map((m) => (
          <g key={m}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(m)} y2={y(m)} stroke="var(--border)" strokeWidth={0.6} />
            <text x={W - PAD_R + 5} y={y(m) + 3} fontSize="9" fill="var(--fg-muted)">
              {clock(m)}
            </text>
          </g>
        ))}
        <path d={`${curve(bedPts)} ${curve([...wakePts].reverse(), false)} Z`} fill="url(#sh-bed)" />
        <path d={curve(bedPts)} fill="none" stroke="#818cf8" strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
        <path d={curve(wakePts)} fill="none" stroke="#fbbf24" strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
        {bedPts.map((p, i) => (
          <circle key={`b${i}`} cx={p.x.toFixed(2)} cy={p.y.toFixed(2)} r={2.2} fill="#818cf8" stroke="var(--bg-card)" strokeWidth={0.8} />
        ))}
        {wakePts.map((p, i) => (
          <circle key={`w${i}`} cx={p.x.toFixed(2)} cy={p.y.toFixed(2)} r={2.2} fill="#fbbf24" stroke="var(--bg-card)" strokeWidth={0.8} />
        ))}
      </svg>
      <div className="flex gap-4 mt-1.5 text-[11px]" style={{ color: "var(--fg-muted)" }}>
        <span className="flex items-center gap-1.5"><span className="w-3 h-[2px] rounded" style={{ background: "#818cf8" }} />Bedtime</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-[2px] rounded" style={{ background: "#fbbf24" }} />Wake</span>
      </div>
    </div>
  );
}

function Stat({ label, value, note, color }: { label: string; value: string; note: string; color?: string }) {
  return (
    <div className="rounded-xl py-2.5 px-2 text-center" style={{ background: "var(--bg-elevated)" }}>
      <p className="text-[11px] font-semibold" style={{ color: "var(--fg-muted)" }}>{label}</p>
      <p className="text-[16px] font-bold tabular-nums leading-tight mt-0.5" style={{ color: color ?? "var(--fg)" }}>
        {value}
      </p>
      <p className="text-[10px] mt-0.5" style={{ color: "var(--fg-muted)" }}>{note}</p>
    </div>
  );
}

export default function SleepHistoryChart({
  history,
}: {
  history: SleepNightHistory[];
}) {
  const [range, setRange] = useState<Range>("W");
  // The stored history holds 30 nights; a year is fetched the first time the
  // Year tab is opened.
  const [year, setYear] = useState<SleepNightHistory[] | null>(null);
  const [yearState, setYearState] = useState<"idle" | "loading" | "error">("idle");

  const pick = (r: Range) => {
    setRange(r);
    if (r !== "Y" || year || yearState === "loading") return;
    setYearState("loading");
    fetch("/api/health/sleep-year", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((body) => {
        setYear(Array.isArray(body.nights) ? body.nights : []);
        setYearState("idle");
      })
      .catch(() => setYearState("error"));
  };

  const nights = useMemo<Night[]>(() => {
    const src = range === "Y" ? (year ?? []) : history;
    const sorted = [...src].sort((a, b) => a.date.localeCompare(b.date));
    const cutoff = new Date();
    cutoff.setUTCHours(0, 0, 0, 0);
    cutoff.setUTCDate(cutoff.getUTCDate() - (range === "W" ? 6 : range === "M" ? 29 : 364));
    const cutoffKey = cutoff.toISOString().slice(0, 10);
    return sorted
      .filter((d) => d.date >= cutoffKey && d.asleepMin > 0)
      .map((d) => {
        // Stage minutes rescaled to time asleep, so the stack's top edge is
        // exactly the headline number even when stages don't quite sum.
        const sum = d.deepMin + d.lightMin + d.remMin;
        const k = sum > 0 ? d.asleepMin / sum : 0;
        return {
          ...d,
          deep: d.deepMin * k,
          light: sum > 0 ? d.lightMin * k : d.asleepMin,
          rem: d.remMin * k,
          total: d.asleepMin,
          bedSN:
            d.startUtc && d.offsetSec != null ? sinceNoon(d.startUtc, d.offsetSec) : undefined,
          wakeSN:
            d.endUtc && d.offsetSec != null ? sinceNoon(d.endUtc, d.offsetSec) : undefined,
        };
      });
  }, [history, range, year]);
  const series = useMemo(() => (range === "Y" ? weekly(nights) : nights), [nights, range]);

  if (history.length === 0) return null;

  const avg = nights.length ? nights.reduce((s, d) => s + d.total, 0) / nights.length : 0;
  const avgOf = (k: "deep" | "rem") =>
    nights.length ? nights.reduce((s, d) => s + d[k], 0) / nights.length : 0;
  const hitGoal = nights.filter((d) => d.total >= GOAL_MIN).length;
  const gap = Math.round(avg - GOAL_MIN);

  return (
    <section
      className="rounded-2xl p-4 mb-5"
      style={{
        background:
          "radial-gradient(120% 80% at 0% 0%, rgba(79,70,229,0.16) 0%, transparent 60%), var(--bg-card)",
        border: "1px solid var(--border-strong)",
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-bold tracking-tight">Sleep trend</h2>
        <div className="flex gap-1 p-1 rounded-full" style={{ background: "var(--bg-elevated)" }}>
          {(["W", "M", "Y"] as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => pick(r)}
              className="text-[12px] px-3 py-1 rounded-full font-semibold"
              style={{
                background: range === r ? "var(--bg-card)" : "transparent",
                color: range === r ? "var(--fg)" : "var(--fg-muted)",
                boxShadow: range === r ? "inset 0 0 0 1px var(--border-strong)" : undefined,
              }}
            >
              {r === "W" ? "Week" : r === "M" ? "Month" : "Year"}
            </button>
          ))}
        </div>
      </div>

      {range === "Y" && yearState !== "idle" ? (
        <p className="text-[12px] py-16 text-center" style={{ color: "var(--fg-muted)" }}>
          {yearState === "loading"
            ? "Loading your year of sleep…"
            : "Couldn't load the year. Try again in a bit."}
        </p>
      ) : nights.length === 0 ? (
        <p className="text-[12px] py-8 text-center" style={{ color: "var(--fg-muted)" }}>
          No sleep tracked in this range.
        </p>
      ) : (
        <>
          <div className="flex items-end gap-2 mt-2">
            <span className="text-[34px] font-bold tabular-nums leading-none tracking-tight">
              {fmtDur(avg)}
            </span>
            <span className="text-[12px] mb-1" style={{ color: "var(--fg-muted)" }}>
              avg a night
            </span>
            <span
              className="ml-auto mb-1 text-[12px] font-semibold tabular-nums"
              style={{ color: gap >= 0 ? GOAL : "#fb923c" }}
            >
              {gap >= 0 ? `+${fmtDur(gap)} over 8h` : `${fmtDur(-gap)} under 8h`}
            </span>
          </div>

          <div className="mt-2">
            {series.length >= 2 ? (
              <StageChart nights={series} mode={range} />
            ) : (
              <p className="text-[12px] py-6 text-center" style={{ color: "var(--fg-muted)" }}>
                One night so far. The trend fills in as you sleep with your tracker.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 mt-2 text-[11px]" style={{ color: "var(--fg-muted)" }}>
            {(["deep", "light", "rem"] as const).map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: STAGE_STYLE[k].top }} />
                {STAGE_STYLE[k].label}
              </span>
            ))}
            <span className="flex items-center gap-1.5 ml-auto">
              <span className="w-3 border-t border-dashed" style={{ borderColor: GOAL }} />
              8h goal
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-3">
            <Stat label="Deep" value={fmtDur(avgOf("deep"))} note="avg a night" />
            <Stat label="REM" value={fmtDur(avgOf("rem"))} note="avg a night" />
            <Stat
              label="8h nights"
              value={`${hitGoal}/${nights.length}`}
              note="hit the goal"
              color={hitGoal * 2 >= nights.length ? GOAL : undefined}
            />
          </div>

          <ScheduleChart nights={series} />
        </>
      )}
    </section>
  );
}
