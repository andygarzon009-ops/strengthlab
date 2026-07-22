import { prisma } from "@/lib/db";
import {
  checkHealthAuth,
  getDailyNutrition,
  getActiveEnergyByDay,
  listDailyWeights,
  type FoodEntry,
} from "@/lib/googleHealth";
import {
  fuelTargets,
  fuelScore,
  fuelProgress,
  dayIsOver,
  observedMaintenance,
  type FuelTargets,
  type FuelScore,
  type FuelProgress,
  type MaintenanceCalibration,
} from "@/lib/nutritionScore";

/// How far back to look when solving maintenance from intake vs weight trend.
/// Long enough for a 0.25%/week trend to clear scale noise, short enough to
/// still describe the athlete's current metabolism and habits.
const CALIBRATION_DAYS = 28;

export type TodayIntake = {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  satFatG: number;
  sodiumMg: number;
  entries: number;
  byMeal: Record<string, number>;
  foods: FoodEntry[];
  microCoverageKcal: { fiber: number; sugar: number; satFat: number; sodium: number };
  macroUnreportedKcal: { protein: number; carbs: number; fat: number };
  macroEnergyKcal: number;
};

export type TodayFuel =
  | { state: "no-account" }
  | { state: "reconnect" }
  | { state: "no-nutrition-scope" }
  | { state: "no-profile" }
  | {
      state: "ok";
      date: string;
      loggedToday: boolean;
      partial: boolean; // score is a pace score — the day isn't over
      intake: TodayIntake;
      activeEnergyKcal: number;
      targets: FuelTargets;
      score: FuelScore;
      progress: FuelProgress;
    };

/// One scored day of fuel — the same shape for today and for any day behind it.
export type FuelDay = {
  date: string; // local YYYY-MM-DD
  logged: boolean;
  /// True while the day is still in progress. `score` is only meaningful once
  /// this is false — until then the day is described by `progress`.
  partial: boolean;
  intake: TodayIntake;
  activeEnergyKcal: number;
  targets: FuelTargets;
  score: FuelScore;
  progress: FuelProgress;
};

export type FuelWeek =
  | { state: "no-account" }
  | { state: "reconnect" }
  | { state: "no-nutrition-scope" }
  | { state: "no-profile" }
  | {
      state: "ok";
      today: string;
      days: FuelDay[]; // oldest → newest, today last
      /// Non-null when maintenance was solved from real intake + weight data
      /// rather than estimated from the BMR formula.
      calibration: MaintenanceCalibration | null;
    };

/// Computes the athlete's goal-aware Fuel Score for *their* local today —
/// today's logged intake from Google Health vs phase-based targets. Shared by
/// the Health page API route and the AI coach so they agree. Live read; tolerant
/// of a missing connection / dead token / unfilled profile via the state union.
/// Thin wrapper over getFuelWeek so today's numbers can never drift from the
/// week's.
export async function getTodayFuel(userId: string): Promise<TodayFuel> {
  const week = await getFuelWeek(userId);
  if (week.state !== "ok") return week;
  const today = week.days[week.days.length - 1];
  return {
    state: "ok",
    date: today.date,
    loggedToday: today.logged,
    partial: today.partial,
    intake: today.intake,
    activeEnergyKcal: today.activeEnergyKcal,
    targets: today.targets,
    score: today.score,
    progress: today.progress,
  };
}

/// The last 7 local days of intake, each scored against that day's own targets
/// (active energy moves the calorie target day to day, so a training day and a
/// rest day are not graded the same). Days with nothing logged are still
/// present, flagged `logged: false`, so the UI can render a gap as a gap rather
/// than as a zero. One nutrition-log call covers the whole window.
export async function getFuelWeek(
  userId: string,
  daysBack = 6,
): Promise<FuelWeek> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      timezone: true,
      bodyweight: true,
      height: true,
      sex: true,
      birthDate: true,
      trainingPhase: true,
    },
  });

  const account = await prisma.healthAccount.findUnique({ where: { userId } });
  if (!account) return { state: "no-account" };

  const auth = await checkHealthAuth(userId);
  if (auth.needsReconnect) return { state: "reconnect" };

  // The nutrition scope was added after the first users connected, and Google
  // only grants it on re-consent. Their tokens are perfectly valid, so the
  // nutrition-log call just 403s and gets swallowed into an empty day — which
  // renders as "nothing logged" and would never resolve itself, no matter how
  // diligently they logged food. Detect it and say what's actually wrong.
  if (!account.scope.includes("googlehealth.nutrition"))
    return { state: "no-nutrition-scope" };

  if (user?.bodyweight == null || user.bodyweight <= 0)
    return { state: "no-profile" };

  const tz = user.timezone ?? "UTC";
  const localKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);

  const now = new Date();
  const today = localKey(now);
  // Walk back in whole days from now. Local-date arithmetic on UTC instants is
  // safe here because we re-derive each key through the user's timezone.
  const window: string[] = [];
  for (let i = daysBack; i >= 0; i--) {
    window.push(localKey(new Date(now.getTime() - i * 86_400_000)));
  }
  // The nutrition window is widened to the calibration span and the display
  // week sliced out of it, so solving maintenance costs no extra API call.
  // Active energy stays on the short window — it arrives per-minute, and a
  // month of it would be tens of thousands of points to page through.
  const calibrationStart = localKey(
    new Date(now.getTime() - CALIBRATION_DAYS * 86_400_000),
  );
  const sinceCivil = `${calibrationStart}T00:00:00`;
  const sinceShort = `${window[0]}T00:00:00`;
  const weightSinceISO = new Date(
    now.getTime() - CALIBRATION_DAYS * 86_400_000,
  ).toISOString();

  // Local clock time, used to grade today on pace rather than as a finished day.
  const hm = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const [nowH, nowM] = hm.split(":").map(Number);
  const todayIsOver = dayIsOver(nowH, nowM);

  const [days, activeByDay, weights] = await Promise.all([
    getDailyNutrition(userId, sinceCivil),
    getActiveEnergyByDay(userId, sinceShort),
    listDailyWeights(userId, weightSinceISO),
  ]);
  const byDate = new Map(days.map((d) => [d.date, d]));

  // Solve maintenance from what actually happened. Today is excluded — it's
  // half-eaten, and averaging a partial day in would drag the estimate down.
  const calibration = observedMaintenance({
    intakeByDay: days
      .filter((d) => d.date !== today)
      .map((d) => ({ date: d.date, kcal: d.kcal })),
    weightByDay: weights,
    bodyweightLb: user.bodyweight,
    windowDays: CALIBRATION_DAYS,
  });

  const age = user.birthDate
    ? Math.floor(
        (Date.now() - user.birthDate.getTime()) / (365.25 * 24 * 3600 * 1000),
      )
    : null;

  // Today's active energy is only counted up to now, so using it raw would make
  // today's calorie target climb all afternoon — and a target that grows while
  // you sit still makes the percentage of it you've eaten go *down*. Project
  // today's burn from the recent days instead, and only let the live figure win
  // once it has already exceeded that (a genuinely big training day).
  const priorActive = window
    .filter((d) => d !== today)
    .map((d) => activeByDay[d] ?? 0)
    .filter((v) => v > 0);
  const typicalActive = priorActive.length
    ? Math.round(priorActive.reduce((s, v) => s + v, 0) / priorActive.length)
    : 0;

  const scored: FuelDay[] = window.map((date) => {
    const d = byDate.get(date) ?? null;
    const actualActive = activeByDay[date] ?? 0;
    const activeEnergyKcal =
      date === today && !todayIsOver
        ? Math.max(actualActive, typicalActive)
        : actualActive;

    // Targets are recomputed per day: active energy raises maintenance, so a
    // heavy training day earns a higher calorie target than a rest day.
    const targets = fuelTargets({
      rawPhase: user.trainingPhase,
      bodyweightLb: user.bodyweight!,
      heightIn: user.height ?? null,
      age,
      sex: user.sex ?? null,
      activeEnergyKcal,
      observedMaintenanceKcal: calibration?.maintenanceKcal ?? null,
    });

    const intake: TodayIntake = {
      kcal: d?.kcal ?? 0,
      proteinG: d?.proteinG ?? 0,
      carbsG: d?.carbsG ?? 0,
      fatG: d?.fatG ?? 0,
      fiberG: d?.fiberG ?? 0,
      sugarG: d?.sugarG ?? 0,
      satFatG: d?.satFatG ?? 0,
      sodiumMg: d?.sodiumMg ?? 0,
      entries: d?.entries ?? 0,
      byMeal: d?.byMeal ?? {},
      foods: d?.foods ?? [],
      microCoverageKcal:
        d?.microCoverageKcal ?? { fiber: 0, sugar: 0, satFat: 0, sodium: 0 },
      macroUnreportedKcal:
        d?.macroUnreportedKcal ?? { protein: 0, carbs: 0, fat: 0 },
      macroEnergyKcal: d?.macroEnergyKcal ?? 0,
    };

    return {
      date,
      logged: intake.entries > 0,
      partial: date === today && !todayIsOver,
      intake,
      activeEnergyKcal,
      targets,
      score: fuelScore({
        targets,
        intakeKcal: intake.kcal,
        proteinG: intake.proteinG,
      }),
      progress: fuelProgress({
        targets,
        intakeKcal: intake.kcal,
        proteinG: intake.proteinG,
      }),
    };
  });

  return { state: "ok", today, days: scored, calibration };
}
