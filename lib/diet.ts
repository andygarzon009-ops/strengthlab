// Dietary restrictions picked on the profile. Plain module (no "use client")
// so the profile form, the recipe route and the coach read the same list.

export const DIET_OPTIONS = [
  { key: "vegetarian", label: "Vegetarian", rule: "vegetarian (no meat, poultry or fish)" },
  { key: "vegan", label: "Vegan", rule: "vegan (no animal products at all, including dairy, eggs, honey and whey)" },
  { key: "pescatarian", label: "Pescatarian", rule: "pescatarian (fish and seafood are fine, no meat or poultry)" },
  { key: "dairy-free", label: "Dairy-free", rule: "dairy-free (no milk, cheese, yogurt, butter, cream or whey)" },
  { key: "gluten-free", label: "Gluten-free", rule: "gluten-free (no wheat, barley, rye, regular pasta, bread, flour tortillas or soy sauce unless tamari)" },
  { key: "nut-free", label: "Nut-free", rule: "no nuts or nut butters (peanuts included)" },
  { key: "egg-free", label: "Egg-free", rule: "no eggs" },
  { key: "shellfish-free", label: "No shellfish", rule: "no shellfish" },
  { key: "pork-free", label: "No pork", rule: "no pork, bacon, ham or pork-based sausage" },
  { key: "halal", label: "Halal", rule: "halal (no pork or alcohol; halal meat)" },
  { key: "kosher", label: "Kosher", rule: "kosher (no pork or shellfish, never meat with dairy)" },
  { key: "low-fodmap", label: "Low-FODMAP", rule: "low-FODMAP (no onion, garlic, wheat, beans or high-FODMAP fruit)" },
] as const;

export type DietKey = (typeof DIET_OPTIONS)[number]["key"];

const KEYS = new Set<string>(DIET_OPTIONS.map((o) => o.key));

export function cleanDiet(keys: unknown): DietKey[] {
  return (Array.isArray(keys) ? keys : []).filter((k): k is DietKey => typeof k === "string" && KEYS.has(k));
}

/// Hard rules for a prompt, or "" when there are none.
export function dietRules(keys: string[], notes: string | null | undefined): string {
  const rules = DIET_OPTIONS.filter((o) => keys.includes(o.key)).map((o) => o.rule);
  const extra = notes?.trim();
  if (!rules.length && !extra) return "";
  return [
    rules.length ? `Dietary restrictions (strict, every ingredient must comply): ${rules.join("; ")}.` : "",
    extra ? `Foods they avoid or dislike (never use): ${extra.slice(0, 300)}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/// One plain line for the coach's profile block.
export function dietSummary(keys: string[], notes: string | null | undefined): string {
  const labels = DIET_OPTIONS.filter((o) => keys.includes(o.key)).map((o) => o.label);
  const extra = notes?.trim();
  if (!labels.length && !extra) return "none";
  return [labels.join(", "), extra ? `avoids: ${extra.slice(0, 300)}` : ""].filter(Boolean).join(" · ");
}
