"use client";

import { useEffect, useState } from "react";

type Targets = {
  phase: string;
  phaseLabel: string;
  proteinTargetG: number;
  calorieTargetKcal: number;
  maintenanceKcal: number;
  phaseSet: boolean;
};
type Score = {
  score: number;
  rating: "on track" | "good" | "off target" | "needs work";
  proteinPct: number;
  caloriePct: number;
  netKcal: number;
  direction: string;
};
type NutritionResponse = {
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
  targets?: Targets;
  score?: Score;
};

const RATING_COLOR: Record<Score["rating"], string> = {
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

function Ring({ score, color }: { score: number; color: string }) {
  const r = 42;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - Math.max(0, Math.min(100, score)) / 100);
  return (
    <svg width="104" height="104" viewBox="0 0 104 104">
      <circle cx="52" cy="52" r={r} fill="none" stroke="var(--border)" strokeWidth="8" />
      <circle
        cx="52"
        cy="52"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={off}
        transform="rotate(-90 52 52)"
      />
      <text x="52" y="49" textAnchor="middle" fontSize="26" fontWeight="700" fill="var(--fg)">
        {score}
      </text>
      <text x="52" y="66" textAnchor="middle" fontSize="10" fill="var(--fg-dim)">
        / 100
      </text>
    </svg>
  );
}

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

/// Goal-aware daily "Fuel Score" on the Health page. Pulls today's logged food
/// from Google Health and scores it against the athlete's trainingPhase
/// (protein target + calorie direction). Renders nothing when Health isn't
/// connected so the page stays clean for un-synced users.
export default function NutritionScoreCard() {
  const [data, setData] = useState<NutritionResponse | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/health/nutrition", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: NutritionResponse | null) => active && setData(d))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!data || !data.connected || data.needsReconnect) return null;

  if (data.needsProfile) {
    return (
      <div className="mb-5">
        <p className="label mb-2">Nutrition</p>
        <div
          className="rounded-xl p-4 text-[13px]"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--fg-dim)" }}
        >
          Add your bodyweight and training phase in your profile to unlock the
          Fuel Score — your goal-based calorie and protein targets.
        </div>
      </div>
    );
  }

  const t = data.targets!;
  const s = data.score!;
  const i = data.intake!;
  const color = RATING_COLOR[s.rating];
  const meals = MEAL_META.filter((m) => (i.byMeal[m.key] ?? 0) > 0);

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <p className="label">Fuel Score</p>
        <span
          className="text-[11px] px-2 py-0.5 rounded-full"
          style={{ background: "var(--accent-dim)", color: "var(--accent)" }}
        >
          🎯 {t.phaseLabel}
        </span>
      </div>

      <div
        className="rounded-xl p-4"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        {!data.loggedToday ? (
          <p className="text-[13px]" style={{ color: "var(--fg-dim)" }}>
            No food logged in Google Health yet today. Your target is{" "}
            <span style={{ color: "var(--fg)" }}>{t.proteinTargetG}g protein</span> and{" "}
            <span style={{ color: "var(--fg)" }}>~{t.calorieTargetKcal.toLocaleString()} kcal</span>.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-4">
              <Ring score={s.score} color={color} />
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold" style={{ color }}>
                  {s.rating}
                </p>
                <p className="text-[12px] mt-0.5" style={{ color: "var(--fg-dim)" }}>
                  {s.direction}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
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
                    <span style={{ color: "var(--fg)", fontWeight: 600 }}>
                      {i.kcal.toLocaleString()}
                    </span>
                    <span style={{ color: "var(--fg-dim)" }}>
                      {" "}/ {t.calorieTargetKcal.toLocaleString()} kcal
                    </span>
                  </span>
                </div>
                <Bar pct={s.caloriePct} color={color} />
                <p className="text-[11px] mt-1 tabular-nums" style={{ color: "var(--fg-dim)" }}>
                  {s.netKcal >= 0 ? "+" : "−"}
                  {Math.abs(s.netKcal).toLocaleString()} kcal vs ~
                  {t.maintenanceKcal.toLocaleString()} burned · carbs {i.carbsG}g · fat {i.fatG}g
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
        )}
      </div>
    </div>
  );
}
