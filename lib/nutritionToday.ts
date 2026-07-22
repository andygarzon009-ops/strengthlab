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

/// Computes the athlete's goal-aware Fuel Score for *their* local today —
/// today's logged intake from Google Health vs phase-based targets. Shared by
/// the Health page API route and the AI coach so they agree. Live read; tolerant
/// of a missing connection / dead token / unfilled profile via the state union.
export async function getTodayFuel(userId: string): Promise<TodayFuel> {
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
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const sinceCivil = `${today}T00:00:00`;

  const [days, activeByDay] = await Promise.all([
    getDailyNutrition(userId, sinceCivil),
    getActiveEnergyByDay(userId, sinceCivil),
  ]);

  const today_ = days.find((d) => d.date === today) ?? null;
  const activeEnergyKcal = activeByDay[today] ?? 0;

  const age = user.birthDate
    ? Math.floor(
        (Date.now() - user.birthDate.getTime()) / (365.25 * 24 * 3600 * 1000),
      )
    : null;

  const targets = fuelTargets({
    rawPhase: user.trainingPhase,
    bodyweightLb: user.bodyweight,
    heightIn: user.height ?? null,
    age,
    sex: user.sex ?? null,
    activeEnergyKcal,
  });

  const intake: TodayIntake = {
    kcal: today_?.kcal ?? 0,
    proteinG: today_?.proteinG ?? 0,
    carbsG: today_?.carbsG ?? 0,
    fatG: today_?.fatG ?? 0,
    fiberG: today_?.fiberG ?? 0,
    sugarG: today_?.sugarG ?? 0,
    satFatG: today_?.satFatG ?? 0,
    sodiumMg: today_?.sodiumMg ?? 0,
    entries: today_?.entries ?? 0,
    byMeal: today_?.byMeal ?? {},
    foods: today_?.foods ?? [],
  };

  const score = fuelScore({
    targets,
    intakeKcal: intake.kcal,
    proteinG: intake.proteinG,
  });

  return {
    state: "ok",
    date: today,
    loggedToday: intake.entries > 0,
    intake,
    activeEnergyKcal,
    targets,
    score,
  };
}
