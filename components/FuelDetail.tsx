"use client";

export type FuelTargetsData = {
  phase: string;
  phaseLabel: string;
  proteinTargetG: number;
  calorieTargetKcal: number;
  maintenanceKcal: number;
  phaseSet: boolean;
};
export type FuelScoreData = {
  score: number;
  rating: "on track" | "good" | "off target" | "needs work";
  proteinPct: number;
  caloriePct: number;
  netKcal: number;
  direction: string;
};
export type NutritionResponse = {
  connected: boolean;
  needsReconnect?: boolean;
  needsProfile?: boolean;
  date?: string;
  loggedToday?: boolean;
  intake?: {
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    entries: number;
    byMeal: Record<string, number>;
  };
  activeEnergyKcal?: number;
  targets?: FuelTargetsData;
  score?: FuelScoreData;
  /// True while today is still in progress — there's no grade yet, only
  /// progress toward the targets.
  partial?: boolean;
  progress?: { pct: number; proteinPct: number; caloriePct: number };
};

export const RATING_COLOR: Record<FuelScoreData["rating"], string> = {
  "on track": "#22c55e",
  good: "#84cc16",
  "off target": "#f59e0b",
  "needs work": "#ef4444",
};

const MEAL_META: { key: string; icon: string; label: string }[] = [
  { key: "BREAKFAST", icon: "☀️", label: "Breakfast" },
  { key: "LUNCH", icon: "🍽️", label: "Lunch" },
  { key: "DINNER", icon: "🌙", label: "Dinner" },
  { key: "SNACK", icon: "🍎", label: "Snack" },
  { key: "OTHER", icon: "🍴", label: "Other" },
];

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 rounded-full mt-1" style={{ background: "var(--border)" }}>
      <div
        className="h-1.5 rounded-full"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }}
      />
    </div>
  );
}

/// Presentational body of the Fuel Score — protein/calorie progress bars,
/// net-vs-burned line, and the meal breakdown. No ring/header/collapse so it can
/// be reused inside the Daily Glance accordion. Handles the no-profile /
/// nothing-logged states too.
export default function FuelDetail({ data }: { data: NutritionResponse }) {
  if (data.needsProfile) {
    return (
      <p className="text-[13px]" style={{ color: "var(--fg-dim)" }}>
        Add your bodyweight and training phase in your profile to unlock the Fuel
        Score — your goal-based calorie and protein targets.
      </p>
    );
  }

  const t = data.targets!;
  if (!data.loggedToday) {
    return (
      <p className="text-[13px]" style={{ color: "var(--fg-dim)" }}>
        No food logged in Google Health yet today. Your target is{" "}
        <span style={{ color: "var(--fg)" }}>{t.proteinTargetG}g protein</span> and{" "}
        <span style={{ color: "var(--fg)" }}>~{t.calorieTargetKcal.toLocaleString()} kcal</span>.
      </p>
    );
  }

  const s = data.score!;
  const i = data.intake!;
  const color = RATING_COLOR[s.rating];
  const meals = MEAL_META.filter((m) => (i.byMeal[m.key] ?? 0) > 0);

  return (
    <>
      <p
        className="text-[13px] mb-3"
        style={{ color: data.partial ? "var(--fg-muted)" : color }}
      >
        {data.partial && data.progress
          ? `${data.progress.pct}% of today's targets logged`
          : s.direction}
      </p>
      <div className="space-y-3">
        <div>
          <div className="flex items-baseline justify-between text-[13px]">
            <span style={{ color: "var(--fg-dim)" }}>Protein</span>
            <span className="tabular-nums">
              <span style={{ color: "var(--fg)", fontWeight: 600 }}>{i.proteinG}</span>
              <span style={{ color: "var(--fg-dim)" }}> / {t.proteinTargetG}g</span>
            </span>
          </div>
          <Bar pct={s.proteinPct} color={color} />
        </div>

        <div>
          <div className="flex items-baseline justify-between text-[13px]">
            <span style={{ color: "var(--fg-dim)" }}>Calories</span>
            <span className="tabular-nums">
              <span style={{ color: "var(--fg)", fontWeight: 600 }}>{i.kcal.toLocaleString()}</span>
              <span style={{ color: "var(--fg-dim)" }}> / {t.calorieTargetKcal.toLocaleString()} kcal</span>
            </span>
          </div>
          <Bar
            pct={Math.min(100, Math.round((i.kcal / Math.max(1, t.calorieTargetKcal)) * 100))}
            color={color}
          />
          <p className="text-[11px] mt-1 tabular-nums" style={{ color: "var(--fg-dim)" }}>
            {s.netKcal >= 0 ? "+" : "−"}
            {Math.abs(s.netKcal).toLocaleString()} kcal vs ~{t.maintenanceKcal.toLocaleString()} burned · carbs {i.carbsG}g · fat {i.fatG}g
          </p>
        </div>
      </div>

      {meals.length > 0 && (
        <div
          className="mt-3 pt-3 flex flex-wrap gap-x-4 gap-y-1.5"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          {meals.map((m) => (
            <span key={m.key} className="text-[12px] tabular-nums">
              {m.icon} {m.label}{" "}
              <span style={{ color: "var(--fg-dim)" }}>
                {Math.round(i.byMeal[m.key]).toLocaleString()}
              </span>
            </span>
          ))}
        </div>
      )}
    </>
  );
}
