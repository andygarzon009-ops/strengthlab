"use client";

// The Fuel page body: a tappable 7-day strip over the selected day's diary.
// Every food carries kcal / protein / carbs / fat, meals subtotal, and the day
// totals against phase-derived targets. Data is a live read (getFuelWeek), so
// there's no history table behind this — the strip is whatever Google Health
// has for the last seven local days.

import { useState } from "react";
import Link from "next/link";

export type FoodRow = {
  name: string;
  meal: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  satFatG: number;
  sodiumMg: number;
  servings: number;
  microsReported: boolean;
};

export type FuelDayView = {
  date: string;
  logged: boolean;
  intake: {
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
    sugarG: number;
    satFatG: number;
    sodiumMg: number;
    entries: number;
    foods: FoodRow[];
    microCoverageKcal: { fiber: number; sugar: number; satFat: number; sodium: number };
    macroUnreportedKcal: { protein: number; carbs: number; fat: number };
    macroEnergyKcal: number;
  };
  activeEnergyKcal: number;
  targets: {
    phaseLabel: string;
    proteinTargetG: number;
    carbTargetG: number;
    fatTargetG: number;
    calorieTargetKcal: number;
    maintenanceKcal: number;
    maintenanceSource: "observed" | "estimated";
    targetLbPerWeek: number;
    assumedProfileFields: string[];
  };
  score: { score: number; rating: string; netKcal: number; direction: string };
  progress: { pct: number; proteinPct: number; caloriePct: number };
  partial: boolean;
};

const PROTEIN = "#a78bfa";
const CARBS = "#38bdf8";
const FAT = "#fbbf24";
const FIBER = "#2dd4bf";
// Progress isn't a verdict, so it gets its own neutral hue rather than borrowing
// the red→green rating scale. The grade takes over once the day closes.
const PROGRESS = "#38bdf8";

const RATING_COLOR: Record<string, string> = {
  "on track": "#22c55e",
  good: "#84cc16",
  "off target": "#f59e0b",
  "needs work": "#ef4444",
};

const MEAL_META: Record<string, { icon: string; label: string; order: number }> = {
  BREAKFAST: { icon: "☀️", label: "Breakfast", order: 0 },
  LUNCH: { icon: "🍽️", label: "Lunch", order: 1 },
  DINNER: { icon: "🌙", label: "Dinner", order: 2 },
  SNACK: { icon: "🍎", label: "Snack", order: 3 },
  ANYTIME: { icon: "🍴", label: "Anytime", order: 4 },
  OTHER: { icon: "🍴", label: "Other", order: 5 },
};
const mealMeta = (k: string) =>
  MEAL_META[k] ?? { icon: "🍴", label: k.charAt(0) + k.slice(1).toLowerCase(), order: 6 };

// Daily reference intakes for the nutrients that have no phase target.
const FIBER_TARGET_G = 30;
const SUGAR_LIMIT_G = 40;
const SODIUM_LIMIT_MG = 2300;

function dow(dateKey: string): string {
  return ["S", "M", "T", "W", "T", "F", "S"][
    new Date(`${dateKey}T12:00:00Z`).getUTCDay()
  ];
}

function longDate(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export type Calibration = {
  maintenanceKcal: number;
  avgIntakeKcal: number;
  lbPerWeek: number;
  loggedDays: number;
  spanDays: number;
};

export default function FuelWeek({
  days,
  today,
  calibration,
}: {
  days: FuelDayView[];
  today: string;
  calibration: Calibration | null;
}) {
  const [selected, setSelected] = useState(today);
  const day = days.find((d) => d.date === selected) ?? days[days.length - 1];
  const isToday = day.date === today;
  // While the day is open we report progress toward the targets; only once it's
  // closed is there a result to grade.
  const inProgress = day.partial;

  const i = day.intake;
  const t = day.targets;

  // Calories contributed by each macro — the honest read on balance, since a
  // day can hit its calorie target with the wrong mix entirely.
  const pKcal = i.proteinG * 4;
  const cKcal = i.carbsG * 4;
  const fKcal = i.fatG * 9;
  const macroKcal = pKcal + cKcal + fKcal || 1;

  const tallest = Math.max(1, ...days.map((d) => d.intake.kcal));
  const scoreColor = RATING_COLOR[day.score.rating] ?? "var(--fg-dim)";

  // Group the diary by meal, in eating order.
  const meals = [...new Set(i.foods.map((f) => f.meal))].sort(
    (a, b) => mealMeta(a).order - mealMeta(b).order,
  );

  return (
    <>
      {/* ── 7-day strip, stacked by macro ── */}
      <p className="label mb-2">
        Last 7 days
        <span
          className="float-right normal-case tracking-normal font-medium"
          style={{ color: "var(--fg-dim)" }}
        >
          stacked by macro
        </span>
      </p>
      <div
        className="rounded-xl px-2 py-3 mb-5"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-end gap-1">
          {days.map((d) => {
            const on = d.date === selected;
            const dp = d.intake.proteinG * 4;
            const dc = d.intake.carbsG * 4;
            const df = d.intake.fatG * 9;
            const total = dp + dc + df;
            const h = total > 0 ? Math.max(10, (d.intake.kcal / tallest) * 74) : 0;
            const c = RATING_COLOR[d.score.rating] ?? "var(--fg-dim)";
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => setSelected(d.date)}
                aria-pressed={on}
                aria-label={`${longDate(d.date)} — ${d.logged ? `${d.intake.kcal} calories` : "nothing logged"}`}
                className="flex-1 flex flex-col items-center rounded-lg py-1.5"
                style={{ background: on ? "var(--bg-elevated)" : "transparent" }}
              >
                <div className="h-[76px] w-full flex flex-col justify-end items-center">
                  {d.logged ? (
                    <div
                      className="w-[62%] flex flex-col overflow-hidden rounded-[3px]"
                      style={{ height: h, opacity: on ? 1 : 0.55 }}
                    >
                      <div style={{ height: `${(dp / total) * 100}%`, background: PROTEIN }} />
                      <div style={{ height: `${(dc / total) * 100}%`, background: CARBS }} />
                      <div style={{ height: `${(df / total) * 100}%`, background: FAT }} />
                    </div>
                  ) : (
                    <div
                      className="w-[62%] rounded-[3px]"
                      style={{ height: 6, border: "1px dashed var(--border-strong)" }}
                    />
                  )}
                </div>
                <span
                  className="text-[10px] font-bold tabular-nums mt-1.5"
                  style={{
                    color: !d.logged
                      ? "var(--fg-dim)"
                      : on
                        ? d.partial
                          ? PROGRESS
                          : c
                        : "var(--fg-dim)",
                  }}
                >
                  {!d.logged ? "—" : d.partial ? `${d.progress.pct}%` : d.score.score}
                </span>
                <span
                  className="text-[10px]"
                  style={{
                    color: on ? "var(--fg)" : "var(--fg-dim)",
                    fontWeight: on ? 700 : 400,
                  }}
                >
                  {dow(d.date)}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3 mt-2 px-1">
          {[
            { c: PROTEIN, l: "Protein" },
            { c: CARBS, l: "Carbs" },
            { c: FAT, l: "Fat" },
          ].map((s) => (
            <span
              key={s.l}
              className="text-[10px] flex items-center gap-1"
              style={{ color: "var(--fg-dim)" }}
            >
              <span className="inline-block w-2 h-2 rounded-sm" style={{ background: s.c }} />
              {s.l}
            </span>
          ))}
        </div>
      </div>

      {/* ── selected day header ── */}
      <p className="label mb-2">
        {isToday ? "Today" : longDate(day.date)}
        <span
          className="float-right normal-case tracking-normal font-medium tabular-nums"
          style={{ color: "var(--fg-dim)" }}
        >
          {t.phaseLabel}
        </span>
      </p>

      {!day.logged ? (
        <div
          className="rounded-2xl px-5 py-10 text-center mb-5"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <div className="text-[28px] mb-2">🍽️</div>
          <p className="text-[14px] font-semibold">Nothing logged</p>
          <p
            className="text-[13px] mt-1.5 leading-snug max-w-[19rem] mx-auto"
            style={{ color: "var(--fg-dim)" }}
          >
            {isToday
              ? `No food from MyFitnessPal yet today. Your target is ${t.proteinTargetG}g protein and ~${t.calorieTargetKcal.toLocaleString()} kcal.`
              : "No food reached Google Health for this day."}
          </p>
        </div>
      ) : (
        <>
          {/* score + calories */}
          <div
            className="rounded-2xl p-5 mb-4 flex items-center gap-5"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <Ring
              value={inProgress ? day.progress.pct : day.score.score}
              color={inProgress ? PROGRESS : scoreColor}
              inProgress={inProgress}
            />
            <div className="min-w-0">
              <p className="text-[22px] font-bold tabular-nums leading-none">
                {i.kcal.toLocaleString()}
                <span className="text-[13px] font-normal" style={{ color: "var(--fg-dim)" }}>
                  {" "}
                  / {t.calorieTargetKcal.toLocaleString()} kcal
                </span>
              </p>
              <p
                className="text-[12px] mt-1.5"
                style={{ color: inProgress ? "var(--fg-muted)" : scoreColor }}
              >
                {inProgress
                  ? `${day.progress.caloriePct}% of calories · ${day.progress.proteinPct}% of protein`
                  : `${day.score.rating} · ${day.score.direction}`}
              </p>
              <p className="text-[11px] mt-1 tabular-nums" style={{ color: "var(--fg-dim)" }}>
                {Math.max(0, t.calorieTargetKcal - i.kcal).toLocaleString()} kcal left ·
                ~{t.maintenanceKcal.toLocaleString()} burned
                {t.maintenanceSource === "observed" ? " (measured)" : " (estimated)"}
              </p>
            </div>
          </div>

          {/* ── macros ── */}
          <p className="label mb-2">Macros</p>
          <div
            className="rounded-2xl p-4 mb-4"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <MacroBar
              label="Protein"
              color={PROTEIN}
              value={i.proteinG}
              target={t.proteinTargetG}
              pctOfKcal={(pKcal / macroKcal) * 100}
            />
            <MacroBar
              label="Carbs"
              color={CARBS}
              value={i.carbsG}
              target={t.carbTargetG}
              pctOfKcal={(cKcal / macroKcal) * 100}
            />
            <MacroBar
              label="Fat"
              color={FAT}
              value={i.fatG}
              target={t.fatTargetG}
              pctOfKcal={(fKcal / macroKcal) * 100}
              last
            />

            <p className="label mt-4 mb-2">Calories from</p>
            <div className="flex h-2 rounded-full overflow-hidden">
              <div style={{ width: `${(pKcal / macroKcal) * 100}%`, background: PROTEIN }} />
              <div style={{ width: `${(cKcal / macroKcal) * 100}%`, background: CARBS }} />
              <div style={{ width: `${(fKcal / macroKcal) * 100}%`, background: FAT }} />
            </div>
            <div className="flex justify-between mt-1.5 text-[10px] tabular-nums">
              <span style={{ color: PROTEIN }}>
                <b>{Math.round((pKcal / macroKcal) * 100)}%</b> protein
              </span>
              <span style={{ color: CARBS }}>
                <b>{Math.round((cKcal / macroKcal) * 100)}%</b> carbs
              </span>
              <span style={{ color: FAT }}>
                <b>{Math.round((fKcal / macroKcal) * 100)}%</b> fat
              </span>
            </div>

            <MacroReconcile intake={i} />
          </div>

          {/* ── the diary ── */}
          <p className="label mb-2">
            {isToday ? "Today's food" : "Food"}
            <span
              className="float-right normal-case tracking-normal font-medium tabular-nums"
              style={{ color: "var(--fg-dim)" }}
            >
              {i.entries} item{i.entries === 1 ? "" : "s"}
            </span>
          </p>
          <div
            className="rounded-2xl p-4 mb-4"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            {meals.map((meal, mi) => {
              const foods = i.foods.filter((f) => f.meal === meal);
              const m = mealMeta(meal);
              const sum = foods.reduce(
                (a, f) => ({
                  kcal: a.kcal + f.kcal,
                  p: a.p + f.proteinG,
                  c: a.c + f.carbsG,
                  f: a.f + f.fatG,
                }),
                { kcal: 0, p: 0, c: 0, f: 0 },
              );
              return (
                <div
                  key={meal}
                  className={mi > 0 ? "mt-3 pt-3" : ""}
                  style={mi > 0 ? { borderTop: "1px solid var(--border)" } : undefined}
                >
                  <p className="text-[13px] font-bold tracking-tight mb-1.5">
                    {m.icon} {m.label}
                  </p>
                  <MacroHead />
                  {foods.map((f, fi) => (
                    <FoodLine key={`${f.name}-${fi}`} food={f} />
                  ))}
                  {/* meal subtotal sits under its foods, where the eye lands
                      after reading them */}
                  <div
                    className="grid items-baseline gap-1 mt-1 pt-1.5 text-[12px] font-semibold tabular-nums"
                    style={{
                      gridTemplateColumns: "minmax(0,1fr) 44px 32px 32px 30px",
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    <span style={{ color: "var(--fg-dim)" }}>{m.label} total</span>
                    <span className="text-right" style={{ color: "var(--fg-muted)" }}>
                      {sum.kcal.toLocaleString()}
                    </span>
                    <span className="text-right" style={{ color: PROTEIN }}>{sum.p}</span>
                    <span className="text-right" style={{ color: CARBS }}>{sum.c}</span>
                    <span className="text-right" style={{ color: FAT }}>{sum.f}</span>
                  </div>
                </div>
              );
            })}

            <div
              className="grid items-baseline gap-1 mt-3 pt-2.5 text-[13px] font-bold tabular-nums"
              style={{
                gridTemplateColumns: "minmax(0,1fr) 44px 32px 32px 30px",
                borderTop: "1px solid var(--border-strong)",
              }}
            >
              <span>Total</span>
              <span className="text-right">{i.kcal.toLocaleString()}</span>
              <span className="text-right" style={{ color: PROTEIN }}>{i.proteinG}</span>
              <span className="text-right" style={{ color: CARBS }}>{i.carbsG}</span>
              <span className="text-right" style={{ color: FAT }}>{i.fatG}</span>
            </div>
          </div>

          {/* ── micronutrients ── */}
          <p className="label mb-2">Fiber &amp; the rest</p>
          <div
            className="rounded-2xl p-4 mb-5"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <Micro
              label="Fiber"
              value={i.fiberG}
              target={FIBER_TARGET_G}
              unit="g"
              color={FIBER}
              coverage={i.kcal > 0 ? i.microCoverageKcal.fiber / i.kcal : 1}
            />
            <Micro
              label="Sugar"
              value={i.sugarG}
              target={SUGAR_LIMIT_G}
              unit="g"
              color={CARBS}
              coverage={i.kcal > 0 ? i.microCoverageKcal.sugar / i.kcal : 1}
            />
            <Micro
              label="Sat. fat"
              value={i.satFatG}
              target={Math.round((t.calorieTargetKcal * 0.06) / 9)}
              unit="g"
              color={FAT}
              coverage={i.kcal > 0 ? i.microCoverageKcal.satFat / i.kcal : 1}
            />
            <Micro
              label="Sodium"
              value={i.sodiumMg}
              target={SODIUM_LIMIT_MG}
              unit="mg"
              color="var(--fg-muted)"
              coverage={i.kcal > 0 ? i.microCoverageKcal.sodium / i.kcal : 1}
              last
            />
            <MicroCaveat foods={i.foods} dayKcal={i.kcal} />
          </div>
        </>
      )}

      <GoalCard targets={day.targets} calibration={calibration} />

      <Link
        href="/group?coach=1"
        className="flex items-center justify-center gap-2 w-full rounded-xl py-3 text-[14px] font-semibold"
        style={{ background: "var(--accent)", color: "#0a0a0a" }}
      >
        🤖 Ask your coach about your intake
      </Link>

      <p className="text-[11px] mt-4 leading-snug" style={{ color: "var(--fg-dim)" }}>
        Food comes from MyFitnessPal via Google Health. Protein and calorie targets follow
        your training phase and bodyweight; carbs and fat are split from the calorie
        target after protein. Calories burned is an estimate — resting metabolism plus the
        day&apos;s logged movement.
      </p>
    </>
  );
}

/// Closes the loop between the target and the goal it's supposed to serve:
/// what rate the plan is aiming for, and — when there's enough data — what the
/// scale says is actually happening.
function GoalCard({
  targets,
  calibration,
}: {
  targets: FuelDayView["targets"];
  calibration: Calibration | null;
}) {
  const goal = targets.targetLbPerWeek;
  const goalText =
    goal === 0
      ? "hold weight"
      : `${goal > 0 ? "+" : "−"}${Math.abs(goal).toFixed(2)} lb / week`;

  // Is the scale doing what the plan asked? Half a target rate of drift is the
  // most a 28-day trend can resolve without over-reading scale noise.
  const tol = Math.max(0.15, Math.abs(goal) * 0.5);
  const actual = calibration?.lbPerWeek ?? null;
  const onPlan = actual != null ? Math.abs(actual - goal) <= tol : null;

  return (
    <div
      className="rounded-2xl p-4 mb-4"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-semibold">{targets.phaseLabel} plan</span>
        <span className="text-[13px] tabular-nums font-semibold">{goalText}</span>
      </div>

      {calibration ? (
        <>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
              Actually happening
            </span>
            <span
              className="text-[13px] tabular-nums font-semibold"
              style={{ color: onPlan ? "#22c55e" : "#f59e0b" }}
            >
              {actual! > 0 ? "+" : actual! < 0 ? "−" : ""}
              {Math.abs(actual!).toFixed(2)} lb / week
            </span>
          </div>
          <p className="text-[11px] mt-2 leading-snug" style={{ color: "var(--fg-dim)" }}>
            {onPlan
              ? `On plan. Your ${targets.maintenanceKcal.toLocaleString()} kcal maintenance is measured from ${calibration.loggedDays} logged days averaging ${calibration.avgIntakeKcal.toLocaleString()} kcal against ${calibration.spanDays} days of scale readings — not an estimate.`
              : `Off plan. Averaging ${calibration.avgIntakeKcal.toLocaleString()} kcal over ${calibration.loggedDays} logged days put you at ${Math.abs(actual!).toFixed(2)} lb/week, so maintenance has been recalculated to ${targets.maintenanceKcal.toLocaleString()} and your target moved to match the goal.`}
          </p>
        </>
      ) : (
        <p className="text-[11px] mt-2 leading-snug" style={{ color: "var(--fg-dim)" }}>
          Targets use an estimated maintenance for now. Log food on most days of
          a month and weigh in at least weekly, and this switches to your real
          maintenance — solved from what you ate against what the scale did.
        </p>
      )}

      {targets.assumedProfileFields.length > 0 && (
        <p
          className="text-[11px] mt-2.5 pt-2.5 leading-snug"
          style={{ borderTop: "1px solid var(--border)", color: "#f59e0b" }}
        >
          Your {targets.assumedProfileFields.join(" and ")}{" "}
          {targets.assumedProfileFields.length === 1 ? "isn't" : "aren't"} set, so
          the calorie estimate is using{" "}
          {targets.assumedProfileFields.length === 1 ? "an average" : "averages"}{" "}
          instead of yours — every target here inherits that error.{" "}
          <Link href="/profile" style={{ color: "var(--accent)" }}>
            Add {targets.assumedProfileFields.length === 1 ? "it" : "them"} →
          </Link>
        </p>
      )}
    </div>
  );
}

function Ring({
  value,
  color,
  inProgress,
}: {
  value: number;
  color: string;
  inProgress: boolean;
}) {
  const r = 32;
  const c = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, value)) / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: 80, height: 80 }}>
      <svg width="80" height="80" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--bg-elevated)" strokeWidth="7" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c - filled}`}
          transform="rotate(-90 40 40)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[22px] font-bold leading-none tabular-nums">
          {value}
          {inProgress && <span className="text-[13px]">%</span>}
        </span>
        <span className="text-[9px] mt-0.5" style={{ color: "var(--fg-dim)" }}>
          {inProgress ? "logged" : "/ 100"}
        </span>
      </div>
    </div>
  );
}

function MacroBar({
  label,
  color,
  value,
  target,
  pctOfKcal,
  last,
}: {
  label: string;
  color: string;
  value: number;
  target: number;
  pctOfKcal: number;
  last?: boolean;
}) {
  const pct = target > 0 ? (value / target) * 100 : 0;
  const left = Math.max(0, target - value);
  return (
    <div className={last ? "" : "mb-3.5"}>
      <div className="flex items-baseline justify-between text-[13px]">
        <span style={{ color }}>{label}</span>
        <span className="tabular-nums text-[12px]">
          <b className="font-semibold">{value}</b>
          <span style={{ color: "var(--fg-dim)" }}>
            {" "}
            / {target}g · {Math.round(pctOfKcal)}% of kcal
          </span>
        </span>
      </div>
      <div
        className="h-[7px] rounded-full mt-1.5 overflow-hidden"
        style={{ background: "var(--bg-elevated)" }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, pct)}%`, background: color }}
        />
      </div>
      <p className="text-[10px] mt-1 tabular-nums" style={{ color: "var(--fg-dim)" }}>
        {left > 0 ? `${left}g left` : `${value - target}g over target`}
      </p>
    </div>
  );
}

function MacroHead() {
  return (
    <div
      className="grid items-baseline gap-1 pb-1.5 mb-1 text-[10px] uppercase tracking-wide"
      style={{
        gridTemplateColumns: "minmax(0,1fr) 44px 32px 32px 30px",
        borderBottom: "1px solid var(--border)",
        color: "var(--fg-dim)",
      }}
    >
      <span />
      <span className="text-right">kcal</span>
      <span className="text-right font-bold" style={{ color: PROTEIN }}>P</span>
      <span className="text-right font-bold" style={{ color: CARBS }}>C</span>
      <span className="text-right font-bold" style={{ color: FAT }}>F</span>
    </div>
  );
}

function FoodLine({ food }: { food: FoodRow }) {
  // Zeros are dimmed so the eye lands on what a food actually contributed.
  const tint = (v: number, color: string) => ({
    color: v > 0 ? color : "var(--fg-dim)",
  });
  return (
    <div
      className="grid items-baseline gap-1 py-[3px] text-[12px] tabular-nums"
      style={{ gridTemplateColumns: "minmax(0,1fr) 44px 32px 32px 30px" }}
    >
      <span className="truncate text-[13px]" title={food.name}>
        {food.name}
      </span>
      <span className="text-right" style={{ color: "var(--fg-muted)" }}>
        {food.kcal.toLocaleString()}
      </span>
      <span className="text-right font-semibold" style={tint(food.proteinG, PROTEIN)}>
        {food.proteinG}
      </span>
      <span className="text-right" style={tint(food.carbsG, CARBS)}>
        {food.carbsG}
      </span>
      <span className="text-right" style={tint(food.fatG, FAT)}>
        {food.fatG}
      </span>
    </div>
  );
}

/// Below this share of the day's calories, the total is too incomplete to state
/// as a number — it's shown as a floor instead.
const MICRO_COVERAGE_OK = 0.9;

/// Macros can't be coverage-checked the way micronutrients are: an omitted macro
/// is usually a genuine zero (butter has no protein, a peach has no fat), so
/// counting foods that "didn't report carbs" would cry wolf constantly. Energy
/// is the real check — 4·P + 4·C + 9·F has to add back up to the calories the
/// same entries claim. It only gets flagged when the mismatch is big enough to
/// mean something: Atwater factors are rounded, fiber and alcohol don't fit the
/// 4/4/9 model, so a few percent of drift is normal and expected.
const MACRO_GAP_PCT = 0.1;
const MACRO_GAP_KCAL = 150;

function MacroReconcile({ intake }: { intake: FuelDayView["intake"] }) {
  const gap = intake.kcal - intake.macroEnergyKcal;
  const pct = intake.kcal > 0 ? Math.abs(gap) / intake.kcal : 0;
  const accounted =
    intake.kcal > 0 ? Math.round((intake.macroEnergyKcal / intake.kcal) * 100) : 0;

  if (pct <= MACRO_GAP_PCT || Math.abs(gap) < MACRO_GAP_KCAL) {
    return (
      <p className="text-[10px] mt-2.5 tabular-nums" style={{ color: "var(--fg-dim)" }}>
        Protein, carbs and fat account for {accounted}% of today&apos;s calories — the
        macros are complete.
      </p>
    );
  }

  // A real gap. Attribute it to whichever macro the most calories went
  // unreported for, which is only meaningful now that we know one is missing.
  const u = intake.macroUnreportedKcal;
  const worst = (
    [
      ["carbs", u.carbs],
      ["fat", u.fat],
      ["protein", u.protein],
    ] as const
  ).reduce((a, b) => (b[1] > a[1] ? b : a));

  return (
    <p
      className="text-[10px] mt-2.5 leading-snug"
      style={{ color: gap > 0 ? "#f59e0b" : "var(--fg-dim)" }}
    >
      {gap > 0 ? (
        <>
          {gap.toLocaleString()} kcal of today&apos;s food isn&apos;t explained by the
          macros logged ({accounted}% accounted for)
          {worst[1] > 0 && <> — most likely missing {worst[0]}</>}. The macro totals
          are lower than what you actually ate.
        </>
      ) : (
        <>
          The macros add up to {Math.abs(gap).toLocaleString()} kcal more than the
          calories logged ({accounted}% of them), so one of the two is overstated.
        </>
      )}
    </p>
  );
}

function Micro({
  label,
  value,
  target,
  unit,
  color,
  coverage,
  last,
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
  color: string;
  coverage: number; // 0..1 share of the day's calories that reported this
  last?: boolean;
}) {
  const partial = coverage < MICRO_COVERAGE_OK;
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div className={`flex items-center gap-2.5 ${last ? "" : "mb-2.5"}`}>
      <span className="text-[12px] w-[58px] shrink-0" style={{ color: "var(--fg-muted)" }}>
        {label}
      </span>
      <span
        className="flex-1 h-[6px] rounded-full overflow-hidden"
        style={{ background: "var(--bg-elevated)" }}
      >
        <span
          className="block h-full rounded-full"
          style={{
            width: `${pct}%`,
            // A partial total gets a faded, striped bar so it can't be read as
            // a confident measurement.
            background: partial
              ? `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)`
              : color,
            opacity: partial ? 0.6 : 1,
          }}
        />
      </span>
      <span
        className="text-[11px] tabular-nums w-[92px] text-right shrink-0"
        style={{ color: "var(--fg-muted)" }}
      >
        {Math.round(value).toLocaleString()}
        {partial && <span style={{ color: "var(--fg-dim)" }}>+</span>} /{" "}
        {target.toLocaleString()}
        {unit}
      </span>
    </div>
  );
}

/// Names the reason the numbers above are floors. Without this the card reads
/// as "you ate 4g of fiber today" when the truth is "the one item that was
/// two-thirds of your calories didn't say."
function MicroCaveat({ foods, dayKcal }: { foods: FoodRow[]; dayKcal: number }) {
  const silent = foods.filter((f) => !f.microsReported && f.kcal > 0);
  if (silent.length === 0 || dayKcal <= 0) return null;
  const silentKcal = silent.reduce((s, f) => s + f.kcal, 0);
  const share = Math.round((silentKcal / dayKcal) * 100);
  if (share < 10) return null;
  const biggest = silent.reduce((a, b) => (b.kcal > a.kcal ? b : a));

  return (
    <p
      className="text-[10px] mt-3 pt-2.5 leading-snug"
      style={{ borderTop: "1px solid var(--border)", color: "var(--fg-dim)" }}
    >
      {silent.length === 1 ? (
        <>
          <span style={{ color: "var(--fg-muted)" }}>{biggest.name}</span> didn&apos;t
          report these
        </>
      ) : (
        <>
          {silent.length} foods didn&apos;t report these, including{" "}
          <span style={{ color: "var(--fg-muted)" }}>{biggest.name}</span>
        </>
      )}{" "}
      — {share}% of today&apos;s calories. Treat the numbers above as minimums,
      not full counts.
    </p>
  );
}
