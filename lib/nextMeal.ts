// Which meal is next and how big it should be. What's left of the day is
// shared across the main meals still to come (plus a little held back for a
// snack), so at lunch the suggestion is a lunch, not the rest of the day's
// calories in one sitting. Once the main meals are in, whatever is still
// short of the target becomes snacks sized to close it.
import { mealForHour, type Meal } from "@/lib/meals";
import type { RoomLeft } from "@/lib/roomLeft";

const MAINS: Meal[] = ["BREAKFAST", "LUNCH", "DINNER"];
// Share of a day's eating each main meal usually takes.
const WEIGHT: Record<string, number> = { BREAKFAST: 0.28, LUNCH: 0.34, DINNER: 0.38 };
const SNACK_RESERVE = 0.1;
// One snack tops out here; a bigger gap is "about 2 snacks like these".
const SNACK_MAX_KCAL = 600;
// No one meal should be more than this multiple of its usual share of the
// day, however much is left — a light day doesn't become a 2,000 kcal dinner.
const MAX_OF_SHARE = 1.25;

export type NextMealPlan = {
  meal: Meal;
  /// What this one meal or snack should come to.
  budget: RoomLeft;
  /// After the main meals: how many snacks of `budget` size close the gap.
  snacksToClose: number | null;
};

/// `logged` holds the meal types already logged today. A main meal that's
/// already in moves the suggestion on to the next one; once dinner is in (or
/// it's late) the suggestion is a snack.
export function planNextMeal(
  room: RoomLeft,
  hour: number,
  logged: Set<string>,
  dayTargetKcal: number,
): NextMealPlan {
  const now = mealForHour(hour);
  // Between meals (mid-afternoon, late night) the hour maps to SNACK; the next
  // main meal is whichever comes after this hour.
  const fromIdx = now === "SNACK" ? (hour < 17 && hour >= 15 ? 2 : 3) : MAINS.indexOf(now);
  const ahead = MAINS.slice(fromIdx).filter((m) => !logged.has(m));
  const scale = (f: number): RoomLeft => ({
    kcal: Math.round(room.kcal * f),
    proteinG: Math.round(room.proteinG * f),
    carbsG: Math.round(room.carbsG * f),
    fatG: Math.round(room.fatG * f),
  });

  if (ahead.length === 0) {
    // The main meals are in; close the gap with as few snacks as fit, each
    // an even share so together they land on the target.
    const snacks = Math.max(1, Math.ceil(room.kcal / SNACK_MAX_KCAL));
    return { meal: "SNACK", budget: scale(1 / snacks), snacksToClose: snacks };
  }
  const next = ahead[0];
  const total = ahead.reduce((s, m) => s + WEIGHT[m], 0);
  // The last main meal of the day gets everything that's left.
  const share = ahead.length === 1 ? 1 : (WEIGHT[next] / total) * (1 - SNACK_RESERVE);
  const cap = (dayTargetKcal * WEIGHT[next] * MAX_OF_SHARE) / Math.max(1, room.kcal);
  return { meal: next, budget: scale(Math.min(share, cap)), snacksToClose: null };
}
