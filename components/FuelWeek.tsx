"use client";

// The Fuel page body: a readiness-style hero for the selected day, then the
// week as stacked macro bars under each day's target, the macro split, the
// day's diary by meal, and fiber & the limits — charts in FuelCharts.tsx.
// Data is a live read (getFuelWeek): StrengthLab's own food log plus whatever
// Google Health has for the last seven local days.

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import TickGauge, { scaleColor } from "@/components/TickGauge";
import { CARBS, FAT, FIBER, FoodDiary, MacroPanel, MicroGrid, PROTEIN, WeekChart } from "@/components/FuelCharts";


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

// Progress isn't a verdict, so it gets its own neutral hue rather than borrowing
// the red→green rating scale. The grade takes over once the day closes.
const PROGRESS = "#38bdf8";

const RATING_COLOR: Record<string, string> = {
  "on track": "#22c55e",
  good: "#84cc16",
  "off target": "#f59e0b",
  "needs work": "#ef4444",
};

// Daily reference intakes for the nutrients that have no phase target.
const FIBER_TARGET_G = 30;
const SUGAR_LIMIT_G = 40;
const SODIUM_LIMIT_MG = 2300;


function weekdayName(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });
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
  children,
}: {
  days: FuelDayView[];
  today: string;
  calibration: Calibration | null;
  /// Rendered under the hero — the meal logger and today's entries.
  children?: ReactNode;
}) {
  const [selected, setSelected] = useState(today);
  const day = days.find((d) => d.date === selected) ?? days[days.length - 1];
  const isToday = day.date === today;
  // While the day is open we report progress toward the targets; only once it's
  // closed is there a result to grade.
  const inProgress = day.partial;

  const i = day.intake;
  const t = day.targets;


  const scoreColor = RATING_COLOR[day.score.rating] ?? "var(--fg-dim)";

  // Group the diary by meal, in eating order.

  return (
    <>
      <FuelHero
        day={day}
        isToday={isToday}
        scoreColor={scoreColor}
      />

      {children}

      {/* ── 7-day strip, stacked by macro ── */}
      <p className="label mb-2" style={{ color: "var(--fg-muted)" }}>
        This week
        <span
          className="float-right normal-case tracking-normal font-medium"
          style={{ color: "var(--fg-dim)" }}
        >
          tap a day · stacked by macro
        </span>
      </p>
      <div
        className="rounded-2xl px-3 pt-3 pb-3.5 mb-5"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)" }}
      >
        <WeekChart days={days} selected={day.date} onSelect={setSelected} />
      </div>

      {day.logged && (
        <>
          {/* ── macros ── */}
          <p className="label mb-2" style={{ color: "var(--fg-muted)" }}>Macros</p>
          <div
            className="rounded-2xl p-4 mb-4"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)" }}
          >
            <MacroPanel day={day} />

            <MacroReconcile intake={i} />
            {inProgress && <RoomLeft intake={i} targets={t} />}
          </div>

          {/* ── the diary — past days only. Today's foods are already listed,
              editable, under "Logged today" at the top. ── */}
          {!isToday && (
            <>
              <p className="label mb-2" style={{ color: "var(--fg-muted)" }}>
                {weekdayName(day.date)}&apos;s food
                <span
                  className="float-right normal-case tracking-normal font-medium tabular-nums"
                  style={{ color: "var(--fg-dim)" }}
                >
                  {i.entries} item{i.entries === 1 ? "" : "s"}
                </span>
              </p>
              <div
                className="rounded-2xl p-4 mb-4"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)" }}
              >
                <FoodDiary foods={i.foods} intake={i} />
              </div>
            </>
          )}

          {/* ── micronutrients ── */}
          <p className="label mb-2" style={{ color: "var(--fg-muted)" }}>Fiber &amp; the rest</p>
          <div
            className="rounded-2xl p-4 mb-5"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)" }}
          >
            <MicroGrid
              day={day}
              fiberTarget={FIBER_TARGET_G}
              sugarLimit={SUGAR_LIMIT_G}
              sodiumLimit={SODIUM_LIMIT_MG}
            />
            <MicroCaveat foods={i.foods} dayKcal={i.kcal} />
          </div>
        </>
      )}

      <p className="label mb-2" style={{ color: "var(--fg-muted)" }}>Your plan</p>
      <GoalCard targets={day.targets} calibration={calibration} />

      <Link
        href="/group?coach=1"
        className="flex items-center justify-center gap-2 w-full rounded-2xl py-3.5 text-[15px] font-semibold"
        style={{
          background: "linear-gradient(180deg, #34d36b 0%, #22c55e 100%)",
          color: "#06150b",
          boxShadow: "0 6px 24px -8px rgba(34,197,94,0.55)",
        }}
      >
        <Sparkles size={17} strokeWidth={2.2} />
        Ask your coach about your intake
      </Link>

      <div className="mb-8" />
    </>
  );
}

function MiniRing({ pct, color, label }: { pct: number; color: string; label: string }) {
  const r = 17;
  const circ = 2 * Math.PI * r;
  const f = (Math.max(0, Math.min(100, pct)) / 100) * circ;
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden>
      <circle cx="22" cy="22" r={r} fill="none" stroke="#26262b" strokeWidth="4.5" />
      {pct > 0 && (
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeDasharray={`${f} ${circ - f}`}
          transform="rotate(-90 22 22)"
        />
      )}
      <text
        x="22"
        y="26"
        textAnchor="middle"
        fontSize="11.5"
        fontWeight="700"
        fill="var(--fg)"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {label}
      </text>
    </svg>
  );
}

/// The readiness-style hero for the selected day: a big gauge with the Fuel
/// score (or, while the day is open, how much of the targets is in), the
/// verdict pill, one plain sentence, and three ring tiles.
function FuelHero({
  day,
  isToday,
  scoreColor,
}: {
  day: FuelDayView;
  isToday: boolean;
  scoreColor: string;
}) {
  const i = day.intake;
  const t = day.targets;
  const inProgress = day.partial;
  const value = !day.logged ? null : inProgress ? day.progress.pct : day.score.score;
  const tint = !day.logged ? "var(--fg-dim)" : inProgress ? PROGRESS : scoreColor;
  const glow =
    value == null ? "rgba(255,255,255,0.03)" : inProgress ? "rgba(56,189,248,0.1)" : scaleColor(value, 0.1);
  const pill = !day.logged
    ? "Nothing logged"
    : inProgress
      ? "In progress"
      : day.score.rating.charAt(0).toUpperCase() + day.score.rating.slice(1);
  const left = Math.max(0, t.calorieTargetKcal - i.kcal);
  const sentence = !day.logged
    ? isToday
      ? `Aim for ~${t.calorieTargetKcal.toLocaleString()} kcal and ${t.proteinTargetG} g protein today.`
      : "No food logged for this day."
    : inProgress
      ? `${i.kcal.toLocaleString()} of ${t.calorieTargetKcal.toLocaleString()} kcal in · ${left.toLocaleString()} to go`
      : `${i.kcal.toLocaleString()} kcal against a ${t.calorieTargetKcal.toLocaleString()} target · ${day.score.direction}`;
  const tiles = [
    {
      key: "Calories",
      pct: (i.kcal / Math.max(1, t.calorieTargetKcal)) * 100,
      color: "#22c55e",
      value: `${i.kcal.toLocaleString()}`,
      note: `of ${t.calorieTargetKcal.toLocaleString()}`,
    },
    {
      key: "Protein",
      pct: (i.proteinG / Math.max(1, t.proteinTargetG)) * 100,
      color: PROTEIN,
      value: `${Math.round(i.proteinG)} g`,
      note: `of ${t.proteinTargetG} g`,
    },
    {
      key: "Fiber",
      pct: (i.fiberG / FIBER_TARGET_G) * 100,
      color: FIBER,
      value: `${Math.round(i.fiberG)} g`,
      note: `of ${FIBER_TARGET_G} g`,
    },
  ];

  return (
    <section
      className="relative rounded-3xl px-5 pt-5 pb-5 mb-5 overflow-hidden"
      style={{
        background: `radial-gradient(140% 90% at 50% 0%, ${glow} 0%, transparent 55%), var(--bg-card)`,
        border: "1px solid var(--border-strong)",
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold" style={{ color: "var(--fg-muted)" }}>
          {isToday ? `Today · ${longDate(day.date)}` : longDate(day.date)}
        </p>
        <p className="text-[11px] font-semibold" style={{ color: "var(--fg-muted)" }}>
          {t.phaseLabel}
        </p>
      </div>

      <div className="relative -mt-1">
        <div className="flex justify-center">
          <TickGauge score={value} size={240} id="fuel-glow" tint={inProgress ? PROGRESS : undefined} />
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center pb-2">
          <span
            className="text-[11px] font-semibold uppercase"
            style={{ color: "var(--fg-muted)", letterSpacing: "0.16em" }}
          >
            {inProgress ? "Fuel so far" : "Fuel"}
          </span>
          <span
            className="text-[68px] font-bold leading-none tabular-nums mt-1"
            style={{ letterSpacing: "-0.04em", color: value == null ? "var(--fg-dim)" : "var(--fg)" }}
          >
            {value ?? "—"}
            {inProgress && value != null && (
              <span className="text-[28px]" style={{ color: "var(--fg-muted)" }}>%</span>
            )}
          </span>
        </div>
        <div className="absolute left-0 right-0 flex justify-center" style={{ bottom: 18 }}>
          <span
            className="text-[13px] font-bold px-3.5 py-1 rounded-full"
            style={{
              color: tint,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--border-strong)",
            }}
          >
            {pill}
          </span>
        </div>
      </div>

      <p
        className="text-[15px] leading-snug text-center max-w-[19rem] mx-auto -mt-1 tabular-nums"
        style={{ textWrap: "balance" }}
      >
        {sentence}
      </p>
      {day.logged && (
        <p className="text-[11px] text-center mt-1.5 tabular-nums" style={{ color: "var(--fg-muted)" }}>
          ~{t.maintenanceKcal.toLocaleString()} kcal burned
          {t.maintenanceSource === "observed" ? " (measured)" : " (estimated)"}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2 mt-5">
        {tiles.map((tl) => (
          <div
            key={tl.key}
            className="rounded-2xl py-3 px-2 flex flex-col items-center text-center"
            style={{ background: "var(--bg-elevated)" }}
          >
            <MiniRing
              pct={tl.pct}
              color={tl.color}
              label={`${Math.min(999, Math.round(tl.pct))}`}
            />
            <p className="text-[12px] font-semibold mt-1.5">{tl.key}</p>
            <p className="text-[12px] tabular-nums">{tl.value}</p>
            <p className="text-[11px] leading-tight tabular-nums" style={{ color: "var(--fg-muted)" }}>
              {tl.note}
            </p>
          </div>
        ))}
      </div>
    </section>
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
      style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)" }}
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





/// What's actually left to eat, as one budget rather than three. Each macro bar
/// above shows its own distance to target, and those distances don't reconcile
/// once a macro has gone over — the overage isn't deducted from the others, so
/// reading them as a shopping list overshoots the calorie target. This states
/// the reconciled version: protein first, then fat, then carbs take the rest.
function RoomLeft({
  intake,
  targets,
}: {
  intake: FuelDayView["intake"];
  targets: FuelDayView["targets"];
}) {
  const left = (have: number, target: number) => Math.max(0, target - have);
  const kcal = left(intake.kcal, targets.calorieTargetKcal);
  const protein = Math.min(
    left(intake.proteinG, targets.proteinTargetG),
    Math.floor(kcal / 4),
  );
  const fat = Math.min(
    left(intake.fatG, targets.fatTargetG),
    Math.floor(Math.max(0, kcal - protein * 4) / 9),
  );
  const carbs = Math.floor(Math.max(0, kcal - protein * 4 - fat * 9) / 4);
  const over = [
    intake.fatG > targets.fatTargetG ? "fat" : null,
    intake.carbsG > targets.carbTargetG ? "carbs" : null,
    intake.proteinG > targets.proteinTargetG ? "protein" : null,
  ].filter(Boolean) as string[];

  if (kcal <= 0) {
    return (
      <p className="text-[11px] mt-3 pt-2.5" style={{ borderTop: "1px solid var(--border)", color: "var(--fg-muted)" }}>
        You&apos;ve reached today&apos;s calorie target.
      </p>
    );
  }

  return (
    <div className="mt-3 pt-2.5" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
          Room left today
        </span>
        <span className="text-[12px] tabular-nums">
          <b>{kcal.toLocaleString()}</b>
          <span style={{ color: "var(--fg-dim)" }}> kcal</span>
          {" · "}
          <b style={{ color: PROTEIN }}>{protein}P</b>{" "}
          <b style={{ color: CARBS }}>{carbs}C</b>{" "}
          <b style={{ color: FAT }}>{fat}F</b>
        </span>
      </div>
      {over.length > 0 && (
        <p className="text-[10px] mt-1 leading-snug" style={{ color: "var(--fg-dim)" }}>
          Already over on {over.join(" and ")}, so the split above spends what&apos;s
          left rather than chasing every macro target.
        </p>
      )}
    </div>
  );
}

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
