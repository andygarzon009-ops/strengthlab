"use client";

// The Fuel page's charts, built the way the sleep and heart-rate charts are:
// an SVG plot with recessive grid, a dashed goal line labelled on the right
// axis, thin rounded marks with 2px surface gaps, and a hold-and-drag readout.
//
// Macro colours are validated for colour-vision deficiency on the dark card
// surface (dataviz validator, 2026-10-19): protein pink, carbs blue, fat
// amber, fiber teal. Every chart also labels its values in text, so identity
// never rests on colour alone.

import { useState } from "react";
import type { FoodRow, FuelDayView } from "@/components/FuelWeek";

export const PROTEIN = "#ec4899";
export const CARBS = "#3b82f6";
export const FAT = "#c2820a";
export const FIBER = "#0d9488";
const OVER = "#f59e0b";
const GAP = 2; // surface gap between stacked fills

function dow(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}
function longDate(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// ── This week ───────────────────────────────────────────────────────────────

/// Seven days as capsules that fill toward each day's calorie target, with the
/// % above. One colour throughout — the day's grade lives in the hero, so the
/// bars only say how full the day got. Tap a day to open it below; the strip
/// under the capsules spells out that day's calories and macros.
export function WeekChart({
  days,
  selected,
  onSelect,
}: {
  days: FuelDayView[];
  selected: string;
  onSelect: (date: string) => void;
}) {
  const n = days.length;
  const logged = days.filter((d) => d.logged);
  const closed = logged.filter((d) => !d.partial);
  const avg = (f: (d: FuelDayView) => number) =>
    logged.length ? Math.round(logged.reduce((s, d) => s + f(d), 0) / logged.length) : 0;
  const onTarget = closed.filter((d) => d.score.rating === "on track" || d.score.rating === "good").length;
  const target = days[n - 1].targets.calorieTargetKcal;
  const sel = days.find((d) => d.date === selected) ?? days[n - 1];

  return (
    <div>
      <div className="flex items-baseline justify-between px-1 pb-3">
        <p className="text-[22px] font-extrabold tracking-tight tabular-nums leading-none">
          {logged.length ? avg((d) => d.intake.kcal).toLocaleString() : "—"}
          <span className="text-[12px] font-medium ml-1.5" style={{ color: "var(--fg-muted)" }}>
            avg kcal / day
          </span>
        </p>
        <span className="text-[11px] tabular-nums" style={{ color: "var(--fg-muted)" }}>
          target {target.toLocaleString()}
        </span>
      </div>

      <div className="flex gap-1.5 px-0.5">
        {days.map((d) => {
          const on = d.date === selected;
          const pct = d.logged ? Math.round((d.intake.kcal / Math.max(1, d.targets.calorieTargetKcal)) * 100) : 0;
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => onSelect(d.date)}
              aria-pressed={on}
              aria-label={`${longDate(d.date)}: ${d.logged ? `${pct}% of target` : "nothing logged"}`}
              className="flex-1 min-w-0 flex flex-col items-center gap-1.5"
            >
              <span
                className="text-[10.5px] font-bold tabular-nums"
                style={{ color: !d.logged ? "var(--fg-dim)" : on ? "var(--fg)" : "var(--fg-muted)" }}
              >
                {d.logged ? `${pct}%` : "—"}
              </span>
              <span
                className="relative w-full max-w-[34px] h-[118px] rounded-xl overflow-hidden"
                style={{
                  background: "var(--bg-elevated)",
                  boxShadow: on ? "0 0 0 1.5px var(--fg)" : undefined,
                }}
              >
                {d.logged && (
                  <span
                    className="absolute left-0 right-0 bottom-0"
                    style={{
                      height: `${Math.min(100, pct)}%`,
                      background: "var(--accent)",
                      opacity: on ? 1 : 0.6,
                    }}
                  />
                )}
                {!d.logged && (
                  <span
                    className="absolute inset-0 flex items-center justify-center text-[9px]"
                    style={{ color: "var(--fg-dim)", writingMode: "vertical-rl" }}
                  >
                    no log
                  </span>
                )}
              </span>
              <span
                className="text-[11px]"
                style={{ color: on ? "var(--fg)" : "var(--fg-muted)", fontWeight: on ? 700 : 500 }}
              >
                {dow(d.date)}
              </span>
            </button>
          );
        })}
      </div>

      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-2.5 mt-3 text-[12px] tabular-nums"
        style={{ background: "var(--bg-elevated)", color: "var(--fg-muted)" }}
      >
        <b className="text-[13px]" style={{ color: "var(--fg)" }}>{longDate(sel.date)}</b>
        {sel.logged ? (
          <>
            <span>
              {sel.intake.kcal.toLocaleString()} / {sel.targets.calorieTargetKcal.toLocaleString()} kcal
            </span>
            {(
              [
                ["protein", sel.intake.proteinG, PROTEIN],
                ["carbs", sel.intake.carbsG, CARBS],
                ["fat", sel.intake.fatG, FAT],
              ] as const
            ).map(([l, v, c]) => (
              <span key={l} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-[2px]" style={{ background: c }} />
                {Math.round(v)} g {l}
              </span>
            ))}
          </>
        ) : (
          <span>Nothing logged</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3.5 pt-3 px-1" style={{ borderTop: "1px solid var(--border)" }}>
        <WeekStat label="Avg / day" value={logged.length ? avg((d) => d.intake.kcal).toLocaleString() : "—"} unit="kcal" />
        <WeekStat
          label="Protein"
          value={logged.length ? `${avg((d) => d.intake.proteinG)}` : "—"}
          unit={`/ ${days[n - 1].targets.proteinTargetG} g`}
        />
        <WeekStat label="On target" value={`${onTarget}`} unit={`of ${closed.length} day${closed.length === 1 ? "" : "s"}`} />
      </div>
    </div>
  );
}

function WeekStat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--fg-dim)" }}>
        {label}
      </p>
      <p className="text-[17px] font-bold tabular-nums mt-0.5">
        {value}
        <span className="text-[11px] font-medium ml-1" style={{ color: "var(--fg-muted)" }}>{unit}</span>
      </p>
    </div>
  );
}

// ── Macros ──────────────────────────────────────────────────────────────────

/// Where the calories came from (a donut), then each macro against its target
/// as a bullet bar with the target marked.
export function MacroPanel({ day }: { day: FuelDayView }) {
  const i = day.intake;
  const t = day.targets;
  const parts = [
    { label: "Protein", g: i.proteinG, kcal: i.proteinG * 4, target: t.proteinTargetG, color: PROTEIN },
    { label: "Carbs", g: i.carbsG, kcal: i.carbsG * 4, target: t.carbTargetG, color: CARBS },
    { label: "Fat", g: i.fatG, kcal: i.fatG * 9, target: t.fatTargetG, color: FAT },
  ];
  const sum = parts.reduce((s, p) => s + p.kcal, 0) || 1;

  // Donut arcs with a small surface gap between them.
  const R = 44;
  const C = 2 * Math.PI * R;
  const gapLen = 3;
  let offset = 0;

  return (
    <div>
      <div className="flex items-center gap-5">
        <svg width="112" height="112" viewBox="0 0 112 112" className="shrink-0" aria-label="Calories by macro">
          <circle cx="56" cy="56" r={R} fill="none" stroke="var(--bg-elevated)" strokeWidth="12" />
          {parts.map((p) => {
            const len = (p.kcal / sum) * C;
            const seg = Math.max(0, len - gapLen);
            const el = (
              <circle
                key={p.label}
                cx="56"
                cy="56"
                r={R}
                fill="none"
                stroke={p.color}
                strokeWidth="12"
                strokeDasharray={`${seg} ${C - seg}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 56 56)"
              />
            );
            offset += len;
            return p.kcal > 0 ? el : null;
          })}
          <text x="56" y="56" textAnchor="middle" fontSize="20" fontWeight="800" fill="var(--fg)" style={{ fontVariantNumeric: "tabular-nums" }}>
            {i.kcal.toLocaleString()}
          </text>
          <text x="56" y="71" textAnchor="middle" fontSize="10" fill="var(--fg-muted)">kcal</text>
        </svg>
        <div className="flex-1 min-w-0 space-y-2">
          {parts.map((p) => (
            <div key={p.label} className="flex items-center gap-2 text-[13px]">
              <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: p.color }} />
              <span className="flex-1">{p.label}</span>
              <span className="tabular-nums font-semibold">{Math.round((p.kcal / sum) * 100)}%</span>
              <span className="tabular-nums text-[11px] w-[54px] text-right" style={{ color: "var(--fg-muted)" }}>
                {Math.round(p.kcal).toLocaleString()} kcal
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {parts.map((p) => {
          const scaleMax = Math.max(p.target * 1.25, p.g, 1);
          const fill = (Math.min(p.g, scaleMax) / scaleMax) * 100;
          const mark = (p.target / scaleMax) * 100;
          const over = p.g > p.target;
          const left = Math.round(p.target - p.g);
          return (
            <div key={p.label}>
              <div className="flex items-baseline justify-between text-[13px]">
                <span className="font-semibold">{p.label}</span>
                <span className="tabular-nums text-[12px]">
                  <b>{Math.round(p.g)}</b>
                  <span style={{ color: "var(--fg-muted)" }}> / {p.target} g</span>
                </span>
              </div>
              <div className="relative h-[10px] rounded-full mt-1.5" style={{ background: "var(--bg-elevated)" }}>
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${fill}%`, background: p.color }} />
                <div
                  className="absolute -top-[3px] -bottom-[3px] w-[2px] rounded-full"
                  style={{ left: `calc(${mark}% - 1px)`, background: "var(--fg)", boxShadow: "0 0 0 2px var(--bg-card)" }}
                  aria-hidden
                />
              </div>
              <p className="text-[11px] mt-1 tabular-nums" style={{ color: over ? OVER : "var(--fg-muted)" }}>
                {over ? `${Math.round(p.g - p.target)} g over target` : left > 0 ? `${left} g to go` : "On target"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Today's food ────────────────────────────────────────────────────────────

const MEAL_META: Record<string, { icon: string; label: string; order: number }> = {
  BREAKFAST: { icon: "☀️", label: "Breakfast", order: 0 },
  LUNCH: { icon: "🍽️", label: "Lunch", order: 1 },
  DINNER: { icon: "🌙", label: "Dinner", order: 2 },
  SNACK: { icon: "🍎", label: "Snack", order: 3 },
  ANYTIME: { icon: "🍴", label: "Anytime", order: 4 },
  OTHER: { icon: "🍴", label: "Other", order: 5 },
};
const mealMeta = (key: string) =>
  MEAL_META[key] ?? { icon: "🍴", label: key.charAt(0) + key.slice(1).toLowerCase(), order: 6 };

function MacroStrip({ p, c, f, height = 6 }: { p: number; c: number; f: number; height?: number }) {
  const parts = [
    { v: p * 4, col: PROTEIN },
    { v: c * 4, col: CARBS },
    { v: f * 9, col: FAT },
  ].filter((x) => x.v > 0);
  const sum = parts.reduce((s, x) => s + x.v, 0);
  if (sum <= 0) return <div className="rounded-full" style={{ height, background: "var(--bg-elevated)" }} />;
  return (
    <div className="flex rounded-full overflow-hidden" style={{ height, gap: GAP }}>
      {parts.map((x, i) => (
        <div key={i} style={{ flexGrow: x.v, flexBasis: 0, background: x.col }} />
      ))}
    </div>
  );
}

function Grams({ p, c, f }: { p: number; c: number; f: number }) {
  return (
    <span className="flex gap-2.5 text-[11px] tabular-nums" style={{ color: "var(--fg-muted)" }}>
      {[
        ["P", p, PROTEIN],
        ["C", c, CARBS],
        ["F", f, FAT],
      ].map(([l, v, col]) => (
        <span key={l as string} className="flex items-center gap-1" style={{ opacity: (v as number) > 0 ? 1 : 0.45 }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: col as string }} />
          {l} {Math.round(v as number)}
        </span>
      ))}
    </span>
  );
}

/// The day's diary: each meal with its calories and macro split, each food
/// with a bar sized to its share of the day's biggest item.
export function FoodDiary({ foods, intake }: { foods: FoodRow[]; intake: FuelDayView["intake"] }) {
  const meals = [...new Set(foods.map((f) => f.meal))].sort((a, b) => mealMeta(a).order - mealMeta(b).order);
  const biggest = Math.max(1, ...foods.map((f) => f.kcal));
  // Each meal folds to its header line; tap to see the foods.
  const [openMeals, setOpenMeals] = useState<Set<string>>(new Set());
  const toggle = (m: string) =>
    setOpenMeals((s) => {
      const next = new Set(s);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });

  return (
    <div>
      {meals.map((meal, mi) => {
        const list = foods.filter((f) => f.meal === meal);
        const m = mealMeta(meal);
        const sum = list.reduce(
          (a, f) => ({ kcal: a.kcal + f.kcal, p: a.p + f.proteinG, c: a.c + f.carbsG, f: a.f + f.fatG }),
          { kcal: 0, p: 0, c: 0, f: 0 },
        );
        const isOpen = openMeals.has(meal);
        return (
          <div key={meal} className={mi > 0 ? "mt-3 pt-3" : ""} style={mi > 0 ? { borderTop: "1px solid var(--border)" } : undefined}>
            <button
              type="button"
              onClick={() => toggle(meal)}
              aria-expanded={isOpen}
              className="w-full flex items-center gap-2 min-h-[36px] text-left active:opacity-70"
            >
              <span className="flex-1 min-w-0 text-[14px] font-bold tracking-tight truncate">
                <span aria-hidden>{m.icon}</span> {m.label}
                <span className="ml-1.5 text-[11px] font-medium" style={{ color: "var(--fg-dim)" }}>
                  {list.length} item{list.length === 1 ? "" : "s"}
                </span>
              </span>
              <span className="text-[14px] font-bold tabular-nums">
                {Math.round(sum.kcal).toLocaleString()}
                <span className="text-[11px] font-medium ml-1" style={{ color: "var(--fg-muted)" }}>kcal</span>
              </span>
              <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--fg-dim)"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  className="shrink-0"
                  style={{ transform: isOpen ? "rotate(180deg)" : undefined, transition: "transform 160ms" }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
            </button>
            <div className="mt-2">
              <MacroStrip p={sum.p} c={sum.c} f={sum.f} />
            </div>
            {isOpen && <div className="mt-2.5 space-y-2.5">
              {list.map((f, fi) => (
                <div key={`${f.name}-${fi}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] truncate" title={f.name}>{f.name}</span>
                    <span className="text-[13px] tabular-nums shrink-0" style={{ color: "var(--fg-muted)" }}>
                      {Math.round(f.kcal).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="h-[4px] rounded-full overflow-hidden" style={{ width: "38%", background: "var(--bg-elevated)" }}>
                      <div className="h-full rounded-full" style={{ width: `${(f.kcal / biggest) * 100}%`, background: "var(--fg-muted)" }} />
                    </div>
                    <Grams p={f.proteinG} c={f.carbsG} f={f.fatG} />
                  </div>
                </div>
              ))}
            </div>}
          </div>
        );
      })}

      <div className="mt-4 pt-3 flex items-center justify-between gap-3" style={{ borderTop: "1px solid var(--border-strong)" }}>
        <span className="text-[13px] font-bold">Total</span>
        <div className="flex items-center gap-3">
          <Grams p={intake.proteinG} c={intake.carbsG} f={intake.fatG} />
          <span className="text-[14px] font-bold tabular-nums">{Math.round(intake.kcal).toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

// ── Fiber & the rest ────────────────────────────────────────────────────────

/// Below this share of the day's calories, a nutrient total is a floor.
const MICRO_COVERAGE_OK = 0.9;

function MicroTile({
  label,
  value,
  target,
  unit,
  kind,
  color,
  coverage,
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
  /// A goal to reach (fiber) or a limit to stay under (sugar, sat fat, sodium).
  kind: "goal" | "limit";
  color: string;
  coverage: number;
}) {
  const partial = coverage < MICRO_COVERAGE_OK;
  // Sodium runs to four digits; "2.1k" keeps the tile on one line.
  const fmt = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`);
  const scaleMax = Math.max(target * 1.3, value, 1);
  const fill = (value / scaleMax) * 100;
  const mark = (target / scaleMax) * 100;
  const over = kind === "limit" && value > target;
  const met = kind === "goal" && value >= target;
  const barColor = over ? OVER : color;
  const note = partial
    ? "partial — some foods didn't report it"
    : kind === "goal"
      ? met
        ? "✓ goal met"
        : `${Math.round(target - value).toLocaleString()} ${unit} to go`
      : over
        ? `${Math.round(value - target).toLocaleString()} ${unit} over limit`
        : "✓ under limit";

  return (
    <div className="rounded-2xl px-3.5 pt-3 pb-3" style={{ background: "var(--bg-elevated)" }}>
      <p className="text-[12px] font-semibold" style={{ color: "var(--fg-muted)" }}>{label}</p>
      <p className="mt-1 leading-none tabular-nums whitespace-nowrap">
        <span className="text-[22px] font-bold" style={{ letterSpacing: "-0.02em" }}>
          {fmt(value)}
          {partial && <span style={{ color: "var(--fg-muted)" }}>+</span>}
        </span>
        <span className="text-[11px] ml-1" style={{ color: "var(--fg-muted)" }}>
          / {fmt(target)} {unit}
        </span>
      </p>
      <div className="relative h-[8px] rounded-full mt-2.5" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${fill}%`,
            // A partial total is striped so it can't read as a measurement.
            background: partial ? `repeating-linear-gradient(90deg, ${barColor} 0 4px, transparent 4px 7px)` : barColor,
            opacity: partial ? 0.7 : 1,
          }}
        />
        <div
          className="absolute -top-[3px] -bottom-[3px] w-[2px] rounded-full"
          style={{ left: `calc(${mark}% - 1px)`, background: "var(--fg)", boxShadow: "0 0 0 2px var(--bg-elevated)" }}
          aria-hidden
        />
      </div>
      <p className="text-[10.5px] mt-1.5 leading-tight" style={{ color: over ? OVER : met ? "#4ade80" : "var(--fg-muted)" }}>
        {note}
      </p>
    </div>
  );
}

export function MicroGrid({ day, fiberTarget, sugarLimit, sodiumLimit }: {
  day: FuelDayView;
  fiberTarget: number;
  sugarLimit: number;
  sodiumLimit: number;
}) {
  const i = day.intake;
  const cov = (v: number) => (i.kcal > 0 ? v / i.kcal : 1);
  return (
    <div className="grid grid-cols-2 gap-2">
      <MicroTile label="Fiber" value={i.fiberG} target={fiberTarget} unit="g" kind="goal" color={FIBER} coverage={cov(i.microCoverageKcal.fiber)} />
      <MicroTile label="Sugar" value={i.sugarG} target={sugarLimit} unit="g" kind="limit" color="#71717a" coverage={cov(i.microCoverageKcal.sugar)} />
      <MicroTile
        label="Sat. fat"
        value={i.satFatG}
        target={Math.round((day.targets.calorieTargetKcal * 0.06) / 9)}
        unit="g"
        kind="limit"
        color="#71717a"
        coverage={cov(i.microCoverageKcal.satFat)}
      />
      <MicroTile label="Sodium" value={i.sodiumMg} target={sodiumLimit} unit="mg" kind="limit" color="#71717a" coverage={cov(i.microCoverageKcal.sodium)} />
    </div>
  );
}
