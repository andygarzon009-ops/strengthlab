import { prisma } from "@/lib/db";
import type { DailyNutrition, FoodEntry } from "@/lib/googleHealth";
import { mealSig } from "@/lib/meals";
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
  /// Foods saved together share it — that's what makes them one meal.
  createdAt: Date;
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
      createdAt: true,
    },
    orderBy: { loggedAt: "asc" },
  });
}

/// For each meal type logged today that is one meal of several foods: its
/// signature and given name, so Next meal can call it by that name.
export function loggedMealIds(
  rows: FoodLogRow[],
  names: Record<string, string>,
): Record<string, { sig: string; name: string | null }> {
  const byType = new Map<string, Map<number, string[]>>();
  for (const r of rows) {
    const saves = byType.get(r.meal) ?? byType.set(r.meal, new Map()).get(r.meal)!;
    const k = r.createdAt.getTime();
    (saves.get(k) ?? saves.set(k, []).get(k)!).push(r.name);
  }
  const out: Record<string, { sig: string; name: string | null }> = {};
  for (const [meal, saves] of byType) {
    const groups = [...saves.values()];
    if (groups.length !== 1 || groups[0].length < 2) continue;
    const sig = mealSig(groups[0]);
    out[meal] = { sig, name: names[sig] ?? null };
  }
  return out;
}

/// Names the athlete gave the meals in `rows` (multi-food saves only), by
/// meal signature.
export async function mealNamesFor(userId: string, rows: FoodLogRow[]): Promise<Record<string, string>> {
  const saves = new Map<number, string[]>();
  for (const r of rows) {
    const k = r.createdAt.getTime();
    (saves.get(k) ?? saves.set(k, []).get(k)!).push(r.name);
  }
  const sigs = [...saves.values()].filter((names) => names.length > 1).map(mealSig);
  if (sigs.length === 0) return {};
  const names = await prisma.mealName.findMany({
    where: { userId, sig: { in: sigs }, NOT: { title: "" } },
    select: { sig: true, title: true },
  });
  return Object.fromEntries(names.map((n) => [n.sig, n.title]));
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

const SNACK_SIZED_KCAL = 350;

export type RecentMeal = {
  /// The meal's food signature: sorted lowercase food names joined by "|".
  key: string;
  title: string;
  /// The title is one the athlete gave it (see MealName).
  named?: boolean;
  /// The meal it's usually logged as, so the re-log list can group by meal.
  meal: string;
  items: {
    name: string;
    portion: string;
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number | null;
  }[];
  kcal: number;
  photoUrl: string | null;
  times: number;
  lastDate: string;
  /// When it was last saved — a meal swiped away before this is back.
  lastAt?: Date;
};

/// Meals logged lately, for one-tap re-logging. A "meal" is one save — the
/// foods written together share a createdAt — and the same set of foods
/// eaten again collapses into one entry, ranked by how often then how
/// recently it was eaten.
export async function listRecentMeals(userId: string, limit = 8): Promise<RecentMeal[]> {
  const since = new Date(Date.now() - 45 * 86_400_000);
  const rows = await prisma.foodLog.findMany({
    where: { userId, createdAt: { gte: since } },
    select: {
      createdAt: true,
      meal: true,
      localDate: true,
      name: true,
      portion: true,
      kcal: true,
      proteinG: true,
      carbsG: true,
      fatG: true,
      fiberG: true,
      photoUrl: true,
    },
    orderBy: { createdAt: "desc" },
    take: 600,
  });

  const saves = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = `${r.createdAt.getTime()}|${r.meal}`;
    (saves.get(k) ?? saves.set(k, []).get(k)!).push(r);
  }

  const byFoods = new Map<string, RecentMeal>();
  // How often each set of foods was logged as each meal; the commonest wins.
  const mealTally = new Map<string, Map<string, number>>();
  for (const list of saves.values()) {
    const sig = mealSig(list.map((r) => r.name));
    const tally = mealTally.get(sig) ?? mealTally.set(sig, new Map()).get(sig)!;
    tally.set(list[0].meal, (tally.get(list[0].meal) ?? 0) + 1);
    const seen = byFoods.get(sig);
    if (seen) {
      seen.times += 1;
      continue;
    }
    // Biggest item names the meal.
    const lead = [...list].sort((a, b) => b.kcal - a.kcal)[0];
    byFoods.set(sig, {
      key: sig,
      title: list.length > 1 ? `${lead.name} +${list.length - 1}` : lead.name,
      meal: list[0].meal,
      items: list.map((r) => ({
        name: r.name,
        portion: r.portion ?? "",
        kcal: r.kcal,
        proteinG: r.proteinG,
        carbsG: r.carbsG,
        fatG: r.fatG,
        fiberG: r.fiberG,
      })),
      kcal: Math.round(list.reduce((s, r) => s + r.kcal, 0)),
      photoUrl: list.find((r) => r.photoUrl)?.photoUrl ?? null,
      times: 1,
      lastDate: list[0].localDate,
      lastAt: list[0].createdAt,
    });
  }

  for (const [sig, m] of byFoods) {
    const tally = mealTally.get(sig)!;
    // The logger labels by the clock, so a handful of dates eaten at noon
    // comes in as "lunch". Anything that small is a snack whatever the label.
    m.meal =
      m.kcal < SNACK_SIZED_KCAL
        ? "SNACK"
        : [...tally.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  }

  // Meals swiped away and not eaten since don't come back.
  const hidden = await prisma.mealName.findMany({
    where: { userId, hiddenAt: { not: null } },
    select: { sig: true, hiddenAt: true },
  });
  const hiddenAt = new Map(hidden.map((h) => [h.sig, h.hiddenAt!]));
  const top = [...byFoods.values()]
    .filter((m) => {
      const at = hiddenAt.get(m.key);
      return !at || (m.lastAt != null && m.lastAt > at);
    })
    .sort((a, b) => b.times - a.times || b.lastDate.localeCompare(a.lastDate))
    .slice(0, limit);
  const names = await prisma.mealName.findMany({
    where: { userId, sig: { in: top.map((m) => m.key) }, NOT: { title: "" } },
    select: { sig: true, title: true },
  });
  const nameOf = new Map(names.map((n) => [n.sig, n.title]));
  for (const m of top) {
    const t = nameOf.get(m.key);
    if (t) {
      m.title = t;
      m.named = true;
    }
    delete m.lastAt;
  }
  return top;
}
