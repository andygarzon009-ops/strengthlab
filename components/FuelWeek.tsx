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
  };
  activeEnergyKcal: number;
  targets: {
    phaseLabel: string;
    proteinTargetG: number;
    carbTargetG: number;
    fatTargetG: number;
    calorieTargetKcal: number;
    maintenanceKcal: number;
  };
  score: { score: number; rating: string; netKcal: number; direction: string };
};

const PROTEIN = "#a78bfa";
const CARBS = "#38bdf8";
const FAT = "#fbbf24";
const FIBER = "#2dd4bf";

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

export default function FuelWeek({
  days,
  today,
}: {
  days: FuelDayView[];
  today: string;
}) {
  const [selected, setSelected] = useState(today);
  const day = days.find((d) => d.date === selected) ?? days[days.length - 1];
  const isToday = day.date === today;

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
                  style={{ color: d.logged ? (on ? c : "var(--fg-dim)") : "var(--fg-dim)" }}
                >
                  {d.logged ? d.score.score : "—"}
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
            <Ring score={day.score.score} color={scoreColor} partial={isToday} />
            <div className="min-w-0">
              <p className="text-[22px] font-bold tabular-nums leading-none">
                {i.kcal.toLocaleString()}
                <span className="text-[13px] font-normal" style={{ color: "var(--fg-dim)" }}>
                  {" "}
                  / {t.calorieTargetKcal.toLocaleString()} kcal
                </span>
              </p>
              <p className="text-[12px] mt-1.5" style={{ color: scoreColor }}>
                {isToday ? "So far today" : day.score.rating} · {day.score.direction}
              </p>
              <p className="text-[11px] mt-1 tabular-nums" style={{ color: "var(--fg-dim)" }}>
                {Math.max(0, t.calorieTargetKcal - i.kcal).toLocaleString()} kcal left ·
                ~{t.maintenanceKcal.toLocaleString()} burned
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
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <span className="text-[13px] font-bold tracking-tight">
                      {m.icon} {m.label}
                    </span>
                    <span
                      className="ml-auto text-[11px] tabular-nums"
                      style={{ color: "var(--fg-dim)" }}
                    >
                      {sum.kcal.toLocaleString()} ·{" "}
                      <b style={{ color: PROTEIN }}>{sum.p}P</b>{" "}
                      <b style={{ color: CARBS }}>{sum.c}C</b>{" "}
                      <b style={{ color: FAT }}>{sum.f}F</b>
                    </span>
                  </div>
                  <MacroHead />
                  {foods.map((f, fi) => (
                    <FoodLine key={`${f.name}-${fi}`} food={f} />
                  ))}
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
            <Micro label="Fiber" value={i.fiberG} target={FIBER_TARGET_G} unit="g" color={FIBER} />
            <Micro label="Sugar" value={i.sugarG} target={SUGAR_LIMIT_G} unit="g" color={CARBS} />
            <Micro label="Sat. fat" value={i.satFatG} target={Math.round((t.calorieTargetKcal * 0.06) / 9)} unit="g" color={FAT} />
            <Micro label="Sodium" value={i.sodiumMg} target={SODIUM_LIMIT_MG} unit="mg" color="var(--fg-muted)" last />
          </div>
        </>
      )}

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

function Ring({
  score,
  color,
  partial,
}: {
  score: number;
  color: string;
  partial: boolean;
}) {
  const r = 32;
  const c = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * c;
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
        <span className="text-[22px] font-bold leading-none tabular-nums">{score}</span>
        <span className="text-[9px] mt-0.5" style={{ color: "var(--fg-dim)" }}>
          {partial ? "so far" : "/ 100"}
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
      <span className="text-right" style={{ color: PROTEIN }}>P</span>
      <span className="text-right" style={{ color: CARBS }}>C</span>
      <span className="text-right" style={{ color: FAT }}>F</span>
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

function Micro({
  label,
  value,
  target,
  unit,
  color,
  last,
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
  color: string;
  last?: boolean;
}) {
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
          style={{ width: `${pct}%`, background: color }}
        />
      </span>
      <span
        className="text-[11px] tabular-nums w-[86px] text-right shrink-0"
        style={{ color: "var(--fg-muted)" }}
      >
        {Math.round(value).toLocaleString()} / {target.toLocaleString()}
        {unit}
      </span>
    </div>
  );
}
