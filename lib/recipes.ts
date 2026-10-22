// Recipe suggestions for the Fuel page's next meal: sized to that meal's
// share of what's left today, following the athlete's dietary restrictions,
// with amounts as numbers so the recipe sheet can scale servings.

import { listRecentMeals } from "@/lib/foodLog";
import { textToJson } from "@/lib/foodAi";
import { prisma } from "@/lib/db";
import { dietRules } from "@/lib/diet";

export type RecipeIngredient = {
  name: string;
  /// Amount for the recipe's servings; null for "to taste" and the like.
  qty: number | null;
  /// g, ml, cup, tbsp, tsp, or a count word ("", "clove", "slice"…).
  unit: string;
  usual: boolean;
};

export type Recipe = {
  title: string;
  /// One appetising line: what makes it good.
  blurb: string;
  minutes: number;
  servings: number;
  /// Which of the athlete's usual foods it builds on, e.g. "Uses rice + pico you eat".
  usesYourFoods: string | null;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number | null;
  ingredients: RecipeIngredient[];
  steps: string[];
};

export const TWEAKS: Record<string, string> = {
  other: "Make it clearly different from the ones listed as already shown.",
  quicker: "It must take 15 minutes or less, start to finish.",
  "no-cook": "No cooking at all — assembly only, no stove or oven (a microwave for 2 minutes is fine).",
};

/// Sweet or packaged snack foods: fine as a snack recipe's base, never a
/// main meal's ingredient just because they show up in the log.
const SNACKY = /\b(date|dates|bar|bars|candy|chocolate|cookie|chips|gummy|gummies|cereal|granola|popcorn|jerky|shake|smoothie|pre-?workout|gatorade|soda|juice)\b/i;

export const num = (n: unknown) => {
  const v = typeof n === "number" ? n : parseFloat(String(n));
  return Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
};

export type RecipeRequest = {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  meal: string;
  phase: string;
  count: number;
  tweak: string;
  exclude: string[];
};

export async function generateRecipes(userId: string, req: RecipeRequest): Promise<Recipe[]> {
  const { kcal, proteinG, carbsG, fatG, meal, phase, count, tweak, exclude } = req;
  const snack = meal === "snack";
  const [recent, user] = await Promise.all([
    listRecentMeals(userId, 40),
    prisma.user.findUnique({ where: { id: userId }, select: { dietRestrictions: true, dietNotes: true } }),
  ]);
  const diet = dietRules(user?.dietRestrictions ?? [], user?.dietNotes);
  // Taste hints from the same kind of eating: main meals only for a main
  // meal (a logged snack of dates isn't a dinner ingredient), snacks for a snack.
  const tally = new Map<string, number>();
  for (const m of recent) {
    if (snack !== (m.meal === "SNACK")) continue;
    for (const it of m.items) {
      if (!snack && SNACKY.test(it.name)) continue;
      tally.set(it.name, (tally.get(it.name) ?? 0) + m.times);
    }
  }
  const usual = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n]) => n);

  const prompt = `You are a chef who cooks for athletes, writing ${count} recipe${count === 1 ? "" : "s"} for a strength athlete's ${snack ? "snack, eaten after their main meals to close the gap to today's target" : meal}.
Target for this ${meal}: about ${kcal} kcal, ${proteinG} g protein, ${carbsG} g carbs, ${fatG} g fat (its share of what's left today, not the whole day).${phase ? ` Phase: ${phase}.` : ""}
Land within about 10% of those calories (never more than 15% over) and as close to that protein as is realistic; protein matters most.
${diet ? `${diet}\n` : ""}
What makes a good recipe here:
- A dish people actually crave and would order: a burrito bowl, a stir-fry, a smash burger, a sheet-pan dinner, a loaded omelette. Real, well-known flavour combinations. Nothing odd or invented.
- It suits the meal: ${snack ? "a snack" : meal === "breakfast" ? "breakfast food" : `a proper ${meal}, not a breakfast dish`}.
- Every ingredient belongs in that dish. Never add something only because they eat it. Sweet snack foods (dates, bars, granola, chocolate) never go in a savoury dish.
- Titles read like a good menu: appetising and plain, max 6 words, e.g. "Chipotle Chicken Burrito Bowl", "Garlic Butter Steak Bites".
- "blurb": one line, max 12 words, on what makes it great, e.g. "Charred, smoky chicken with cool lime crema and crunchy slaw."
${usual.length ? `- Foods they often eat, as a hint to their taste: ${usual.join(", ")}. ${count === 1 ? "Use one only if it fits the dish naturally." : "At most one recipe may build on these, and only where a chef would naturally use them."}` : ""}
${exclude.length ? `Already shown, make something different: ${exclude.join("; ")}.` : ""}
${tweak}
${snack ? "Snacks: 10 minutes or less, 2–6 ingredients, 1–3 steps, little or no cooking, protein-forward (Greek yogurt bowls, cottage cheese, shakes, egg bites, wraps, jerky and the like)." : "Home-cook friendly: common grocery ingredients, 5–9 ingredients, 3–5 steps, one serving."}

Steps must be short and exact. Each step:
- one or two actions, max 16 words, starts with a verb;
- includes the heat, time or doneness cue that matters ("medium-high", "4 min a side", "until golden");
- never restates quantities (the ingredient list carries them, and it gets scaled);
- no filler ("enjoy", "serve and enjoy", "season to taste" on its own).
Good: "Sear chicken in a hot oiled pan, 5 min a side, until charred." Bad: "Cook the chicken until it is done."

Return ONLY JSON:
{ "recipes": [ {
  "title": string,
  "blurb": string,
  "minutes": number,
  "servings": 1,
  "usesYourFoods": string | null,
  "kcal": number, "proteinG": number, "carbsG": number, "fatG": number, "fiberG": number | null,
  "ingredients": [ { "name": string, "qty": number | null, "unit": string, "usual": boolean } ],
  "steps": [ string ]
} ] }
- "qty" is a number for one serving (decimals fine, e.g. 0.5); null only for things like "salt and pepper".
- "unit" is one of "g", "ml", "cup", "tbsp", "tsp", or a count word ("" for plain counts like eggs, "clove", "slice", "tortilla"). Grams for meat, fish, rice, pasta, potatoes and cheese (say cooked or raw in the name, e.g. "jasmine rice, cooked"); tbsp or tsp for oils, butter, sauces, dressings and spices; cups for milk, broth, greens and chopped veg; counts for eggs, tortillas, buns and cloves.
- "name" is the ingredient alone, lowercase, with any prep after a comma: "chicken thigh, boneless", "red onion, diced".
- "usesYourFoods": a short phrase like "Uses rice + pico you eat" (two foods at most), or null.
- "usual": true when that ingredient is one of the foods they often eat.
- Nutrition numbers are totals for the serving, whole numbers, and must add up: kcal ≈ 4·protein + 4·carbs + 9·fat.`;

  const parsed = await textToJson<{ recipes?: unknown[] }>(prompt, "recipes", { claudeFirst: true });
  const recipes: Recipe[] = (Array.isArray(parsed?.recipes) ? parsed.recipes : [])
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      const ing = Array.isArray(o.ingredients) ? o.ingredients : [];
      const steps = Array.isArray(o.steps) ? o.steps : [];
      return {
        title: String(o.title ?? "").trim().slice(0, 80),
        blurb: String(o.blurb ?? "").trim().slice(0, 120),
        minutes: num(o.minutes),
        servings: num(o.servings) || 1,
        usesYourFoods: o.usesYourFoods ? String(o.usesYourFoods).trim().slice(0, 60) : null,
        kcal: num(o.kcal),
        proteinG: num(o.proteinG),
        carbsG: num(o.carbsG),
        fatG: num(o.fatG),
        fiberG: o.fiberG == null ? null : num(o.fiberG),
        ingredients: ing.slice(0, 14).map((i) => {
          const x = (i ?? {}) as Record<string, unknown>;
          const q = typeof x.qty === "number" ? x.qty : parseFloat(String(x.qty));
          const unit = String(x.unit ?? "").trim().toLowerCase().replace(/([^s])s$/, "$1").slice(0, 16);
          return {
            name: String(x.name ?? "").trim().slice(0, 60),
            qty: Number.isFinite(q) && q > 0 ? q : null,
            unit: unit === "gram" ? "g" : unit === "tablespoon" ? "tbsp" : unit === "teaspoon" ? "tsp" : unit,
            usual: x.usual === true,
          };
        }).filter((i) => i.name),
        steps: steps.slice(0, 6).map((s) => String(s).trim().slice(0, 160)).filter(Boolean),
      };
    })
    .filter((r) => r.title && r.kcal > 0 && r.ingredients.length && r.steps.length)
    .map((r) => {
      // Models drift on totals; when kcal and the macros disagree by more
      // than 12%, the macros win (they're what the target is built from).
      const fromMacros = r.proteinG * 4 + r.carbsG * 4 + r.fatG * 9;
      return Math.abs(r.kcal - fromMacros) > fromMacros * 0.12 ? { ...r, kcal: Math.round(fromMacros) } : r;
    });
  // Prefer the ones that actually fit; fall back to the closest rather than
  // show nothing.
  const fit = (r: Recipe) => r.kcal <= kcal * 1.15 && r.kcal >= kcal * 0.7;
  recipes.sort((a, b) => Number(fit(b)) - Number(fit(a)) || Math.abs(a.kcal - kcal) - Math.abs(b.kcal - kcal));
  recipes.splice(count);

  return recipes;
}
