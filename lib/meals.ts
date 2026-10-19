// Meal types for the food log. Plain (no server imports) so the client logger
// can use them too.
export const MEALS = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"] as const;
export type Meal = (typeof MEALS)[number];

/// A meal type for "now" in the athlete's day, so the logger opens on the
/// right one: breakfast before 11, lunch before 3, dinner after 5, else snack.
export function mealForHour(h: number): Meal {
  if (h < 11) return "BREAKFAST";
  if (h < 15) return "LUNCH";
  if (h >= 17 && h < 22) return "DINNER";
  return "SNACK";
}
