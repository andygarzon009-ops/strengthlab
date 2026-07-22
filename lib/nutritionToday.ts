import { prisma } from "@/lib/db";
import {
  checkHealthAuth,
  getDailyNutrition,
  getActiveEnergyByDay,
  type FoodEntry,
} from "@/lib/googleHealth";
import {
  fuelTargets,
  fuelScore,
  type FuelTargets,
  type FuelScore,
} from "@/lib/nutritionScore";

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
};

export type TodayFuel =
  | { state: "no-account" }
  | { state: "reconnect" }
  | { state: "no-profile" }
  | {
      state: "ok";
      date: string;
      loggedToday: boolean;
      intake: TodayIntake;
      activeEnergyKcal: number;
      targets: FuelTargets;
      score: FuelScore;
    };

/// One scored day of fuel — the same shape for today and for any day behind it.
export type FuelDay = {
  date: string; // local YYYY-MM-DD
  logged: boolean;
  intake: TodayIntake;
  activeEnergyKcal: number;
  targets: FuelTargets;
  score: FuelScore;
};

export type FuelWeek =
  | { state: "no-account" }
  | { state: "reconnect" }
  | { state: "no-profile" }
  | { state: "ok"; today: string; days: FuelDay[] }; // oldest → newest, today last

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
    intake: today.intake,
    activeEnergyKcal: today.activeEnergyKcal,
    targets: today.targets,
    score: today.score,
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
  const sinceCivil = `${window[0]}T00:00:00`;

  const [days, activeByDay] = await Promise.all([
    getDailyNutrition(userId, sinceCivil),
    getActiveEnergyByDay(userId, sinceCivil),
  ]);
  const byDate = new Map(days.map((d) => [d.date, d]));

  const age = user.birthDate
    ? Math.floor(
        (Date.now() - user.birthDate.getTime()) / (365.25 * 24 * 3600 * 1000),
      )
    : null;

  const scored: FuelDay[] = window.map((date) => {
    const d = byDate.get(date) ?? null;
    const activeEnergyKcal = activeByDay[date] ?? 0;

    // Targets are recomputed per day: active energy raises maintenance, so a
    // heavy training day earns a higher calorie target than a rest day.
    const targets = fuelTargets({
      rawPhase: user.trainingPhase,
      bodyweightLb: user.bodyweight!,
      heightIn: user.height ?? null,
      age,
      sex: user.sex ?? null,
      activeEnergyKcal,
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
    };

    return {
      date,
      logged: intake.entries > 0,
      intake,
      activeEnergyKcal,
      targets,
      score: fuelScore({
        targets,
        intakeKcal: intake.kcal,
        proteinG: intake.proteinG,
      }),
    };
  });

  return { state: "ok", today, days: scored };
}
