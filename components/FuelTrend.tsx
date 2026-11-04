"use client";

// The Macros page's look back: one stacked bar per day (per week on Y), split
// protein / carbs / fat, against the calorie target — drawn in the heart-rate
// chart's style: a tinted on-target band, a dashed goal line labelled in the
// right gutter, a soft glow, and a readout that stays put after the finger
// lifts. Today lives in the hero above, so there's no day view here. Tapping a
// day in the week opens its food below.

import { useEffect, useMemo, useState } from "react";
import { useScrub } from "@/lib/useScrub";
import { hapticTick } from "@/lib/haptics";
import type { FuelDayView } from "@/components/FuelWeek";
import type { DailyIntake } from "@/lib/foodLog";
import { CARBS, FAT, PROTEIN } from "@/components/FuelCharts";

type Range = "W" | "M" | "Y";

type Bar = {
  key: string;
  label: string;
  kcal: number | null;
  p: number;
  c: number;
  f: number;
  target: number;
  /// Today, still being eaten.
  partial?: boolean;
  /// A day with a full FuelDayView, so selecting it can open its diary.
  date?: string;
};

const RANGES: Range[] = ["W", "M", "Y"];
const GREEN = "#22c55e";
const OVER = "#f59e0b";
// Within ±10% of the calorie target counts as on target.
const LO = 0.9;
const HI = 1.1;

const W = 320;
const H = 132;
const PAD_L = 4;
const PAD_R = 36;
const PAD_T = 8;
const PAD_B = 18;
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
const fmt = (n: number) => Math.round(n).toLocaleString();
const onTargetRatio = (b: Bar) => {
  const r = (b.kcal ?? 0) / Math.max(1, b.target);
  return r >= LO && r <= HI;
};

export default function FuelTrend({
  days,
  history,
  today,
  selected,
  onSelect,
}: {
  days: FuelDayView[];
  history: DailyIntake[];
  today: string;
  selected: string;
  onSelect: (date: string) => void;
}) {
  const [range, setRange] = useState<Range>("W");
  const todayDay = days.find((d) => d.date === today) ?? days[days.length - 1];
  const ref = todayDay.targets.calorieTargetKcal;
  const proteinTarget = todayDay.targets.proteinTargetG;
  const todayPartial = todayDay.partial;

  const bars = useMemo<Bar[]>(() => {
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
          label: `Wk of ${shortDate(wk)}`,
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
        label: key === today ? "Today so far" : `${dowOf(key)} ${shortDate(key)}`,
        kcal: h ? h.kcal : null,
        p: h?.proteinG ?? 0,
        c: h?.carbsG ?? 0,
        f: h?.fatG ?? 0,
        target: view?.targets.calorieTargetKcal ?? ref,
        partial: key === today && todayPartial,
        date: view ? key : undefined,
      };
    });
  }, [range, history, days, today, ref, todayPartial]);

  // ── summary: finished days only, so half of today doesn't drag it down ──
  const closed = bars.filter((b) => b.kcal != null && !b.partial);
  const avg = (g: (b: Bar) => number) => (closed.length ? closed.reduce((s, b) => s + g(b), 0) / closed.length : null);
  const avgKcal = avg((b) => b.kcal!);
  const avgProtein = avg((b) => b.p);
  const hits = closed.filter(onTargetRatio).length;
  const unit = range === "Y" ? "wks" : "days";

  // ── scale ──
  const yHi = Math.ceil((Math.max(ref * 1.2, ...bars.map((b) => b.kcal ?? 0)) * 1.04) / 500) * 500;
  const yFor = (kcal: number) => PAD_T + PLOT_H * (1 - Math.max(0, Math.min(yHi, kcal)) / yHi);
  const base = PAD_T + PLOT_H;
  const n = bars.length;
  const slot = PLOT_W / n;
  const barW = Math.min(26, slot * (range === "W" ? 0.56 : 0.66));
  const cx = (i: number) => PAD_L + slot * (i + 0.5);

  // ── tap / hold ──
  const { trackRef, frac, handlers } = useScrub<HTMLDivElement>();
  const [held, setHeld] = useState<{ range: Range; idx: number } | null>(null);
  // Bars sit centred in equal slots, so the scrub maps straight onto a slot.
  const liveIdx =
    frac == null ? null : Math.max(0, Math.min(n - 1, Math.floor(((frac * W - PAD_L) / PLOT_W) * n)));
  if (liveIdx != null && (held?.range !== range || held.idx !== liveIdx)) {
    setHeld({ range, idx: liveIdx });
    hapticTick();
  }
  const idx = held && held.range === range ? held.idx : null;
  const active = idx != null ? bars[idx] : null;
  const activeDate = active?.date;
  useEffect(() => {
    if (activeDate && activeDate !== selected) onSelect(activeDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDate]);
  // With nothing held, the week highlights the day open below.
  const focusKey = active?.key ?? (range === "Y" ? null : selected);

  // ── x labels ──
  const ticks: { i: number; label: string }[] = [];
  if (range === "W") bars.forEach((b, i) => ticks.push({ i, label: dowOf(b.key) }));
  else if (range === "M") [0, 7, 14, 21, 29].forEach((i) => ticks.push({ i, label: shortDate(bars[i].key) }));
  else {
    const byMonth = new Map<string, number[]>();
    bars.forEach((b, i) => {
      const m = b.key.slice(0, 7);
      (byMonth.get(m) ?? byMonth.set(m, []).get(m)!).push(i);
    });
    let k = 0;
    for (const [m, is] of byMonth) {
      // Every other month keeps the axis from crowding.
      if (is.length >= 3 && k++ % 2 === 0)
        ticks.push({ i: is[Math.floor(is.length / 2)], label: MONTHS[Number(m.slice(5, 7)) - 1] });
    }
  }

  return (
    <div className="rounded-2xl px-4 pt-3.5 pb-3 mb-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="tabular-nums leading-none">
            <span className="text-[24px] font-bold" style={{ letterSpacing: "-0.02em" }}>
              {avgKcal != null ? fmt(avgKcal) : "—"}
            </span>
            <span className="text-[12px] ml-1.5" style={{ color: "var(--fg-muted)" }}>
              avg kcal / day
            </span>
          </p>
          <p className="text-[12px] mt-1.5 tabular-nums truncate" style={{ color: "var(--fg-muted)" }}>
            {closed.length ? (
              <>
                <span style={{ color: hits > 0 ? GREEN : undefined, fontWeight: 600 }}>
                  on target {hits}/{closed.length} {unit}
                </span>
                {" · "}
                <span style={{ color: PROTEIN, fontWeight: 600 }}>{Math.round(avgProtein!)}</span>
                {` / ${proteinTarget} g protein`}
              </>
            ) : (
              "Nothing logged in this range yet"
            )}
          </p>
        </div>
        <div className="flex gap-0.5 p-0.5 rounded-full shrink-0" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
          {RANGES.map((r) => {
            const on = r === range;
            return (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setRange(r);
                  setHeld(null);
                }}
                aria-pressed={on}
                className="w-9 py-1.5 rounded-full text-[12px] font-semibold transition-colors"
                style={{
                  background: on ? "var(--bg-card)" : "transparent",
                  color: on ? "var(--fg)" : "var(--fg-muted)",
                  boxShadow: on ? "inset 0 0 0 1px var(--border-strong)" : undefined,
                }}
              >
                {r}
              </button>
            );
          })}
        </div>
      </div>

      {/* Readout: the held bar, or the key. */}
      <div className="h-8 mt-2 flex items-center select-none">
        {active ? (
          <div className="flex items-center gap-2 min-w-0 w-full tabular-nums">
            <span className="text-[12px] shrink-0" style={{ color: "var(--fg-muted)" }}>
              {active.label}
            </span>
            {active.kcal != null ? (
              <>
                <b
                  className="text-[14px]"
                  style={{ color: onTargetRatio(active) ? GREEN : active.kcal > active.target * HI ? OVER : undefined }}
                >
                  {fmt(active.kcal)}
                </b>
                {([
                  ["P", active.p, PROTEIN],
                  ["C", active.c, CARBS],
                  ["F", active.f, FAT],
                ] as const).map(([l, v, c]) => (
                  <span key={l} className="flex items-center gap-1 text-[12px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
                    {Math.round(v)}
                    <span className="font-normal" style={{ color: "var(--fg-dim)" }}>{l}</span>
                  </span>
                ))}
              </>
            ) : (
              <span className="text-[12px]" style={{ color: "var(--fg-dim)" }}>nothing logged</span>
            )}
            <button
              type="button"
              onClick={() => setHeld(null)}
              aria-label="Clear reading"
              className="ml-auto w-6 h-6 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "var(--bg-elevated)", color: "var(--fg-muted)" }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--fg-muted)" }}>
            {([
              ["Protein", PROTEIN],
              ["Carbs", CARBS],
              ["Fat", FAT],
            ] as const).map(([l, c]) => (
              <span key={l} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-[2px]" style={{ background: c }} />
                {l}
              </span>
            ))}
            <span className="truncate" style={{ color: "var(--fg-dim)" }}>
              · tap {range === "Y" ? "a week" : "a day"}
            </span>
          </div>
        )}
      </div>

      <div ref={trackRef} className="relative touch-none cursor-pointer select-none" data-chart-scrub {...handlers}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }} aria-hidden>
          <defs>
            {bars.map((b, i) =>
              b.kcal ? (
                <clipPath key={b.key} id={`fuel-bar-${i}`}>
                  <rect
                    x={cx(i) - barW / 2}
                    y={yFor(b.kcal)}
                    width={barW}
                    height={base - yFor(b.kcal)}
                    rx={Math.min(5, barW / 2)}
                  />
                </clipPath>
              ) : null,
            )}
          </defs>

          {/* On-target band and the goal, like the HR zones. */}
          <rect x={PAD_L} y={yFor(ref * HI)} width={PLOT_W} height={yFor(ref * LO) - yFor(ref * HI)} fill={GREEN} opacity={0.08} />
          <line x1={PAD_L} x2={W - PAD_R} y1={base} y2={base} stroke="var(--border)" strokeWidth={0.6} />

          {focusKey &&
            bars.map((b, i) =>
              b.key === focusKey ? (
                <rect key="focus" x={cx(i) - slot / 2 + 1} y={PAD_T} width={slot - 2} height={PLOT_H} rx={6} fill="var(--fg)" opacity={0.05} />
              ) : null,
            )}

          {bars.map((b, i) => {
            const x = cx(i) - barW / 2;
            if (!b.kcal) {
              // A stub marks the day so the week keeps its shape.
              return <rect key={b.key} x={x} y={base - 2} width={barW} height={2} rx={1} fill="var(--fg-dim)" opacity={0.35} />;
            }
            // Split the day's calories by where they came from. Macros don't
            // always sum to the logged kcal, so the shares scale to it.
            const parts = [
              { v: b.p * 4, c: PROTEIN },
              { v: b.c * 4, c: CARBS },
              { v: b.f * 9, c: FAT },
            ];
            const sum = parts.reduce((s, p) => s + p.v, 0);
            const top = yFor(b.kcal);
            const h = base - top;
            const dim = focusKey != null && b.key !== focusKey;
            let y = base;
            return (
              <g
                key={b.key}
                clipPath={`url(#fuel-bar-${i})`}
                opacity={b.partial ? 0.5 : dim ? 0.7 : 1}
                style={{ filter: dim ? undefined : "drop-shadow(0 0 5px rgba(236,72,153,0.25))" }}
              >
                {sum <= 0 ? (
                  <rect x={x} y={top} width={barW} height={h} fill="var(--fg-muted)" />
                ) : (
                  parts.map((p, j) => {
                    const ph = (p.v / sum) * h;
                    y -= ph;
                    // A hairline of card between segments, like the HR marks.
                    return ph > 0 ? <rect key={j} x={x} y={y} width={barW} height={Math.max(0, ph - (j < 2 ? 1 : 0))} fill={p.c} /> : null;
                  })
                )}
              </g>
            );
          })}

          <line x1={PAD_L} x2={W - PAD_R} y1={yFor(ref)} y2={yFor(ref)} stroke="var(--fg)" strokeWidth={0.9} strokeDasharray="3 3" opacity={0.55} />
          <text x={W - PAD_R + 5} y={yFor(ref) + 3} fontSize="9" fontWeight="700" fill={GREEN}>
            {fmt(ref)}
          </text>
          <text x={W - PAD_R + 5} y={PAD_T + 3} fontSize="9" fill="var(--fg-dim)">
            {fmt(yHi)}
          </text>

          {ticks.map((t) => (
            <text
              key={`${t.i}-${t.label}`}
              x={cx(t.i).toFixed(2)}
              y={H - 4}
              fontSize="9"
              fontWeight={bars[t.i].key === focusKey ? 700 : 400}
              fill={bars[t.i].key === focusKey ? "var(--fg)" : "var(--fg-muted)"}
              textAnchor={range === "M" && t.i === 0 ? "start" : range === "M" && t.i === n - 1 ? "end" : "middle"}
            >
              {t.label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}
