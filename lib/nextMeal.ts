// Which meal is next and how big it should be. What's left of the day is
// shared across the main meals still to come (plus a little held back for a
// snack), so at lunch the suggestion is a lunch, not the rest of the day's
// calories in one sitting.
import { mealForHour, type Meal } from "@/lib/meals";
import type { RoomLeft } from "@/lib/roomLeft";

const MAINS: Meal[] = ["BREAKFAST", "LUNCH", "DINNER"];
// Share of a day's eating each main meal usually takes.
const WEIGHT: Record<string, number> = { BREAKFAST: 0.28, LUNCH: 0.34, DINNER: 0.38 };
const SNACK_RESERVE = 0.1;
const SNACK_KCAL = 300;
// No one meal should be more than this multiple of its usual share of the
// day, however much is left — a light day doesn't become a 2,000 kcal dinner.
const MAX_OF_SHARE = 1.25;

export type NextMealPlan = { meal: Meal; budget: RoomLeft };

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
    const f = Math.min(1, SNACK_KCAL / Math.max(1, room.kcal));
    return { meal: "SNACK", budget: scale(f) };
  }
  const next = ahead[0];
  const total = ahead.reduce((s, m) => s + WEIGHT[m], 0);
  // The last main meal of the day gets everything that's left.
  const share = ahead.length === 1 ? 1 : (WEIGHT[next] / total) * (1 - SNACK_RESERVE);
  const cap = (dayTargetKcal * WEIGHT[next] * MAX_OF_SHARE) / Math.max(1, room.kcal);
  return { meal: next, budget: scale(Math.min(share, cap)) };
}
