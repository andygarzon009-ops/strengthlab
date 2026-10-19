import { prisma } from "@/lib/db";
import type { DailyNutrition, FoodEntry } from "@/lib/googleHealth";
export { MEALS, mealForHour, type Meal } from "@/lib/meals";

export type FoodLogRow = {
  id: string;
  localDate: string;
  meal: string;
  name: string;
  portion: string | null;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number | null;
  photoUrl: string | null;
};

export async function listFoodLog(userId: string, sinceDate: string): Promise<FoodLogRow[]> {
  return prisma.foodLog.findMany({
    where: { userId, localDate: { gte: sinceDate } },
    select: {
      id: true,
      localDate: true,
      meal: true,
      name: true,
      portion: true,
      kcal: true,
      proteinG: true,
      carbsG: true,
      fatG: true,
      fiberG: true,
      photoUrl: true,
    },
    orderBy: { loggedAt: "asc" },
  });
}

/// Fold StrengthLab-logged foods into Google Health's per-day nutrition so
/// the Fuel score sees one intake. Own foods report macros (and fiber when
/// the estimate had it) but no other micros, so they add calories to the
/// macro check and nothing to micro coverage.
export function mergeFoodLog(
  days: DailyNutrition[],
  rows: FoodLogRow[],
): DailyNutrition[] {
  const byDate = new Map(days.map((d) => [d.date, { ...d, foods: [...d.foods], byMeal: { ...d.byMeal } }]));
  for (const r of rows) {
    const d =
      byDate.get(r.localDate) ??
      ({
        date: r.localDate,
        kcal: 0,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
        fiberG: 0,
        sugarG: 0,
        satFatG: 0,
        sodiumMg: 0,
        entries: 0,
        byMeal: {},
        foods: [],
        microCoverageKcal: { fiber: 0, sugar: 0, satFat: 0, sodium: 0 },
        macroUnreportedKcal: { protein: 0, carbs: 0, fat: 0 },
        macroEnergyKcal: 0,
      } satisfies DailyNutrition);
    d.kcal += r.kcal;
    d.proteinG += r.proteinG;
    d.carbsG += r.carbsG;
    d.fatG += r.fatG;
    if (r.fiberG != null) {
      d.fiberG += r.fiberG;
      d.microCoverageKcal = { ...d.microCoverageKcal, fiber: d.microCoverageKcal.fiber + r.kcal };
    }
    d.entries += 1;
    d.byMeal[r.meal] = (d.byMeal[r.meal] ?? 0) + r.kcal;
    d.macroEnergyKcal += 4 * r.proteinG + 4 * r.carbsG + 9 * r.fatG;
    const food: FoodEntry = {
      name: r.name,
      meal: r.meal,
      kcal: r.kcal,
      proteinG: r.proteinG,
      carbsG: r.carbsG,
      fatG: r.fatG,
      fiberG: r.fiberG ?? 0,
      sugarG: 0,
      satFatG: 0,
      sodiumMg: 0,
      servings: 1,
      microsReported: false,
    };
    d.foods.push(food);
    byDate.set(r.localDate, d);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
