// Fuel settings that shape recipe suggestions beyond dietary restrictions:
// how long they'll cook, how comfortable they are in the kitchen, what they
// cook with, whether they batch-cook, and what they like to eat. Plain module
// (no "use client") so the settings page, the recipe route and the coach
// share one shape.

export type MealPrefs = {
  /// Most minutes they'll spend cooking a meal.
  cookMinutes: 15 | 30 | 45 | 60 | null;
  skill: "beginner" | "comfortable" | "confident" | null;
  equipment: string[];
  /// Batch-cooks: recipes keep and reheat well, and the recipe sheet opens
  /// at `batchServings`.
  mealPrep: boolean;
  batchServings: number;
  cuisines: string[];
  proteins: string[];
  spice: "mild" | "medium" | "hot" | null;
  budget: "tight" | "normal" | "flexible" | null;
};

export const DEFAULT_MEAL_PREFS: MealPrefs = {
  cookMinutes: null,
  skill: null,
  equipment: [],
  mealPrep: false,
  batchServings: 4,
  cuisines: [],
  proteins: [],
  spice: null,
  budget: null,
};

export const COOK_MINUTES = [15, 30, 45, 60] as const;

export const SKILLS = [
  { key: "beginner", label: "Beginner", rule: "a beginner cook: simple techniques only, nothing fiddly" },
  { key: "comfortable", label: "Comfortable", rule: "a comfortable home cook" },
  { key: "confident", label: "Confident", rule: "a confident cook: more involved techniques are fine" },
] as const;

export const EQUIPMENT = [
  "Stove",
  "Oven",
  "Microwave",
  "Air fryer",
  "Grill",
  "Slow cooker",
  "Instant Pot",
  "Blender",
  "Rice cooker",
] as const;

export const CUISINES = [
  "Mexican",
  "Italian",
  "Mediterranean",
  "Chinese",
  "Japanese",
  "Korean",
  "Thai",
  "Indian",
  "Middle Eastern",
  "American",
  "Greek",
  "Caribbean",
] as const;

export const PROTEINS = [
  "Chicken",
  "Beef",
  "Turkey",
  "Pork",
  "Fish",
  "Shrimp",
  "Eggs",
  "Greek yogurt",
  "Cottage cheese",
  "Tofu",
  "Beans & lentils",
  "Protein powder",
] as const;

export const SPICE = [
  { key: "mild", label: "Mild" },
  { key: "medium", label: "Medium" },
  { key: "hot", label: "Hot" },
] as const;

export const BUDGET = [
  { key: "tight", label: "Budget", rule: "on a tight budget: cheap staples, no pricey cuts or specialty items" },
  { key: "normal", label: "Normal", rule: "" },
  { key: "flexible", label: "Flexible", rule: "" },
] as const;

const pick = <T extends string>(list: readonly T[], v: unknown): T[] =>
  (Array.isArray(v) ? v : []).filter((x): x is T => list.includes(x as T));
const one = <T extends string>(list: readonly { key: T }[], v: unknown): T | null =>
  list.some((o) => o.key === v) ? (v as T) : null;

/// Whatever is stored (or posted) → a valid MealPrefs.
export function cleanMealPrefs(raw: unknown): MealPrefs {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const mins = Number(o.cookMinutes);
  const batch = Math.round(Number(o.batchServings));
  return {
    cookMinutes: (COOK_MINUTES as readonly number[]).includes(mins) ? (mins as MealPrefs["cookMinutes"]) : null,
    skill: one(SKILLS, o.skill),
    equipment: pick(EQUIPMENT, o.equipment),
    mealPrep: o.mealPrep === true,
    batchServings: Number.isFinite(batch) ? Math.min(8, Math.max(2, batch)) : 4,
    cuisines: pick(CUISINES, o.cuisines),
    proteins: pick(PROTEINS, o.proteins),
    spice: one(SPICE, o.spice),
    budget: one(BUDGET, o.budget),
  };
}

/// Prompt lines for the recipe writer, or "" when nothing is set.
export function mealPrefRules(p: MealPrefs, snack: boolean): string {
  const lines: string[] = [];
  if (p.cookMinutes && !snack) lines.push(`Total time ${p.cookMinutes} minutes or less, start to finish.`);
  const skill = SKILLS.find((s) => s.key === p.skill);
  if (skill && skill.key !== "comfortable") lines.push(`Written for ${skill.rule}.`);
  if (p.equipment.length)
    lines.push(`Kitchen has only: ${p.equipment.join(", ")} (plus basic pans, knives and a cutting board). Don't need anything else.`);
  if (p.mealPrep && !snack)
    lines.push(
      `They meal prep, cooking ${p.batchServings} servings at once: dishes must keep 4 days in the fridge and reheat well (no fried eggs, crispy toppings that go soggy, or dressed salads). Add a last step on storing and reheating.`,
    );
  if (p.cuisines.length) lines.push(`Cuisines they enjoy: ${p.cuisines.join(", ")}. Lean toward these.`);
  if (p.proteins.length) lines.push(`Proteins they like: ${p.proteins.join(", ")}. Build around these.`);
  if (p.spice) lines.push(`Spice level: ${p.spice}.`);
  const budget = BUDGET.find((b) => b.key === p.budget);
  if (budget?.rule) lines.push(`Cooking ${budget.rule}.`);
  return lines.join("\n");
}

/// One line for the coach's profile block.
export function mealPrefSummary(p: MealPrefs): string {
  const parts = [
    p.cookMinutes ? `cooks ≤${p.cookMinutes} min` : "",
    p.skill ? `${p.skill} cook` : "",
    p.mealPrep ? `meal preps ${p.batchServings} servings at a time` : "",
    p.equipment.length ? `has ${p.equipment.join(", ")}` : "",
    p.cuisines.length ? `likes ${p.cuisines.join(", ")}` : "",
    p.proteins.length ? `proteins: ${p.proteins.join(", ")}` : "",
    p.spice ? `${p.spice} spice` : "",
    p.budget === "tight" ? "tight budget" : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "none set";
}
