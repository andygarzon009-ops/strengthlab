"use client";

// The Macros page's intake trend, drawn the way the heart-rate chart is: a
// D / W / M / Y pill, a big headline number, a gradient trace with a fading
// fill over tinted target bands (amber over, green on target, slate under, the
// way HR zones tint its plot), a dashed goal line labelled in the right gutter,
// and a hold-and-drag readout that stays put after the finger lifts.
//
// Protein rides along as a pink line scaled so its own target sits on the
// calorie goal line — both "on the line" means both hit. The readout always
// gives real grams.

import { useEffect, useMemo, useState } from "react";
import { useScrub, scrubIndex } from "@/lib/useScrub";
import { hapticTick } from "@/lib/haptics";
import type { FuelDayView } from "@/components/FuelWeek";
import type { DailyIntake } from "@/lib/foodLog";
import { CARBS, FAT, PROTEIN } from "@/components/FuelCharts";

export type Range = "D" | "W" | "M" | "Y";
export type TodayEntry = {
  t: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  name: string;
};

type Pt = {
  key: string;
  label: string;
  /// Position across the plot, 0..1.
  xf: number;
  kcal: number | null;
  p: number;
  c: number;
  f: number;
  target: number;
  /// Today, still being eaten.
  partial?: boolean;
  /// A day that has a full FuelDayView, so tapping it can open its diary.
  date?: string;
};

const RANGES: Range[] = ["D", "W", "M", "Y"];
const GREEN = "#22c55e";
const OVER = "#f59e0b";
const UNDER = "#94a3b8";
// Within ±10% of the calorie target counts as on target.
const LO = 0.9;
const HI = 1.1;

const W = 320;
const H = 180;
const PAD_L = 8;
const PAD_R = 38;
const PAD_T = 12;
const PAD_B = 22;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const utc = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const shift = (key: string, n: number) => new Date(utc(key) + n * 86_400_000).toISOString().slice(0, 10);
const dowOf = (key: string) => DOW[new Date(utc(key)).getUTCDay()];
const shortDate = (key: string) => {
  const d = new Date(utc(key));
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};
const ratioColor = (kcal: number, target: number, filling = false) => {
  const r = kcal / Math.max(1, target);
  return r > HI ? OVER : r >= LO || filling ? GREEN : UNDER;
};
const fmt = (n: number) => Math.round(n).toLocaleString();

/// Catmull-Rom through the points, the same curve the HR range view uses.
function curvePath(pts: { x: number; y: number }[]): string {
  const f = (n: number) => n.toFixed(2);
  if (pts.length === 0) return "";
  let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    d += ` C${f(p1.x + (p2.x - p0.x) / 6)},${f(p1.y + (p2.y - p0.y) / 6)} ${f(p2.x - (p3.x - p1.x) / 6)},${f(p2.y - (p3.y - p1.y) / 6)} ${f(p2.x)},${f(p2.y)}`;
  }
  return d;
}

/// Running total through the day: flat between meals, a step up at each one.
function stepPath(pts: { x: number; y: number }[]): string {
  const f = (n: number) => n.toFixed(2);
  if (pts.length === 0) return "";
  let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
  for (let i = 1; i < pts.length; i++) d += ` H${f(pts[i].x)} V${f(pts[i].y)}`;
  return d;
}

/// Runs of consecutive logged points, so a day with nothing logged is a gap
/// rather than a line pretending to know.
function segments<T extends { kcal: number | null }>(pts: T[]): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  for (const p of pts) {
    if (p.kcal == null) {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push(p);
  }
  if (cur.length) out.push(cur);
  return out;
}

export default function FuelTrend({
  days,
  history,
  todayEntries,
  today,
  tz,
  selected,
  onSelect,
}: {
  days: FuelDayView[];
  history: DailyIntake[];
  todayEntries: TodayEntry[];
  today: string;
  tz: string;
  selected: string;
  onSelect: (date: string) => void;
}) {
  const [range, setRange] = useState<Range>("W");
  const todayDay = days.find((d) => d.date === today) ?? days[days.length - 1];
  const ref = todayDay.targets.calorieTargetKcal;
  const proteinRef = Math.max(1, todayDay.targets.proteinTargetG);
  const todayPartial = todayDay.partial;

  const minuteOf = useMemo(() => {
    const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
    return (d: Date) => {
      const parts = f.formatToParts(d);
      const hh = Number(parts.find((p) => p.type === "hour")?.value) % 24;
      const mm = Number(parts.find((p) => p.type === "minute")?.value);
      return hh * 60 + mm;
    };
  }, [tz]);

  const points = useMemo<Pt[]>(() => {
    const byDate = new Map(history.map((h) => [h.date, h]));
    const views = new Map(days.map((d) => [d.date, d]));
    // The week's views are the same food log, but carry each day's own target.
    for (const d of days) {
      if (d.logged)
        byDate.set(d.date, {
          date: d.date,
          kcal: d.intake.kcal,
          proteinG: d.intake.proteinG,
          carbsG: d.intake.carbsG,
          fatG: d.intake.fatG,
        });
    }

    if (range === "D") {
      const rows = [...todayEntries].sort((a, b) => a.t.localeCompare(b.t));
      let k = 0, p = 0, c = 0, f = 0;
      const out: Pt[] = [{ key: "start", label: "Midnight", xf: 0, kcal: 0, p: 0, c: 0, f: 0, target: ref }];
      // Foods saved together share a timestamp — that's one meal, one step.
      const meals: { t: string; names: string[]; kcal: number; p: number; c: number; f: number }[] = [];
      for (const r of rows) {
        const m = meals[meals.length - 1];
        if (m && m.t === r.t) {
          m.names.push(r.name);
          m.kcal += r.kcal;
          m.p += r.proteinG;
          m.c += r.carbsG;
          m.f += r.fatG;
        } else meals.push({ t: r.t, names: [r.name], kcal: r.kcal, p: r.proteinG, c: r.carbsG, f: r.fatG });
      }
      for (const m of meals) {
        k += m.kcal;
        p += m.p;
        c += m.c;
        f += m.f;
        const d = new Date(m.t);
        const name = m.names.length > 1 ? `${m.names[0]} +${m.names.length - 1} more` : m.names[0];
        out.push({
          key: m.t,
          label: `${d.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" })} · ${name} · +${fmt(m.kcal)}`,
          xf: minuteOf(d) / 1440,
          kcal: k,
          p,
          c,
          f,
          target: ref,
        });
      }
      return out;
    }

    if (range === "Y") {
      // 52 Monday-start weeks ending with this one, each the average of the
      // days logged in it.
      const dow = (new Date(utc(today)).getUTCDay() + 6) % 7;
      const thisMonday = shift(today, -dow);
      return Array.from({ length: 52 }, (_, i) => {
        const wk = shift(thisMonday, (i - 51) * 7);
        const logged = Array.from({ length: 7 }, (_, j) => shift(wk, j))
          .filter((k) => k <= today)
          .map((k) => byDate.get(k))
          .filter((x): x is DailyIntake => !!x)
          // Half of today would drag this week's average down.
          .filter((x, _, all) => !(x.date === today && todayPartial && all.length > 1));
        const avg = (g: (x: DailyIntake) => number) =>
          logged.length ? logged.reduce((s, x) => s + g(x), 0) / logged.length : 0;
        return {
          key: wk,
          label: `Week of ${shortDate(wk)} · ${logged.length} day${logged.length === 1 ? "" : "s"} logged`,
          xf: i / 51,
          kcal: logged.length ? Math.round(avg((x) => x.kcal)) : null,
          p: avg((x) => x.proteinG),
          c: avg((x) => x.carbsG),
          f: avg((x) => x.fatG),
          target: ref,
        };
      });
    }

    const n = range === "W" ? 7 : 30;
    return Array.from({ length: n }, (_, i) => {
      const key = shift(today, i - (n - 1));
      const h = byDate.get(key);
      const view = views.get(key);
      return {
        key,
        label: `${dowOf(key)} ${shortDate(key)}${key === today ? " · today" : ""}`,
        xf: i / (n - 1),
        kcal: h ? h.kcal : null,
        p: h?.proteinG ?? 0,
        c: h?.carbsG ?? 0,
        f: h?.fatG ?? 0,
        target: view?.targets.calorieTargetKcal ?? ref,
        partial: key === today && todayPartial,
        date: view ? key : undefined,
      };
    });
  }, [range, history, days, todayEntries, today, tz, ref, todayPartial, minuteOf]);

  // ── summary numbers ──
  const closed = points.filter((p) => p.kcal != null && !p.partial && p.key !== "start");
  const avg = (g: (p: Pt) => number) => (closed.length ? closed.reduce((s, p) => s + g(p), 0) / closed.length : null);
  const onTarget = closed.filter((p) => {
    const r = p.kcal! / Math.max(1, p.target);
    return r >= LO && r <= HI;
  }).length;
  const last = points[points.length - 1];

  // ── scale ──
  const top = Math.max(
    ref * 1.18,
    ...points.map((p) => p.kcal ?? 0),
    ...(range === "D" ? [] : points.map((p) => (p.p / proteinRef) * ref)),
  );
  const yHi = Math.ceil((top * 1.04) / 250) * 250;
  const yFor = (kcal: number) => PAD_T + PLOT_H * (1 - Math.max(0, Math.min(yHi, kcal)) / yHi);
  const xFor = (xf: number) => PAD_L + xf * PLOT_W;
  const base = PAD_T + PLOT_H;

  // ── scrub ──
  const { trackRef, frac, handlers } = useScrub<HTMLDivElement>();
  const [held, setHeld] = useState<{ range: Range; idx: number } | null>(null);
  let liveIdx: number | null = null;
  if (frac != null && points.length) {
    if (range === "D") {
      const t = (frac - PAD_L / W) / (PLOT_W / W);
      let best = 0;
      for (let i = 1; i < points.length; i++)
        if (Math.abs(points[i].xf - t) < Math.abs(points[best].xf - t)) best = i;
      liveIdx = best;
    } else liveIdx = scrubIndex(frac, points.length, PAD_L / W, PAD_R / W);
  }
  if (liveIdx != null && liveIdx >= 0 && (held?.range !== range || held.idx !== liveIdx)) {
    setHeld({ range, idx: liveIdx });
    hapticTick();
  }
  const idx = held && held.range === range ? held.idx : null;
  const active = idx != null ? points[idx] : null;
  // A held day in the week opens its diary below.
  const activeDate = active?.date;
  useEffect(() => {
    if (activeDate && activeDate !== selected) onSelect(activeDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDate]);

  // ── header ──
  const label =
    range === "D" ? "Today" : range === "W" ? "Last 7 days" : range === "M" ? "Last 30 days" : "Last 12 months";
  const headline = range === "D" ? (last.kcal ?? 0) : avg((p) => p.kcal!);
  const subtitle =
    range === "D"
      ? `of ${fmt(ref)} kcal · ${todayEntries.length} item${todayEntries.length === 1 ? "" : "s"} logged`
      : closed.length
        ? `avg / ${range === "Y" ? "day, by week" : "day"} · on target ${onTarget} of ${closed.length} ${range === "Y" ? "weeks" : "days"}`
        : "Nothing logged in this range yet";

  // ── x labels ──
  const ticks: { xf: number; label: string }[] = [];
  if (range === "D") {
    [0, 360, 720, 1080].forEach((m) => ticks.push({ xf: m / 1440, label: ["12am", "6am", "12pm", "6pm"][m / 360] }));
  } else if (range === "W") {
    points.forEach((p) => ticks.push({ xf: p.xf, label: dowOf(p.key) }));
  } else if (range === "M") {
    [0, 7, 14, 21, 29].forEach((i) => ticks.push({ xf: points[i].xf, label: shortDate(points[i].key) }));
  } else {
    const byMonth = new Map<string, number[]>();
    points.forEach((p, i) => {
      const m = p.key.slice(0, 7);
      (byMonth.get(m) ?? byMonth.set(m, []).get(m)!).push(i);
    });
    let n = 0;
    for (const [m, is] of byMonth) {
      // Every other month keeps twelve labels from crowding the axis.
      if (is.length >= 3 && n++ % 2 === 0)
        ticks.push({ xf: points[is[Math.floor(is.length / 2)]].xf, label: MONTHS[Number(m.slice(5, 7)) - 1] });
    }
  }

  // ── traces ──
  const kcalPts = points.map((p) => ({ ...p, x: xFor(p.xf), y: p.kcal == null ? 0 : yFor(p.kcal) }));
  const protPts = points.map((p) => ({ ...p, x: xFor(p.xf), y: p.kcal == null ? 0 : yFor((p.p / proteinRef) * ref) }));
  // Today's running total carries on flat to now, so the gap since the last
  // meal reads as time passing rather than the line just stopping.
  const nowX = xFor(minuteOf(new Date()) / 1440);
  const path = (seg: { x: number; y: number }[]) => {
    if (range !== "D") return curvePath(seg);
    return stepPath(seg) + (seg[seg.length - 1].x < nowX ? ` H${nowX.toFixed(2)}` : "");
  };
  const endX = (seg: { x: number }[]) => (range === "D" ? Math.max(nowX, seg[seg.length - 1].x) : seg[seg.length - 1].x);

  // Mid-day, being under target only means the day isn't eaten yet, so the
  // day view stays green until it goes over.
  const gradStops = [
    { from: yHi, to: ref * HI, c: OVER },
    { from: ref * HI, to: ref * LO, c: GREEN },
    { from: ref * LO, to: 0, c: range === "D" ? GREEN : UNDER },
  ].flatMap((b) => [
    { o: (yFor(b.from) - PAD_T) / PLOT_H, c: b.c },
    { o: (yFor(b.to) - PAD_T) / PLOT_H, c: b.c },
  ]);

  let peak: (typeof kcalPts)[number] | null = null;
  if (range !== "D") for (const p of kcalPts) if (p.kcal != null && (!peak || p.kcal > peak.kcal!)) peak = p;
  const liveEnd = range === "D" ? kcalPts[kcalPts.length - 1] : kcalPts.find((p) => p.partial && p.kcal != null);
  const dotR = range === "W" ? 3.2 : range === "M" ? 2 : 1.5;
  const selPt = range === "W" || range === "M" ? kcalPts.find((p) => p.key === selected && p.kcal != null) : null;

  // Composition of the range's average (or today's running total), for the split bar.
  const split =
    range === "D"
      ? { p: last.p, c: last.c, f: last.f }
      : { p: avg((p) => p.p) ?? 0, c: avg((p) => p.c) ?? 0, f: avg((p) => p.f) ?? 0 };
  const splitKcal = split.p * 4 + split.c * 4 + split.f * 9;

  return (
    <div>
      <div className="flex gap-1 p-1 rounded-full mb-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)" }}>
        {RANGES.map((r) => {
          const on = r === range;
          return (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              aria-pressed={on}
              className="flex-1 py-2 rounded-full text-[13px] font-semibold transition-colors"
              style={{
                background: on ? "var(--bg-elevated)" : "transparent",
                color: on ? "var(--fg)" : "var(--fg-muted)",
                boxShadow: on ? "inset 0 0 0 1px var(--border-strong)" : undefined,
              }}
            >
              {r}
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl p-4 mb-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)" }}>
        <p className="text-[13px] font-semibold" style={{ color: "var(--fg-muted)" }}>
          {label}
        </p>
        <div className="flex items-baseline gap-1.5 mt-1 tabular-nums">
          <span
            className="text-[30px] font-bold leading-none"
            style={{ letterSpacing: "-0.02em", color: headline != null && headline > 0 ? undefined : "var(--fg-muted)" }}
          >
            {headline != null ? fmt(headline) : "—"}
          </span>
          <span className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
            kcal
          </span>
        </div>
        <p className="text-[12px] mt-1 mb-2" style={{ color: "var(--fg-muted)" }}>
          {subtitle}
        </p>

        {/* Readout: the held point, or the key. */}
        <div className="h-9 mb-1 flex items-center select-none">
          {active && active.key !== "start" ? (
            <div className="flex items-center gap-2.5 min-w-0 w-full">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 tabular-nums">
                  <span
                    className="text-[20px] font-bold leading-none"
                    style={{ color: active.kcal != null ? ratioColor(active.kcal, active.target, range === "D") : "var(--fg-muted)" }}
                  >
                    {active.kcal != null ? fmt(active.kcal) : "—"}
                  </span>
                  <span className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
                    kcal
                  </span>
                  {active.kcal != null &&
                    ([
                      ["P", active.p, PROTEIN],
                      ["C", active.c, CARBS],
                      ["F", active.f, FAT],
                    ] as const).map(([l, v, c]) => (
                      <span key={l} className="flex items-center gap-1 text-[12px] font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
                        {Math.round(v)}
                        <span className="font-normal" style={{ color: "var(--fg-dim)" }}>
                          {l}
                        </span>
                      </span>
                    ))}
                </div>
                <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--fg-dim)" }}>
                  {active.kcal == null ? `${active.label} · nothing logged` : active.label}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHeld(null)}
                aria-label="Clear reading"
                className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "var(--bg-elevated)", color: "var(--fg-muted)" }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--fg-muted)" }}>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 rounded" style={{ background: range === "D" ? `linear-gradient(90deg, ${GREEN}, ${OVER})` : `linear-gradient(90deg, ${UNDER}, ${GREEN}, ${OVER})` }} />
                Calories
              </span>
              {range !== "D" && (
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 rounded" style={{ background: PROTEIN }} />
                  Protein
                </span>
              )}
              <span className="truncate">· hold and drag to read</span>
            </div>
          )}
        </div>

        <div ref={trackRef} className="relative touch-none cursor-ew-resize select-none" data-chart-scrub {...handlers}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }} aria-hidden>
            <defs>
              <linearGradient id="fuel-band" gradientUnits="userSpaceOnUse" x1={0} y1={PAD_T} x2={0} y2={base}>
                {gradStops.map((s, i) => (
                  <stop key={i} offset={`${(Math.max(0, Math.min(1, s.o)) * 100).toFixed(2)}%`} stopColor={s.c} />
                ))}
              </linearGradient>
              <linearGradient id="fuel-fade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fff" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#fff" stopOpacity={0} />
              </linearGradient>
              {/* Fades over each area's own height, so a low trace still glows. */}
              <mask id="fuel-mask" maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox" x={0} y={0} width={1} height={1}>
                <rect x={0} y={0} width={1} height={1} fill="url(#fuel-fade)" />
              </mask>
            </defs>

            {/* Target bands, tinted like the HR zones. */}
            <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={yFor(ref * HI) - PAD_T} fill={OVER} opacity={0.045} />
            <rect x={PAD_L} y={yFor(ref * HI)} width={PLOT_W} height={yFor(ref * LO) - yFor(ref * HI)} fill={GREEN} opacity={0.08} />
            {[HI, LO].map((r) => (
              <line key={r} x1={PAD_L} x2={W - PAD_R} y1={yFor(ref * r)} y2={yFor(ref * r)} stroke={r === HI ? OVER : GREEN} strokeWidth={0.6} strokeOpacity={0.35} />
            ))}
            <line x1={PAD_L} x2={W - PAD_R} y1={yFor(ref)} y2={yFor(ref)} stroke="var(--fg-muted)" strokeWidth={0.9} strokeDasharray="3 3" opacity={0.8} />
            <text x={W - PAD_R + 5} y={yFor(ref) + 3} fontSize="9" fontWeight="700" fill={GREEN}>
              {fmt(ref)}
            </text>
            <text x={W - PAD_R + 5} y={PAD_T + 3} fontSize="9" fill="var(--fg-dim)">
              {fmt(yHi)}
            </text>
            <line x1={PAD_L} x2={W - PAD_R} y1={base} y2={base} stroke="var(--border)" strokeWidth={0.6} />

            {ticks.map((t) => (
              <text
                key={`${t.xf}-${t.label}`}
                x={xFor(t.xf).toFixed(2)}
                y={H - PAD_B + 15}
                fontSize="9"
                fill="var(--fg-muted)"
                textAnchor={t.xf === 0 ? "start" : t.xf === 1 ? "end" : "middle"}
              >
                {t.label}
              </text>
            ))}

            {selPt && (
              <line x1={selPt.x} x2={selPt.x} y1={PAD_T} y2={base} stroke="var(--fg)" strokeWidth={range === "W" ? 14 : 5} opacity={0.05} strokeLinecap="round" />
            )}

            {segments(kcalPts).map((seg, i) =>
              seg.length === 1 && range !== "D" ? null : (
                <g key={`k${i}`}>
                  <path
                    d={`${path(seg)} L${endX(seg).toFixed(2)},${base} L${seg[0].x.toFixed(2)},${base} Z`}
                    fill="url(#fuel-band)"
                    mask="url(#fuel-mask)"
                  />
                  <path
                    d={path(seg)}
                    fill="none"
                    stroke="url(#fuel-band)"
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ filter: "drop-shadow(0 0 4px rgba(34,197,94,0.35))" }}
                  />
                </g>
              ),
            )}
            {range !== "D" && segments(protPts).map((seg, i) =>
              seg.length < 2 ? null : (
                <path
                  key={`p${i}`}
                  d={path(seg)}
                  fill="none"
                  stroke={PROTEIN}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.85}
                />
              ),
            )}

            {range !== "D" &&
              kcalPts.map((p) =>
                p.kcal == null ? null : (
                  <circle
                    key={p.key}
                    cx={p.x.toFixed(2)}
                    cy={p.y.toFixed(2)}
                    r={p.key === selected ? dotR + 1 : dotR}
                    fill={p.partial ? "var(--bg-card)" : ratioColor(p.kcal, p.target)}
                    stroke={p.partial ? ratioColor(p.kcal, p.target) : "var(--bg-card)"}
                    strokeWidth={p.partial ? 1.4 : 0.8}
                  />
                ),
              )}
            {range === "D" &&
              kcalPts.slice(1).map((p) => (
                <circle key={p.key} cx={p.x.toFixed(2)} cy={p.y.toFixed(2)} r={3} fill={ratioColor(p.kcal!, ref, true)} stroke="var(--bg-card)" strokeWidth={1} />
              ))}

            {peak && peak.kcal != null && (
              <text
                x={Math.max(PAD_L + 10, Math.min(W - PAD_R - 10, peak.x)).toFixed(2)}
                y={(peak.y - 7).toFixed(2)}
                fontSize="9"
                fontWeight="700"
                textAnchor="middle"
                fill={ratioColor(peak.kcal, peak.target)}
              >
                {fmt(peak.kcal)}
              </text>
            )}

            {liveEnd && liveEnd.kcal != null && (range !== "D" || liveEnd.kcal > 0) && (
              <g>
                <circle cx={(range === "D" ? nowX : liveEnd.x).toFixed(2)} cy={liveEnd.y.toFixed(2)} r={3} fill={ratioColor(liveEnd.kcal, liveEnd.target, true)} opacity={0.35}>
                  <animate attributeName="r" values="3;8;3" dur="1.8s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.45;0;0.45" dur="1.8s" repeatCount="indefinite" />
                </circle>
                <circle cx={(range === "D" ? nowX : liveEnd.x).toFixed(2)} cy={liveEnd.y.toFixed(2)} r={2.8} fill={ratioColor(liveEnd.kcal, liveEnd.target, true)} stroke="var(--bg-card)" strokeWidth={1} />
              </g>
            )}

            {active && active.key !== "start" && (
              <>
                <line x1={xFor(active.xf)} x2={xFor(active.xf)} y1={PAD_T} y2={base} stroke="var(--fg)" strokeWidth={1} opacity={0.45} />
                {active.kcal != null && (
                  <>
                    <circle cx={xFor(active.xf)} cy={yFor(active.kcal)} r={4} fill="var(--bg-card)" stroke="var(--fg)" strokeWidth={2} />
                    {range !== "D" && (
                      <circle cx={xFor(active.xf)} cy={yFor((active.p / proteinRef) * ref)} r={3} fill="var(--bg-card)" stroke={PROTEIN} strokeWidth={1.8} />
                    )}
                  </>
                )}
              </>
            )}
          </svg>
        </div>

        {/* Where the calories came from: the range's average split (today's running split on D). */}
        {splitKcal > 0 && (
          <div className="mt-3">
            <div className="flex h-2 rounded-full overflow-hidden gap-[2px]">
              {([
                [split.p * 4, PROTEIN],
                [split.c * 4, CARBS],
                [split.f * 9, FAT],
              ] as const).map(([v, c], i) => (v > 0 ? <div key={i} style={{ flexGrow: v, flexBasis: 0, background: c }} /> : null))}
            </div>
            <div className="flex justify-between mt-1.5 text-[11px] tabular-nums" style={{ color: "var(--fg-muted)" }}>
              {([
                ["Protein", split.p * 4, PROTEIN],
                ["Carbs", split.c * 4, CARBS],
                ["Fat", split.f * 9, FAT],
              ] as const).map(([l, v, c]) => (
                <span key={l} className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
                  {l} {Math.round((v / splitKcal) * 100)}%
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-stretch mt-3 rounded-xl py-2.5" style={{ background: "var(--bg-elevated)" }}>
          {(range === "D"
            ? [
                { label: "Left", value: fmt(Math.max(0, ref - (last.kcal ?? 0))), color: undefined },
                { label: `Protein / ${todayDay.targets.proteinTargetG}g`, value: `${Math.round(last.p)}`, color: PROTEIN },
                { label: "Carbs g", value: `${Math.round(last.c)}`, color: CARBS },
                { label: "Fat g", value: `${Math.round(last.f)}`, color: FAT },
              ]
            : [
                { label: "Avg kcal", value: closed.length ? fmt(avg((p) => p.kcal!)!) : "—", color: undefined },
                { label: `Protein / ${todayDay.targets.proteinTargetG}g`, value: closed.length ? `${Math.round(avg((p) => p.p)!)}` : "—", color: PROTEIN },
                { label: "Carbs g", value: closed.length ? `${Math.round(avg((p) => p.c)!)}` : "—", color: CARBS },
                { label: "Fat g", value: closed.length ? `${Math.round(avg((p) => p.f)!)}` : "—", color: FAT },
              ]
          ).map((it, i) => (
            <div key={it.label} className="flex-1 flex min-w-0">
              {i > 0 && <div className="w-px self-stretch" style={{ background: "var(--border)" }} />}
              <div className="flex-1 text-center min-w-0">
                <p className="text-[17px] font-bold tabular-nums leading-tight" style={{ color: it.color }}>
                  {it.value}
                </p>
                <p className="text-[10.5px] mt-0.5 truncate px-1" style={{ color: "var(--fg-muted)" }}>
                  {it.label}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
